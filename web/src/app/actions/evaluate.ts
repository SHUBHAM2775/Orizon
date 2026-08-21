"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function runEvaluationAction(applicantId: string, applicantRef: string) {
  const supabase = await createClient();
  
  // 1. Fetch applicant
  const { data: applicant, error: applicantError } = await supabase
    .from("applicants")
    .select("*")
    .eq("id", applicantId)
    .single();
    
  if (applicantError || !applicant) {
    throw new Error("Applicant not found");
  }

  // 2. Prepare profile data for python API
  const raw = applicant.raw_input_json || {};
  const profile = {
    ...raw,
    applicantId: applicantRef,
    age: applicant.age ?? raw.age,
    employmentType: applicant.employment_type ?? raw.employmentType,
    requestedLoanAmount: applicant.requested_amount ?? raw.requested_amount,
    tenureMonths: applicant.tenure_months ?? raw.tenure_months,
    declaredIncome: applicant.monthly_income ?? raw.monthly_income ?? raw.annual_income,
    bureauScore: applicant.cibil_score ?? raw.cibil_score,
    hasWriteOff: applicant.last_default ?? raw.hasWriteOff ?? raw.has_write_off,
  };

  const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";
  
  // 3. Call python API
  const res = await fetch(`${PYTHON_API_URL}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, use_xai: true }),
  });
  
  if (!res.ok) {
    throw new Error(`Python API failed: ${await res.text()}`);
  }

  // Python API has already saved it to Supabase via persist_to_db

  // Write audit log for analysts
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("email", user.email!)
      .single();

    if (userData) {
      await supabase.from("audit_logs").insert({
        actor_id: userData.id,
        action: "EVALUATION_RUN",
        target_type: "applicant",
        target_id: applicantId,
        before_value: null,
        after_value: { status: "evaluated", applicantRef }
      });
    }
  }
  
  revalidatePath("/applications");
  return { success: true };
}

export async function getEvaluationsAction() {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("evaluations")
    .select(
      "id, applicant_id, final_decision, eligible_amount, interest_rate, risk_grade, derived_metrics_json, xai_narrative, tool_results_json, api_budget_json, ml_risk_tier, ml_risk_score, rule_version_snapshot, evaluated_at, approved_by_email"
    )
    .order("evaluated_at", { ascending: false });
  
  if (error) throw new Error(error.message);
  return data;
}

export async function getEvaluationRuleResultsAction(evaluationId: string) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("evaluation_rule_results")
    .select(
      "id, evaluation_id, rule_id, result, actual_value, threshold_at_evaluation, rules:rule_id ( rule_code, description, field_name, operator, outcome, reason_code )"
    )
    .eq("evaluation_id", evaluationId);
    
    if (error) throw new Error(error.message);
    return data;
}

export async function getExceptionCasesAction() {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("exception_cases")
    .select(
      `id, evaluation_id, level, status, assigned_to, decided_by,
       decision_notes, escalated_from, decided_at,
       evaluations (
         id, applicant_id, final_decision, eligible_amount,
         interest_rate, evaluated_at, approved_by_email,
         derived_metrics_json, xai_narrative, tool_results_json, api_budget_json, ml_risk_tier, ml_risk_score, rule_version_snapshot,
         applicants (
           id, applicant_ref, monthly_income, requested_amount,
           tenure_months, cibil_score, existing_emi, avg_bank_balance,
           bounce_count, last_default, raw_input_json,
           submitted_by, created_at
         )
       )`
    )
    .order("decided_at", { ascending: false, nullsFirst: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function updateExceptionCaseAction(
  caseId: string,
  evaluationId: string,
  newStatus: "APPROVED" | "REJECTED",
  notes: string,
  decidedByDbId: string,
  decidedByEmail: string
) {
  const adminClient = createAdminClient();
  
  // Update exception_case
  const { error: exError } = await adminClient
    .from("exception_cases")
    .update({
      status: newStatus,
      decided_by: decidedByDbId,
      decision_notes: notes || null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", caseId);
  if (exError) throw new Error(exError.message);

  // Update evaluation
  const { error: evalError } = await adminClient
    .from("evaluations")
    .update({ 
      final_decision: newStatus,
      approved_by_email: newStatus === "APPROVED" ? decidedByEmail : null
    })
    .eq("id", evaluationId);
  if (evalError) throw new Error(evalError.message);

  return { success: true };
}

export async function escalateExceptionCaseAction(
  caseId: string,
  evaluationId: string,
  notes: string,
  escalatedByDbId: string
) {
  const adminClient = createAdminClient();

  // Mark current L1 case as ESCALATED
  const { error: updateErr } = await adminClient
    .from("exception_cases")
    .update({
      status: "ESCALATED",
      decided_by: escalatedByDbId,
      decision_notes: notes || null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", caseId);
  if (updateErr) throw new Error(updateErr.message);

  // Create L2 case
  const { error: insertErr } = await adminClient
    .from("exception_cases")
    .insert({
      evaluation_id: evaluationId,
      level: "L2",
      status: "PENDING",
      escalated_from: caseId,
    });
  if (insertErr) throw new Error(insertErr.message);

  // Update evaluation
  const { error: evalUpdateErr } = await adminClient
    .from("evaluations")
    .update({ final_decision: "EXCEPTION_L2" })
    .eq("id", evaluationId);
  if (evalUpdateErr) throw new Error(evalUpdateErr.message);

  return { success: true };
}
