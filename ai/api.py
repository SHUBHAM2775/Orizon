import os
import json
import uuid
import tempfile
import pandas as pd
from datetime import datetime
from typing import List

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from the Next.js .env.local file
env_path = os.path.join(os.path.dirname(__file__), "..", "web", ".env.local")
load_dotenv(dotenv_path=env_path)

from core.models import NormalizedApplicantProfile
from engine.core.orchestrator import run_underwriting
from ingestion.mapper import map_structured_input
from ingestion.pdf_processor import parse_document
from ingestion.reconciler import reconcile_profiles

app = FastAPI(title="Orizon AI - Underwriting API", version="1.0.0")

# Allow Next.js frontend/backend to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase Initialization
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None
    print("Warning: Supabase credentials not found. DB persistence is disabled.")

class EvaluationRequest(BaseModel):
    profile: dict  # The raw profile data (JSON from frontend)
    use_xai: bool = True  # Whether to run the LLM explanation

def persist_to_db(profile_data: dict, decision_data: dict):
    """Background task to save profile and decision to Supabase."""
    if not supabase:
        return
    
    try:
        applicant_ref = profile_data.get("applicantId", "UNKNOWN")
        # Upsert applicant
        applicant_record = {
            "applicant_ref": applicant_ref,
            "age": profile_data.get("age"),
            "employment_type": profile_data.get("employmentType"),
            "requested_amount": profile_data.get("requestedLoanAmount"),
            "monthly_income": profile_data.get("declaredIncome") or 0,
            "cibil_score": profile_data.get("bureauScore"),
            "existing_emi": profile_data.get("existing_emi"),
            "avg_bank_balance": profile_data.get("avg_bank_balance"),
            "bounce_count": profile_data.get("bounce_count"),
            "last_default": profile_data.get("hasWriteOff"),
            "assets_value": profile_data.get("assets_value"),
            "raw_input_json": profile_data,
        }
        # Filter None
        applicant_record = {k: v for k, v in applicant_record.items() if v is not None}
        
        applicant_res = supabase.table("applicants").upsert(applicant_record, on_conflict="applicant_ref").execute()
        
        if not applicant_res.data:
            print("Failed to upsert applicant.")
            return
            
        applicant_db_id = applicant_res.data[0]["id"]
        
        # Insert evaluation
        eval_record = {
            "applicant_id": applicant_db_id,
            "final_decision": decision_data.get("policy_result", {}).get("final_decision", "INSUFFICIENT_DATA"),
            "eligible_amount": decision_data.get("max_eligible_amount"),
            "interest_rate": None,
            "risk_grade": decision_data.get("risk_grade"),
            "derived_metrics_json": decision_data,
            "xai_narrative": decision_data.get("xai_narrative"),
            "tool_results_json": decision_data.get("tool_results"),
            "api_budget_json": decision_data.get("api_budget_summary"),
            "ml_risk_tier": decision_data.get("ml_result", {}).get("risk_tier"),
            "ml_risk_score": decision_data.get("ml_result", {}).get("risk_score"),
            "evaluated_at": datetime.utcnow().isoformat()
        }
        # Parse interest rate
        band = decision_data.get("interest_rate_band")
        if band and isinstance(band, str):
            import re
            m = re.search(r"(\d+(\.\d+)?)", band)
            if m:
                eval_record["interest_rate"] = float(m.group(1))

        eval_res = supabase.table("evaluations").insert(eval_record).execute()
        eval_db_id = eval_res.data[0]["id"]
        
        # Insert rule results
        policy_result = decision_data.get("policy_result", {})
        triggered_rules = policy_result.get("triggered_rules", [])
        
        if triggered_rules:
            rules_res = supabase.table("rules").select("id, rule_code").eq("is_active", True).execute()
            rule_map = {r["rule_code"]: r["id"] for r in rules_res.data}
            
            results_to_insert = []
            for r in triggered_rules:
                rule_code = r.get("ruleId")
                rule_db_id = rule_map.get(rule_code)
                if rule_db_id:
                    results_to_insert.append({
                        "evaluation_id": eval_db_id,
                        "rule_id": rule_db_id,
                        "result": "TRIGGERED" if r.get("outcome") != "PASS" else "PASS",
                        "actual_value": r.get("observedValue"),
                        "threshold_at_evaluation": r.get("threshold") or 0
                    })
            if results_to_insert:
                supabase.table("evaluation_rule_results").insert(results_to_insert).execute()
                
        print(f"Successfully persisted evaluation for {applicant_ref}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Failed to persist to Supabase: {e}")

