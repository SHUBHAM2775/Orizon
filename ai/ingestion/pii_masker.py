import uuid
import re
from typing import Tuple, Any

# ---------------------------------------------------------------------------
# PII Masker — runs 100% locally, no API calls
# Uses Microsoft Presidio for NER + custom India-specific regex recognizers
# Falls back to pure regex if Presidio is not installed.
# ---------------------------------------------------------------------------

_analyzer = None  # lazy singleton
_USE_PRESIDIO = True

def _get_analyzer():
    """Lazily initialize the Presidio AnalyzerEngine with India-specific recognizers."""
    global _analyzer, _USE_PRESIDIO
    if _analyzer is not None:
        return _analyzer

    try:
        from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer
    except ImportError:
        print("  [PII] WARNING: presidio_analyzer not installed. Using regex-only fallback.")
        print("  [PII] To install: pip install presidio-analyzer presidio-anonymizer spacy && python -m spacy download en_core_web_lg")
        _USE_PRESIDIO = False
        return None

    _analyzer = AnalyzerEngine()

    # India-specific recognizers that Presidio doesn't ship with
    pan_recognizer = PatternRecognizer(
        supported_entity="IN_PAN",
        patterns=[Pattern(name="pan", regex=r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", score=0.9)]
    )
    aadhaar_recognizer = PatternRecognizer(
        supported_entity="IN_AADHAAR",
        patterns=[Pattern(name="aadhaar", regex=r"\b\d{4}\s?\d{4}\s?\d{4}\b", score=0.85)]
    )
    account_recognizer = PatternRecognizer(
        supported_entity="ACCOUNT_NUMBER",
        patterns=[Pattern(name="acc_no", regex=r"\b\d{9,18}\b", score=0.6)]
    )
    ifsc_recognizer = PatternRecognizer(
        supported_entity="IN_IFSC",
        patterns=[Pattern(name="ifsc", regex=r"\b[A-Z]{4}0[A-Z0-9]{6}\b", score=0.9)]
    )

    for r in [pan_recognizer, aadhaar_recognizer, account_recognizer, ifsc_recognizer]:
        _analyzer.registry.add_recognizer(r)

    return _analyzer


# Entities we want to detect and mask
ENTITIES = [
    "PERSON", "IN_PAN", "IN_AADHAAR", "ACCOUNT_NUMBER",
    "IN_IFSC", "PHONE_NUMBER", "EMAIL_ADDRESS"
]

# Regex fallback patterns (used when Presidio is not installed)
_REGEX_PATTERNS = [
    ("IN_PAN",          re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")),
    ("IN_AADHAAR",      re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b")),
    ("IN_IFSC",         re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b")),
    ("EMAIL_ADDRESS",   re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")),
    ("PHONE_NUMBER",    re.compile(r"\+?\d[\d\s\-]{8,14}\d")),
    ("ACCOUNT_NUMBER",  re.compile(r"\b\d{9,18}\b")),
]


def _mask_with_regex(text: str) -> Tuple[str, dict]:
    """Pure regex fallback when Presidio is unavailable."""
    mapping = {}
    masked = text
    
    # Collect all matches first, then replace right-to-left
    all_matches = []
    for entity_type, pattern in _REGEX_PATTERNS:
        for m in pattern.finditer(text):
            all_matches.append((m.start(), m.end(), entity_type, m.group()))
    
    # Sort right-to-left so replacements don't shift indices
    all_matches.sort(key=lambda x: x[0], reverse=True)
    
    for start, end, entity_type, real_value in all_matches:
        token = f"<<{entity_type}_{uuid.uuid4().hex[:6]}>>"
        mapping[token] = real_value
        masked = masked[:start] + token + masked[end:]
    
    return masked, mapping


def mask_text(text: str) -> Tuple[str, dict]:
    """
    Detects PII in the given text and replaces each span with an opaque token.
    
    Returns:
        masked_text: The text with PII replaced by tokens like <<PERSON_a1b2c3>>.
        mapping: A dict of token -> real_value. This NEVER leaves the local process.
    """
    analyzer = _get_analyzer()
    
    if analyzer is None:
        # Presidio not available — use regex fallback
        return _mask_with_regex(text)
    
    results = analyzer.analyze(text=text, entities=ENTITIES, language="en")

    # Sort right-to-left so replacements don't shift character indices
    results = sorted(results, key=lambda r: r.start, reverse=True)

    mapping = {}
    masked = text
    for r in results:
        real_value = text[r.start:r.end]
        token = f"<<{r.entity_type}_{uuid.uuid4().hex[:6]}>>"
        mapping[token] = real_value
        masked = masked[:r.start] + token + masked[r.end:]

    return masked, mapping


def unmask_json(obj: Any, mapping: dict) -> Any:
    """
    Recursively walks a JSON-like object and replaces tokens back to real values.
    Call this AFTER the LLM returns its extraction result.
    After calling this, discard the mapping from memory.
    """
    if isinstance(obj, str):
        for token, real in mapping.items():
            obj = obj.replace(token, real)
        return obj
    if isinstance(obj, dict):
        return {k: unmask_json(v, mapping) for k, v in obj.items()}
    if isinstance(obj, list):
        return [unmask_json(v, mapping) for v in obj]
    return obj
