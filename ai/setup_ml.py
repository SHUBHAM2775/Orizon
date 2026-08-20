from pathlib import Path

ROOT = Path(r"D:\Anoop\Code\projects\Orizon\ai")

FILES = {
    "core/models.py": r'''from pydantic import BaseModel, ConfigDict
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

  prospect_id: Optional[str] = None
  loan_type: Optional[Literal["personal", "business"]] = None
  risk_tier: Optional[Literal["P1", "P2", "P3", "P4"]] = None
  risk_score: Optional[float] = None
  base_risk_score: Optional[float] = None
  final_risk_score: Optional[float] = None
  tier_probabilities: Optional[Dict[str, float]] = None
  top_contributing_factors: List[ContributingFactor] = []
  model_version: Optional[str] = None
  segmentation_method: Optional[str] = None
  market_analysis: Optional[MarketAnalysis] = None
  derived_metrics: Dict[str, Any] = {}
''',
    "engine/config/ml_config.py": r'''import os
from dataclasses import dataclass
from typing import Dict, List

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DATASETS_DIR = os.path.join(BASE_DIR, "datasets")
MODEL_DIR = os.path.join(BASE_DIR, "models")
REPORTS_DIR = os.path.join(BASE_DIR, "reports")
EXPERIMENTS_DIR = os.path.join(BASE_DIR, "experiments")

INTERNAL_DATASET = os.path.join(DATASETS_DIR, "Internal_Bank_Dataset.xlsx")
EXTERNAL_DATASET = os.path.join(DATASETS_DIR, "External_Cibil_Dataset.xlsx")
UNSEEN_DATASET = os.path.join(DATASETS_DIR, "Unseen_Dataset.xlsx")

JOIN_KEY = "PROSPECTID"
TARGET_COLUMN = "Approved_Flag"
SENTINEL_VALUE = -99999
MISSING_COLUMN_THRESHOLD = 0.20
RANDOM_STATE = 42

RISK_TIERS: List[str] = ["P1", "P2", "P3", "P4"]
RISK_SCORE_ANCHORS: Dict[str, float] = {"P1": 100.0, "P2": 70.0, "P3": 40.0, "P4": 10.0}

PERSONAL_MODEL_VERSION = "personal_loan_xgb_v1"
BUSINESS_MODEL_VERSION = "business_loan_xgb_v1"
MODEL_FILES = {
    "personal": os.path.join(MODEL_DIR, "personal_loan_xgb_v1.joblib"),
    "business": os.path.join(MODEL_DIR, "business_loan_xgb_v1.joblib"),
}
SEGMENTATION_METHOD = "proxy_rule_v1"

@dataclass(frozen=True)
class ScorePolicy:
    approve_min_score: float = 72.0
    l1_min_score: float = 55.0
    l2_min_score: float = 38.0
    max_l1_amount: float = 1_000_000.0
    income_multiplier: float = 5.0
    max_loan_cap: float = 5_000_000.0

SCORE_POLICY = ScorePolicy()
''',
    "engine/tools/market_agent.py": r'''import json
import os
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

from core.models import MarketAnalysis, NormalizedApplicantProfile

CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models", "market_cache.json")
CACHE_TTL_SECONDS = 30 * 24 * 60 * 60
MAX_ADJUSTMENT = 0.15

def run_market_analysis(profile: NormalizedApplicantProfile, base_score: float, base_tier: str) -> MarketAnalysis:
    sector = _extract_sector(profile)
    if not sector:
        return MarketAnalysis(
            sector_outlook="not_run",
            key_reasons=["No industry or sector field was available on the applicant profile."],
            adjustment_applied=0.0,
            confidence="low",
            base_score=round(base_score, 2),
            final_score=round(base_score, 2),
        )

    cached = _read_cache().get(sector.lower())
    if cached and time.time() - cached.get("cached_at", 0) < CACHE_TTL_SECONDS:
        result = MarketAnalysis(**cached["analysis"])
        result.base_score = round(base_score, 2)
        result.final_score = round(_apply_adjustment(base_score, result.adjustment_applied), 2)
        return result

    sources, snippets = _bounded_sector_search(sector)
    analysis = _synthesize_market_analysis(sector, snippets, sources, base_tier)
    analysis.base_score = round(base_score, 2)
    analysis.final_score = round(_apply_adjustment(base_score, analysis.adjustment_applied), 2)
    _write_cache(sector, analysis)
    return analysis

def _extract_sector(profile: NormalizedApplicantProfile) -> Optional[str]:
    data = profile.model_dump()
    for key in ("industry", "sector", "businessSector", "business_sector", "loanPurpose", "loan_purpose"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None

def _bounded_sector_search(sector: str) -> tuple[List[str], List[str]]:
    queries = [f"{sector} industry outlook India 2026", f"{sector} MSME credit risk default rate India"]
    sources: List[str] = []
    snippets: List[str] = []
    for query in queries[:2]:
        try:
            url = "https://duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as response:
                html = response.read().decode("utf-8", errors="ignore")
            sources.append(url)
            snippets.append(_compact_html(html))
        except Exception as exc:
            snippets.append(f"Search failed for '{query}': {exc}")
    return sources[:5], snippets[:5]

def _synthesize_market_analysis(sector: str, snippets: List[str], sources: List[str], base_tier: str) -> MarketAnalysis:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return _heuristic_market_analysis(sector, snippets, sources)
    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "system", "content": "Return only JSON: sector_outlook positive|neutral|negative|not_run, key_reasons array, adjustment_applied number -0.15..0.05, confidence low|medium|high. Use only provided snippets."},
                {"role": "user", "content": json.dumps({"sector": sector, "base_tier": base_tier, "snippets": snippets, "sources": sources})},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        raw = json.loads(response.choices[0].message.content)
        adjustment = max(-MAX_ADJUSTMENT, min(0.05, float(raw.get("adjustment_applied", 0.0))))
        return MarketAnalysis(
            sector_outlook=raw.get("sector_outlook", "neutral"),
            key_reasons=list(raw.get("key_reasons", []))[:5],
            sources=sources,
            adjustment_applied=adjustment,
            confidence=raw.get("confidence", "low"),
        )
    except Exception:
        return _heuristic_market_analysis(sector, snippets, sources)

def _heuristic_market_analysis(sector: str, snippets: List[str], sources: List[str]) -> MarketAnalysis:
    text = " ".join(snippets).lower()
    neg = sum(text.count(t) for t in ["default", "stress", "decline", "slowdown", "risk", "weak", "loss"])
    pos = sum(text.count(t) for t in ["growth", "positive", "robust", "strong", "improve", "demand"])
    if not sources:
        outlook, adjustment = "not_run", 0.0
    elif neg > pos + 2:
        outlook, adjustment = "negative", -0.08
    elif pos > neg + 2:
        outlook, adjustment = "positive", 0.03
    else:
        outlook, adjustment = "neutral", 0.0
    return MarketAnalysis(
        sector_outlook=outlook,
        key_reasons=[f"Sector evaluated: {sector}.", "Fallback heuristic used when structured market synthesis was unavailable."],
        sources=sources,
        adjustment_applied=adjustment,
        confidence="low" if not sources else "medium",
    )

def _apply_adjustment(base_score: float, adjustment: float) -> float:
    adjustment = max(-MAX_ADJUSTMENT, min(0.05, adjustment))
    return max(0.0, min(100.0, base_score * (1.0 + adjustment)))

def _compact_html(html: str) -> str:
    text = html.replace("\n", " ").replace("\r", " ")
    while "  " in text:
        text = text.replace("  ", " ")
    return text[:2500]

def _read_cache() -> Dict[str, Any]:
    try:
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _write_cache(sector: str, analysis: MarketAnalysis) -> None:
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    cache = _read_cache()
    cache[sector.lower()] = {"cached_at": time.time(), "analysis": analysis.model_dump(exclude_none=True)}
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)
''',
    "engine/ml/train_models.py": r'''import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import RandomizedSearchCV, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from engine.ml_config import (
    BUSINESS_MODEL_VERSION, EXPERIMENTS_DIR, EXTERNAL_DATASET, INTERNAL_DATASET,
    JOIN_KEY, MISSING_COLUMN_THRESHOLD, MODEL_FILES, MODEL_DIR, PERSONAL_MODEL_VERSION,
    RANDOM_STATE, REPORTS_DIR, RISK_TIERS, SEGMENTATION_METHOD, SENTINEL_VALUE, TARGET_COLUMN,
)

def train_all(force: bool = False) -> Dict[str, str]:
    os.makedirs(MODEL_DIR, exist_ok=True)
    if not force and all(os.path.exists(path) for path in MODEL_FILES.values()):
        return MODEL_FILES
    df = load_training_frame()
    write_data_profile()
    df = add_proxy_loan_type(df)
    write_segmentation_report(df)
    outputs = {}
    for loan_type in ("personal", "business"):
        segment_df = df[df["loan_type"] == loan_type].copy()
        if len(segment_df) < 200 or segment_df[TARGET_COLUMN].nunique() < 2:
            segment_df = df.copy()
        outputs[loan_type] = train_segment_model(segment_df, loan_type)
    return outputs

def load_training_frame() -> pd.DataFrame:
    internal = pd.read_excel(INTERNAL_DATASET)
    external = pd.read_excel(EXTERNAL_DATASET)
    if JOIN_KEY not in internal.columns or JOIN_KEY not in external.columns:
        raise ValueError(f"Expected join key {JOIN_KEY} in both datasets.")
    df = internal.merge(external, on=JOIN_KEY, how="inner")
    df = df.replace(SENTINEL_VALUE, np.nan)
    if TARGET_COLUMN not in df.columns:
        raise ValueError(f"Expected target column {TARGET_COLUMN}.")
    return df

def train_segment_model(df: pd.DataFrame, loan_type: str) -> str:
    target = df[TARGET_COLUMN].astype(str)
    features = df.drop(columns=[TARGET_COLUMN, "loan_type", JOIN_KEY], errors="ignore")
    missing_ratio = features.isna().mean()
    features = features[missing_ratio[missing_ratio <= MISSING_COLUMN_THRESHOLD].index.tolist()]
    categorical = [c for c in features.columns if features[c].dtype == "object"]
    numeric = [c for c in features.columns if c not in categorical]

    preprocessor = ColumnTransformer([
        ("num", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), numeric),
        ("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore"))]), categorical),
    ])

    try:
        from xgboost import XGBClassifier
    except Exception as exc:
        raise RuntimeError("xgboost is required for the credit-risk models.") from exc

    y, class_to_index, index_to_class = encode_target(target)
    x_train, x_temp, y_train, y_temp = train_test_split(features, y, test_size=0.30, stratify=y, random_state=RANDOM_STATE)
    x_val, x_test, y_val, y_test = train_test_split(x_temp, y_temp, test_size=0.50, stratify=y_temp, random_state=RANDOM_STATE)

    pipe = Pipeline([
        ("preprocess", preprocessor),
        ("model", XGBClassifier(objective="multi:softprob", num_class=len(class_to_index), eval_metric="mlogloss", random_state=RANDOM_STATE, n_jobs=1)),
    ])
    search = RandomizedSearchCV(
        pipe,
        {
            "model__n_estimators": [150, 250, 350, 500],
            "model__max_depth": [3, 4, 5, 6],
            "model__learning_rate": [0.02, 0.04, 0.06, 0.08, 0.10],
            "model__subsample": [0.75, 0.85, 1.0],
            "model__colsample_bytree": [0.75, 0.85, 1.0],
            "model__min_child_weight": [1, 3, 5],
        },
        n_iter=40,
        scoring="f1_macro",
        cv=5,
        random_state=RANDOM_STATE,
        n_jobs=1,
        verbose=1,
    )
    search.fit(x_train, y_train)
    calibrated = CalibratedClassifierCV(search.best_estimator_, method="isotonic", cv="prefit")
    calibrated.fit(x_val, y_val)

    y_pred = calibrated.predict(x_test)
    write_metrics({
        "loan_type": loan_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "accuracy": accuracy_score(y_test, y_pred),
        "macro_f1": f1_score(y_test, y_pred, average="macro"),
        "best_params": search.best_params_,
        "classification_report": classification_report(y_test, y_pred, output_dict=True, zero_division=0),
    })

    artifact = {
        "model": calibrated,
        "feature_columns": features.columns.tolist(),
        "class_to_index": class_to_index,
        "index_to_class": index_to_class,
        "loan_type": loan_type,
        "model_version": PERSONAL_MODEL_VERSION if loan_type == "personal" else BUSINESS_MODEL_VERSION,
        "segmentation_method": SEGMENTATION_METHOD,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    path = MODEL_FILES[loan_type]
    joblib.dump(artifact, path)
    return path

def encode_target(target: pd.Series) -> Tuple[np.ndarray, Dict[str, int], Dict[int, str]]:
    classes = [tier for tier in RISK_TIERS if tier in set(target)]
    classes += [c for c in sorted(set(target)) if c not in classes]
    class_to_index = {label: idx for idx, label in enumerate(classes)}
    return target.map(class_to_index).to_numpy(), class_to_index, {idx: label for label, idx in class_to_index.items()}

def add_proxy_loan_type(df: pd.DataFrame) -> pd.DataFrame:
    def classify(row: pd.Series) -> str:
        unsecured = _num(row.get("Unsecured_TL"))
        other = _num(row.get("Other_TL"))
        pl = _num(row.get("PL_TL"))
        consumer = _num(row.get("Consumer_TL"))
        unsecured_heavy = unsecured >= max(2.0, pl + consumer + 1.0)
        mixed_non_retail = other >= 2 and unsecured >= 2
        return "business" if unsecured_heavy or mixed_non_retail else "personal"
    df["loan_type"] = df.apply(classify, axis=1)
    return df

def write_data_profile() -> None:
    os.makedirs(REPORTS_DIR, exist_ok=True)
    lines = ["# Data Profile", ""]
    for path in (INTERNAL_DATASET, EXTERNAL_DATASET):
        df = pd.read_excel(path)
        lines += [f"## {os.path.basename(path)}", f"- Rows: {len(df)}", f"- Columns: {len(df.columns)}", "", "| Column | dtype | missing % | -99999 % |", "|---|---:|---:|---:|"]
        for col in df.columns:
            lines.append(f"| {col} | {df[col].dtype} | {df[col].isna().mean()*100:.2f} | {(df[col] == SENTINEL_VALUE).mean()*100:.2f} |")
        lines.append("")
    with open(os.path.join(REPORTS_DIR, "data_profile.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

def write_segmentation_report(df: pd.DataFrame) -> None:
    os.makedirs(REPORTS_DIR, exist_ok=True)
    counts = df["loan_type"].value_counts().to_dict()
    with open(os.path.join(REPORTS_DIR, "segmentation_report.md"), "w", encoding="utf-8") as f:
        f.write("# Segmentation Report\n\n")
        f.write(f"Method: `{SEGMENTATION_METHOD}`\n\n")
        f.write("No ground-truth business-loan label was found. Business segmentation uses a proxy based on unsecured-heavy/non-retail trade-line mix.\n\n")
        for key, value in counts.items():
            f.write(f"- {key}: {value}\n")

def write_metrics(metrics: Dict[str, Any]) -> None:
    os.makedirs(EXPERIMENTS_DIR, exist_ok=True)
    path = os.path.join(EXPERIMENTS_DIR, "metrics_log.csv")
    row = {k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in metrics.items()}
    pd.DataFrame([row]).to_csv(path, mode="a", index=False, header=not os.path.exists(path))

def _num(value: Any) -> float:
    try:
        if pd.isna(value):
            return 0.0
        return float(value)
    except Exception:
        return 0.0

if __name__ == "__main__":
    train_all(force=True)
''',
}

