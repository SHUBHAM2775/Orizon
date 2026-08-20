from typing import List
from core.models import StructuredRow, NormalizedApplicantProfile

# Fields where we want to take the MAXIMUM value across all sources
# (e.g. annual ITR income > monthly salary slip gross that the LLM annualised wrong)
MAX_WINS_FIELDS = {"declaredIncome", "declaredAssets"}

# Fields where the BASE profile always wins (don't let PDFs overwrite application data)
BASE_WINS_FIELDS = {
    "applicantId", "age", "requestedLoanAmount", "requestedTenure",
    "existingObligations", "bureauScore", "employmentType",
    "writeOffFlag", "settlementFlag", "defaultFlag", "dpdHistory"
}

def reconcile_profiles(
    base_profile: StructuredRow,
    raw_sources: List[StructuredRow]
) -> NormalizedApplicantProfile:
    """
    Merges data from the base application profile and any raw document sources
    (bank statements, ITRs, salary slips) into a single authoritative Master Profile.

    Merge rules (in priority order):
      1. BASE_WINS_FIELDS  — base application always wins, PDFs/bank cannot overwrite.
      2. MAX_WINS_FIELDS   — take the highest value across all sources (avoids monthly
                             salary gross beating annual ITR income).
      3. Everything else   — "first non-null wins" (base, then sources in order).
    """
    master = base_profile.model_dump()

    for source in raw_sources:
        source_data = source.model_dump(exclude_none=True)

        for field, value in source_data.items():
            # Skip metadata fields
            if field in ("sourceType", "missingFields", "unmappedFields", "validationErrors"):
                continue

            current = master.get(field)

            # Rule 1: Base-wins fields — never overwrite if base already has a value
            if field in BASE_WINS_FIELDS:
                if current is None:
                    master[field] = value
                continue

            # Rule 2: Max-wins fields — take the higher numeric value
            if field in MAX_WINS_FIELDS:
                if current is None:
                    master[field] = value
                elif isinstance(value, (int, float)) and isinstance(current, (int, float)):
                    master[field] = max(current, value)
                continue

            # Rule 3: First-non-null wins
            if current is None:
                master[field] = value

    # Determine which critical fields are missing
    critical = ["applicantId", "declaredIncome", "requestedLoanAmount"]
    missing = [f for f in critical if not master.get(f)]

    # Determine source type
    source_type = master.get("sourceType", "structured")
    if source_type not in ("structured", "pdf", "synthetic"):
        source_type = "structured"

    return NormalizedApplicantProfile(
        **{k: v for k, v in master.items()
           if k not in ("sourceType", "missingFields", "unmappedFields", "validationErrors")},
        sourceType=source_type,
        missingFields=missing,
        unmappedFields=[],
        validationErrors=[]
    )
