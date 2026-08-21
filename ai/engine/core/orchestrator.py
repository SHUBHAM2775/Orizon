"""
engine/orchestrator.py — Pipeline v2 Orchestrator

Plain function with explicit state management. No AgentExecutor, no LangGraph.
Routing is deterministic code. The only agentic loops are inside individual tools.
"""

import json
import os
import uuid
from datetime import datetime, timezone

from core.models import (
    APIBudget, DecisionReport, MLScoringResult, NormalizedApplicantProfile,
    PipelineStage, PipelineState, PolicyResult, RuleEvaluation,
    ToolResult, UnderwritingResult,
)
from engine.ml.model import run_ml_scoring, run_policy_engine
from engine.tools import aggregate_adjustments, run_tool_catalog


# ---------------------------------------------------------------------------
# Audit Logger — append-only JSONL
# ---------------------------------------------------------------------------

_EXPERIMENTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "experiments")
_AUDIT_LOG_PATH = os.path.join(_EXPERIMENTS_DIR, "pipeline_runs.jsonl")


class AuditLogger:
    """Append-only audit logger for pipeline runs."""

    def __init__(self, state: PipelineState):
        self._state = state
        self._stages: dict = {}

    def log_stage(self, stage_name: str, data):
        if hasattr(data, "model_dump"):
            self._stages[stage_name] = data.model_dump(exclude_none=True)
        elif isinstance(data, list) and data and hasattr(data[0], "model_dump"):
            self._stages[stage_name] = [d.model_dump(exclude_none=True) for d in data]
        else:
            self._stages[stage_name] = data

    def log_failure(self, error: Exception):
        self._stages["failure"] = {
            "stage": self._state.failed_stage.value if self._state.failed_stage else "UNKNOWN",
            "error": str(error),
        }

    def finalize(self, state: PipelineState):
        os.makedirs(_EXPERIMENTS_DIR, exist_ok=True)
        record = {
            "run_id": state.run_id,
            "applicant_id": state.applicant_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "pipeline_version": "v2.0",
            "status": "completed" if state.current_stage == PipelineStage.COMPLETE else "failed",
            "final_stage": state.current_stage.value,
            "stages": self._stages,
            "api_budget": state.api_budget.summary(),
            "stage_history": state.stage_history,
        }
        if state.error:
            record["error"] = state.error
        try:
            with open(_AUDIT_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, default=str) + "\n")
        except Exception as e:
            print(f"  [Audit] Warning: failed to write audit log: {e}")


# ---------------------------------------------------------------------------
# Main Orchestrator
# ---------------------------------------------------------------------------

def run_underwriting(applicant: NormalizedApplicantProfile) -> UnderwritingResult:
    """
    Full pipeline: ML → Tools → Aggregate → Policy → XAI → Audit.
    Every stage is guarded by the state machine. Every external call is budget-tracked.
    """
    state = PipelineState(
        run_id=str(uuid.uuid4()),
        applicant_id=applicant.applicantId or "UNKNOWN",
        api_budget=APIBudget(),
    )
    audit = AuditLogger(state)

    try:
        # Insufficient data check
        has_any_data = any([applicant.declaredIncome, applicant.bureauScore, applicant.requestedLoanAmount])
        if not has_any_data:
            state.fail("Insufficient usable applicant data")
            audit.finalize(state)
            return UnderwritingResult(
                applicant_id=state.applicant_id,
                loan_type="personal",
                ml_result=MLScoringResult(
                    loan_type="personal", risk_tier="P4", risk_score=0.0,
                    tier_probabilities={}, model_version="", segmentation_method="",
                ),
                policy_result=PolicyResult(
                    hard_reject_triggered=False,
                    final_decision="INSUFFICIENT_DATA",
                    final_score=0.0,
                ),
                xai_narrative="Insufficient usable applicant data was provided.",
                run_id=state.run_id,
            )

        # Stage 1 — ML Scoring (0 API calls)
        state.advance_to(PipelineStage.ML_SCORING)
        state.ml_result = run_ml_scoring(applicant)
        audit.log_stage("ml_scoring", state.ml_result)
        print(f"  [Pipeline] ML scoring: tier={state.ml_result.risk_tier}, score={state.ml_result.risk_score}")

        # Stage 2 — Tool Catalog (budget-tracked API calls)
        state.advance_to(PipelineStage.TOOL_CATALOG)
        state.tool_results = run_tool_catalog(applicant, state.ml_result, state.api_budget)
        audit.log_stage("tool_catalog", state.tool_results)
        ran_tools = [t.tool_id for t in state.tool_results if t.ran]
        skipped_tools = [t.tool_id for t in state.tool_results if not t.ran]
        print(f"  [Pipeline] Tools ran: {ran_tools}  |  Skipped: {skipped_tools}")

        # Stage 3 — Aggregation (0 API calls)
        state.advance_to(PipelineStage.AGGREGATION)
        state.combined_adjustment = aggregate_adjustments(state.tool_results)
        audit.log_stage("aggregation", {
            "combined_adjustment": state.combined_adjustment,
            "per_tool": {t.tool_id: t.adjustment_applied for t in state.tool_results if t.ran},
        })
        print(f"  [Pipeline] Combined tool adjustment: {state.combined_adjustment:+.4f}")

        # Stage 4 — Policy Engine (0 API calls)
        state.advance_to(PipelineStage.POLICY_ENGINE)
        state.policy_result = run_policy_engine(applicant, state.ml_result, state.combined_adjustment)
        audit.log_stage("policy_engine", state.policy_result)
        print(f"  [Pipeline] Decision: {state.policy_result.final_decision}  |  Final score: {state.policy_result.final_score}")

        # Stage 5 — XAI Narrative (1 API call max)
        state.advance_to(PipelineStage.XAI_NARRATIVE)
        from .xai import generate_xai_narrative
        state.xai_narrative, state.actionable_steps = generate_xai_narrative(
            applicant, state.ml_result, state.tool_results, state.policy_result, state.api_budget,
        )
        audit.log_stage("xai_narrative", {"generated": state.xai_narrative is not None})
        print(f"  [Pipeline] XAI narrative generated: {len(state.xai_narrative or '')} chars")

        state.advance_to(PipelineStage.COMPLETE)

    except Exception as e:
        state.fail(str(e))
        audit.log_failure(e)
        import traceback
        traceback.print_exc()

    audit.finalize(state)
    return _assemble_result(state)


