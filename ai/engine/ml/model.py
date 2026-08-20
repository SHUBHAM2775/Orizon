"""
engine/model.py — ML Scoring + Policy Engine (Pipeline v2)

Public API:
  run_ml_scoring(profile)  → MLScoringResult
  run_policy_engine(profile, ml_result, combined_adj) → PolicyResult

Legacy shim:
  run_bre(profile) → DecisionReport   (used by main.py / api.py unchanged)
"""

import json
import os
from typing import Any, Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd

from core.models import (
    ContributingFactor, DecisionReport, FOIRAdjustment,
    MLScoringResult, NormalizedApplicantProfile, PolicyResult, RuleEvaluation,
)
from engine.config.ml_config import (
    BUSINESS_MODEL_VERSION, FOIR_MAX_ATTEMPTS, FOIR_STEP_PCT, FOIR_THRESHOLD,
    MODEL_FILES, PERSONAL_MODEL_VERSION, RISK_SCORE_ANCHORS, SCORE_POLICY,
    SEGMENTATION_METHOD,
)

# ---------------------------------------------------------------------------
# Stage 1 — ML Scoring (no API calls)
# ---------------------------------------------------------------------------

def run_ml_scoring(profile: NormalizedApplicantProfile) -> MLScoringResult:
    """Load XGBoost models, predict calibrated probabilities, return typed result."""
    artifacts = _load_or_train_models()
    loan_type = _infer_loan_type(profile)
    artifact = artifacts[loan_type]
    frame = _profile_to_model_frame(profile, artifact["feature_columns"])

    probabilities = _predict_probabilities(artifact, frame)
    score = _risk_score(probabilities)
    tier = _tier_from_score_and_probabilities(score, probabilities)

    return MLScoringResult(
        loan_type=loan_type,
        risk_tier=tier,
        risk_score=round(score, 2),
        tier_probabilities={k: round(v, 6) for k, v in probabilities.items()},
        top_contributing_factors=_top_factors(artifact, frame, probabilities),
        model_version=artifact.get("model_version") or (
            PERSONAL_MODEL_VERSION if loan_type == "personal" else BUSINESS_MODEL_VERSION
        ),
        segmentation_method=artifact.get("segmentation_method", SEGMENTATION_METHOD),
    )


# ---------------------------------------------------------------------------
# Stage 4 — Policy / BRE Engine (no API calls)
# ---------------------------------------------------------------------------

def run_policy_engine(
    profile: NormalizedApplicantProfile,
    ml_result: MLScoringResult,
    combined_tool_adjustment: float,
) -> PolicyResult:
    """
    Hard-reject gates → apply tool adjustment → FOIR retry → eligibility → decision.
    Order is fixed and inviolable.
    """
    # 1. Hard-reject gates — always first, short-circuit everything
    hard_reject_rules = _evaluate_hard_rejects(profile)
    if hard_reject_rules:
        return PolicyResult(
            hard_reject_triggered=True,
            triggered_rules=hard_reject_rules,
            foir_adjustment=None,
            final_decision="HARD_REJECT",
            escalation_authority="SYSTEM_AUTO",
            final_score=ml_result.risk_score,
            combined_tool_adjustment=0.0,
            risk_grade=_risk_grade_from_score(ml_result.risk_score),
            interest_rate_band=_interest_band_from_score(ml_result.risk_score),
            max_eligible_amount=0.0,
            is_eligible_for_requested=False,
        )

    # 2. Apply combined tool adjustment to ML base score
    final_score = ml_result.risk_score * (1.0 + combined_tool_adjustment)
    final_score = round(max(0.0, min(100.0, final_score)), 2)

    # 3. FOIR bounded retry loop
    foir_adj = _try_foir_adjustment(profile)

    # 4. Eligibility rules (from default_policy.json)
    eligibility_rules = _evaluate_eligibility(profile)
    ineligible = any(r.outcome != "PASS" for r in eligibility_rules)

    # 5. Score → decision mapping
    if ineligible:
        final_decision, escalation = "HARD_REJECT", "SYSTEM_AUTO"
    else:
        final_decision, escalation = _decision_from_score(profile, final_score)

    # 6. Sizing
    if ineligible:
        max_eligible = 0.0
    else:
        max_eligible = _max_eligible_amount(profile)
        if foir_adj.cleared and foir_adj.final_amount is not None:
            max_eligible = min(max_eligible, foir_adj.final_amount)
    requested = profile.requestedLoanAmount

    all_rules = eligibility_rules + [
        RuleEvaluation(
            ruleId="ML-RISK-TIER", category="ML Score",
            description="Calibrated model risk tier",
            outcome=ml_result.risk_tier,
            observedValue=final_score,
            threshold="P1/P2/P3/P4",
            reason=f"{ml_result.loan_type} model probability-weighted score",
        ),
    ]
    if combined_tool_adjustment != 0.0:
        all_rules.append(RuleEvaluation(
            ruleId="TOOL-ADJUSTMENT", category="Tool Catalog",
            description="Combined tool adjustment applied to ML score",
            outcome="FLAG",
            observedValue=round(combined_tool_adjustment, 4),
            threshold=0,
            reason=f"Score moved from {ml_result.risk_score} to {final_score}",
        ))

    return PolicyResult(
        hard_reject_triggered=False,
        triggered_rules=all_rules,
        foir_adjustment=foir_adj if foir_adj.triggered else None,
        final_decision=final_decision,
        escalation_authority=escalation,
        final_score=final_score,
        combined_tool_adjustment=combined_tool_adjustment,
        risk_grade=_risk_grade_from_score(final_score),
        interest_rate_band=_interest_band_from_score(final_score),
        max_eligible_amount=round(max_eligible, 2),
        is_eligible_for_requested=(requested <= max_eligible if requested is not None else None),
    )


