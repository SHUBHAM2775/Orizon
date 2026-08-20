import os
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
    "personal": os.path.join(MODEL_DIR, "personal_loan_xgb_v1.pkl"),
    "business": os.path.join(MODEL_DIR, "business_loan_xgb_v1.pkl"),
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

# ---------------------------------------------------------------------------
# Pipeline v2 — Tool Adjustment Caps & Policy Thresholds
# ---------------------------------------------------------------------------

FOIR_THRESHOLD = 0.40
FOIR_MAX_ATTEMPTS = 3
FOIR_STEP_PCT = 0.10

ADVERSE_MEDIA_AMOUNT_THRESHOLD = 500_000.0

# Per-tool adjustment bounds (lo, hi)
TOOL_CAPS: Dict[str, tuple] = {
    "market_analysis":       (-0.15, +0.15),
    "employer_verification": (-0.10, +0.10),
    "collateral_valuation":  (-0.10, +0.10),
    "adverse_media":         (-0.10,  0.00),   # one-directional: never improves score
    "macro_outlook":         (-0.05, +0.05),
    "peer_benchmarking":     (-0.10, +0.10),
}

# Combined ceiling across all tools
COMBINED_CAP = (-0.20, +0.05)

# Sector baselines for peer benchmarking (z-score reference)
SECTOR_BASELINES: Dict[str, Dict[str, float]] = {
    "retail":         {"median_income": 80000,  "median_vintage": 5,  "std_income": 30000},
    "manufacturing":  {"median_income": 120000, "median_vintage": 8,  "std_income": 50000},
    "services":       {"median_income": 100000, "median_vintage": 6,  "std_income": 40000},
    "agriculture":    {"median_income": 50000,  "median_vintage": 10, "std_income": 20000},
    "construction":   {"median_income": 90000,  "median_vintage": 7,  "std_income": 35000},
    "trading":        {"median_income": 70000,  "median_vintage": 4,  "std_income": 25000},
    "technology":     {"median_income": 150000, "median_vintage": 4,  "std_income": 60000},
    "healthcare":     {"median_income": 110000, "median_vintage": 6,  "std_income": 45000},
    "hospitality":    {"median_income": 60000,  "median_vintage": 5,  "std_income": 25000},
    "logistics":      {"median_income": 85000,  "median_vintage": 6,  "std_income": 30000},
}
