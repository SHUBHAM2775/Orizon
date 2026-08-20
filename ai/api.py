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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
