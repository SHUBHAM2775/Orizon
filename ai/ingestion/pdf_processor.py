import os
import json
import pymupdf
from groq import Groq
from core.models import StructuredRow
from dotenv import load_dotenv
from ingestion.pii_masker import mask_text, unmask_json

def extract_text_from_file(filepath: str) -> str:
    """Extracts text from PDF. If it's a txt file (for testing), just reads it."""
    if filepath.endswith('.txt'):
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
            
    try:
        doc = pymupdf.open(filepath)
        text = ""
        for page in doc:
            text += page.get_text()
        return text
    except Exception as e:
        raise ValueError(f"Failed to extract text from PDF: {str(e)}")


def parse_document(filepath: str, groq_api_key: str = None) -> StructuredRow:
    """
    PII-safe document extraction pipeline:
    1. Extract text locally (pymupdf)
    2. Mask all PII locally (Presidio)
    3. Send ONLY masked text to LLM for structural extraction
    4. Rehydrate PII locally
    5. Return StructuredRow
    
    The LLM never sees real PAN, Aadhaar, name, or account numbers.
    """
    if not groq_api_key:
        load_dotenv()
        groq_api_key = os.environ.get("GROQ_API_KEY")
        if not groq_api_key:
            raise ValueError("GROQ_API_KEY is not set.")

    # Step 1: Extract text locally
    raw_text = extract_text_from_file(filepath)
    print(f"  [PDF] Extracted {len(raw_text)} characters of text.")
    
    # Step 2: Mask PII locally (Presidio — no API calls)
    masked_text, pii_mapping = mask_text(raw_text)
    pii_count = len(pii_mapping)
    print(f"  [PII] Masked {pii_count} PII entities. LLM will NOT see real identity data.")
    
    # Truncate for LLM context window
    masked_text = masked_text[:6000]

    client = Groq(api_key=groq_api_key)

    system_prompt = """You are a financial document extraction AI for a credit underwriting system.
The user will provide text from a financial document (ITR, bank statement, salary slip, application form etc.).
The text has been PII-masked — identity fields contain tokens like <<PERSON_abc123>> or <<IN_PAN_def456>>. 
This is intentional. Extract the token as-is for identity fields.

Extract ALL of the following fields that you can find. Return ONLY a valid JSON object.
Use null for any field you cannot find. Do not include markdown formatting.

Fields to extract:
{
  "applicantName": "string or PII token",
  "pan": "string or PII token",
  "age": number,
  "employmentType": "Salaried" or "Self-Employed" or null,
  "requestedLoanAmount": number,
  "requestedTenure": number,
  "declaredIncome": number (annual gross total income),
  "emiDebits": number (existing monthly EMI),
  "bureauScore": number (CIBIL score),
  "bankAvgBalance": number,
  "bounceCount": number,
  "declaredAssets": number,
  "writeOffFlag": boolean (true if default/writeoff mentioned),
  "itrIncomeLastTwoYears": [number, number] or null
}"""

    user_prompt = f"Extract financial data from this masked document:\n\n{masked_text}"

    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model="openai/gpt-oss-20b",
            temperature=0.0,
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        extracted = json.loads(content)
        
        # Step 4: Rehydrate PII locally (swap tokens back to real values)
        extracted = unmask_json(extracted, pii_mapping)
        print(f"  [PII] Rehydrated {pii_count} PII entities back to real values locally.")
        
        # Discard mapping from memory — it should never be persisted
        del pii_mapping
        
        # Build StructuredRow from extracted fields
        return StructuredRow(
            age=extracted.get("age"),
            employmentType=extracted.get("employmentType"),
            requestedLoanAmount=extracted.get("requestedLoanAmount"),
            requestedTenure=extracted.get("requestedTenure"),
            declaredIncome=extracted.get("declaredIncome"),
            emiDebits=extracted.get("emiDebits"),
            bureauScore=extracted.get("bureauScore"),
            bankAvgBalance=extracted.get("bankAvgBalance"),
            bounceCount=extracted.get("bounceCount"),
            declaredAssets=extracted.get("declaredAssets"),
            writeOffFlag=extracted.get("writeOffFlag") or False,
            itrIncomeLastTwoYears=extracted.get("itrIncomeLastTwoYears") or [],
        )
        
    except Exception as e:
        print(f"  [WARNING] LLM extraction failed ({str(e)}). Using regex fallback...")
        # Regex fallback: try to find "Gross Total Income" pattern
        import re
        income_match = re.search(r'(?:gross\s+total\s+income|total\s+income)[:\s]*[\u20b9]?\s*([\d,]+(?:\.\d+)?)', raw_text, re.IGNORECASE)
        income = None
        if income_match:
            income = float(income_match.group(1).replace(',', ''))
            print(f"  [Fallback] Found income via regex: {income}")
        return StructuredRow(declaredIncome=income)
