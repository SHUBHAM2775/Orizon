/**
 * rule-engine.ts — Pure, deterministic rule evaluation engine.
 *
 * evaluateApplicant(applicant, rules) → Evaluation
 *
 * This is the "configurable BRE" that makes demo scenario 5 possible:
 * an Admin changes a threshold → same applicant re-run → different outcome.
 *
 * Design decisions:
 *   - Pure function — no side effects, no state. All state lives in the
 *     store (mock-store.tsx). This makes re-evaluation trivial.
 *   - Outcome priority: HARD_REJECT > EXCEPTION_L2 > EXCEPTION_L1 > APPROVED
 *     (a hard-reject rule always overrides everything else)
 *   - Multiple EXCEPTION_L1 + EXCEPTION_L2 triggers → outcome is L2
 *   - Thresholds are snapshotted per EvaluationRuleResult so historical
 *     decisions stay internally consistent after Admin edits rules later
 *   - hasWriteOff (boolean) is normalized to 0/1 for comparison with threshold
 *
 * Eligible amount (APPROVED only):
 *   - Simplified formula: eligible = min(requested, income * ELIGIBLE_MULTIPLIER)
 *   - Interest rate band based on CIBIL score tier
 */

import type {
  Applicant,
  Rule,
  Evaluation,
  EvaluationRuleResult,
  DecisionOutcome,
  RuleOperator,
} from "./mock-data";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compare(operator: RuleOperator, actual: number, threshold: number): boolean {
  switch (operator) {
    case "gte": return actual >= threshold;
    case "lte": return actual <= threshold;
    case "gt":  return actual > threshold;
    case "lt":  return actual < threshold;
    case "eq":  return actual === threshold;
    case "neq": return actual !== threshold;
  }
}

function getActualValue(applicant: Applicant, field: keyof Applicant): number {
  const val = applicant[field];
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "number") return val;
  return 0;
}

const ELIGIBLE_MULTIPLIER = 0.45; // annual income × 0.45 = rough eligible amount

function deriveInterestBand(cibil: number): string {
  if (cibil >= 775) return "8.5% – 10.0% p.a.";
  if (cibil >= 750) return "9.5% – 11.5% p.a.";
  if (cibil >= 725) return "11.0% – 13.5% p.a.";
  return "13.0% – 16.0% p.a.";
}

let evalCounter = 100; // Simple ID generator — resets on page refresh (fine for mock phase)

// ─── Main export ──────────────────────────────────────────────────────────────

export function evaluateApplicant(
  applicant: Applicant,
  rules: Rule[],
  runBy: string,
): Evaluation {
  const activeRules = rules.filter((r) => r.isActive);
  const ruleResults: EvaluationRuleResult[] = [];

  for (const rule of activeRules) {
    const actual = getActualValue(applicant, rule.field);
    const triggered = compare(rule.operator, actual, rule.threshold);

    ruleResults.push({
      ruleId: rule.id,
      ruleName: rule.name,
      reasonCode: rule.reasonCode,
      actualValue: applicant[rule.field] as number | boolean,
      thresholdAtEvaluation: rule.threshold,
      operator: rule.operator,
      triggered,
      outcome: rule.outcome,
      explanation: rule.explanation,
    });
  }

  // Outcome priority: HARD_REJECT > EXCEPTION_L2 > EXCEPTION_L1 > APPROVED
  const triggered = ruleResults.filter((r) => r.triggered);
  let finalDecision: DecisionOutcome = "APPROVED";

  const hasHardReject = triggered.some((r) => r.outcome === "HARD_REJECT");
  const hasL2 = triggered.some((r) => r.outcome === "EXCEPTION_L2");
  const hasL1 = triggered.some((r) => r.outcome === "EXCEPTION_L1");

  // Multiple L1 triggers also escalate to L2 (context.md §3)
  const multipleL1 = triggered.filter((r) => r.outcome === "EXCEPTION_L1").length >= 2;

  if (hasHardReject) {
    finalDecision = "HARD_REJECT";
  } else if (hasL2 || (hasL1 && multipleL1)) {
    finalDecision = "EXCEPTION_L2";
  } else if (hasL1) {
    finalDecision = "EXCEPTION_L1";
  }

  const evalId = `EVAL${String(++evalCounter).padStart(3, "0")}`;
  const rulesVersion = Math.max(...activeRules.map((r) => r.version), 1);

  const evaluation: Evaluation = {
    id: evalId,
    applicantId: applicant.id,
    runAt: new Date().toISOString(),
    runBy,
    finalDecision,
    ruleResults,
    rulesVersion,
  };

  if (finalDecision === "APPROVED") {
    evaluation.eligibleAmount = Math.min(
      applicant.loanAmount,
      Math.round(applicant.annualIncome * ELIGIBLE_MULTIPLIER),
    );
    evaluation.interestRateBand = deriveInterestBand(applicant.cibilScore);
  }

  return evaluation;
}