def _merge_into(target: NormalizedApplicantProfile, source):
    """Merge non-None fields from source into target (target wins on conflicts)."""
    source_data = source.model_dump(exclude_none=True)
    for key, value in source_data.items():
        if key in ('sourceType', 'missingFields', 'unmappedFields', 'validationErrors'):
            continue
        current = getattr(target, key, None)
        if current is None:
            setattr(target, key, value)

@app.post("/api/evaluate")
async def evaluate_applicant(req: EvaluationRequest, background_tasks: BackgroundTasks):
    try:
        # 1. Parse and validate the profile
        profile = NormalizedApplicantProfile(**req.profile)
        
        # 2. Run the agentic engine
        decision_report = run_underwriting(profile)
            
        profile_dict = profile.model_dump(exclude_none=True)
        decision_dict = decision_report.model_dump(exclude_none=True)
        
        # 3. Save to DB
        persist_to_db(profile_dict, decision_dict)
        
        return {
            "status": "success",
            "profile": profile_dict,
            "decision": decision_dict
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/process/structured")
async def process_structured(files: List[UploadFile] = File(...)):
    """
    Processes multiple structured CSV or JSON files.
    Each file (or row in the file) is treated as a distinct applicant.
    Returns a List of NormalizedApplicantProfile.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    all_profiles = []

    for file in files:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ['.csv', '.json']:
            continue

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name

        try:
            if ext == '.json':
                with open(temp_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                rows = data if isinstance(data, list) else [data]
                for row in rows:
                    profile = map_structured_input(row)
                    all_profiles.append(profile)
            
            elif ext == '.csv':
                try:
                    df_peek = pd.read_csv(temp_path, nrows=1)
                except pd.errors.EmptyDataError:
                    continue
                
                headers = [c.strip().lower() for c in df_peek.columns]
                bank_keywords = {'date', 'balance', 'withdrawal', 'deposit', 'credit', 
                                 'debit', 'amount', 'txn_date', 'txn date', 'closing_bal',
                                 'dr', 'cr', 'bal', 'credit_amt', 'debit_amt'}
                
                if len(set(headers) & bank_keywords) >= 2:
                    # It's a bank statement, we can't process it independently without an applicant to attach it to.
                    # We'll skip it in batch mode or just create a dummy profile.
                    from ingestion.bank_parser import parse_bank_statement
                    bank_result = parse_bank_statement(temp_path)
                    dummy_base = NormalizedApplicantProfile(applicantId=f"BANK-{uuid.uuid4().hex[:8]}", sourceType="structured")
                    final_profile = reconcile_profiles(dummy_base, [bank_result])
                    all_profiles.append(final_profile)
                else:
                    # Application data
                    try:
                        df_full = pd.read_csv(temp_path, on_bad_lines='skip')
                    except Exception:
                        continue
                        
                    df_full = df_full.where(pd.notnull(df_full), None)
                    for _, row in df_full.iterrows():
                        row_dict = row.to_dict()
                        profile = map_structured_input(row_dict)
                        all_profiles.append(profile)
        finally:
            os.remove(temp_path)
            
    if not all_profiles:
        raise HTTPException(status_code=400, detail="No valid application data found.")

    return [p.model_dump(exclude_none=True) for p in all_profiles]

@app.post("/process/pdf")
async def process_pdf(files: List[UploadFile] = File(...)):
    """
    Processes multiple PDF documents independently.
    Returns a List of NormalizedApplicantProfile.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    all_profiles = []
    for file in files:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ['.pdf', '.txt']:
            continue

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name

        try:
            profile = parse_document(temp_path)
            
            base = NormalizedApplicantProfile(
                applicantId=f"PDF-{uuid.uuid4().hex[:8]}",
                sourceType="pdf"
            )
            
            final_profile = reconcile_profiles(base, [profile])
            all_profiles.append(final_profile)
        finally:
            os.remove(temp_path)
            
    if not all_profiles:
        raise HTTPException(status_code=400, detail="No valid PDF data found.")
        
    return [p.model_dump(exclude_none=True) for p in all_profiles]

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "db_connected": supabase is not None}

if __name__ == "__main__":
    import uvicorn
    # Run with: python api.py
    uvicorn.run(app, host="0.0.0.0", port=8000)
