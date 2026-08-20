import os
import json
import urllib.request
import urllib.error
from typing import Dict, Any, List
from core.models import NormalizedApplicantProfile, DecisionReport, RuleEvaluation

POLICY_PATH = os.path.join(os.path.dirname(__file__), "default_policy.json")

def load_policy():
    # Load keys from web/.env.local for DB access
    env_path = os.path.join(os.path.dirname(__file__), '..', '..', 'web', '.env.local')
    supabase_url = None
    supabase_key = None
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
                    supabase_url = line.split('=', 1)[1].strip()
                elif line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
                    supabase_key = line.split('=', 1)[1].strip()

    # Load static pricing from json
    with open(POLICY_PATH, 'r') as f:
        static_policy = json.load(f)
        pricing = static_policy.get("pricing", {})
    
    if not supabase_url or not supabase_key:
        print("Warning: Could not connect to DB. Using static policy.")
        return static_policy

    # Fetch dynamic rules from DB
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json"
    }
    url = f"{supabase_url}/rest/v1/rules?is_active=eq.true&order=priority.asc"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response:
            db_rules = json.loads(response.read().decode('utf-8'))
            
            # Reconstruct the policy structure expected by run_bre
            policy = {
                "hard_reject_gates": [],
                "eligibility_gates": [],
                "scoring_rules": [],
                "pricing": pricing
            }
            
            OP_MAP = {
                "EQ": "==",
                "LT": "<",
                "GT": ">",
                "LTE": "<=",
                "GTE": ">="
            }
            
            for r in db_rules:
                rule_obj = {
                    "id": r["rule_code"],
                    "field": r["field_name"],
                    "operator": OP_MAP.get(r["operator"], "=="),
                    "threshold": r["threshold_value"],
                    "reason": r["description"],
                    "severity": r["reason_code"],
                    "deviation_weight": r.get("deviation_weight")
                }
                
                # Boolean threshold mapping if field is known boolean
                if rule_obj["field"] in ("writeOffFlag", "settlementFlag"):
                    rule_obj["threshold"] = bool(rule_obj["threshold"])

                if r["category"] == "hard_reject":
                    policy["hard_reject_gates"].append(rule_obj)
                elif r["category"] == "eligibility":
                    policy["eligibility_gates"].append(rule_obj)
                elif r["category"] == "scoring":
                    policy["scoring_rules"].append(rule_obj)
                    
            return policy
    except Exception as e:
        print(f"Error fetching rules from Supabase: {e}. Falling back to static.")
        return static_policy

def evaluate_condition(operator: str, observed: Any, threshold: Any) -> bool:
    if observed is None:
        return False
    
    if operator == "==":
        return observed == threshold
    elif operator == "<":
        return observed < threshold
    elif operator == ">":
        return observed > threshold
    elif operator == "<=":
        return observed <= threshold
    elif operator == ">=":
        return observed >= threshold
    return False

