"""
engine/engine.py — Backward-compatible entry point

main.py and api.py call `run_bre(profile)` → this shim routes to the v2 orchestrator
and maps the result back to DecisionReport.
"""

from core.models import DecisionReport, NormalizedApplicantProfile
from engine.core.orchestrator import run_underwriting, to_decision_report


def run_bre(profile: NormalizedApplicantProfile) -> DecisionReport:
    """Backward-compatible shim — main.py and api.py need zero changes."""
    result = run_underwriting(profile)
    return to_decision_report(result, profile)


__all__ = ["run_bre"]
