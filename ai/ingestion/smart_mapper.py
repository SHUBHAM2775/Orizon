import os
import json
from groq import Groq
from dotenv import load_dotenv

# The canonical fields from our models.py
CANONICAL_FIELDS = [
  "applicantId", "age", "employmentType", "businessVintage", 
  "requestedLoanAmount", "requestedTenure", "declaredIncome", 
  "existingObligations", "bureauScore", "activeLoans", "enquiries", 
  "overdueAmount", "dpdHistory", "writeOffFlag", "settlementFlag", 
  "defaultFlag", "bankAvgCredits", "monthlyCredits", "bankAvgBalance", 
  "emiDebits", "bounceCount", "cashFlowVolatility", "largeObligationsCount", 
  "itrIncomeLastTwoYears", "incomeTrend", "declaredAssets", 
  "employmentStability", "utilityPaymentBehaviour"
]

# Bank statement canonical columns (for bank_parser dynamic mapping)
BANK_CANONICAL_COLUMNS = ["date", "narration", "withdrawal", "deposit", "balance"]

def generate_column_mapping(raw_headers: list, target_fields: list = None, groq_api_key: str = None) -> dict:
  """
  Uses Groq to generate a JSON mapping of raw column headers to canonical fields.
  Works for both applicant data (CSV/JSON) and bank statement columns.
  
  Args:
    raw_headers: The raw column names from the uploaded file.
    target_fields: The canonical fields to map to. Defaults to CANONICAL_FIELDS.
    groq_api_key: Optional API key override.
    
  Returns:
    A dict mapping raw_header -> canonical_field (or null if no match).
  """
  if not groq_api_key:
    load_dotenv()
    groq_api_key = os.environ.get("GROQ_API_KEY")
    if not groq_api_key:
      raise ValueError("GROQ_API_KEY is not set. Please set the environment variable.")

  if target_fields is None:
    target_fields = CANONICAL_FIELDS

  client = Groq(api_key=groq_api_key)

  system_prompt = f"""You are a data mapping assistant for a credit underwriting system.
Your job is to map raw column headers provided by the user to our canonical system fields.

Here are the ONLY allowed canonical fields you can map to:
{json.dumps(target_fields, indent=2)}

Rules:
1. You must output ONLY a valid JSON object. No markdown formatting, no explanation text.
2. The keys of the JSON must be the raw headers exactly as provided.
3. The values must be the EXACT canonical field name from the allowed list.
4. If a raw header clearly does not match any canonical field, set its value to null.
5. Do not hallucinate fields. Only use field names from the allowed list.
6. Use semantic understanding — e.g., "Txn_Date" maps to "date", "Dr_Amount" maps to "withdrawal", "Cr_Amount" maps to "deposit".
"""

  user_prompt = f"Map the following raw headers to the canonical fields:\n{json.dumps(raw_headers)}"

  response = client.chat.completions.create(
    messages=[
      {"role": "system", "content": system_prompt},
      {"role": "user", "content": user_prompt}
    ],
    model="openai/gpt-oss-20b",
    temperature=0.0,
    response_format={"type": "json_object"}
  )

  try:
    content = response.choices[0].message.content
    mapping = json.loads(content)
    return mapping
  except Exception as e:
    raise RuntimeError(f"Failed to parse Groq response as JSON. Response: {content}\nError: {str(e)}")