def run_bre(profile: NormalizedApplicantProfile) -> DecisionReport:
    policy = load_policy()
    evaluations: List[RuleEvaluation] = []
    
    # 1. Hard gate: if we have truly NOTHING useful, stop immediately
    has_any_data = any([
        profile.declaredIncome,
        profile.bureauScore,
        profile.requestedLoanAmount,
    ])
    if not has_any_data:
        return DecisionReport(
            applicantId=profile.applicantId or "UNKNOWN",
            finalDecision="INSUFFICIENT_DATA",
            ruleEvaluations=[]
        )
    
    # 2. Partial-data warning — note what we're missing but continue
    partial_mode = bool(profile.missingFields)

        
    # 2. Compute Derived Metrics
    foir = 0.0
    if profile.declaredIncome and profile.declaredIncome > 0:
        foir = (profile.existingObligations or 0.0) / profile.declaredIncome
        
    # 3. Evaluate Hard-Reject Gates (Short-circuits)
    for rule in policy.get("hard_reject_gates", []):
        val = getattr(profile, rule["field"], None)
        is_triggered = evaluate_condition(rule["operator"], val, rule["threshold"])
        
        evaluations.append(RuleEvaluation(
            ruleId=rule["id"], category="Hard Reject", description=rule["reason"],
            outcome="HARD_REJECT" if is_triggered else "PASS",
            observedValue=val, threshold=rule["threshold"], reason=rule["reason"] if is_triggered else None
        ))
        
        if is_triggered:
            return DecisionReport(
                applicantId=profile.applicantId,
                finalDecision="HARD_REJECT",
                ruleEvaluations=evaluations
            )
            
    # 4. Evaluate Eligibility Gates
    for rule in policy.get("eligibility_gates", []):
        val = getattr(profile, rule["field"], None)
        is_triggered = evaluate_condition(rule["operator"], val, rule["threshold"])
        
        evaluations.append(RuleEvaluation(
            ruleId=rule["id"], category="Eligibility", description=rule["reason"],
            outcome="HARD_REJECT" if is_triggered else "PASS",
            observedValue=val, threshold=rule["threshold"], reason=rule["reason"] if is_triggered else None
        ))
        
        if is_triggered:
            return DecisionReport(
                applicantId=profile.applicantId,
                finalDecision="HARD_REJECT",
                ruleEvaluations=evaluations
            )

    # =========================================================================
    # PIPELINE ORDER CONFLICT-HANDLING POLICY
    # The evaluation order is strictly defined and MUST NOT change:
    # 1. Hard Reject Gates (Short-circuit on match)
    # 2. Eligibility Gates (Short-circuit on match)
    # 3. Scoring Rules (No short-circuit, deviation counts accumulate)
    # 4. Pricing (Static JSON, independent of DB rules)
    # This structure guarantees that pricing cannot override a hard-reject, 
    # and multiple scoring deviations strictly escalate exceptions.
    # =========================================================================

    # 5. Evaluate Scoring Rules (Do not short circuit)
    # We must ensure profile has the computed field 'foir_calculated' to match the DB seed field name
    setattr(profile, 'foir_calculated', round(foir, 2))
    deviations = 0

    asset_cap = (profile.requestedLoanAmount or 0.0) * 0.5
    has_asset_comp = profile.declaredAssets and profile.declaredAssets >= asset_cap

    for rule in policy.get("scoring_rules", []):
        val = getattr(profile, rule["field"], None)
        is_triggered = evaluate_condition(rule["operator"], val, rule["threshold"])

        # Special logic to preserve the FOIR hard-reject override without breaking the DB structure
        if is_triggered and rule["id"] == "SC-FOIR-BORDERLINE" and not has_asset_comp:
            evaluations.append(RuleEvaluation(
                ruleId=rule["id"], category="Scoring", description=rule["reason"],
                outcome="HARD_REJECT", observedValue=val, threshold=rule["threshold"],
                reason="FOIR is above safe limits and no asset compensation"
            ))
            return DecisionReport(applicantId=profile.applicantId, finalDecision="HARD_REJECT", ruleEvaluations=evaluations)

        if is_triggered:
            deviations += rule.get("deviation_weight", 0)
            
        evaluations.append(RuleEvaluation(
            ruleId=rule["id"], category="Scoring", description=rule["reason"],
            outcome=rule["severity"] if is_triggered else "PASS",
            observedValue=val, threshold=rule["threshold"], 
            reason=rule["reason"] if is_triggered else None
        ))

    # 6. Aggregate Outcomes (Exceptions)
    final_decision = "APPROVE"
    if deviations >= 2:
        final_decision = "L2_EXCEPTION"
    elif deviations == 1:
        final_decision = "L1_EXCEPTION"
        
    # 7. Loan Sizing & Pricing
    pricing = policy.get("pricing", {})
    # declaredIncome from ITR is already annual. From salary slip it may be monthly gross.
    # The reconciler's max-wins ensures the ITR (larger) value wins, so treat as annual.
    annual_income = profile.declaredIncome or 0
    max_by_income = annual_income * pricing.get("income_multiplier", 5)
    max_by_cap = pricing.get("max_loan_cap", 5000000)
    requested = profile.requestedLoanAmount or max_by_income  # if no request, size to max eligible
    
    eligible = min(max_by_income, max_by_cap, requested)
    
    risk_grade = "A"
    rate_band = pricing.get("rates", {}).get("A", "10-12%")
    if deviations >= 2:
        risk_grade = "D"
        rate_band = pricing.get("rates", {}).get("D", "18-24%")
    elif deviations == 1:
        risk_grade = "C"
        rate_band = pricing.get("rates", {}).get("C", "14-18%")
        
    return DecisionReport(
        applicantId=profile.applicantId,
        finalDecision=final_decision,
        riskGrade=risk_grade,
        eligibleAmount=round(eligible, 2),
        interestRateBand=rate_band,
        ruleEvaluations=evaluations
    )
