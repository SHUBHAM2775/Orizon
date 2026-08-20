import pandas as pd
from typing import Dict, Any
from core.models import StructuredRow
import re

def parse_bank_statement(filepath: str) -> StructuredRow:
    """
    Parses a raw Bank Statement CSV and calculates derived metrics deterministically.
    Expects columns: Date, Narration, Withdrawal, Deposit, Balance
    """
    try:
        df = pd.read_csv(filepath)
    except Exception as e:
        raise ValueError(f"Failed to read bank statement: {str(e)}")
        
    # Standardize column names for processing
    df.columns = [c.strip().lower() for c in df.columns]
    
    required_cols = {'date', 'narration', 'withdrawal', 'deposit', 'balance'}
    if not required_cols.issubset(set(df.columns)):
        raise ValueError(f"Bank statement missing required columns. Found: {df.columns}")
        
    # Clean numeric columns
    for col in ['withdrawal', 'deposit', 'balance']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    # 1. Calculate Average Balance
    avg_balance = float(df['balance'].mean())
    
    # 2. Calculate Total Monthly Credits (simplified as total deposits)
    # For a real implementation, you'd group by month. We'll do total for now.
    total_credits = float(df['deposit'].sum())
    
    # 3. Detect EMI Debits
    # Find withdrawals where narration contains 'EMI', 'LOAN', 'FINANCE'
    emi_keywords = r'emi|loan|finance'
    emi_mask = (df['withdrawal'] > 0) & (df['narration'].str.lower().str.contains(emi_keywords, na=False))
    # Sum the EMI debits (assuming they are monthly, we can just take the max or average)
    # Let's assume the highest recurring EMI is the fixed monthly obligation
    emi_debits = 0.0
    if not df[emi_mask].empty:
        emi_debits = float(df[emi_mask]['withdrawal'].median())
        
    # 4. Count Bounces
    # Find any row where narration contains 'return', 'bounce', 'chq rtn'
    bounce_keywords = r'return|bounce|rtn|insufficient'
    bounce_mask = df['narration'].str.lower().str.contains(bounce_keywords, na=False)
    bounce_count = int(bounce_mask.sum())
    
    # Return a partial StructuredRow
    return StructuredRow(
        bankAvgBalance=avg_balance,
        monthlyCredits=total_credits,
        emiDebits=emi_debits,
        bounceCount=bounce_count
    )
