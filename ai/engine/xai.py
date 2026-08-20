import os
import json
from groq import Groq
from core.models import NormalizedApplicantProfile, DecisionReport

def generate_xai_explanation(profile: NormalizedApplicantProfile, report: DecisionReport) -> DecisionReport:
    """
    Generates a deterministic counterfactual metric analysis, then uses an LLM
    to translate the metrics into a human-readable memo and actionable steps.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        print("  [XAI] Warning: No GROQ_API_KEY found. Skipping XAI generation.")
        return report

    # 1. Calculate deterministic counterfactual metrics
    metrics_context = []
    actionable_metrics = []
    
    for rule in report.ruleEvaluations:
        if rule.outcome in ["FLAG", "HARD_REJECT"]:
            # FOIR Counterfactual
            if rule.ruleId == "SC-FOIR" and isinstance(rule.observedValue, (int, float)):
                threshold = rule.threshold or 0.4
                deficit = float(rule.observedValue) - float(threshold)
                required_reduction = deficit * (profile.declaredIncome or 0)
                metrics_context.append(f"FOIR failed. Observed: {rule.observedValue*100}%, Target: {threshold*100}%.")
                if required_reduction > 0:
                    actionable_metrics.append(f"Reduce monthly existing obligations by {required_reduction:,.2f} INR to meet the {threshold*100}% FOIR limit.")
            
            # Bureau Counterfactual
            elif rule.ruleId == "SC-BUREAU" and isinstance(rule.observedValue, (int, float)):
                threshold = rule.threshold or 700
                deficit = float(threshold) - float(rule.observedValue)
                metrics_context.append(f"Bureau failed. Observed: {rule.observedValue}, Target: {threshold}.")
                actionable_metrics.append(f"Improve credit score by {deficit} points to reach the required {threshold} threshold.")
            
            # Income Counterfactual
            elif rule.ruleId == "EL-03" and isinstance(rule.observedValue, (int, float)):
                threshold = rule.threshold or 15000
                deficit = float(threshold) - float(rule.observedValue)
                metrics_context.append(f"Income failed. Observed: {rule.observedValue}, Target: {threshold}.")
                actionable_metrics.append(f"Increase declared annual income by {deficit:,.2f} INR.")
            
            # Boolean Flags (Hard Rejects)
            elif isinstance(rule.observedValue, bool):
                metrics_context.append(f"{rule.description} (Observed: {rule.observedValue})")
                actionable_metrics.append(f"Resolve the flag: {rule.description}")

    # 2. Format Context for LLM
    decision_context = f"Final Decision: {report.finalDecision}\nRisk Grade: {report.riskGrade}\nMax Eligible Amount: {report.maxEligibleAmount}"
    if not metrics_context:
        metrics_context.append("Applicant passed all rules with zero deviations.")
        actionable_metrics.append("Maintain current financial health and timely payments.")

    system_prompt = """You are an Explainable AI (XAI) agent for a credit underwriting system.
Your job is to translate hard mathematical metrics into a professional, empathetic memo for the loan officer or applicant.
You MUST rely exactly on the 'Metrics' provided. Do not hallucinate numbers.

Format your response exactly as a JSON object:
{
  "memo": "A 2-3 sentence paragraph explaining the decision logically based on the metrics.",
  "actionable_steps": ["step 1 based on actionable metrics", "step 2 based on actionable metrics"]
}
"""
    
    user_prompt = f"""
Decision Context:
{decision_context}

Metrics & Failed Rules:
{chr(10).join(metrics_context)}

Calculated Actionable Advice:
{chr(10).join(actionable_metrics)}
"""

    client = Groq(api_key=api_key)
    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.0
        )
        
        result_str = response.choices[0].message.content
        result_json = json.loads(result_str)
        
        report.xaiMemo = result_json.get("memo", "Unable to generate memo.")
        report.actionableSteps = result_json.get("actionable_steps", actionable_metrics)
        print("  [XAI] Successfully generated Explainability Memo and Counterfactuals.")
        
    except Exception as e:
        print(f"  [XAI] Error generating XAI explanation: {e}")
        report.xaiMemo = "Explainability Engine failed to process metrics."
        report.actionableSteps = actionable_metrics # Fallback to raw math

    return report
