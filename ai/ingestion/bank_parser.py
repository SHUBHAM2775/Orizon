import pandas as pd
from typing import Dict, Any
from core.models import StructuredRow
import re

# The 5 canonical bank statement columns we need for our math
BANK_CANONICAL = ["date", "narration", "withdrawal", "deposit", "balance"]

def _try_ai_column_mapping(raw_headers: list) -> dict:
    """
    Calls the AI smart mapper to dynamically map unknown column names
    to our 5 canonical bank statement columns.
    """
    from ingestion.smart_mapper import generate_column_mapping, BANK_CANONICAL_COLUMNS
    print(f"  [AI] Mapping unknown columns: {raw_headers} -> {BANK_CANONICAL_COLUMNS}")
    mapping = generate_column_mapping(raw_headers, target_fields=BANK_CANONICAL_COLUMNS)
    # Filter out null mappings and build rename dict
    rename_dict = {}
    for raw_col, canonical_col in mapping.items():
        if canonical_col is not None:
            rename_dict[raw_col] = canonical_col
    print(f"  [AI] Column mapping result: {rename_dict}")
    return rename_dict


def parse_bank_statement(filepath: str) -> StructuredRow:
    """
    Parses a raw Bank Statement CSV and calculates derived metrics deterministically.
    Handles ANY column schema by using AI-driven mapping as a fallback.
    """
    try:
        df = pd.read_csv(filepath)
    except Exception as e:
        raise ValueError(f"Failed to read bank statement: {str(e)}")
        
    # Standardize column names for comparison
    original_columns = list(df.columns)
    df.columns = [c.strip().lower() for c in df.columns]
    
    required_cols = {'date', 'narration', 'withdrawal', 'deposit', 'balance'}
    
    # Check if columns already match our canonical names
    if not required_cols.issubset(set(df.columns)):
        # Columns don't match — use AI to dynamically map them
        print("  [Bank Parser] Columns don't match canonical format. Calling AI mapper...")
        rename_dict = _try_ai_column_mapping(original_columns)
        
        # Rename using the AI mapping (lowercase the keys first since we lowered df.columns)
        lower_rename = {k.strip().lower(): v for k, v in rename_dict.items()}
        df = df.rename(columns=lower_rename)
        
        # Verify after renaming
        if not required_cols.issubset(set(df.columns)):
            raise ValueError(
                f"Bank statement columns could not be mapped. "
                f"After AI mapping, found: {list(df.columns)}. "
                f"Required: {list(required_cols)}"
            )
        print("  [Bank Parser] AI mapping successful! Proceeding with calculations...")
        
    # Clean numeric columns
    for col in ['withdrawal', 'deposit', 'balance']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    # 1. Calculate Average Balance
    avg_balance = float(df['balance'].mean())
    
    # 2. Calculate Total Monthly Credits (total deposits)
    total_credits = float(df['deposit'].sum())
    
    # 3. Detect EMI Debits
    emi_keywords = r'emi|loan|finance|auto.?debit'
    emi_mask = (df['withdrawal'] > 0) & (df['narration'].str.lower().str.contains(emi_keywords, na=False))
    emi_debits = 0.0
    if not df[emi_mask].empty:
        emi_debits = float(df[emi_mask]['withdrawal'].median())
        
    # 4. Count Bounces
    bounce_keywords = r'return|bounce|rtn|insufficient'
    bounce_mask = df['narration'].str.lower().str.contains(bounce_keywords, na=False)
    bounce_count = int(bounce_mask.sum())
    
    # 5. Calculate Cash Flow Volatility (std dev of monthly deposits)
    df['month'] = pd.to_datetime(df['date'], dayfirst=True, errors='coerce').dt.to_period('M')
    monthly_deposits = df.groupby('month')['deposit'].sum()
    volatility = float(monthly_deposits.std()) if len(monthly_deposits) > 1 else 0.0
    
    return StructuredRow(
        bankAvgBalance=avg_balance,
        monthlyCredits=total_credits,
        emiDebits=emi_debits,
        bounceCount=bounce_count,
        cashFlowVolatility=volatility
    )
