"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

type DecisionOutcome = "APPROVED" | "HARD_REJECT" | "EXCEPTION_L1" | "EXCEPTION_L2";

function evaluateCondition(operator: string, observed: any, threshold: any): boolean {
  if (observed == null) return false;
  if (typeof observed === "boolean" && typeof threshold === "number") {
    // Sometimes boolean flags are compared to 1/0
    observed = observed ? 1 : 0;
  }
  
  switch (operator) {
    case "EQ": return observed === threshold;
    case "LT": return observed < threshold;
    case "GT": return observed > threshold;
    case "LTE": return observed <= threshold;
    case "GTE": return observed >= threshold;
    default: return false;
  }
}

export async function runEvaluationAction(applicantId: string, applicantRef: string) {
  const supabase = await createClient();
  const adminClient = createAdminClient();
  
  // 1. Fetch applicant
  const { data: applicant, error: applicantError } = await supabase
    .from("applicants")
    .select("*")
    .eq("id", applicantId)
    .single();
    
  if (applicantError || !applicant) {
    throw new Error("Applicant not found");
  }

  // 2. Fetch active rules
  const { data: rules, error: rulesError } = await supabase
    .from("rules")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (rulesError || !rules) {
    throw new Error("Failed to fetch rules");
  }

  // 3. Map applicant to engine fields
  const raw = applicant.raw_input_json || {};
  const monthlyIncome = applicant.monthly_income ?? Number(raw.monthly_income ?? raw.annual_income ?? 0) ?? 0;
  const annualIncome = monthlyIncome * 12;
  
  let foir = 0;
  if (monthlyIncome > 0 && applicant.existing_emi != null) {
    foir = applicant.existing_emi / monthlyIncome;
  } else if (raw.foir) {
    foir = Number(raw.foir) / 100; // Assuming raw foir is percentage
  }

  const engineContext = {
    writeOffFlag: applicant.last_default ?? raw.hasWriteOff ?? raw.has_write_off ?? false,
    settlementFlag: raw.settlementFlag ?? false,
    bureauScore: applicant.cibil_score ?? raw.cibil_score ?? 0,
    age: applicant.age ?? raw.age ?? 0,
    declaredIncome: annualIncome,
    foir_calculated: foir,
    requestedLoanAmount: applicant.requested_amount ?? raw.requested_amount ?? 0,
  } as Record<string, any>;

  const ruleResults: any[] = [];
  let deviations = 0;
  let finalDecision: DecisionOutcome = "APPROVED";
  let hardReject = false;
  
  // 4. Evaluate rules strictly in priority order
  for (const rule of rules) {
    const val = engineContext[rule.field_name];
    const isTriggered = evaluateCondition(rule.operator, val, rule.threshold_value);
    
    // We only care if it triggered or passed
    ruleResults.push({
      rule_id: rule.id,
      result: isTriggered ? "TRIGGERED" : "PASS",
      actual_value: val,
      threshold_at_evaluation: rule.threshold_value
    });

    if (isTriggered) {
      if (rule.category === "hard_reject" || rule.category === "eligibility") {
        hardReject = true;
        finalDecision = "HARD_REJECT";
        break; // Short-circuit on hard reject or eligibility fail
      } else if (rule.category === "scoring") {
        deviations += (rule.deviation_weight ?? 1);
      }
    }
  }

  // 5. Compute exceptions & pricing if not hard rejected
  let eligibleAmount = 0;
  let riskGrade = "A";
  let rateBand = "10-12%";
  
  if (!hardReject) {
    if (deviations >= 2) {
      finalDecision = "EXCEPTION_L2";
      riskGrade = "D";
      rateBand = "18-24%";
    } else if (deviations === 1) {
      finalDecision = "EXCEPTION_L1";
      riskGrade = "C";
      rateBand = "14-18%";
    }
    
    const incomeMultiplier = 5;
    const maxCap = 5000000;
    const maxByIncome = annualIncome * incomeMultiplier;
    const requested = engineContext.requestedLoanAmount || maxByIncome;
    eligibleAmount = Math.min(maxByIncome, maxCap, requested);
  }

  // 6. Insert evaluation
  const { data: evaluation, error: evalInsertError } = await adminClient
    .from("evaluations")
    .insert({
      applicant_id: applicantId,
      final_decision: finalDecision,
      eligible_amount: hardReject ? null : Math.round(eligibleAmount),
      interest_rate: hardReject ? null : parseFloat(rateBand), // just grab the number part if possible, or null
      risk_grade: hardReject ? null : riskGrade,
      rule_version_snapshot: { version: 1 }, // mock version
      evaluated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (evalInsertError) {
    throw evalInsertError;
  }

  // 7. Insert rule results
  const resultsToInsert = ruleResults.map(r => ({
    evaluation_id: evaluation.id,
    rule_id: r.rule_id,
    result: r.result,
    actual_value: typeof r.actual_value === "boolean" ? (r.actual_value ? 1 : 0) : r.actual_value,
    threshold_at_evaluation: r.threshold_at_evaluation
  }));

  const { error: resultsInsertError } = await adminClient
    .from("evaluation_rule_results")
    .insert(resultsToInsert);

  if (resultsInsertError) {
    throw resultsInsertError;
  }

  revalidatePath("/applications");
  return { success: true };
}

export async function getEvaluationsAction() {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("evaluations")
    .select(
      "id, applicant_id, final_decision, eligible_amount, interest_rate, risk_grade, derived_metrics_json, rule_version_snapshot, evaluated_at"
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

