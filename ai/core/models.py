from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal, Dict, Any
from enum import Enum

class StructuredRow(BaseModel):
  applicantId: Optional[str] = None
  age: Optional[int] = None
  employmentType: Optional[str] = None
  businessVintage: Optional[int] = None
  requestedLoanAmount: Optional[float] = None
  requestedTenure: Optional[int] = None
  declaredIncome: Optional[float] = None
  existingObligations: Optional[float] = None
  bureauScore: Optional[int] = None
  activeLoans: Optional[int] = None
  enquiries: Optional[int] = None
  overdueAmount: Optional[float] = None
  dpdHistory: Optional[List[int]] = []
  writeOffFlag: Optional[bool] = False
  settlementFlag: Optional[bool] = False
  defaultFlag: Optional[bool] = False

  bankAvgCredits: Optional[float] = None
  monthlyCredits: Optional[float] = None
  bankAvgBalance: Optional[float] = None
  emiDebits: Optional[float] = None
  bounceCount: Optional[int] = None
  cashFlowVolatility: Optional[float] = None
  largeObligationsCount: Optional[int] = None

  itrIncomeLastTwoYears: Optional[List[float]] = []
  incomeTrend: Optional[str] = None
  declaredAssets: Optional[float] = None
  employmentStability: Optional[str] = None
  utilityPaymentBehaviour: Optional[str] = None

  model_config = ConfigDict(extra='allow')

class NormalizedApplicantProfile(StructuredRow):
  sourceType: Literal["structured", "pdf", "synthetic"]
  missingFields: List[str] = []
  unmappedFields: List[str] = []
  validationErrors: List[str] = []

class RuleOutcome(str, Enum):
  PASS = "PASS"
  FLAG = "FLAG"
  INELIGIBLE = "INELIGIBLE"
  HARD_REJECT = "HARD_REJECT"

class RuleEvaluation(BaseModel):
  ruleId: str
  category: str
  description: str
  outcome: str
  observedValue: Optional[float | int | str | bool] = None
  threshold: Optional[float | int | str | bool] = None
  reason: Optional[str] = None

class ContributingFactor(BaseModel):
  feature: str
  shap_value: float
  direction: Literal["positive", "negative"]

class MarketAnalysis(BaseModel):
  applies_to: Literal["business_only"] = "business_only"
  sector_outlook: Literal["positive", "neutral", "negative", "not_run"]
  key_reasons: List[str] = []
  sources: List[str] = []
  adjustment_applied: float = 0.0
  confidence: Literal["low", "medium", "high"] = "low"
  base_score: Optional[float] = None
  final_score: Optional[float] = None

class DecisionReport(BaseModel):
  applicantId: str
  finalDecision: Literal[
    "APPROVE", "APPROVED", "L1_EXCEPTION", "L2_EXCEPTION",
    "EXCEPTION_L1", "EXCEPTION_L2", "HARD_REJECT", "INSUFFICIENT_DATA"
  ]
  escalationAuthority: Optional[str] = None
  riskGrade: Optional[str] = None
  maxEligibleAmount: Optional[float] = None
  isEligibleForRequested: Optional[bool] = None
  interestRateBand: Optional[str] = None
  ruleEvaluations: List[RuleEvaluation] = []
  xaiMemo: Optional[str] = None
  actionableSteps: List[str] = []


  audit_trail: List[Dict[str, Any]] = []
  derived_metrics: Dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Pipeline v2 — State Management, Budget, and Typed Stage Results
# ---------------------------------------------------------------------------

class PipelineStage(str, Enum):
  INIT          = "INIT"
  ML_SCORING    = "ML_SCORING"
  TOOL_CATALOG  = "TOOL_CATALOG"
  AGGREGATION   = "AGGREGATION"
  POLICY_ENGINE = "POLICY_ENGINE"
  XAI_NARRATIVE = "XAI_NARRATIVE"
  COMPLETE      = "COMPLETE"
  FAILED        = "FAILED"

