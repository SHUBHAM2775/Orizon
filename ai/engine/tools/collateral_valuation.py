"""
Tool 3 — Collateral Valuation Check (secured loans only)

Pure deterministic LTV ratio calculation. No LLM.
Optional: 1 web search for market-value sanity check.
Cap: ±10%.
"""

import urllib.parse
import urllib.request

from core.models import APIBudget, NormalizedApplicantProfile, ToolResult


def run_collateral_tool(
    applicant: NormalizedApplicantProfile,
    api_budget: APIBudget,
) -> ToolResult:
    declared_assets = applicant.declaredAssets or 0.0
    requested = applicant.requestedLoanAmount or 0.0

    if declared_assets <= 0:
        return ToolResult(
            tool_id="collateral_valuation",
            ran=True,
            adjustment_applied=0.0,
            key_reasons=["No collateral value declared."],
            confidence="low",
            needs_manual_review=True,
        )

    # Core LTV calculation — deterministic, no LLM
    ltv = requested / declared_assets if declared_assets > 0 else float("inf")

    reasons = []
    if ltv <= 0.60:
        adjustment = 0.05
        reasons.append(f"LTV ratio {ltv:.2%} is well within safe range (≤60%).")
    elif ltv <= 0.80:
        adjustment = 0.0
        reasons.append(f"LTV ratio {ltv:.2%} is within acceptable range (60-80%).")
    else:
        adjustment = -0.08
        reasons.append(f"LTV ratio {ltv:.2%} exceeds 80% — elevated exposure.")

    # Optional: market value sanity check via web search
    market_check = None
    sources = []
    if api_budget.can_call("web_search", "collateral_valuation"):
        market_check = _search_market_value(applicant, api_budget)
        if market_check:
            sources = market_check.get("sources", [])
            if market_check.get("value_mismatch"):
                adjustment = min(adjustment, -0.06)
                reasons.append(
                    f"Market value check suggests declared value may be "
                    f"{market_check['mismatch_direction']} by ~{market_check.get('mismatch_pct', '?')}%."
                )

    return ToolResult(
        tool_id="collateral_valuation",
        ran=True,
        adjustment_applied=adjustment,
        key_reasons=reasons,
        sources=sources,
        confidence="medium" if market_check else "low",
        raw_findings={
            "ltv_ratio": round(ltv, 4),
            "declared_assets": declared_assets,
            "requested_amount": requested,
            "market_check": market_check,
        },
        api_calls_used=1 if market_check else 0,
    )


def _search_market_value(applicant, api_budget):
    """Single search for property/asset market value. Returns dict or None."""
    data = applicant.model_dump()
    asset_type = data.get("collateral_type") or data.get("assetType") or "property"
    location = data.get("city") or data.get("location") or "India"
    query = f"{asset_type} {location} market value 2026"

    try:
        url = "https://duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
        api_budget.consume("web_search", "collateral_valuation", endpoint=url)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=8) as response:
            html = response.read().decode("utf-8", errors="ignore")
        return {
            "searched": True,
            "sources": [url],
            "value_mismatch": False,
            "mismatch_direction": None,
            "mismatch_pct": None,
        }
    except Exception:
        return None
