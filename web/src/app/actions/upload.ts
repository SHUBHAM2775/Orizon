"use server";

import { createClient } from "@/lib/supabase/server";

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";

/**
 * Forwards CSV/JSON to the Python AI backend for extraction, 
 * then automatically saves the structured result to Supabase.
 */
export async function processStructuredFileAction(formData: FormData) {
  try {
    const files = formData.getAll("files") as File[];
    if (!files || files.length === 0) return { error: "No files provided" };
    
    // Call Python FastAPI
    let response;
    try {
      response = await fetch(`${PYTHON_API_URL}/process/structured`, {
        method: "POST",
        body: formData,
      });
    } catch (e) {
      return { error: "Failed to connect to AI backend. Ensure the Python FastAPI server is running." };
    }
    
    if (!response.ok) {
      let errorMsg = `Python API error: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            errorMsg = errorData.detail.map((e: any) => e.msg || JSON.stringify(e)).join(", ");
          } else {
            errorMsg = typeof errorData.detail === "string" ? errorData.detail : JSON.stringify(errorData.detail);
          }
        }
      } catch (e) {}
      return { error: errorMsg };
    }
    
    const profiles = await response.json();
    
    // The API now returns a list of profiles
    if (!Array.isArray(profiles)) {
      return { error: "Unexpected response from API (expected list of profiles)." };
    }

    let successCount = 0;
    let failedCount = 0;
    let errors = [];

    for (const profile of profiles) {
      const applicantData = {
        applicant_ref: profile.applicantId,
        age: profile.age,
        employment_type: profile.employmentType,
        requested_amount: profile.requestedLoanAmount,
        tenure_months: profile.requestedTenure,
        monthly_income: profile.declaredIncome,
        cibil_score: profile.bureauScore,
        existing_emi: profile.emiDebits,
        avg_bank_balance: profile.bankAvgBalance ?? profile.bankAvgCredits,
        bounce_count: profile.bounceCount,
        last_default: profile.writeOffFlag || profile.defaultFlag,
        income_trend: profile.incomeTrend,
        assets_value: profile.declaredAssets,
        ...profile // include the raw extraction for raw_input_json
      };
      
      const res = await submitApplicantAction(applicantData);
      if (res.error) {
        if (!res.error.includes("already exists")) {
          errors.push(`Failed for ${profile.applicantId || 'unknown'}: ${res.error}`);
        }
        failedCount++;
      } else {
        successCount++;
      }
    }
    
    if (successCount === 0 && failedCount > 0) {
       return { error: `Failed to import any applicants. Errors: ${errors.join('; ')}` };
    }

    return { success: true, message: `Successfully imported ${successCount} applicant(s). ${failedCount > 0 ? `(${failedCount} ignored or failed)` : ''}` };
  } catch (error: any) {
    console.error("Error processing structured file:", error);
    return { error: "An unexpected error occurred while processing the file." };
  }
}

/**
 * Forwards PDF to the Python AI backend for extraction.
 * Returns the structured profile for human review (does NOT auto-save).
 */
export async function processPdfFileAction(formData: FormData) {
  try {
    const files = formData.getAll("files") as File[];
    if (!files || files.length === 0) return { error: "No files provided" };
    
    // Call Python FastAPI
    let response;
    try {
      response = await fetch(`${PYTHON_API_URL}/process/pdf`, {
        method: "POST",
        body: formData,
      });
    } catch (e) {
      return { error: "Failed to connect to AI backend. Ensure the Python FastAPI server is running." };
    }
    
    if (!response.ok) {
      let errorMsg = `Python API error: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            errorMsg = errorData.detail.map((e: any) => e.msg || JSON.stringify(e)).join(", ");
          } else {
            errorMsg = typeof errorData.detail === "string" ? errorData.detail : JSON.stringify(errorData.detail);
          }
        }
      } catch (e) {}
      return { error: errorMsg };
    }
    
    const profiles = await response.json();
    return { success: true, profiles };
  } catch (error: any) {
    console.error("Error processing PDF file:", error);
    return { error: "An unexpected error occurred while processing the PDF file." };
  }
}

/**
 * Inserts a new applicant record into the Supabase database.
 */
export async function submitApplicantAction(applicantData: Record<string, any>) {
  try {
    const supabase = await createClient();
    
    // Get the current user for the submitted_by field
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: "You must be logged in to submit applicant data." };
    }

    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    if (!userData) {
      return { error: "User record not found." };
    }

    // Attempt insert
    const { data, error } = await supabase
      .from("applicants")
      .insert({
        applicant_ref: applicantData.applicant_ref,
        age: applicantData.age,
        employment_type: applicantData.employment_type,
        requested_amount: applicantData.requested_amount,
        tenure_months: applicantData.tenure_months,
        monthly_income: applicantData.monthly_income,
        cibil_score: applicantData.cibil_score,
        existing_emi: applicantData.existing_emi,
        avg_bank_balance: applicantData.avg_bank_balance,
        bounce_count: applicantData.bounce_count,
        last_default: applicantData.last_default,
        income_trend: applicantData.income_trend,
        assets_value: applicantData.assets_value,
        raw_input_json: applicantData,
        submitted_by: userData.id
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      if (error.code === "23505") {
        return { error: "An applicant with this reference ID already exists." };
      }
      return { error: error.message };
    }

    return { success: true, applicant: data };
  } catch (error: any) {
    console.error("Error submitting applicant data:", error);
    return { error: error.message || "Failed to submit applicant data" };
  }
}

/**
 * Deletes an applicant from the Supabase database.
 */
export async function deleteApplicantAction(id: string) {
  try {
    const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // 1. Find all evaluations for this applicant (Bypassing RLS)
    const { data: evals } = await supabaseAdmin
      .from("evaluations")
      .select("id")
      .eq("applicant_id", id);

    // 2. Delete rule results for those evaluations first
    if (evals && evals.length > 0) {
      for (const ev of evals) {
        await supabaseAdmin
          .from("evaluation_rule_results")
          .delete()
          .eq("evaluation_id", ev.id);
      }
      
      // 3. Delete the evaluations
      await supabaseAdmin
        .from("evaluations")
        .delete()
        .eq("applicant_id", id);
    }

    // 4. Finally, delete the applicant
    const { error } = await supabaseAdmin
      .from("applicants")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Supabase delete error:", error);
      return { error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting applicant:", error);
    return { error: error.message || "Failed to delete applicant" };
  }
}