# ---------------------------------------------------------------------------
# FOIR Bounded Retry (deterministic loop, not an agent)
# ---------------------------------------------------------------------------

def _try_foir_adjustment(
    profile: NormalizedApplicantProfile,
    max_attempts: int = FOIR_MAX_ATTEMPTS,
    step_pct: float = FOIR_STEP_PCT,
) -> FOIRAdjustment:
    if not profile.declaredIncome or not profile.requestedLoanAmount or profile.declaredIncome <= 0:
        return FOIRAdjustment(triggered=False, cleared=False)

    obligations = profile.existingObligations or 0.0
    amount = profile.requestedLoanAmount
    attempts = []

    for i in range(max_attempts):
        foir = obligations / profile.declaredIncome
        attempts.append({
            "attempt": i,
            "amount": round(amount, 2),
            "foir": round(foir, 4),
        })
        if foir <= FOIR_THRESHOLD:
            return FOIRAdjustment(
                triggered=True, final_amount=round(amount, 2),
                attempts=attempts, cleared=True,
            )
        amount *= (1 - step_pct)

    return FOIRAdjustment(triggered=True, final_amount=None, attempts=attempts, cleared=False)


# ---------------------------------------------------------------------------
# Hard-Reject & Eligibility Gates (from default_policy.json)
# ---------------------------------------------------------------------------

_POLICY_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "default_policy.json")

