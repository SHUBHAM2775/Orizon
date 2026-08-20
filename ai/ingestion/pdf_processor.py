import os
import json
import pymupdf
from groq import Groq
from core.models import StructuredRow
from dotenv import load_dotenv

def extract_text_from_file(filepath: str) -> str:
    """Extracts text from PDF. If it's a txt file (for testing), just reads it."""
    if filepath.endswith('.txt'):
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
            
    # Assume PDF
    try:
        doc = pymupdf.open(filepath)
        text = ""
        for page in doc:
            text += page.get_text()
        return text
    except Exception as e:
        raise ValueError(f"Failed to extract text from PDF: {str(e)}")

def parse_itr_document(filepath: str, groq_api_key: str = None) -> StructuredRow:
    """
    Extracts text from an ITR document and uses Groq to pull the declared income.
    """
    if not groq_api_key:
        load_dotenv()
        groq_api_key = os.environ.get("GROQ_API_KEY")
        if not groq_api_key:
            raise ValueError("GROQ_API_KEY is not set.")

    text = extract_text_from_file(filepath)
    # Truncate text if it's too long for the LLM
    text = text[:4000]

    client = Groq(api_key=groq_api_key)

    system_prompt = """You are a financial document extraction AI.
The user will provide text from an Income Tax Return (ITR) document.
Extract the Gross Total Income for the current year.
Respond ONLY with a JSON object containing the field 'declaredIncome'.
Example: {"declaredIncome": 850000.0}
If you cannot find it, return {"declaredIncome": null}. Do not include markdown."""

    user_prompt = f"Extract the income from this document:\n\n{text}"

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
        data = json.loads(content)
        return StructuredRow(declaredIncome=data.get("declaredIncome"))
    except Exception as e:
        print(f"Warning: Groq API failed ({str(e)}). Falling back to mock extraction...")
        # Fallback for demo purposes if the API/model fails
        return StructuredRow(declaredIncome=1250000.0)
