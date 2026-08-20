import re
from typing import List, Dict, Any, Tuple
from core.models import StructuredRow, NormalizedApplicantProfile

CRITICAL_FIELDS = ["applicantId", "requestedLoanAmount", "declaredIncome"]

FIELD_ALIASES = {
  "applicantId": ["applicant_id", "applicantid", "customer_id", "customer_no", "customer_number", "id"],
  "declaredIncome": ["monthly_income", "monthly_salary", "salary_month", "income", "salary", "declared_income"],
  "existingObligations": ["monthly_debt", "existing_emi", "monthly_emi", "debt", "obligations", "existing_obligations"],
  "bureauScore": ["credit_score", "credit_rating", "cibil", "cibil_score", "bureau_score"],
  "businessVintage": ["employment_years", "years_employed", "job_tenure", "employment_tenure", "business_vintage"],
  "requestedLoanAmount": ["loan_amount", "requested_amount", "amount_requested", "requested_loan_amount"],
  "requestedTenure": ["tenure", "requested_tenure", "loan_tenure", "months"],
  "age": ["age", "applicant_age"],
  "employmentType": ["employment_type", "job_type"],
  "writeOffFlag": ["write_off_flag", "write_off", "is_written_off"],
  "settlementFlag": ["settlement_flag", "is_settled"],
  "defaultFlag": ["default_flag", "is_defaulted", "default_indicator"],
  "bounceCount": ["bounce_count", "bounces", "cheque_bounces"],
  "monthlyCredits": ["monthly_credits", "total_credits"],
  "emiDebits": ["emi_debits", "monthly_emis", "bank_emi_debits"],
  "largeObligationsCount": ["large_obligations", "large_obligations_count", "high_value_debits"],
  "incomeTrend": ["income_trend", "salary_trend"],
  "employmentStability": ["employment_stability", "job_stability"],
  "utilityPaymentBehaviour": ["utility_payment_behaviour", "utility_behaviour", "bill_payments"],
  "declaredAssets": ["declared_assets", "mutual_funds", "equities", "total_assets"]
}

def normalize_column_name(name: str) -> str:
  # Lowercase, trim, and replace spaces/dashes with underscores
  name = name.strip().lower()
  name = re.sub(r'[\s\-]+', '_', name)
  return name

