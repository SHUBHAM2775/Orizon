"""
Tool 4 — Adverse Media / Litigation Screen (business loans > 5L only)

Searches for public litigation, regulatory action against the BUSINESS ENTITY only.
Never screens the individual — entity-scoped for privacy.
Cap: -10% to 0% (one-directional — never improves score). Max searches: 3. Max LLM: 1.
"""

import json
import os
import urllib.parse
import urllib.request
from typing import List, Optional

from core.models import APIBudget, NormalizedApplicantProfile, ToolResult


def run_adverse_media_tool(
    applicant: NormalizedApplicantProfile,
    api_budget: APIBudget,
) -> ToolResult:
    entity_name = _extract_business_name(applicant)
    if not entity_name:
        return ToolResult(
            tool_id="adverse_media",
            ran=True,
            adjustment_applied=0.0,
            key_reasons=["No business entity name available — cannot screen."],
            confidence="low",
            needs_manual_review=True,
        )

    # Bounded search — max 3 queries
    queries = [
        f'"{entity_name}" fraud penalty RBI SEBI India',
        f'"{entity_name}" court case winding up NCLT',
        f'"{entity_name}" regulatory action India 2024 2025',
    ]

    snippets: List[str] = []
    sources: List[str] = []
    for query in queries:
        if not api_budget.can_call("web_search", "adverse_media"):
            break
        try:
            url = "https://duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
            api_budget.consume("web_search", "adverse_media", endpoint=url)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as response:
                html = response.read().decode("utf-8", errors="ignore")
            snippets.append(_compact(html))
            sources.append(url)
        except Exception as e:
            snippets.append(f"Search failed: {e}")

    if not sources:
        return ToolResult(
            tool_id="adverse_media",
            ran=True,
            adjustment_applied=0.0,
            key_reasons=["All searches failed or budget exhausted."],
            confidence="low",
            needs_manual_review=True,
            degraded=True,
        )

    # Synthesize via LLM if budget allows, else heuristic
    findings = _synthesize(entity_name, snippets, sources, api_budget)

    # ONE-DIRECTIONAL: never positive. Clamp to (-0.10, 0.00)
    adjustment = max(-0.10, min(0.0, findings["adjustment"]))

    return ToolResult(
        tool_id="adverse_media",
        ran=True,
        adjustment_applied=adjustment,
        key_reasons=findings["reasons"],
        sources=sources,
        confidence=findings["confidence"],
        needs_manual_review=findings.get("adverse_found", False),
        raw_findings=findings,
        api_calls_used=len(sources) + (1 if findings.get("llm_used") else 0),
    )


def _extract_business_name(applicant: NormalizedApplicantProfile) -> Optional[str]:
    data = applicant.model_dump()
    for key in ("businessName", "business_name", "employerName", "employer_name", "employer", "company"):
        val = data.get(key)
        if isinstance(val, str) and val.strip() and val.strip().lower() not in ("salaried", "self-employed", "unemployed"):
            return val.strip()
    return None


def _synthesize(entity_name, snippets, sources, api_budget):
    api_key = os.getenv("GROQ_API_KEY")
    if api_key and api_budget.can_call("groq_llm", "adverse_media"):
        try:
            from groq import Groq
            api_budget.consume("groq_llm", "adverse_media", endpoint="groq/chat")
            client = Groq(api_key=api_key)
            response = client.chat.completions.create(
                model="openai/gpt-oss-20b",
                messages=[
                    {"role": "system", "content": (
                        "You are screening a business entity for adverse media and litigation. "
                        "Return ONLY JSON: {adverse_found: bool, severity: minor|moderate|severe|none, "
                        "key_findings: [{claim: str, source: str}], confidence: low|medium|high}. "
                        "Use only the provided search snippets. Be conservative — only flag "
                        "clear evidence of fraud, regulatory action, or litigation."
                    )},
                    {"role": "user", "content": json.dumps({
                        "entity_name": entity_name,
                        "snippets": snippets[:3],
                        "sources": sources[:3],
                    })},
                ],
                response_format={"type": "json_object"},
                temperature=0,
            )
            raw = json.loads(response.choices[0].message.content)
            return _build_result(raw)
        except Exception:
            pass

    return _heuristic(entity_name, snippets)


def _build_result(raw):
    adverse_found = raw.get("adverse_found", False)
    severity = raw.get("severity", "none")

    severity_map = {"none": 0.0, "minor": -0.03, "moderate": -0.07, "severe": -0.10}
    adjustment = severity_map.get(severity, 0.0)

    findings = raw.get("key_findings", [])
    reasons = [f"{f.get('claim', 'Unknown finding')}" for f in findings[:3]]
    if not adverse_found:
        reasons = ["No adverse media or litigation found for the business entity."]

    return {
        "adverse_found": adverse_found,
        "severity": severity,
        "adjustment": adjustment if adverse_found else 0.0,
        "reasons": reasons,
        "confidence": raw.get("confidence", "low"),
        "llm_used": True,
    }


def _heuristic(entity_name, snippets):
    text = " ".join(snippets).lower()
    neg_terms = ["fraud", "scam", "penalty", "winding up", "nclt", "default", "blacklist", "debarred"]
    hits = sum(text.count(t) for t in neg_terms)

    if hits == 0:
        return {"adverse_found": False, "severity": "none", "adjustment": 0.0,
                "reasons": ["Heuristic: no adverse signals found in search results."],
                "confidence": "low", "llm_used": False}
    elif hits <= 3:
        return {"adverse_found": True, "severity": "minor", "adjustment": -0.03,
                "reasons": [f"Heuristic: {hits} adverse keyword(s) found in search results."],
                "confidence": "low", "llm_used": False}
    else:
        return {"adverse_found": True, "severity": "moderate", "adjustment": -0.07,
                "reasons": [f"Heuristic: {hits} adverse keywords found — elevated concern."],
                "confidence": "low", "llm_used": False}


def _compact(html: str) -> str:
    text = html.replace("\n", " ").replace("\r", " ")
    while "  " in text:
        text = text.replace("  ", " ")
    return text[:2500]
