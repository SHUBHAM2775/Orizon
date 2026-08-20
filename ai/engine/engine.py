import os
import json
from typing import Dict, Any, List
from core.models import NormalizedApplicantProfile, DecisionReport, RuleEvaluation

POLICY_PATH = os.path.join(os.path.dirname(__file__), "default_policy.json")

def load_policy():
    with open(POLICY_PATH, 'r') as f:
        return json.load(f)

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
    
    # 1. Missing Data Check
    if profile.missingFields:
        return DecisionReport(
            applicantId=profile.applicantId or "UNKNOWN",
            finalDecision="INSUFFICIENT_DATA",
            ruleEvaluations=[]
        )
        
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

    # 5. Evaluate Scoring Rules (Do not short circuit)
    scoring = policy.get("scoring_rules", {})
    deviations = 0
    
    # FOIR evaluation
    foir_bands = scoring.get("foir_bands", {})
    asset_cap = (profile.requestedLoanAmount or 0.0) * 0.5
    has_asset_comp = profile.declaredAssets and profile.declaredAssets >= asset_cap
    
    foir_outcome = "PASS"
    if foir > foir_bands.get("borderline_threshold", 0.55):
        if has_asset_comp:
            foir_outcome = "FLAG"
            deviations += 1
        else:
            foir_outcome = "HARD_REJECT"
    elif foir > foir_bands.get("pass_threshold", 0.40):
        foir_outcome = "FLAG"
        deviations += 1
        
    evaluations.append(RuleEvaluation(
        ruleId="SC-FOIR", category="Scoring", description="FOIR Check",
        outcome=foir_outcome, observedValue=round(foir, 2), threshold=foir_bands.get("pass_threshold"),
        reason="FOIR is above safe limits" if foir_outcome != "PASS" else None
    ))
    
    if foir_outcome == "HARD_REJECT":
        return DecisionReport(applicantId=profile.applicantId, finalDecision="HARD_REJECT", ruleEvaluations=evaluations)

    # Bureau evaluation
    bureau_score = profile.bureauScore or 0
    b_bands = scoring.get("bureau_bands", {})
    b_outcome = "PASS"
    if bureau_score < b_bands.get("fair", 650):
        b_outcome = "FLAG"
        deviations += 2 # Heavy deviation for weak bureau
    elif bureau_score < b_bands.get("good", 700):
        b_outcome = "FLAG"
        deviations += 1
        
    evaluations.append(RuleEvaluation(
        ruleId="SC-BUREAU", category="Scoring", description="Bureau Score Band",
        outcome=b_outcome, observedValue=bureau_score, threshold=b_bands.get("good"),
        reason="Bureau score in lower bands" if b_outcome != "PASS" else None
    ))

    # 6. Aggregate Outcomes (Exceptions)
    final_decision = "APPROVE"
    if deviations >= 2:
        final_decision = "L2_EXCEPTION"
    elif deviations == 1:
        final_decision = "L1_EXCEPTION"
        
    # 7. Loan Sizing & Pricing
    pricing = policy.get("pricing", {})
    annual_income = (profile.declaredIncome or 0) * 12
    eligible = min(
        annual_income * pricing.get("income_multiplier", 5),
        pricing.get("max_loan_cap", 5000000),
        profile.requestedLoanAmount or 0
    )
    
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
        eligibleAmount=eligible,
        interestRateBand=rate_band,
        ruleEvaluations=evaluations
    )