VALID_TRANSITIONS: Dict[str, List[str]] = {
  "INIT":          ["ML_SCORING"],
  "ML_SCORING":    ["TOOL_CATALOG", "FAILED"],
  "TOOL_CATALOG":  ["AGGREGATION", "FAILED"],
  "AGGREGATION":   ["POLICY_ENGINE", "FAILED"],
  "POLICY_ENGINE": ["XAI_NARRATIVE", "FAILED"],
  "XAI_NARRATIVE": ["COMPLETE", "FAILED"],
}


class PipelineStateError(Exception):
  """Raised when the pipeline attempts an invalid state transition."""
  pass

class APIBudgetExhausted(Exception):
  """Raised as defense-in-depth when a tool ignores can_call() and tries to consume anyway."""
  pass


class MLScoringResult(BaseModel):
  loan_type: Literal["personal", "business"]
  risk_tier: Literal["P1", "P2", "P3", "P4"]
  risk_score: float
  tier_probabilities: Dict[str, float]
  top_contributing_factors: List[ContributingFactor] = []
  model_version: str = ""
  segmentation_method: str = ""


class FOIRAdjustment(BaseModel):
  triggered: bool
  final_amount: Optional[float] = None
  attempts: List[Dict[str, Any]] = []
  cleared: bool = False


class ToolResult(BaseModel):
  tool_id: str
  ran: bool
  skip_reason: Optional[str] = None
  adjustment_applied: float = 0.0
  key_reasons: List[str] = []
  sources: List[str] = []
  confidence: Literal["low", "medium", "high"] = "low"
  needs_manual_review: bool = False
  raw_findings: Dict[str, Any] = {}
  api_calls_used: int = 0
  degraded: bool = False


class PolicyResult(BaseModel):
  hard_reject_triggered: bool
  triggered_rules: List[RuleEvaluation] = []
  foir_adjustment: Optional[FOIRAdjustment] = None
  final_decision: Literal[
    "APPROVED", "EXCEPTION_L1", "EXCEPTION_L2", "HARD_REJECT", "INSUFFICIENT_DATA"
  ]
  escalation_authority: Optional[str] = None
  final_score: float
  combined_tool_adjustment: float = 0.0
  risk_grade: Optional[str] = None
  interest_rate_band: Optional[str] = None
  max_eligible_amount: Optional[float] = None
  is_eligible_for_requested: Optional[bool] = None


class APIBudget(BaseModel):
  """Tracks all external API calls (LLM + web search) for a single pipeline run."""
  max_groq_calls: int = 7
  max_web_searches: int = 12
  max_total_api_calls: int = 20

  tool_search_caps: Dict[str, int] = {
    "market_analysis": 2,
    "employer_verification": 3,
    "collateral_valuation": 1,
    "adverse_media": 3,
    "macro_outlook": 2,
    "peer_benchmarking": 1,
  }
  tool_llm_caps: Dict[str, int] = {
    "market_analysis": 1,
    "employer_verification": 1,
    "adverse_media": 1,
    "macro_outlook": 1,
    "xai_narrative": 1,
    "orchestrator": 3,
  }

  groq_calls_used: int = 0
  web_searches_used: int = 0
  total_calls_used: int = 0

  tool_calls: Dict[str, Dict[str, int]] = {}
  call_log: List[Dict[str, Any]] = []

  def can_call(self, call_type: str, tool_id: str = "global") -> bool:
    """Check whether budget allows this call. Does NOT consume it."""
    if self.total_calls_used >= self.max_total_api_calls:
      return False
    if call_type == "groq_llm" and self.groq_calls_used >= self.max_groq_calls:
      return False
    if call_type == "web_search" and self.web_searches_used >= self.max_web_searches:
      return False
    # Per-tool cap
    tool_counts = self.tool_calls.get(tool_id, {})
    if call_type == "web_search":
      cap = self.tool_search_caps.get(tool_id, 0)
      if tool_counts.get("search", 0) >= cap:
        return False
    if call_type == "groq_llm":
      cap = self.tool_llm_caps.get(tool_id, 0)
      if tool_counts.get("llm", 0) >= cap:
        return False
    return True

  def consume(self, call_type: str, tool_id: str, endpoint: str = ""):
    """Record one API call. Raises APIBudgetExhausted if over budget."""
    from datetime import datetime, timezone as tz
    if not self.can_call(call_type, tool_id):
      raise APIBudgetExhausted(
        f"Budget exhausted: {call_type} for {tool_id}. "
        f"Total: {self.total_calls_used}/{self.max_total_api_calls}"
      )
    self.total_calls_used += 1
    if call_type == "groq_llm":
      self.groq_calls_used += 1
    elif call_type == "web_search":
      self.web_searches_used += 1
    if tool_id not in self.tool_calls:
      self.tool_calls[tool_id] = {}
    key = "llm" if call_type == "groq_llm" else "search"
    self.tool_calls[tool_id][key] = self.tool_calls[tool_id].get(key, 0) + 1
    self.call_log.append({
      "timestamp": datetime.now(tz.utc).isoformat(),
      "tool_id": tool_id,
      "call_type": call_type,
      "endpoint": endpoint,
      "total_after": self.total_calls_used,
    })

  def summary(self) -> Dict[str, Any]:
    return {
      "groq": f"{self.groq_calls_used}/{self.max_groq_calls}",
      "search": f"{self.web_searches_used}/{self.max_web_searches}",
      "total": f"{self.total_calls_used}/{self.max_total_api_calls}",
      "per_tool": self.tool_calls,
    }


