"""
Tool 2 — Employer / Business Verification (any loan)

Checks registered-entity existence via web search (MCA21/GST registry preferred)
and vintage consistency with declared businessVintage.
Cap: ±10%. Max searches: 3. Max LLM: 1.
"""

import json
import os
import urllib.parse
import urllib.request
from typing import List, Optional

from core.models import APIBudget, NormalizedApplicantProfile, ToolResult


def run_employer_tool(
    applicant: NormalizedApplicantProfile,
    api_budget: APIBudget,
) -> ToolResult:
    employer_name = _extract_employer_name(applicant)
    if not employer_name:
        return ToolResult(
            tool_id="employer_verification",
            ran=True,
            adjustment_applied=0.0,
            key_reasons=["No employer or business name available on profile."],
            confidence="low",
            needs_manual_review=True,
        )

    # Search for entity registration
    snippets: List[str] = []
    sources: List[str] = []
    queries = [
        f'"{employer_name}" MCA registration India',
        f'"{employer_name}" GST registration India',
        f'"{employer_name}" company incorporation date India',
    ]

    for query in queries:
        if not api_budget.can_call("web_search", "employer_verification"):
            break
        try:
            url = "https://duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
            api_budget.consume("web_search", "employer_verification", endpoint=url)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as response:
                html = response.read().decode("utf-8", errors="ignore")
            snippets.append(_compact(html))
            sources.append(url)
        except Exception as e:
            snippets.append(f"Search failed: {e}")

    if not sources:
        return ToolResult(
            tool_id="employer_verification",
            ran=True,
            adjustment_applied=0.0,
            key_reasons=["All searches failed or budget exhausted."],
            confidence="low",
            needs_manual_review=True,
            degraded=True,
            api_calls_used=0,
        )

    # Synthesize via LLM if budget allows
    findings = _synthesize_findings(employer_name, applicant, snippets, sources, api_budget)

    return ToolResult(
        tool_id="employer_verification",
        ran=True,
        adjustment_applied=findings["adjustment"],
        key_reasons=findings["reasons"],
        sources=sources,
        confidence=findings["confidence"],
        needs_manual_review=not findings["entity_found"],
        raw_findings=findings,
        api_calls_used=len(sources) + (1 if findings.get("llm_used") else 0),
    )


def _extract_employer_name(applicant: NormalizedApplicantProfile) -> Optional[str]:
    data = applicant.model_dump()
    for key in ("businessName", "business_name", "employerName", "employer_name", "employer", "company", "employmentType"):
        val = data.get(key)
        if isinstance(val, str) and val.strip() and val.strip().lower() not in ("salaried", "self-employed", "unemployed"):
            return val.strip()
    return None


def _synthesize_findings(employer_name, applicant, snippets, sources, api_budget):
    """Try LLM synthesis, fall back to heuristic."""
    api_key = os.getenv("GROQ_API_KEY")

    if api_key and api_budget.can_call("groq_llm", "employer_verification"):
        try:
            from groq import Groq
            api_budget.consume("groq_llm", "employer_verification", endpoint="groq/chat")
            client = Groq(api_key=api_key)
            response = client.chat.completions.create(
                model="openai/gpt-oss-20b",
                messages=[
                    {"role": "system", "content": (
                        "You are verifying an employer/business entity. "
                        "Return ONLY JSON: {entity_found: bool, registration_date: str|null, "
                        "vintage_from_registry: int|null, confidence: low|medium|high, qualitative_analysis: str}. "
                        "In 'qualitative_analysis', write a comprehensive 2-3 sentence paragraph detailing the digital footprint, registration validity, and operational status of the entity based on the search snippets. "
                        "Use only the provided search snippets."
                    )},
                    {"role": "user", "content": json.dumps({
                        "employer_name": employer_name,
                        "declared_vintage": applicant.businessVintage,
                        "snippets": snippets[:3],
                    })},
                ],
                response_format={"type": "json_object"},
                temperature=0,
            )
            raw = json.loads(response.choices[0].message.content)
            return _build_result(raw, applicant, llm_used=True)
        except Exception:
            pass

    # Heuristic fallback
    return _heuristic_result(employer_name, snippets, applicant)


def _build_result(raw, applicant, llm_used=False):
    entity_found = raw.get("entity_found", False)
    reg_vintage = raw.get("vintage_from_registry")
    declared_vintage = applicant.businessVintage

    reasons = []
    adjustment = 0.0

    analysis = raw.get("qualitative_analysis")
    if analysis:
        reasons.append(analysis)
    else:
        if not entity_found:
            reasons.append("Entity could not be verified in public registries or online records, posing a high risk.")
        elif reg_vintage is not None and declared_vintage is not None:
            gap = abs(declared_vintage - reg_vintage)
            if gap > 3:
                reasons.append(f"Entity exists, but vintage is highly inconsistent (declared {declared_vintage}y vs registry ~{reg_vintage}y).")
            else:
                reasons.append(f"Entity successfully verified. Vintage is consistent with declared {declared_vintage}y.")
        elif entity_found:
            reasons.append("Entity found in search results, confirming basic operational footprint, though exact vintage could not be verified.")

    return {
        "entity_found": entity_found,
        "adjustment": adjustment,
        "reasons": reasons,
        "confidence": raw.get("confidence", "low"),
        "llm_used": llm_used,
        "vintage_from_registry": reg_vintage,
        "vintage_gap": abs((declared_vintage or 0) - (reg_vintage or 0)) if (declared_vintage and reg_vintage) else None,
    }


def _heuristic_result(employer_name, snippets, applicant):
    text = " ".join(snippets).lower()
    found = employer_name.lower() in text
    if found:
        reasons = ["Heuristic analysis verified the employer's name in online records, indicating a baseline operational footprint, though full registry details were not synthesized."]
    else:
        reasons = ["Heuristic analysis failed to find the employer's name in standard public records, highlighting a significant verification gap that requires manual investigation."]

    return {
        "entity_found": found,
        "adjustment": 0.02 if found else -0.05,
        "reasons": reasons,
        "confidence": "low",
        "llm_used": False,
        "vintage_from_registry": None,
        "vintage_gap": None,
    }


def _compact(html: str) -> str:
    text = html.replace("\n", " ").replace("\r", " ")
    while "  " in text:
        text = text.replace("  ", " ")
    return text[:2500]