def _assemble_result(state: PipelineState) -> UnderwritingResult:
    ml = state.ml_result or MLScoringResult(
        loan_type="personal", risk_tier="P4", risk_score=0.0,
        tier_probabilities={}, model_version="", segmentation_method="",
    )
    policy = state.policy_result or PolicyResult(
        hard_reject_triggered=False, final_decision="INSUFFICIENT_DATA", final_score=0.0,
    )
    
    audit_trail = []
    if state.tool_results:
        audit_trail.extend([t.model_dump(exclude_none=True) for t in state.tool_results])
    if state.policy_result:
        audit_trail.extend([r.model_dump(exclude_none=True) for r in state.policy_result.triggered_rules])
        
    return UnderwritingResult(
        applicant_id=state.applicant_id,
        loan_type=ml.loan_type,
        ml_result=ml,
        tool_results=state.tool_results or [],
        policy_result=policy,
        xai_narrative=state.xai_narrative,
        actionable_steps=state.actionable_steps,
        risk_grade=policy.risk_grade,
        interest_rate_band=policy.interest_rate_band,
        max_eligible_amount=policy.max_eligible_amount,
        is_eligible_for_requested=policy.is_eligible_for_requested,
        api_budget_summary=state.api_budget.summary(),
        audit_trail=audit_trail,
        run_id=state.run_id,
    )


# ---------------------------------------------------------------------------
# Backward-Compatible Shim: UnderwritingResult → DecisionReport
# ---------------------------------------------------------------------------

def to_decision_report(result: UnderwritingResult, applicant: NormalizedApplicantProfile) -> DecisionReport:
    """Maps the v2 UnderwritingResult back to the legacy DecisionReport shape."""
    # Map tool results to MarketAnalysis for backward compat
    market_analysis = None
    for t in result.tool_results:
        if t.tool_id == "market_analysis" and t.ran:
            from core.models import MarketAnalysis
            market_analysis = MarketAnalysis(
                sector_outlook=t.raw_findings.get("sector_outlook", "not_run"),
                key_reasons=t.key_reasons,
                sources=t.sources,
                adjustment_applied=t.adjustment_applied,
                confidence=t.confidence,
                base_score=result.ml_result.risk_score,
                final_score=result.policy_result.final_score,
            )
            break

    # Build rule evaluations from policy + tool results
    evaluations = list(result.policy_result.triggered_rules)
    for t in result.tool_results:
        if t.ran and t.adjustment_applied != 0.0:
            evaluations.append(RuleEvaluation(
                ruleId=f"TOOL-{t.tool_id.upper().replace('_', '-')}",
                category="Tool Catalog",
                description=f"{t.tool_id} adjustment",
                outcome="FLAG",
                observedValue=round(t.adjustment_applied, 4),
                threshold=0,
                reason="; ".join(t.key_reasons[:2]) if t.key_reasons else None,
            ))

    # Map decision name for backward compatibility
    decision = result.policy_result.final_decision
    if decision == "APPROVED":
        decision_compat = "APPROVED"
    elif decision == "EXCEPTION_L1":
        decision_compat = "EXCEPTION_L1"
    elif decision == "EXCEPTION_L2":
        decision_compat = "EXCEPTION_L2"
    elif decision == "HARD_REJECT":
        decision_compat = "HARD_REJECT"
    else:
        decision_compat = "INSUFFICIENT_DATA"

    return DecisionReport(
        applicantId=result.applicant_id,
        finalDecision=decision_compat,
        escalationAuthority=result.policy_result.escalation_authority,
        riskGrade=result.risk_grade,
        maxEligibleAmount=result.max_eligible_amount,
        isEligibleForRequested=result.is_eligible_for_requested,
        interestRateBand=result.interest_rate_band,
        ruleEvaluations=evaluations,
        derived_metrics={
            "risk_score": result.policy_result.final_score,
            "risk_tier": result.ml_result.risk_tier,
            "requested_loan_amount": applicant.requestedLoanAmount,
            "declared_income": applicant.declaredIncome,
            "bureau_score": applicant.bureauScore,
            "tool_adjustments": {t.tool_id: t.adjustment_applied for t in result.tool_results if t.ran},
            "combined_adjustment": result.policy_result.combined_tool_adjustment,
            "api_budget": result.api_budget_summary,
            "actionable_steps": result.actionable_steps,
        },
        audit_trail=result.audit_trail,
        xaiMemo=result.xai_narrative,
        actionableSteps=result.actionable_steps or [],
    )
