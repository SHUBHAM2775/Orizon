"""
engine/xai.py — XAI Narrative Generator (Pipeline v2)

Single LLM call. Returns str only. Narrates the decision that has already been made.
Never reads a decision field back out of this — enforced by return type.
"""

import json
import os
from typing import List, Tuple

from core.models import (
    APIBudget, MLScoringResult, NormalizedApplicantProfile,
    PolicyResult, ToolResult,
)


def generate_xai_narrative(
    applicant: NormalizedApplicantProfile,
    ml_result: MLScoringResult,
    tool_results: List[ToolResult],
    policy_result: PolicyResult,
    api_budget: APIBudget,
) -> Tuple[str, List[str]]:
    """
    Single Groq call that explains the finalized decision. 
    Returns (narrative, actionable_steps).
    """
    context = _build_context(applicant, ml_result, tool_results, policy_result)

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or not api_budget.can_call("groq_llm", "xai_narrative"):
        return _fallback_narrative(ml_result, tool_results, policy_result)

    try:
        from groq import Groq
        api_budget.consume("groq_llm", "xai_narrative", endpoint="groq/chat")

        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="qwen/qwen3.6-27b", # Use a model that reliably supports JSON mode
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": context},
            ],
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content.strip()
        if content:
            parsed = json.loads(content)
            return parsed.get("narrative", ""), parsed.get("actionable_steps", [])
    except Exception as e:
        print(f"  [XAI] LLM call failed: {e}")

    return _fallback_narrative(ml_result, tool_results, policy_result)


_SYSTEM_PROMPT = """You are an Explainable AI (XAI) agent for a credit underwriting system.
The decision has ALREADY been made. Your job is to EXPLAIN it — not to suggest a different decision.

You MUST respond in strict JSON format matching exactly this schema:
{
  "narrative": "A VERY CONCISE summary (MAXIMUM 2-3 SENTENCES) explaining the purpose of everything and what drove the score up/down, along with a brief summary of the decision.",
  "actionable_steps": [
    "A clear, concise step the applicant can take to improve their chances (e.g., 'Reduce FOIR below 40%').",
    "Another optional step."
  ]
}

DO NOT include tables, greetings, or any other information outside the JSON object."""


def _build_context(applicant, ml_result, tool_results, policy_result) -> str:
    sections = []

    # Decision summary
    sections.append(f"DECISION: {policy_result.final_decision}")
    sections.append(f"RISK TIER: {ml_result.risk_tier} (ML score {ml_result.risk_score}, final score {policy_result.final_score})")
    sections.append(f"LOAN TYPE: {ml_result.loan_type}")
    sections.append(f"RISK GRADE: {policy_result.risk_grade}")
    sections.append(f"INTEREST BAND: {policy_result.interest_rate_band}")
    sections.append(f"MAX ELIGIBLE: {policy_result.max_eligible_amount}")
    sections.append(f"ESCALATION: {policy_result.escalation_authority or 'N/A'}")

    # Applicant profile
    sections.append(f"\nAPPLICANT:")
    sections.append(f"  Income: {applicant.declaredIncome}")
    sections.append(f"  Bureau Score: {applicant.bureauScore}")
    sections.append(f"  Requested: {applicant.requestedLoanAmount}")
    sections.append(f"  Vintage: {applicant.businessVintage}")
    sections.append(f"  Obligations: {applicant.existingObligations}")

    # SHAP factors
    if ml_result.top_contributing_factors:
        sections.append(f"\nTOP SHAP FACTORS:")
        for f in ml_result.top_contributing_factors:
            sections.append(f"  {f.feature}: SHAP={f.shap_value:+.4f} ({f.direction})")

    # Tool results
    sections.append(f"\nTOOL RESULTS:")
    for t in tool_results:
        status = "RAN" if t.ran else f"SKIPPED ({t.skip_reason})"
        sections.append(f"  [{t.tool_id}] {status}")
        if t.ran:
            sections.append(f"    Adjustment: {t.adjustment_applied:+.4f} | Confidence: {t.confidence}")
            for reason in t.key_reasons[:3]:
                sections.append(f"    • {reason}")
            if t.sources:
                sections.append(f"    Sources: {', '.join(t.sources[:2])}")
            if t.needs_manual_review:
                sections.append(f"    ⚠ NEEDS MANUAL REVIEW")

    # Combined adjustment
    sections.append(f"\nCOMBINED TOOL ADJUSTMENT: {policy_result.combined_tool_adjustment:+.4f}")

    # FOIR
    if policy_result.foir_adjustment:
        fa = policy_result.foir_adjustment
        sections.append(f"\nFOIR RETRY:")
        sections.append(f"  Cleared: {fa.cleared}")
        if fa.final_amount:
            sections.append(f"  Final Amount: {fa.final_amount}")
        for attempt in fa.attempts:
            sections.append(f"  Attempt {attempt['attempt']}: ₹{attempt['amount']:,.0f} → FOIR {attempt['foir']:.2%}")

    # Triggered rules
    sections.append(f"\nTRIGGERED RULES:")
    for rule in policy_result.triggered_rules:
        sections.append(f"  [{rule.ruleId}] {rule.description} → {rule.outcome} (observed: {rule.observedValue}, threshold: {rule.threshold})")

    return "\n".join(sections)


def _fallback_narrative(ml_result, tool_results, policy_result) -> Tuple[str, List[str]]:
    """Concise 2-3 sentence template narrative when LLM is unavailable."""
    adj = policy_result.combined_tool_adjustment
    adjustment_str = f"a positive adjustment of {adj:+.4f}" if adj >= 0 else f"a negative adjustment of {adj:+.4f}"
    
    sentence1 = f"The application has been resolved as {policy_result.final_decision} with a final underwriting score of {policy_result.final_score:.2f}."
    sentence2 = f"This decision reflects an initial risk tier of {ml_result.risk_tier} combined with {adjustment_str} from the agentic verification tools."
    sentence3 = f"A maximum eligible limit of ₹{policy_result.max_eligible_amount or 0:,.2f} is established under escalation authority {policy_result.escalation_authority or 'SYSTEM_AUTO'}."
    
    narrative = f"{sentence1} {sentence2} {sentence3}"
    
    actionable_steps = [
        "Ensure declared income reflects all verifiable sources to improve FOIR.",
        "Maintain a stable average bank balance and clear past dues to improve bureau score."
    ]

    return narrative, actionable_steps
