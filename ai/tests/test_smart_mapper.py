import sys
import os
# Add the ai root directory to the python path to allow importing from our layers
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pandas as pd
import json
from layer1_ingestion.smart_mapper import generate_column_mapping

def test_mapper(filepath: str):
  if not os.path.exists(filepath):
    print(f"Error: File '{filepath}' not found.")
    return

  if not os.environ.get("GROQ_API_KEY"):
    print("Error: GROQ_API_KEY environment variable is missing.")
    print("Please set it in your terminal before running this script.")
    print("Example: $env:GROQ_API_KEY='your_api_key'")
    return

  print(f"Reading headers from '{filepath}'...")
  
  # Extract keys/headers depending on file type
  if filepath.lower().endswith('.json'):
    with open(filepath, 'r', encoding='utf-8') as f:
      data = json.load(f)
      # Handle both arrays of objects and single objects
      if isinstance(data, list) and len(data) > 0:
        headers = list(data[0].keys())
      elif isinstance(data, dict):
        headers = list(data.keys())
      else:
        print("Error: JSON must be a dictionary or a list of dictionaries.")
        return
  else:
    # Assume CSV
    df = pd.read_csv(filepath, nrows=0)
    headers = list(df.columns)
  
  print("\nRaw headers/keys found:")
  print(headers)
  
  print("\nCalling Groq API to generate mapping (this might take a few seconds)...")
  try:
    mapping = generate_column_mapping(headers)
    print("\n--- Success! AI Generated Mapping ---")
    print(json.dumps(mapping, indent=2))
  except Exception as e:
    print(f"\nError: {str(e)}")

if __name__ == "__main__":
  if len(sys.argv) != 2:
    print("Usage: python test_smart_mapper.py <path_to_csv_or_json>")
    print("Example: python test_smart_mapper.py ..\\test_data\\test_invalid.json")
    sys.exit(1)
    
  test_mapper(sys.argv[1])
