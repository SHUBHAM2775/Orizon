"use client";

/**
 * eval-detail.tsx — Evaluation detail panel: rule breakdown + decision stamp.
 *
 * Used by:
 *   - Analyst dashboard: shows result after running an applicant
 *   - Exception queue: approver sees same detail when making a decision
 *
 * Contains:
 *   EvalSummaryCard   — top-level decision + eligible amount/rate (if approved)
 *   RuleBreakdownTable — per-rule Pass/Fail grid with triggered rules highlighted
 *   ApplicantProfileCard — the applicant's key metrics in an IndexCard
 */

import { cn } from "@/lib/utils";
import { IndexCard, IndexCardHeader } from "@/components/ui/index-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Stamp } from "@/components/ui/stamp";
import type {
  Evaluation,
  Applicant,
  EvaluationRuleResult,
  DecisionOutcome,
} from "@/lib/mock-data";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decisionToStampTone(d: string) {
  switch (d) {
    case "APPROVED":       return "approve" as const;
    case "HARD_REJECT":    return "reject" as const;
    case "REJECTED":       return "reject" as const;
    case "EXCEPTION_L1":   return "exception-l1" as const;
    case "EXCEPTION_L2":   return "exception-l2" as const;
    default:               return "pending" as const;
  }
}

function decisionToBadgeTone(d: string) {
  switch (d) {
    case "APPROVED":       return "approve" as const;
    case "HARD_REJECT":    return "reject" as const;
    case "REJECTED":       return "reject" as const;
    case "EXCEPTION_L1":   return "exception-l1" as const;
    case "EXCEPTION_L2":   return "exception-l2" as const;
    default:               return "pending" as const;
  }
}

