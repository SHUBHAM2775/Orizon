import json
import os
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

from core.models import MarketAnalysis, NormalizedApplicantProfile

CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "market_cache.json")
CACHE_TTL_SECONDS = 30 * 24 * 60 * 60
MAX_ADJUSTMENT = 0.15

def run_market_analysis(profile: NormalizedApplicantProfile, base_score: float, base_tier: str) -> MarketAnalysis:
    sector = _extract_sector(profile)
    if not sector:
        return MarketAnalysis(
            sector_outlook="not_run",
            key_reasons=["No industry or sector field was available on the applicant profile."],
            adjustment_applied=0.0,
            confidence="low",
            base_score=round(base_score, 2),
            final_score=round(base_score, 2),
        )

    cached = _read_cache().get(sector.lower())
    if cached and time.time() - cached.get("cached_at", 0) < CACHE_TTL_SECONDS:
        result = MarketAnalysis(**cached["analysis"])
        result.base_score = round(base_score, 2)
        result.final_score = round(_apply_adjustment(base_score, result.adjustment_applied), 2)
        return result

    sources, snippets = _bounded_sector_search(sector)
    analysis = _synthesize_market_analysis(sector, snippets, sources, base_tier)
    analysis.base_score = round(base_score, 2)
    analysis.final_score = round(_apply_adjustment(base_score, analysis.adjustment_applied), 2)
    _write_cache(sector, analysis)
    return analysis

def _extract_sector(profile: NormalizedApplicantProfile) -> Optional[str]:
    data = profile.model_dump()
    for key in ("industry", "sector", "businessSector", "business_sector", "loanPurpose", "loan_purpose"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None

def _bounded_sector_search(sector: str) -> tuple[List[str], List[str]]:
    queries = [f"{sector} industry outlook India 2026", f"{sector} MSME credit risk default rate India"]
    sources: List[str] = []
    snippets: List[str] = []
    for query in queries[:2]:
        try:
            url = "https://duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as response:
                html = response.read().decode("utf-8", errors="ignore")
            sources.append(url)
            snippets.append(_compact_html(html))
        except Exception as exc:
            snippets.append(f"Search failed for '{query}': {exc}")
    return sources[:5], snippets[:5]

def _synthesize_market_analysis(sector: str, snippets: List[str], sources: List[str], base_tier: str) -> MarketAnalysis:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return _heuristic_market_analysis(sector, snippets, sources)
    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "system", "content": "Return only JSON: sector_outlook positive|neutral|negative|not_run, key_reasons array, adjustment_applied number -0.15..0.05, confidence low|medium|high. Use only provided snippets."},
                {"role": "user", "content": json.dumps({"sector": sector, "base_tier": base_tier, "snippets": snippets, "sources": sources})},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        raw = json.loads(response.choices[0].message.content)
        adjustment = max(-MAX_ADJUSTMENT, min(0.05, float(raw.get("adjustment_applied", 0.0))))
        return MarketAnalysis(
            sector_outlook=raw.get("sector_outlook", "neutral"),
            key_reasons=list(raw.get("key_reasons", []))[:5],
            sources=sources,
            adjustment_applied=adjustment,
            confidence=raw.get("confidence", "low"),
        )
    except Exception:
        return _heuristic_market_analysis(sector, snippets, sources)

def _heuristic_market_analysis(sector: str, snippets: List[str], sources: List[str]) -> MarketAnalysis:
    text = " ".join(snippets).lower()
    neg = sum(text.count(t) for t in ["default", "stress", "decline", "slowdown", "risk", "weak", "loss"])
    pos = sum(text.count(t) for t in ["growth", "positive", "robust", "strong", "improve", "demand"])
    if not sources:
        outlook, adjustment = "not_run", 0.0
    elif neg > pos + 2:
        outlook, adjustment = "negative", -0.08
    elif pos > neg + 2:
        outlook, adjustment = "positive", 0.03
    else:
        outlook, adjustment = "neutral", 0.0
    return MarketAnalysis(
        sector_outlook=outlook,
        key_reasons=[f"Sector evaluated: {sector}.", "Fallback heuristic used when structured market synthesis was unavailable."],
        sources=sources,
        adjustment_applied=adjustment,
        confidence="low" if not sources else "medium",
    )

def _apply_adjustment(base_score: float, adjustment: float) -> float:
    adjustment = max(-MAX_ADJUSTMENT, min(0.05, adjustment))
    return max(0.0, min(100.0, base_score * (1.0 + adjustment)))

def _compact_html(html: str) -> str:
    text = html.replace("\n", " ").replace("\r", " ")
    while "  " in text:
        text = text.replace("  ", " ")
    return text[:2500]

def _read_cache() -> Dict[str, Any]:
    try:
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _write_cache(sector: str, analysis: MarketAnalysis) -> None:
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    cache = _read_cache()
    cache[sector.lower()] = {"cached_at": time.time(), "analysis": analysis.model_dump(exclude_none=True)}
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)