class PipelineState(BaseModel):
  """Explicit state object passed through every pipeline stage."""
  run_id: str
  applicant_id: str
  current_stage: PipelineStage = PipelineStage.INIT
  stage_history: List[Dict[str, Any]] = []

  # Stage outputs — None until that stage completes
  ml_result: Optional[MLScoringResult] = None
  tool_results: Optional[List[ToolResult]] = None
  combined_adjustment: Optional[float] = None
  policy_result: Optional[PolicyResult] = None
  xai_narrative: Optional[str] = None
  actionable_steps: List[str] = []

  # Budget
  api_budget: APIBudget = APIBudget()

  # Error tracking
  error: Optional[str] = None
  failed_stage: Optional[PipelineStage] = None

  def advance_to(self, next_stage: PipelineStage):
    """Enforced state transition — raises PipelineStateError if invalid."""
    from datetime import datetime, timezone as tz
    valid = VALID_TRANSITIONS.get(self.current_stage.value, [])
    if next_stage.value not in valid:
      raise PipelineStateError(
        f"Invalid transition: {self.current_stage.value} → {next_stage.value}. "
        f"Valid next stages: {valid}"
      )
    self.stage_history.append({
      "stage": self.current_stage.value,
      "exited_at": datetime.now(tz.utc).isoformat(),
      "status": "completed",
    })
    self.current_stage = next_stage

  def fail(self, error_msg: str):
    """Transition to FAILED from any stage. Always allowed."""
    from datetime import datetime, timezone as tz
    self.failed_stage = self.current_stage
    self.error = error_msg
    self.stage_history.append({
      "stage": self.current_stage.value,
      "exited_at": datetime.now(tz.utc).isoformat(),
      "status": "failed",
      "error": error_msg,
    })
    self.current_stage = PipelineStage.FAILED


class UnderwritingResult(BaseModel):
  """Top-level pipeline output. Fully backward-compatible with DecisionReport consumers."""
  applicant_id: str
  loan_type: Literal["personal", "business"]
  ml_result: MLScoringResult
  tool_results: List[ToolResult] = []
  policy_result: PolicyResult
  xai_narrative: Optional[str] = None
  actionable_steps: List[str] = []
  risk_grade: Optional[str] = None
  interest_rate_band: Optional[str] = None
  max_eligible_amount: Optional[float] = None
  is_eligible_for_requested: Optional[bool] = None
  pipeline_version: str = "v2.0"
  api_budget_summary: Dict[str, Any] = {}
  audit_trail: List[Dict[str, Any]] = []
  run_id: str = ""