function fmtINR(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function fmtOperator(op: string, threshold: number | boolean): string {
  const val = typeof threshold === "boolean" ? (threshold ? "Yes" : "No") : threshold;
  switch (op) {
    case "gte": return `≥ ${val}`;
    case "lte": return `≤ ${val}`;
    case "gt":  return `> ${val}`;
    case "lt":  return `< ${val}`;
    case "eq":  return `= ${val}`;
    case "neq": return `≠ ${val}`;
    default: return String(val);
  }
}

function fmtActual(val: number | boolean, field: string): string {
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (field === "loanAmount" || field === "avgMonthlyBalance" || field === "annualIncome") {
    return fmtINR(val);
  }
  if (field === "foir") return `${val}%`;
  return String(val);
}

// ─── ApplicantProfileCard ─────────────────────────────────────────────────────

export function ApplicantProfileCard({ applicant }: { applicant: Applicant }) {
  return (
    <IndexCard tabTone="default" as="div">
      <IndexCardHeader
        title={applicant.name}
        meta={`${applicant.id} · ${applicant.email}`}
      />
      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mt-3">
        <ProfileRow label="Requested amount" value={fmtINR(applicant.loanAmount)} mono />
        <ProfileRow label="Tenure" value={`${applicant.tenureMonths} months`} mono />
        <ProfileRow label="CIBIL score" value={String(applicant.cibilScore)} mono highlight />
        <ProfileRow label="FOIR" value={`${applicant.foir}%`} mono highlight />
        <ProfileRow label="Avg. monthly balance" value={fmtINR(applicant.avgMonthlyBalance)} mono />
        <ProfileRow label="Annual income" value={fmtINR(applicant.annualIncome)} mono />
        <ProfileRow label="EMI bounces (12M)" value={String(applicant.bounceCount)} mono />
        <ProfileRow label="Write-off on record" value={applicant.hasWriteOff ? "Yes" : "No"} mono />
      </div>
    </IndexCard>
  );
}

function ProfileRow({
  label,
  value,
  mono = false,
  highlight = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-[color-mix(in_oklch,var(--ink),transparent_93%)] py-1 last:border-0">
      <span className="text-xs text-[var(--ink-muted)] flex-shrink-0">{label}</span>
      <span
        className={cn(
          mono ? "font-mono text-xs" : "text-sm",
          highlight ? "text-[var(--ink)] font-medium" : "text-[var(--ink)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ─── EvalSummaryCard ──────────────────────────────────────────────────────────

export function EvalSummaryCard({ evaluation, applicant }: { evaluation: Evaluation; applicant: Applicant }) {
  const triggeredRules = evaluation.ruleResults.filter((r) => r.triggered);
  const primaryReason = triggeredRules[0]?.explanation;

  return (
    <IndexCard tabTone={evaluation.finalDecision === "APPROVED" ? "approve" : evaluation.finalDecision === "HARD_REJECT" ? "reject" : "exception"} as="div">
      <IndexCardHeader
        title="Decision"
        meta={`Eval ${evaluation.id} · ${new Date(evaluation.runAt).toLocaleString("en-IN")}`}
        action={<StatusBadge tone={decisionToBadgeTone(evaluation.finalDecision)} />}
      />

      <div className="flex gap-10 items-start mt-4">
        {/* Stamp — the one deliberate bold moment */}
        <Stamp
          tone={decisionToStampTone(evaluation.finalDecision)}
          reason={primaryReason}
        />

        <div className="flex-1 space-y-3 mt-2">
          {evaluation.finalDecision === "APPROVED" && (
            <>
              {evaluation.approvedByEmail && (
                <DetailRow label="Approved by" value={evaluation.approvedByEmail} />
              )}
              {evaluation.eligibleAmount && (
                <DetailRow label="Eligible amount" value={fmtINR(evaluation.eligibleAmount)} />
              )}
              <DetailRow label="Interest rate band" value={evaluation.interestRateBand ?? "—"} />
            </>
          )}
          <DetailRow label="Rules evaluated" value={String(evaluation.ruleResults.length)} />
          <DetailRow label="Rules passed" value={String(evaluation.ruleResults.length - triggeredRules.length)} />
          <DetailRow label="Rules triggered" value={String(triggeredRules.length)} />
          
          {evaluation.derivedMetrics?.api_budget_summary && (
            <DetailRow 
              label="API Budget (Calls)" 
              value={evaluation.derivedMetrics.api_budget_summary.total ?? "—"} 
            />
          )}
          {evaluation.derivedMetrics?.policy_result?.combined_tool_adjustment != null && (
            <DetailRow 
              label="Agent Adjustment" 
              value={`${evaluation.derivedMetrics.policy_result.combined_tool_adjustment > 0 ? '+' : ''}${evaluation.derivedMetrics.policy_result.combined_tool_adjustment}`} 
            />
          )}

          <DetailRow label="Rules version" value={`v${evaluation.rulesVersion}`} />
          <DetailRow label="Run by" value={evaluation.runBy} />
        </div>
      </div>
    </IndexCard>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-[var(--ink-muted)] w-32 flex-shrink-0">{label}</span>
      <span className="font-mono text-xs text-[var(--ink)]">{value}</span>
    </div>
  );
}


// ─── ActionableStepsCard ─────────────────────────────────────────────────────────

export function ActionableStepsCard({ steps }: { steps: string[] }) {
  if (!steps || steps.length === 0) return null;
  
  return (
    <IndexCard tabTone="default" as="div">
      <IndexCardHeader
        title="Actionable Steps"
        meta="How to improve chances"
      />
      <div className="mt-4 text-sm leading-relaxed text-[var(--ink)]">
        <ul className="list-disc pl-5 space-y-2">
          {steps.map((step, idx) => (
            <li key={idx}>{step}</li>
          ))}
        </ul>
      </div>
    </IndexCard>
  );
}

// ─── ToolResultsCard ──────────────────────────────────────────────────────────

export function ToolResultsCard({ toolResults }: { toolResults: any[] }) {
  if (!toolResults || toolResults.length === 0) return null;
  
  return (
    <IndexCard tabTone="default" as="div">
      <IndexCardHeader
        title="Agentic Workflow (Tools Run)"
        meta={`${toolResults.filter(t => t.ran).length} tools executed`}
      />
      <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
        <div className="flex flex-col">
          {toolResults.map((t, idx) => (
            <div key={idx} className="px-6 py-4 border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)] last:border-0">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm text-[var(--ink)]">
                  {t.tool_id.replace(/_/g, " ").toUpperCase()}
                </span>
                <span className={cn(
                  "font-mono text-[10px] uppercase tracking-wider",
                  t.ran ? "text-[var(--approve)]" : "text-[var(--ink-muted)]"
                )}>
                  {t.ran ? "Executed" : "Skipped"}
                </span>
              </div>
              {t.ran && (
                <div className="space-y-1.5 mt-2">
                  <DetailRow label="Confidence" value={t.confidence.toUpperCase()} />
                  <DetailRow label="Adjustment" value={`${t.adjustment_applied > 0 ? '+' : ''}${t.adjustment_applied}`} />
                  {t.key_reasons && t.key_reasons.length > 0 && (
                    <div className="mt-2 text-xs text-[var(--ink-muted)]">
                      <ul className="list-disc pl-4 space-y-1">
                        {t.key_reasons.map((reason: string, rIdx: number) => (
                          <li key={rIdx}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </IndexCard>
  );
}

// ─── XAINarrativeCard ─────────────────────────────────────────────────────────

export function XAINarrativeCard({ narrative }: { narrative: string }) {
  if (!narrative) return null;
  
  return (
    <IndexCard tabTone="default" as="div">
      <IndexCardHeader
        title="Agentic Reasoning (XAI)"
        meta="LLM-generated explanation"
      />
      <div className="mt-4 text-sm leading-relaxed text-[var(--ink)]">
        {narrative.split('\n').map((paragraph, idx) => (
          <p key={idx} className="mb-2 last:mb-0">{paragraph}</p>
        ))}
      </div>
    </IndexCard>
  );
}
