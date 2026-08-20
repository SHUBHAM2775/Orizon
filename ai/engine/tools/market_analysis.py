"""
Tool 1 — Market / Sector Analysis (business loans only)

Wraps existing engine/market_agent.py into ToolResult shape.
Cap: ±15%. Max searches: 2. Max LLM: 1. Cached by sector+month.
"""

from core.models import APIBudget, MLScoringResult, NormalizedApplicantProfile, ToolResult
from .market_agent import run_market_analysis


def run_market_tool(
    applicant: NormalizedApplicantProfile,
    ml_result: MLScoringResult,
    api_budget: APIBudget,
) -> ToolResult:
    """Delegates to the existing market_agent, wraps into ToolResult."""
    calls_before = api_budget.total_calls_used

    try:
        analysis = run_market_analysis(applicant, ml_result.risk_score, ml_result.risk_tier)

        calls_used = api_budget.total_calls_used - calls_before

        return ToolResult(
            tool_id="market_analysis",
            ran=True,
            adjustment_applied=analysis.adjustment_applied,
            key_reasons=analysis.key_reasons,
            sources=analysis.sources,
            confidence=analysis.confidence,
            needs_manual_review=(analysis.sector_outlook == "not_run"),
            raw_findings={
                "sector_outlook": analysis.sector_outlook,
                "base_score": analysis.base_score,
                "final_score": analysis.final_score,
            },
            api_calls_used=calls_used,
            degraded=(analysis.sector_outlook == "not_run"),
        )
    except Exception as e:
        return ToolResult(
            tool_id="market_analysis",
            ran=True,
            adjustment_applied=0.0,
            key_reasons=[f"Market analysis failed: {str(e)}"],
            confidence="low",
            needs_manual_review=True,
            degraded=True,
        )
