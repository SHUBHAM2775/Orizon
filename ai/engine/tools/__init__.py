"""
engine/tools/ — Tool Catalog for the Underwriting Pipeline

Routing is deterministic code, not an LLM decision. Each tool runs its own
capped loop independently — they don't call each other and can't trigger new tools.
"""

from typing import List

from core.models import APIBudget, MLScoringResult, NormalizedApplicantProfile, ToolResult
from engine.config.ml_config import ADVERSE_MEDIA_AMOUNT_THRESHOLD, COMBINED_CAP, TOOL_CAPS


import json
import os

def run_tool_catalog(
    applicant: NormalizedApplicantProfile,
    ml_result: MLScoringResult,
    api_budget: APIBudget,
) -> List[ToolResult]:
    """
    Agentic tool orchestrator loop. The LLM decides which tools to run based on the
    applicant profile and prior tool results, for a maximum of 3 loops.
    Always returns exactly 6 entries to maintain downstream pipeline contracts.
    """
    # Lazy imports to keep module loading fast
    from .market_analysis import run_market_tool
    from .employer_verification import run_employer_tool
    from .collateral_valuation import run_collateral_tool
    from .adverse_media import run_adverse_media_tool
    from .macro_outlook import run_macro_tool
    from .peer_benchmarking import run_peer_tool

    # All available tools mapping
    tool_map = {
        "market_analysis": lambda: run_market_tool(applicant, ml_result, api_budget),
        "employer_verification": lambda: run_employer_tool(applicant, api_budget),
        "collateral_valuation": lambda: run_collateral_tool(applicant, api_budget),
        "adverse_media": lambda: run_adverse_media_tool(applicant, api_budget),
        "macro_outlook": lambda: run_macro_tool(applicant, api_budget),
        "peer_benchmarking": lambda: run_peer_tool(applicant, api_budget),
    }

    results_map = {}
    
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        print("  [Orchestrator] No API key found, skipping all tools.")
        return [ToolResult(tool_id=t, ran=False, skip_reason="Agentic Orchestrator disabled (no API key)") for t in tool_map]

    from groq import Groq
    client = Groq(api_key=api_key)

    applicant_summary = applicant.model_dump(exclude_none=True)
    
    for loop_num in range(3):
        if not api_budget.can_call("groq_llm", "orchestrator"):
            print("  [Orchestrator] Budget exhausted, terminating loop.")
            break
            
        print(f"  [Orchestrator] Loop {loop_num+1} starting...")
        
        # Build state context
        state_context = {
            "applicant": applicant_summary,
            "ml_risk_tier": ml_result.risk_tier,
            "available_uncalled_tools": [t for t in tool_map.keys() if t not in results_map],
            "previously_called_tools_and_results": [
                {"tool": k, "adjustment": v.adjustment_applied, "reasons": v.key_reasons}
                for k, v in results_map.items()
            ]
        }
        
        system_prompt = (
            "You are the Orchestrator Agent. You decide which data-gathering tools to run to assess credit risk. "
            "Examine the 'applicant' data and any 'previously_called_tools_and_results'. "
            "If you need more information, return a JSON object with a list of tools to run: {\"tools_to_run\": [\"tool_name\"]}. "
            "If you have enough information to make a solid assessment, or if there are no 'available_uncalled_tools' left, return {\"done\": true}. "
            "Important Rules:\n"
            "- Do not call collateral_valuation if the applicant has no declared assets.\n"
            "- Do not call business-only tools (market_analysis, adverse_media, macro_outlook, peer_benchmarking) for personal loans.\n"
            "- Only select tools from the 'available_uncalled_tools' list.\n"
        )
        
        try:
            api_budget.consume("groq_llm", "orchestrator", endpoint="groq/chat")
            response = client.chat.completions.create(
                model="openai/gpt-oss-20b",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(state_context)}
                ],
                response_format={"type": "json_object"},
                temperature=0,
            )
            raw = json.loads(response.choices[0].message.content)
            
            if raw.get("done"):
                print("  [Orchestrator] Decided it has enough information. Exiting loop.")
                break
                
            tools_to_run = raw.get("tools_to_run", [])
            if not tools_to_run:
                break
                
            print(f"  [Orchestrator] Decided to run: {tools_to_run}")
            for tool in tools_to_run:
                if tool in tool_map and tool not in results_map:
                    try:
                        results_map[tool] = tool_map[tool]()
                    except Exception as e:
                        results_map[tool] = ToolResult(
                            tool_id=tool, ran=True, adjustment_applied=0.0,
                            needs_manual_review=True, key_reasons=[f"Tool failed: {str(e)}"], confidence="low"
                        )
                        
        except Exception as e:
            print(f"  [Orchestrator] Loop failed: {e}")
            break

    # Build final list of 6 ToolResults to maintain contract
    final_results = []
    for tool_id in tool_map.keys():
        if tool_id in results_map:
            final_results.append(results_map[tool_id])
        else:
            final_results.append(ToolResult(
                tool_id=tool_id, ran=False, skip_reason="Agentic Orchestrator skipped this tool"
            ))
            
    return final_results


def aggregate_adjustments(tool_results: List[ToolResult]) -> float:
    """
    Sum per-tool adjustments (each already clamped by its own cap), then clamp
    the combined total to COMBINED_CAP.
    """
    total = 0.0
    for t in tool_results:
        if not t.ran:
            continue
        lo, hi = TOOL_CAPS.get(t.tool_id, (-0.10, 0.10))
        clamped = max(lo, min(hi, t.adjustment_applied))
        total += clamped
    return max(COMBINED_CAP[0], min(COMBINED_CAP[1], total))
