"""
engine/tools/ — Tool Catalog for the Underwriting Pipeline

Routing is deterministic code, not an LLM decision. Each tool runs its own
capped loop independently — they don't call each other and can't trigger new tools.
"""

from typing import List

from core.models import APIBudget, MLScoringResult, NormalizedApplicantProfile, ToolResult
from engine.config.ml_config import ADVERSE_MEDIA_AMOUNT_THRESHOLD, COMBINED_CAP, TOOL_CAPS


def run_tool_catalog(
    applicant: NormalizedApplicantProfile,
    ml_result: MLScoringResult,
    api_budget: APIBudget,
) -> List[ToolResult]:
    """
    Deterministic routing table. Every tool either runs or is skipped with a reason.
    Always returns exactly 6 entries.
    """
    is_business = ml_result.loan_type == "business"
    has_collateral = bool(applicant.declaredAssets and applicant.declaredAssets > 0)
    is_large_business = is_business and (applicant.requestedLoanAmount or 0) > ADVERSE_MEDIA_AMOUNT_THRESHOLD
    has_financials = is_business and bool(applicant.declaredIncome)

    # Lazy imports to keep module loading fast
    from .market_analysis import run_market_tool
    from .employer_verification import run_employer_tool
    from .collateral_valuation import run_collateral_tool
    from .adverse_media import run_adverse_media_tool
    from .macro_outlook import run_macro_tool
    from .peer_benchmarking import run_peer_tool

    routing = [
        ("market_analysis",       is_business,       "personal loan",               lambda: run_market_tool(applicant, ml_result, api_budget)),
        ("employer_verification", True,              None,                          lambda: run_employer_tool(applicant, api_budget)),
        ("collateral_valuation",  has_collateral,    "no collateral declared",      lambda: run_collateral_tool(applicant, api_budget)),
        ("adverse_media",         is_large_business, "personal/below threshold",    lambda: run_adverse_media_tool(applicant, api_budget)),
        ("macro_outlook",         is_business,       "personal loan",               lambda: run_macro_tool(applicant, api_budget)),
        ("peer_benchmarking",     has_financials,    "no income declared/personal", lambda: run_peer_tool(applicant, api_budget)),
    ]

    results: List[ToolResult] = []
    for tool_id, condition, skip_reason, fn in routing:
        if not condition:
            results.append(ToolResult(
                tool_id=tool_id, ran=False, skip_reason=skip_reason or "condition not met",
            ))
        else:
            try:
                results.append(fn())
            except Exception as e:
                results.append(ToolResult(
                    tool_id=tool_id, ran=True, adjustment_applied=0.0,
                    needs_manual_review=True,
                    key_reasons=[f"Tool failed: {str(e)}"],
                    confidence="low",
                ))
    return results


def aggregate_adjustments(tool_results: List[ToolResult]) -> float:
    """
    Sum per-tool adjustments (each already clamped by its own cap), then clamp
    the combined total to COMBINED_CAP.
    """
    total = 0.0
    for t in tool_results:
        if not t.ran:
            continue
        lo, hi = TOOL_CAPS.get(t.tool_id, (-0.10, 0.10))
        clamped = max(lo, min(hi, t.adjustment_applied))
        total += clamped
    return max(COMBINED_CAP[0], min(COMBINED_CAP[1], total))
