"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Extracts text from a PDF file buffer using unpdf.
 */
export async function extractPdfTextAction(formData: FormData) {
  try {
    const file = formData.get("file") as File;
    if (!file) {
      return { error: "No file provided" };
    }

    const arrayBuffer = await file.arrayBuffer();

    // Use unpdf for robust server-side extraction without canvas/DOM polyfills
    const { extractText } = await import("unpdf");
    
    // Uint8Array is expected by unpdf
    const data = new Uint8Array(arrayBuffer);
    
    let extracted;
    try {
      extracted = await extractText(data);
    } catch (parseError: any) {
      console.error("PDF parsing failed:", parseError);
      return { error: "Failed to parse PDF document. The file may be corrupt, password-protected, or not a valid PDF." };
    }
    
    const textStr = Array.isArray(extracted.text) 
      ? extracted.text.join("\n") 
      : extracted.text;

    return { success: true, text: textStr };
  } catch (error: any) {
    console.error("Error extracting PDF text:", error);
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
