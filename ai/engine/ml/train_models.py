import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

# Add the project root to sys.path so it can be run from the 'ai' directory or as a module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

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

from engine.config.ml_config import (
    BUSINESS_MODEL_VERSION, EXPERIMENTS_DIR, EXTERNAL_DATASET, INTERNAL_DATASET,
    JOIN_KEY, MISSING_COLUMN_THRESHOLD, MODEL_FILES, MODEL_DIR, PERSONAL_MODEL_VERSION,
    RANDOM_STATE, REPORTS_DIR, RISK_TIERS, SEGMENTATION_METHOD, SENTINEL_VALUE, TARGET_COLUMN,
)

def train_all(force: bool = False) -> Dict[str, str]:
    print("Starting train_all()...")
    os.makedirs(MODEL_DIR, exist_ok=True)
    if not force and all(os.path.exists(path) for path in MODEL_FILES.values()):
        print("Models already exist and force=False. Skipping training.")
        return MODEL_FILES
    
    print("Loading training frame...")
    df = load_training_frame()
    
    print("Writing data profile...")
    write_data_profile()
    
    print("Adding proxy loan type...")
    df = add_proxy_loan_type(df)
    
    print("Writing segmentation report...")
    write_segmentation_report(df)
    
    outputs = {}
    for loan_type in ("personal", "business"):
        print(f"\n--- Processing segment: {loan_type.upper()} ---")
        segment_df = df[df["loan_type"] == loan_type].copy()
        if len(segment_df) < 200 or segment_df[TARGET_COLUMN].nunique() < 2:
            print(f"Warning: Not enough data for {loan_type}, falling back to full dataset.")
            segment_df = df.copy()
        print(f"Training model for {loan_type} with {len(segment_df)} rows...")
        outputs[loan_type] = train_segment_model(segment_df, loan_type)
        print(f"Finished training {loan_type}. Model saved to {outputs[loan_type]}")
        
    print("\nTraining completed successfully!")
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
    categorical = features.select_dtypes(include=['object', 'string', 'category']).columns.tolist()
    numeric = features.select_dtypes(exclude=['object', 'string', 'category']).columns.tolist()

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
    print(f"Running RandomizedSearchCV for {loan_type} (this may take a while)...")
    search.fit(x_train, y_train)
    print(f"Best parameters found for {loan_type}: {search.best_params_}")
    
    print(f"Calibrating classifier for {loan_type}...")
    from sklearn.frozen import FrozenEstimator
    calibrated = CalibratedClassifierCV(FrozenEstimator(search.best_estimator_), method="isotonic")
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
        print(f"Reading {os.path.basename(path)} for data profile...")
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
    print("Starting training script...")
    train_all(force=True)
