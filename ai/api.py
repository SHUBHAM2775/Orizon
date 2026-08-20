import os
import json
import uuid
import tempfile
import pandas as pd
from typing import List

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ingestion.mapper import map_structured_input
from core.models import NormalizedApplicantProfile
from ingestion.pdf_processor import parse_document
from ingestion.reconciler import reconcile_profiles

app = FastAPI(title="Orizon AI Pipeline")

# Allow Next.js frontend/backend to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _merge_into(target: NormalizedApplicantProfile, source):
    """Merge non-None fields from source into target (target wins on conflicts)."""
    source_data = source.model_dump(exclude_none=True)
    for key, value in source_data.items():
        if key in ('sourceType', 'missingFields', 'unmappedFields', 'validationErrors'):
            continue
        current = getattr(target, key, None)
        if current is None:
            setattr(target, key, value)

@app.post("/process/structured")
async def process_structured(file: UploadFile = File(...)):
    """
    Processes a structured CSV or JSON file.
    Returns a NormalizedApplicantProfile.
    """
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.csv', '.json']:
        raise HTTPException(status_code=400, detail="Only .csv and .json files are supported for structured processing.")

    # Create a temporary file to work with pandas/json loaders
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
        content = await file.read()
        temp_file.write(content)
        temp_path = temp_file.name

    base_profile = None
    extra_sources = []

    try:
        if ext == '.json':
            with open(temp_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            rows = data if isinstance(data, list) else [data]
            for row in rows:
                profile = map_structured_input(row)
                if base_profile is None:
                    base_profile = profile
                else:
                    _merge_into(base_profile, profile)
        
        elif ext == '.csv':
            df_peek = pd.read_csv(temp_path, nrows=1)
            headers = [c.strip().lower() for c in df_peek.columns]
            
            bank_keywords = {'date', 'balance', 'withdrawal', 'deposit', 'credit', 
                             'debit', 'amount', 'txn_date', 'txn date', 'closing_bal',
                             'dr', 'cr', 'bal', 'credit_amt', 'debit_amt'}
            
            if len(set(headers) & bank_keywords) >= 2:
                # Bank statement
                from ingestion.bank_parser import parse_bank_statement
                bank_result = parse_bank_statement(temp_path)
                extra_sources.append(bank_result)
            else:
                # Application data
                df_full = pd.read_csv(temp_path)
                df_full = df_full.where(pd.notnull(df_full), None)
                for _, row in df_full.iterrows():
                    row_dict = row.to_dict()
                    profile = map_structured_input(row_dict)
                    if base_profile is None:
                        base_profile = profile
                    else:
                        _merge_into(base_profile, profile)
                        
        if base_profile is None and not extra_sources:
            raise HTTPException(status_code=400, detail="No valid application data found.")
        
        if base_profile is None:
            # If only bank statement was provided, create a dummy base profile
            base_profile = NormalizedApplicantProfile(applicantId=f"BANK-{uuid.uuid4().hex[:8]}", sourceType="structured")

        if extra_sources:
            final_profile = reconcile_profiles(base_profile, extra_sources)
        else:
            final_profile = base_profile

        return final_profile.model_dump(exclude_none=True)

    finally:
        os.remove(temp_path)

@app.post("/process/pdf")
async def process_pdf(file: UploadFile = File(...)):
    """
    Processes a PDF document (e.g. ITR, Form 16, salary slip).
    Returns a NormalizedApplicantProfile.
    """
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.pdf', '.txt']:
        raise HTTPException(status_code=400, detail="Only .pdf and .txt files are supported for pdf processing.")

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
        return final_profile.model_dump(exclude_none=True)

    finally:
        os.remove(temp_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