for rel, content in FILES.items():
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

engine = ROOT / "engine" / "engine.py"
engine.write_text(r'''import os
from typing import Any, Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd

from core.models import ContributingFactor, DecisionReport, NormalizedApplicantProfile, RuleEvaluation
from engine.tools.market_agent import run_market_analysis
from engine.config.ml_config import (
    BUSINESS_MODEL_VERSION, MODEL_FILES, PERSONAL_MODEL_VERSION,
    RISK_SCORE_ANCHORS, SCORE_POLICY, SEGMENTATION_METHOD,
)

def run_bre(profile: NormalizedApplicantProfile) -> DecisionReport:
    has_any_data = any([profile.declaredIncome, profile.bureauScore, profile.requestedLoanAmount])
    if not has_any_data:
        return DecisionReport(
            applicantId=profile.applicantId or "UNKNOWN",
            prospect_id=profile.applicantId or "UNKNOWN",
            finalDecision="INSUFFICIENT_DATA",
            ruleEvaluations=[],
            xaiMemo="Insufficient usable applicant data was provided.",
            actionableSteps=["Provide income, bureau score, and requested loan amount before scoring."],
        )

    artifacts = _load_or_train_models()
    loan_type = _infer_loan_type(profile)
    artifact = artifacts[loan_type]
    frame = _profile_to_model_frame(profile, artifact["feature_columns"])

    probabilities = _predict_probabilities(artifact, frame)
    base_score = _risk_score(probabilities)
    base_tier = _tier_from_score_and_probabilities(base_score, probabilities)
    market_analysis = None
    final_score = base_score
    if loan_type == "business":
        market_analysis = run_market_analysis(profile, base_score, base_tier)
        final_score = market_analysis.final_score if market_analysis.final_score is not None else base_score

    final_tier = _tier_from_score(final_score)
    final_decision, escalation = _decision_from_score(profile, final_score)
    max_eligible = _max_eligible_amount(profile)
    requested = profile.requestedLoanAmount
    evaluations = _build_model_evaluations(profile, probabilities, base_score, final_score, final_tier, loan_type)

    return DecisionReport(
        applicantId=profile.applicantId or "UNKNOWN",
        prospect_id=profile.applicantId or "UNKNOWN",
        loan_type=loan_type,
        finalDecision=final_decision,
        escalationAuthority=escalation,
        riskGrade=_risk_grade_from_score(final_score),
        maxEligibleAmount=round(max_eligible, 2),
        isEligibleForRequested=(requested <= max_eligible if requested is not None else None),
        interestRateBand=_interest_band_from_score(final_score),
        ruleEvaluations=evaluations,
        risk_tier=final_tier,
        risk_score=round(final_score, 2),
        base_risk_score=round(base_score, 2),
        final_risk_score=round(final_score, 2),
        tier_probabilities={k: round(v, 6) for k, v in probabilities.items()},
        top_contributing_factors=_top_factors(artifact, frame, probabilities),
        model_version=artifact.get("model_version") or (PERSONAL_MODEL_VERSION if loan_type == "personal" else BUSINESS_MODEL_VERSION),
        segmentation_method=artifact.get("segmentation_method", SEGMENTATION_METHOD),
        market_analysis=market_analysis,
        derived_metrics=_derive_metrics(profile, final_score, final_tier),
        xaiMemo=_memo(final_decision, final_tier, final_score, loan_type),
        actionableSteps=_actionable_steps(final_decision, final_tier, evaluations),
    )

def _load_or_train_models() -> Dict[str, Dict[str, Any]]:
    if not all(os.path.exists(path) for path in MODEL_FILES.values()):
        print("  - ML models will be fully retrained (this takes ~5-10 mins).")
        from engine.ml.train_models import train_all
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

def _derive_metrics(profile: NormalizedApplicantProfile, score: float, tier: str) -> Dict[str, Any]:
    foir = None
    if profile.declaredIncome and profile.declaredIncome > 0:
        foir = (profile.existingObligations or 0.0) / profile.declaredIncome
    return {"foir": round(foir, 4) if foir is not None else None, "risk_score": round(score, 2), "risk_tier": tier, "requested_loan_amount": profile.requestedLoanAmount, "declared_income": profile.declaredIncome, "bureau_score": profile.bureauScore}

def _build_model_evaluations(profile, probabilities, base_score, final_score, final_tier, loan_type) -> List[RuleEvaluation]:
    evaluations = [
        RuleEvaluation(ruleId="ML-RISK-TIER", category="ML Score", description="Calibrated model risk tier", outcome=final_tier, observedValue=round(final_score, 2), threshold="P1/P2/P3/P4", reason=f"{loan_type} model probability-weighted score"),
        RuleEvaluation(ruleId="ML-P4-PROBABILITY", category="ML Score", description="Highest-risk tier probability", outcome="FLAG" if probabilities.get("P4", 0.0) >= 0.30 else "PASS", observedValue=round(probabilities.get("P4", 0.0), 6), threshold=0.30, reason="P4 probability is elevated" if probabilities.get("P4", 0.0) >= 0.30 else None),
    ]
    if profile.writeOffFlag or profile.settlementFlag or profile.defaultFlag:
        evaluations.append(RuleEvaluation(ruleId="PROFILE-DELINQUENCY-FLAG", category="Profile Override", description="Applicant has write-off, settlement, or default flag", outcome="HARD_REJECT", observedValue=True, threshold=False, reason="Profile delinquency override"))
    if base_score != final_score:
        evaluations.append(RuleEvaluation(ruleId="MARKET-ADJUSTMENT", category="Agentic Market Analysis", description="Business market-analysis adjustment", outcome="FLAG", observedValue=round(final_score - base_score, 2), threshold=0, reason="Market analysis adjusted the base ML score"))
    return evaluations

def _top_factors(artifact: Dict[str, Any], frame: pd.DataFrame, probabilities: Dict[str, float]) -> List[ContributingFactor]:
    try:
        import shap
        estimator = artifact["model"].calibrated_classifiers_[0].estimator
        preprocessor = estimator.named_steps["preprocess"]
        model = estimator.named_steps["model"]
        transformed = preprocessor.transform(frame)
        names = preprocessor.get_feature_names_out()
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

def _memo(decision: str, tier: str, score: float, loan_type: str) -> str:
    return f"{loan_type.title()} loan model returned risk tier {tier} with a final calibrated score of {score:.2f}. The final decision is {decision} based on the model score, profile overrides, loan sizing, and business market adjustment where applicable."

def _actionable_steps(decision: str, tier: str, evaluations: List[RuleEvaluation]) -> List[str]:
    if decision in ("APPROVED", "APPROVE"):
        return ["Maintain current repayment behavior and income stability."]
    steps = ["Review the top contributing factors and applicant bureau/internal trade-line profile."]
    if tier in ("P3", "P4"):
        steps.append("Improve repayment behavior, reduce unsecured exposure, and lower recent delinquency/enquiry signals before re-application.")
    if any(rule.ruleId == "MARKET-ADJUSTMENT" for rule in evaluations):
        steps.append("Manually review sector outlook because market analysis changed the base ML score.")
    return steps
''', encoding="utf-8")
