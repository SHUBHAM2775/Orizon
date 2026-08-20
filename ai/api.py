import os
import json
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import the existing pipeline components
from core.models import NormalizedApplicantProfile, DecisionReport
from engine.engine import run_bre

app = FastAPI(title="Orizon AI - Underwriting API", version="1.0.0")

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
        # Save to a hypothetical 'evaluations' table
        record = {
            "applicant_id": profile_data.get("applicantId", "UNKNOWN"),
            "profile_data": profile_data,
            "decision_data": decision_data,
            "final_decision": decision_data.get("finalDecision"),
            "risk_tier": decision_data.get("derived_metrics", {}).get("risk_tier"),
            "risk_score": decision_data.get("derived_metrics", {}).get("risk_score"),
            "created_at": datetime.utcnow().isoformat()
        }
        supabase.table("evaluations").insert(record).execute()
        print(f"Successfully persisted evaluation for {record['applicant_id']}")
    except Exception as e:
        print(f"Failed to persist to Supabase: {e}")

@app.post("/api/evaluate")
async def evaluate_applicant(req: EvaluationRequest, background_tasks: BackgroundTasks):
    try:
        # 1. Parse and validate the profile
        profile = NormalizedApplicantProfile(**req.profile)
        
        # 2. Run the deterministic/ML engine
        decision_report = run_bre(profile)
        
        # XAI explanation is now generated inside run_bre() → orchestrator
            
        profile_dict = profile.model_dump(exclude_none=True)
        decision_dict = decision_report.model_dump(exclude_none=True)
        
        # 4. Save to DB in the background
        background_tasks.add_task(persist_to_db, profile_dict, decision_dict)
        
        return {
            "status": "success",
            "profile": profile_dict,
            "decision": decision_dict
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "db_connected": supabase is not None}

if __name__ == "__main__":
    import uvicorn
    # Run with: python api.py
    uvicorn.run(app, host="0.0.0.0", port=8000)
