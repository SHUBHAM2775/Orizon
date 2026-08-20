from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal
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

class DecisionReport(BaseModel):
  applicantId: str
  finalDecision: Literal["APPROVE", "L1_EXCEPTION", "L2_EXCEPTION", "HARD_REJECT", "INSUFFICIENT_DATA"]
  escalationAuthority: Optional[str] = None
  riskGrade: Optional[str] = None
  maxEligibleAmount: Optional[float] = None
  isEligibleForRequested: Optional[bool] = None
  interestRateBand: Optional[str] = None
  ruleEvaluations: List[RuleEvaluation] = []
  xaiMemo: Optional[str] = None
  actionableSteps: List[str] = []
