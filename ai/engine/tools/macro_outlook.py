"""
Tool 5 — Macro / Regulatory Outlook (business loans only)

Checks economy-wide signals: RBI rate cycle, upcoming regulation, credit tightening.
Distinct from sector analysis (Tool 1) — this is macro, not sector-specific.
Cap: ±5%. Max searches: 2. Max LLM: 1.
"""

import json
import os
import urllib.parse
import urllib.request
from typing import List

from core.models import APIBudget, NormalizedApplicantProfile, ToolResult


def run_macro_tool(
    applicant: NormalizedApplicantProfile,
    api_budget: APIBudget,
) -> ToolResult:
    queries = [
        "RBI repo rate outlook India 2026 credit lending",
        "India MSME lending policy regulation 2026",
    ]

    snippets: List[str] = []
    sources: List[str] = []
    for query in queries:
        if not api_budget.can_call("web_search", "macro_outlook"):
            break
        try:
            url = "https://duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
            api_budget.consume("web_search", "macro_outlook", endpoint=url)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as response:
                html = response.read().decode("utf-8", errors="ignore")
            snippets.append(_compact(html))
            sources.append(url)
        except Exception as e:
            snippets.append(f"Search failed: {e}")

    if not sources:
        return ToolResult(
            tool_id="macro_outlook",
            ran=True,
            adjustment_applied=0.0,
            key_reasons=["All searches failed or budget exhausted."],
            confidence="low",
            needs_manual_review=True,
            degraded=True,
        )

    # Synthesize via LLM if available, else heuristic
    findings = _synthesize(snippets, sources, api_budget)

    return ToolResult(
        tool_id="macro_outlook",
        ran=True,
        adjustment_applied=findings["adjustment"],
        key_reasons=findings["reasons"],
        sources=sources,
        confidence=findings["confidence"],
        raw_findings=findings,
        api_calls_used=len(sources) + (1 if findings.get("llm_used") else 0),
    )


def _synthesize(snippets, sources, api_budget):
    api_key = os.getenv("GROQ_API_KEY")
    if api_key and api_budget.can_call("groq_llm", "macro_outlook"):
        try:
            from groq import Groq
            api_budget.consume("groq_llm", "macro_outlook", endpoint="groq/chat")
            client = Groq(api_key=api_key)
            response = client.chat.completions.create(
                model="openai/gpt-oss-20b",
                messages=[
                    {"role": "system", "content": (
                        "You are analyzing the macro lending environment in India. "
                        "Return ONLY JSON: {outlook: tightening|neutral|easing, "
                        "key_reasons: [str], adjustment: number between -0.05 and 0.05, "
                        "confidence: low|medium|high}. Use only the provided snippets."
                    )},
                    {"role": "user", "content": json.dumps({
                        "snippets": snippets[:2],
                        "sources": sources[:2],
                    })},
                ],
                response_format={"type": "json_object"},
                temperature=0,
            )
            raw = json.loads(response.choices[0].message.content)
            adjustment = max(-0.05, min(0.05, float(raw.get("adjustment", 0.0))))
            return {
                "outlook": raw.get("outlook", "neutral"),
                "adjustment": adjustment,
                "reasons": list(raw.get("key_reasons", []))[:3],
                "confidence": raw.get("confidence", "low"),
                "llm_used": True,
            }
        except Exception:
            pass

    return _heuristic(snippets)


def _heuristic(snippets):
    text = " ".join(snippets).lower()
    tighten = sum(text.count(t) for t in ["tightening", "hike", "increase rate", "restrict", "npa"])
    ease = sum(text.count(t) for t in ["easing", "cut", "reduce rate", "support", "stimulus"])

    if tighten > ease + 2:
        return {"outlook": "tightening", "adjustment": -0.03, "reasons": ["Heuristic: tightening signals found."], "confidence": "low", "llm_used": False}
    elif ease > tighten + 2:
        return {"outlook": "easing", "adjustment": 0.02, "reasons": ["Heuristic: easing signals found."], "confidence": "low", "llm_used": False}
    else:
        return {"outlook": "neutral", "adjustment": 0.0, "reasons": ["Heuristic: macro environment appears neutral."], "confidence": "low", "llm_used": False}


def _compact(html: str) -> str:
    text = html.replace("\n", " ").replace("\r", " ")
    while "  " in text:
        text = text.replace("  ", " ")
    return text[:2500]