def _load_policy(policy_path: str = _POLICY_PATH) -> Dict[str, Any]:
    with open(_POLICY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def _evaluate_hard_rejects(profile: NormalizedApplicantProfile) -> List[RuleEvaluation]:
    policy = _load_policy()
    triggered = []
    data = profile.model_dump()
    for gate in policy.get("hard_reject_gates", []):
        field_val = data.get(gate["field"])
        threshold = gate["threshold"]
        op = gate["operator"]
        fired = False
        if op == "==" and field_val == threshold:
            fired = True
        elif op == "<" and field_val is not None and field_val < threshold:
            fired = True
        elif op == ">" and field_val is not None and field_val > threshold:
            fired = True
        if fired:
            triggered.append(RuleEvaluation(
                ruleId=gate["id"], category="Hard Reject",
                description=gate["reason"], outcome="HARD_REJECT",
                observedValue=field_val, threshold=threshold,
                reason=gate["reason"],
            ))
    return triggered

def _evaluate_eligibility(profile: NormalizedApplicantProfile) -> List[RuleEvaluation]:
    policy = _load_policy()
    results = []
    data = profile.model_dump()
    for gate in policy.get("eligibility_gates", []):
        field_val = data.get(gate["field"])
        threshold = gate["threshold"]
        op = gate["operator"]
        fired = False
        if op == "<" and field_val is not None and field_val < threshold:
            fired = True
        elif op == ">" and field_val is not None and field_val > threshold:
            fired = True
        outcome = "INELIGIBLE" if fired else "PASS"
        results.append(RuleEvaluation(
            ruleId=gate["id"], category="Eligibility",
            description=gate["reason"], outcome=outcome,
            observedValue=field_val, threshold=threshold,
            reason=gate["reason"] if fired else None,
        ))
    return results


# ---------------------------------------------------------------------------
# Shared Helpers (unchanged from v1)
# ---------------------------------------------------------------------------

def _load_or_train_models() -> Dict[str, Dict[str, Any]]:
    if not all(os.path.exists(path) for path in MODEL_FILES.values()):
        from .train_models import train_all
        train_all(force=False)
    return {loan_type: joblib.load(path) for loan_type, path in MODEL_FILES.items()}

def _profile_to_model_frame(profile: NormalizedApplicantProfile, columns: List[str]) -> pd.DataFrame:
    values = profile.model_dump()
    aliases = {
        "PROSPECTID": profile.applicantId,
        "Credit_Score": profile.bureauScore,
        "NETMONTHLYINCOME": profile.declaredIncome,
        "AGE": profile.age,
        "Time_With_Curr_Empr": profile.businessVintage,
        "Tot_Missed_Pmnt": profile.bounceCount,
        "enq_L3m": profile.enquiries,
        "MARITALSTATUS": values.get("MARITALSTATUS") or values.get("maritalStatus"),
        "EDUCATION": values.get("EDUCATION") or values.get("education"),
        "GENDER": values.get("GENDER") or values.get("gender"),
    }
    for key in ("PL_TL", "CC_TL", "Consumer_TL", "Home_TL", "Unsecured_TL", "Secured_TL", "Other_TL", "last_prod_enq2", "first_prod_enq2"):
        aliases[key] = values.get(key)
    return pd.DataFrame([{col: values.get(col, aliases.get(col, np.nan)) for col in columns}], columns=columns)

def _predict_probabilities(artifact: Dict[str, Any], frame: pd.DataFrame) -> Dict[str, float]:
    probs = artifact["model"].predict_proba(frame)[0]
    result = {tier: 0.0 for tier in RISK_SCORE_ANCHORS}
    for idx, prob in enumerate(probs):
        label = artifact["index_to_class"].get(idx, str(idx))
        if label in result:
            result[label] = float(prob)
    total = sum(result.values())
    return {k: (v / total if total > 0 else v) for k, v in result.items()}

def _risk_score(probabilities: Dict[str, float]) -> float:
    return sum(probabilities.get(tier, 0.0) * anchor for tier, anchor in RISK_SCORE_ANCHORS.items())

def _tier_from_score_and_probabilities(score: float, probabilities: Dict[str, float]) -> str:
    return max(probabilities.items(), key=lambda item: item[1])[0] if probabilities else _tier_from_score(score)

def _tier_from_score(score: float) -> str:
    if score >= 82:
        return "P1"
    if score >= 62:
        return "P2"
    if score >= 35:
        return "P3"
    return "P4"

def _decision_from_score(profile: NormalizedApplicantProfile, score: float) -> Tuple[str, str]:
    if profile.writeOffFlag or profile.settlementFlag or profile.defaultFlag:
        return "HARD_REJECT", "SYSTEM_AUTO"
    if score >= SCORE_POLICY.approve_min_score:
        if (profile.requestedLoanAmount or 0) > SCORE_POLICY.max_l1_amount:
            return "EXCEPTION_L1", "CREDIT_MANAGER"
        return "APPROVED", "SYSTEM_AUTO"
    if score >= SCORE_POLICY.l1_min_score:
        return "EXCEPTION_L1", "CREDIT_MANAGER"
    if score >= SCORE_POLICY.l2_min_score:
        return "EXCEPTION_L2", "VP_CREDIT"
    return "HARD_REJECT", "SYSTEM_AUTO"

def _risk_grade_from_score(score: float) -> str:
    if score >= 82:
        return "A"
    if score >= 70:
        return "B"
    if score >= 55:
        return "C"
    if score >= 38:
        return "D"
    return "E"

def _interest_band_from_score(score: float) -> str:
    return {"A": "10-12%", "B": "12-14%", "C": "14-18%", "D": "18-24%", "E": "24%+"}[_risk_grade_from_score(score)]

def _max_eligible_amount(profile: NormalizedApplicantProfile) -> float:
    return min((profile.declaredIncome or 0.0) * SCORE_POLICY.income_multiplier, SCORE_POLICY.max_loan_cap)

def _top_factors(artifact: Dict[str, Any], frame: pd.DataFrame, probabilities: Dict[str, float]) -> List[ContributingFactor]:
    try:
        estimator = artifact["model"].calibrated_classifiers_[0].estimator
        preprocessor = estimator.named_steps["preprocess"]
        model = estimator.named_steps["model"]
        transformed = preprocessor.transform(frame)
        names = preprocessor.get_feature_names_out()
        import shap
        values = shap.TreeExplainer(model).shap_values(transformed)
        tier = max(probabilities.items(), key=lambda item: item[1])[0]
        class_index = artifact["class_to_index"].get(tier, 0)
        row_values = values[class_index][0] if isinstance(values, list) else values[0]
        order = np.argsort(np.abs(row_values))[::-1][:5]
        return [ContributingFactor(feature=str(names[i]), shap_value=float(row_values[i]), direction="positive" if row_values[i] >= 0 else "negative") for i in order]
    except Exception:
        return [ContributingFactor(feature=str(col), shap_value=0.0, direction="positive") for col in frame.columns[:5] if not pd.isna(frame.iloc[0][col])]

def _infer_loan_type(profile: NormalizedApplicantProfile) -> str:
    data = profile.model_dump()
    explicit = data.get("loan_type") or data.get("loanType")
    if isinstance(explicit, str) and explicit.lower() in ("personal", "business"):
        return explicit.lower()
    if data.get("industry") or data.get("sector") or data.get("businessSector") or data.get("business_sector"):
        return "business"
    employment = str(profile.employmentType or "").lower()
    if any(token in employment for token in ("self", "business", "owner", "proprietor")):
        return "business"
    unsecured = _float(data.get("Unsecured_TL"))
    other = _float(data.get("Other_TL"))
    pl = _float(data.get("PL_TL"))
    consumer = _float(data.get("Consumer_TL"))
    return "business" if unsecured >= max(2.0, pl + consumer + 1.0) or (other >= 2 and unsecured >= 2) else "personal"

def _float(value: Any) -> float:
    try:
        if value is None or pd.isna(value):
            return 0.0
        return float(value)
    except Exception:
        return 0.0
