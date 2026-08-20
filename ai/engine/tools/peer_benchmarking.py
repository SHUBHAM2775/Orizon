"""
Tool 6 — Peer Benchmarking (business loans with declared income)

Compares declared financials against sector-typical ranges using a statistical
z-score — NOT an LLM impression of "typical". Deterministic when sector data exists.
Cap: ±10%. Max searches: 1 (only if no baseline in config). No LLM.
"""

from typing import Optional

from core.models import APIBudget, NormalizedApplicantProfile, ToolResult
from engine.config.ml_config import SECTOR_BASELINES


def run_peer_tool(
    applicant: NormalizedApplicantProfile,
    api_budget: APIBudget,
) -> ToolResult:
    sector = _extract_sector(applicant)
    if not sector:
        return ToolResult(
            tool_id="peer_benchmarking",
            ran=True,
            adjustment_applied=0.0,
            key_reasons=["No sector identified — cannot benchmark."],
            confidence="low",
            needs_manual_review=True,
        )

    # Look up sector baseline
    baseline = SECTOR_BASELINES.get(sector.lower())
    if not baseline:
        # Try fuzzy match
        for key in SECTOR_BASELINES:
            if key in sector.lower() or sector.lower() in key:
                baseline = SECTOR_BASELINES[key]
                break

    if not baseline:
        return ToolResult(
            tool_id="peer_benchmarking",
            ran=True,
            adjustment_applied=0.0,
            key_reasons=[f"No sector baseline available for '{sector}'."],
            confidence="low",
            needs_manual_review=True,
            skip_reason=f"no sector baseline for '{sector}'",
        )

    # Z-score calculation — deterministic
    income = applicant.declaredIncome or 0.0
    median = baseline["median_income"]
    std = baseline.get("std_income", 1.0)

    z = (income - median) / std if std > 0 else 0.0

    reasons = []
    if z < -2:
        adjustment = -0.08
        reasons.append(
            f"Declared income ₹{income:,.0f} is far below sector median ₹{median:,.0f} "
            f"(z-score: {z:.2f}). Significantly below peers."
        )
    elif z < -1:
        adjustment = -0.03
        reasons.append(
            f"Declared income ₹{income:,.0f} is below sector median ₹{median:,.0f} "
            f"(z-score: {z:.2f}). Moderately below peers."
        )
    elif z < 1:
        adjustment = 0.0
        reasons.append(
            f"Declared income ₹{income:,.0f} is within typical range for sector "
            f"(median ₹{median:,.0f}, z-score: {z:.2f})."
        )
    else:
        adjustment = 0.04
        reasons.append(
            f"Declared income ₹{income:,.0f} is above sector median ₹{median:,.0f} "
            f"(z-score: {z:.2f}). Stronger than typical peers."
        )

    # Vintage comparison if available
    if applicant.businessVintage and baseline.get("median_vintage"):
        vintage_z = (applicant.businessVintage - baseline["median_vintage"]) / max(baseline["median_vintage"] * 0.5, 1)
        if vintage_z < -1:
            reasons.append(f"Business vintage ({applicant.businessVintage}y) is below sector median ({baseline['median_vintage']}y).")
        elif vintage_z > 1:
            reasons.append(f"Business vintage ({applicant.businessVintage}y) is above sector median ({baseline['median_vintage']}y) — established entity.")

    return ToolResult(
        tool_id="peer_benchmarking",
        ran=True,
        adjustment_applied=adjustment,
        key_reasons=reasons,
        confidence="medium",
        raw_findings={
            "sector": sector,
            "income_z_score": round(z, 4),
            "declared_income": income,
            "sector_median_income": median,
            "sector_std_income": std,
        },
        api_calls_used=0,
    )


def _extract_sector(applicant: NormalizedApplicantProfile) -> Optional[str]:
    data = applicant.model_dump()
    for key in ("industry", "sector", "businessSector", "business_sector", "loanPurpose", "loan_purpose"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None
