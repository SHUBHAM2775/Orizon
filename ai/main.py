"""
Orizon AI — Loan Underwriting Pipeline

Usage:
  python main.py <folder_path> structured    # Folder of JSON/CSV files for one applicant
  python main.py <folder_path> pdf           # Folder of PDF/TXT files for one applicant

All files in the folder are assumed to belong to the SAME applicant.
The system auto-detects each file's role (application data, bank statement, ITR, etc.)
and aggregates everything into one Master Profile + Decision.
"""

import os
import sys
from dotenv import load_dotenv
load_dotenv()
import time
import json
import pandas as pd
from io import BytesIO

from ingestion.mapper import map_structured_input
from engine.engine import run_bre
from engine.xai import generate_xai_explanation
from core.models import NormalizedApplicantProfile, StructuredRow

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")
os.makedirs(RESULTS_DIR, exist_ok=True)


def process_structured_folder(folder_path: str):
  """
  Processes a folder containing JSON and/or CSV files for ONE applicant.
  
  - JSON files are loaded and merged (all fields aggregated into one profile).
  - CSV files are sniffed:
      - If columns look like a bank statement (date/balance/etc) -> Bank Parser
      - Otherwise -> treated as structured application data
  - Everything is reconciled into a single Master Profile and run through the engine.
  """
  print("=" * 60)
  print(f"PROCESSING STRUCTURED DATA: {folder_path}")
  print("=" * 60)

  base_profile = None
  extra_sources = []

  files = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f))]
  
  if not files:
    print("Error: No files found in the folder.")
    return

  for filename in sorted(files):
    file_path = os.path.join(folder_path, filename)
    ext = os.path.splitext(filename)[1].lower()

    if ext == '.json':
      print(f"\n  [Router] '{filename}' -> Structured Mapper (JSON)")
      with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
      
      # Handle arrays: take first row, or merge all
      rows = data if isinstance(data, list) else [data]
      for row in rows:
        profile = map_structured_input(row)
        if base_profile is None:
          base_profile = profile
        else:
          # Merge: fill in blanks from this profile
          _merge_into(base_profile, profile)

    elif ext == '.csv':
      # Sniff headers to decide: bank statement or application data?
      df_peek = pd.read_csv(file_path, nrows=1)
      headers = [c.strip().lower() for c in df_peek.columns]
      
      bank_keywords = {'date', 'balance', 'withdrawal', 'deposit', 'credit', 
                       'debit', 'amount', 'txn_date', 'txn date', 'closing_bal',
                       'dr', 'cr', 'bal', 'credit_amt', 'debit_amt'}
      
      if len(set(headers) & bank_keywords) >= 2:
        # This is a bank statement
        print(f"\n  [Router] '{filename}' -> Bank Parser (CSV with financial columns)")
        from ingestion.bank_parser import parse_bank_statement
        bank_result = parse_bank_statement(file_path)
        extra_sources.append(bank_result)
      else:
        # This is structured application data
        print(f"\n  [Router] '{filename}' -> Structured Mapper (CSV)")
        df_full = pd.read_csv(file_path)
        df_full = df_full.where(pd.notnull(df_full), None)
        for _, row in df_full.iterrows():
          row_dict = row.to_dict()
          profile = map_structured_input(row_dict)
          if base_profile is None:
            base_profile = profile
          else:
            _merge_into(base_profile, profile)
    else:
      print(f"\n  [Router] '{filename}' -> Skipped (unsupported extension: {ext})")

  if base_profile is None:
    print("\n  [Error] No valid application data found. Need at least one JSON or CSV with applicant info.")
    return

  # Reconcile bank data into the profile
  if extra_sources:
    from ingestion.reconciler import reconcile_profiles
    final_profile = reconcile_profiles(base_profile, extra_sources)
  else:
    final_profile = base_profile

  # Run decision engine
  decision_report = run_bre(final_profile)
  
  # Generate XAI Explanation
  decision_report = generate_xai_explanation(final_profile, decision_report)

  # Save & print results
  timestamp = int(time.time())
  result = {
    "profile": final_profile.model_dump(exclude_none=True),
    "decision": decision_report.model_dump(exclude_none=True)
  }
  
  out_filepath = os.path.join(RESULTS_DIR, f"structured-{timestamp}.json")
  with open(out_filepath, "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2)

  _print_results(final_profile, decision_report, out_filepath)


def process_pdf_folder(folder_path: str):
  """
  Processes a folder containing PDF (and/or .txt) files for ONE applicant.
  
  Each file is run through the PII-safe extraction pipeline:
    1. Extract text locally (PyMuPDF / plain read)
    2. Mask PII locally (Presidio or regex fallback)
    3. Send masked text to LLM for structured extraction
    4. Rehydrate PII locally
  
  All extracted data is reconciled into one profile.
  """
  print("=" * 60)
  print(f"PROCESSING PDF DOCUMENTS: {folder_path}")
  print("=" * 60)

  from ingestion.pdf_processor import parse_document

  extracted_profiles = []
  
  files = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f))]
  supported = [f for f in files if os.path.splitext(f)[1].lower() in ('.pdf', '.txt')]
  
  if not supported:
    print("Error: No PDF or TXT files found in the folder.")
    return

  for filename in sorted(supported):
    file_path = os.path.join(folder_path, filename)
    print(f"\n  [Router] '{filename}' -> PII-Safe PDF Extractor")
    profile = parse_document(file_path)
    extracted_profiles.append(profile)
    print(f"  [Extracted] declaredIncome={profile.declaredIncome}, employmentType={profile.employmentType}")

  # Build a base from the first extraction, merge the rest
  base = NormalizedApplicantProfile(
    applicantId=os.path.basename(folder_path),
    sourceType="pdf"
  )
  
  from ingestion.reconciler import reconcile_profiles
  final_profile = reconcile_profiles(base, extracted_profiles)

  # Run decision engine
  decision_report = run_bre(final_profile)

  # Generate XAI Explanation
  decision_report = generate_xai_explanation(final_profile, decision_report)

  # Save & print results
  timestamp = int(time.time())
  result = {
    "profile": final_profile.model_dump(exclude_none=True),
    "decision": decision_report.model_dump(exclude_none=True)
  }
  
  out_filepath = os.path.join(RESULTS_DIR, f"pdf-{timestamp}.json")
  with open(out_filepath, "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2)

  _print_results(final_profile, decision_report, out_filepath)


def _merge_into(target: NormalizedApplicantProfile, source):
  """Merge non-None fields from source into target (target wins on conflicts)."""
  source_data = source.model_dump(exclude_none=True)
  for key, value in source_data.items():
    if key in ('sourceType', 'missingFields', 'unmappedFields', 'validationErrors'):
      continue
    current = getattr(target, key, None)
    if current is None:
      setattr(target, key, value)


def _print_results(profile, decision, filepath):
  """Pretty-print the final results."""
  print("\n" + "=" * 60)
  print("PIPELINE COMPLETE")
  print("=" * 60)
  
  print(f"\n  Applicant ID  : {profile.applicantId}")
  print(f"  Decision      : {decision.finalDecision}")
  print(f"  Risk Grade    : {decision.riskGrade}")
  print(f"  Max Elig. Amt : {decision.maxEligibleAmount}")
  print(f"  Req. Eligible : {decision.isEligibleForRequested}")
  print(f"  Interest Band : {decision.interestRateBand}")
  print(f"  Escalation    : {decision.escalationAuthority}")
  
  # Show triggered rules
  triggered = [r for r in decision.ruleEvaluations if r.outcome != "PASS"]
  if triggered:
    print(f"\n  Triggered Rules:")
    for r in triggered:
      print(f"    - [{r.ruleId}] {r.description} (observed: {r.observedValue}, threshold: {r.threshold})")
      
  # Show XAI Explanations
  if decision.xaiMemo:
    print("\n  ================ EXPLAINABILITY MEMO ================")
    print(f"  {decision.xaiMemo}")
    if decision.actionableSteps:
      print("\n  Actionable Steps:")
      for step in decision.actionableSteps:
        print(f"    -> {step}")
    print("  ===================================================")
  
  print(f"\n  Full result saved to: {filepath}")
  
  print("\n  Master Profile:")
  print("  " + json.dumps(profile.model_dump(exclude_none=True), indent=2).replace('\n', '\n  '))
  
  print("\n  Decision Report:")
  print("  " + json.dumps(decision.model_dump(exclude_none=True), indent=2).replace('\n', '\n  '))


if __name__ == "__main__":
  if len(sys.argv) != 3:
    print("Usage: python main.py <folder_path> <mode>")
    print("")
    print("Modes:")
    print("  structured  -  Folder of JSON/CSV files (application data, bank statements)")
    print("  pdf         -  Folder of PDF/TXT files (ITR, salary slips, Form 16, etc.)")
    print("")
    print("Examples:")
    print("  python main.py test_data/batch/Applicant_1_Perfect structured")
    print("  python main.py test_data/batch/Applicant_1_Perfect pdf")
    print("")
    print("All files in the folder are assumed to belong to the SAME person.")
    sys.exit(1)

  folder_path = sys.argv[1]
  mode = sys.argv[2].lower()

  if not os.path.isdir(folder_path):
    print(f"Error: '{folder_path}' is not a directory.")
    print("Both modes expect a folder containing files for one applicant.")
    sys.exit(1)

  if mode == "structured":
    process_structured_folder(folder_path)
  elif mode == "pdf":
    process_pdf_folder(folder_path)
  else:
    print(f"Error: Unknown mode '{mode}'. Use 'structured' or 'pdf'.")
    sys.exit(1)
