import os
import sys
import time
import json
import pandas as pd
import pymupdf
from io import BytesIO

from ingestion.mapper import map_structured_input
from engine.engine import run_bre

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")
os.makedirs(RESULTS_DIR, exist_ok=True)

def process_file(filepath: str, label: str):
  if label.lower() != "aggregate" and not os.path.exists(filepath):
    print(f"Error: File '{filepath}' not found.")
    return

  label = label.lower()
  if label not in ["csv", "json", "pdf", "aggregate"]:
    print("Error: Invalid label. Must be csv, json, pdf, or aggregate.")
    return

  print(f"Processing '{filepath}' as '{label}'...")

  filename_base = os.path.basename(filepath)
  safe_name = "".join(c for c in filename_base if c.isalnum() or c in ".-_")
  timestamp = int(time.time())

  if label == "json":
    try:
      with open(filepath, "rb") as f:
        content = f.read()
      data = json.loads(content)
      rows = data if isinstance(data, list) else [data]
      
      profiles = []
      for row in rows:
        profile = map_structured_input(row)
        decision_report = run_bre(profile)
        profiles.append({
          "profile": profile.model_dump(exclude_none=True),
          "decision": decision_report.model_dump(exclude_none=True)
        })
      
      out_filename = f"structured-json-{timestamp}.json"
      out_filepath = os.path.join(RESULTS_DIR, out_filename)
      
      with open(out_filepath, "w", encoding="utf-8") as f:
        json.dump(profiles, f, indent=2)
        
      print(f"\n--- Success! JSON processed and saved to: {out_filepath} ---")
      print(json.dumps(profiles, indent=2))
      
    except ValueError as e:
      print(f"Error: {str(e)}")
    except json.JSONDecodeError:
      print("Error: Invalid JSON file.")

  elif label == "csv":
    try:
      with open(filepath, "rb") as f:
        content = f.read()
      df = pd.read_csv(BytesIO(content))
      df = df.where(pd.notnull(df), None)
      
      profiles = []
      for _, row in df.iterrows():
        row_dict = row.to_dict()
        profile = map_structured_input(row_dict)
        decision_report = run_bre(profile)
        profiles.append({
          "profile": profile.model_dump(exclude_none=True),
          "decision": decision_report.model_dump(exclude_none=True)
        })
        
      out_filename = f"structured-csv-{timestamp}.json"
      out_filepath = os.path.join(RESULTS_DIR, out_filename)
      
      with open(out_filepath, "w", encoding="utf-8") as f:
        json.dump(profiles, f, indent=2)
        
      print(f"\n--- Success! CSV processed and saved to: {out_filepath} ---")
      print(json.dumps(profiles, indent=2))
      
    except ValueError as e:
      print(f"Error: {str(e)}")
    except Exception as e:
      print(f"Error processing CSV: {str(e)}")

  elif label == "pdf":
    try:
      with open(filepath, "rb") as f:
        content = f.read()
      doc = pymupdf.open(stream=content, filetype="pdf")
      text = ""
      for page in doc:
        text += page.get_text()
        
      out_filename = f"{safe_name.replace('.pdf', '')}-{timestamp}.txt"
      out_filepath = os.path.join(RESULTS_DIR, out_filename)
      
      with open(out_filepath, "w", encoding="utf-8") as f:
        f.write(text)
          
      print(f"\n--- Success! PDF text extracted and saved to: {out_filepath} ---")
      print(f"Preview of text (first 200 chars):\n{text[:200]}...")
      
    except Exception as e:
      print(f"Error processing PDF: {str(e)}")

  elif label == "aggregate":
    print("Running full raw data aggregation pipeline...")
    # Hardcoded paths for the demo
    base_json_path = os.path.join(os.path.dirname(__file__), "test_data", "comprehensive_test.json")
    raw_bank_path = os.path.join(os.path.dirname(__file__), "test_data", "raw_bank_statement.csv")
    raw_itr_path = os.path.join(os.path.dirname(__file__), "test_data", "raw_itr.txt")
    
    # 1. Load basic application data
    with open(base_json_path, 'r', encoding='utf-8') as f:
      data = json.load(f)
      # Get the first borderline applicant to test reconciliation
      raw_base = data[1] if isinstance(data, list) else data
      from ingestion.mapper import map_structured_input
      base_profile = map_structured_input(raw_base)

    # 2. Parse Raw Bank Statement
    print("Parsing Raw Bank Statement CSV...")
    from ingestion.bank_parser import parse_bank_statement
    bank_profile = parse_bank_statement(raw_bank_path)

    # 3. Parse Raw ITR PDF (simulated with txt) using AI
    print("Calling Groq AI to extract Income from ITR PDF...")
    from ingestion.pdf_processor import parse_itr_document
    itr_profile = parse_itr_document(raw_itr_path)

    # 4. Reconcile
    print("Reconciling multiple sources into a Master Profile...")
    from ingestion.reconciler import reconcile_profiles
    final_profile = reconcile_profiles(base_profile, [bank_profile, itr_profile])

    # 5. Run Decision Engine
    print("Running Business Rule Engine on Master Profile...")
    decision_report = run_bre(final_profile)
    
    print("\n--- AGGREGATION & RECONCILIATION SUCCESS ---")
    print("Master Profile (Reconciled):")
    print(json.dumps(final_profile.model_dump(exclude_none=True), indent=2))
    print("\nFinal Decision Report:")
    print(json.dumps(decision_report.model_dump(exclude_none=True), indent=2))

if __name__ == "__main__":
  if len(sys.argv) != 3:
    print("Usage: python main.py <path_to_file> <label>")
    print("Example: python main.py sample.pdf pdf")
    print("Example: python main.py dummy aggregate")
    print("Supported labels: json, csv, pdf, aggregate")
    sys.exit(1)
    
  process_file(sys.argv[1], sys.argv[2])
