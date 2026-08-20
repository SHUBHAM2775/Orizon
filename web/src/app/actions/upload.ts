"use server";

import { createClient } from "@/lib/supabase/server";

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";

/**
 * Forwards CSV/JSON to the Python AI backend for extraction, 
 * then automatically saves the structured result to Supabase.
 */
export async function processStructuredFileAction(formData: FormData) {
  try {
    const file = formData.get("file") as File;
    if (!file) return { error: "No file provided" };
    
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
        if (errorData.detail) errorMsg = errorData.detail;
      } catch (e) {}
      return { error: errorMsg };
    }
    
    const profile = await response.json();
    
    // Map profile to applicantData shape
    const applicantData = {
      applicant_ref: profile.applicantId,
      age: profile.age,
      employment_type: profile.employmentType,
      requested_amount: profile.requestedLoanAmount,
      tenure_months: profile.requestedTenure,
      monthly_income: profile.declaredIncome ? profile.declaredIncome / 12 : undefined,
      cibil_score: profile.bureauScore,
      existing_emi: profile.emiDebits,
      avg_bank_balance: profile.bankAvgBalance ?? profile.bankAvgCredits,
      bounce_count: profile.bounceCount,
      last_default: profile.writeOffFlag || profile.defaultFlag,
      income_trend: profile.incomeTrend,
      assets_value: profile.declaredAssets,
      ...profile // include the raw extraction for raw_input_json
    };
    
    return submitApplicantAction(applicantData);
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
    const file = formData.get("file") as File;
    if (!file) return { error: "No file provided" };
    
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
        if (errorData.detail) errorMsg = errorData.detail;
      } catch (e) {}
      return { error: errorMsg };
    }
    
    const profile = await response.json();
    return { success: true, profile };
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