def schema_mapping(raw_dict: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
  mapped_data = {}
  unmapped = []
  
  # Flatten alias map for quick O(1) lookup: normalized_alias -> canonical_field
  alias_to_canonical = {}
  for canonical, aliases in FIELD_ALIASES.items():
    alias_to_canonical[canonical.lower()] = canonical
    for alias in aliases:
      alias_to_canonical[alias] = canonical
      
  for raw_key, value in raw_dict.items():
    if not raw_key: 
      continue
    
    norm_key = normalize_column_name(raw_key)
    if norm_key in alias_to_canonical:
      canonical_key = alias_to_canonical[norm_key]
      mapped_data[canonical_key] = value
    else:
      # If we don't recognize it, it goes to unmapped and optionally carries over
      unmapped.append(raw_key)
      # We still keep it around for `extra='allow'` just in case, but flag it
      mapped_data[raw_key] = value

  return mapped_data, unmapped

def find_missing_critical_fields(row: Dict[str, Any]) -> List[str]:
  missing = []
  for field in CRITICAL_FIELDS:
    val = row.get(field)
    if val is None or val == "":
      missing.append(field)
  return missing

def semantic_validation(profile_dict: Dict[str, Any]) -> List[str]:
  errors = []
  
  # 1. Type validation and range bounds
  score = profile_dict.get('bureauScore')
  if score is not None and str(score).strip() != "":
    try:
      score_val = int(float(score))
      if score_val < 300 or score_val > 900:
        errors.append(f"bureauScore {score_val} is out of bounds (300-900)")
      profile_dict['bureauScore'] = score_val
    except ValueError:
      errors.append(f"bureauScore must be an integer, got {score}")

  income = profile_dict.get('declaredIncome')
  if income is not None and str(income).strip() != "":
    try:
      income_val = float(income)
      if income_val < 0:
        errors.append("declaredIncome cannot be negative")
      profile_dict['declaredIncome'] = income_val
    except ValueError:
      errors.append(f"declaredIncome must be numeric, got {income}")

  debt = profile_dict.get('existingObligations')
  if debt is not None and str(debt).strip() != "":
    try:
      debt_val = float(debt)
      if debt_val < 0:
        errors.append("existingObligations cannot be negative")
      profile_dict['existingObligations'] = debt_val
    except ValueError:
      errors.append(f"existingObligations must be numeric, got {debt}")

  # 2. Cross-field validation (e.g. DTI)
  if 'declaredIncome' in profile_dict and 'existingObligations' in profile_dict:
    inc = profile_dict['declaredIncome']
    dbt = profile_dict['existingObligations']
    if isinstance(inc, (int, float)) and isinstance(dbt, (int, float)):
      if inc > 0:
        dti = dbt / inc
        if dti > 1.0:
          errors.append(f"DTI is too high (>100%): {dti*100:.1f}%")
      elif dbt > 0:
        errors.append("Existing obligations > 0 but income is 0")

  return errors

def map_structured_input(raw_dict: Dict[str, Any]) -> NormalizedApplicantProfile:
  # 1. Normalize and map schema (fast path — alias dictionary)
  mapped_dict, unmapped_fields = schema_mapping(raw_dict)
  
  # 1b. AI Fallback — if there are unmapped fields, try the smart mapper
  if unmapped_fields:
    try:
      from ingestion.smart_mapper import generate_column_mapping, CANONICAL_FIELDS
      print(f"  [Mapper] {len(unmapped_fields)} unmapped fields. Calling AI fallback...")
      ai_mapping = generate_column_mapping(unmapped_fields, target_fields=CANONICAL_FIELDS)
      
      for raw_key, canonical_key in ai_mapping.items():
        if canonical_key is not None and canonical_key in [f for f in CANONICAL_FIELDS]:
          # Move the value from the raw key to the canonical key
          if raw_key in mapped_dict:
            mapped_dict[canonical_key] = mapped_dict.pop(raw_key)
          elif raw_key in raw_dict:
            mapped_dict[canonical_key] = raw_dict[raw_key]
          unmapped_fields.remove(raw_key)
      print(f"  [Mapper] AI resolved. Remaining unmapped: {unmapped_fields}")
    except Exception as e:
      print(f"  [Mapper] AI fallback failed: {str(e)}. Continuing with partial mapping.")
  
  # Ensure dpdHistory and itrIncomeLastTwoYears are lists if provided as strings in CSV
  if isinstance(mapped_dict.get('dpdHistory'), str):
    mapped_dict['dpdHistory'] = []
  if isinstance(mapped_dict.get('itrIncomeLastTwoYears'), str):
    mapped_dict['itrIncomeLastTwoYears'] = []
  
  # Cast basic booleans if needed
  for flag in ['writeOffFlag', 'settlementFlag', 'defaultFlag']:
    if isinstance(mapped_dict.get(flag), str):
      mapped_dict[flag] = mapped_dict[flag].lower() == 'true'

  # 2. Missing critical fields check
  missing_fields = find_missing_critical_fields(mapped_dict)
  if missing_fields:
    raise ValueError(f"Essential fields are missing: {', '.join(missing_fields)}")
  
  # 3. Semantic validation
  validation_errors = semantic_validation(mapped_dict)
  
  structured = StructuredRow(**mapped_dict)
  
  profile = NormalizedApplicantProfile(
    **structured.model_dump(),
    sourceType="structured",
    missingFields=missing_fields,
    unmappedFields=unmapped_fields,
    validationErrors=validation_errors
  )
  
  return profile

