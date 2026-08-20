from typing import List, Dict, Any
from core.models import StructuredRow, NormalizedApplicantProfile

def reconcile_profiles(base_profile: StructuredRow, raw_sources: List[StructuredRow]) -> NormalizedApplicantProfile:
    """
    Merges data from the mapped application (base_profile) and any raw document sources 
    (like Bank Statements or ITRs) into a single Master Profile.
    """
    # Start with a clean base model
    master_profile = StructuredRow(**base_profile.model_dump())
    
    # Merge in extracted fields from raw sources (override if not None)
    for source in raw_sources:
        for field, value in source.model_dump(exclude_none=True).items():
            setattr(master_profile, field, value)
            
    missing = []
    # Ensure critical fields exist
    critical = ["applicantId", "declaredIncome", "requestedLoanAmount"]
    for field in critical:
        if getattr(master_profile, field, None) is None:
            missing.append(field)
            
    # Calculate FOIR safely now that all data is merged
    # Even though engine.py does this, doing it here validates it early.
    
    return NormalizedApplicantProfile(
        **master_profile.model_dump(exclude={'sourceType', 'missingFields', 'unmappedFields', 'validationErrors'}),
        sourceType="structured",
        missingFields=missing,
        unmappedFields=[],
        validationErrors=[]
    )
