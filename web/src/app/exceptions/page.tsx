"use client";

/**
 * Exception Queue — /exceptions
 *
 * Shared queue component for L1 and L2 approvers, filtered by level.
 * Level is determined by the logged-in user's role, not a URL param.
 * (URL param ?level= is kept for direct-link compatibility but role wins.)
 *
 * Features:
 *   - Lists all PENDING exception cases matching the approver's level
 *   - Click a case → view applicant profile + rule breakdown for that evaluation
 *   - Approve / Reject buttons with a notes field
 *   - L1 approvers also see an "Escalate to L2" action
 *   - Closed cases shown in a separate section (collapsed by default)
 *
 * Data source: real Supabase tables (no mock-store)
 *   exception_cases → joined with evaluations → joined with applicants
 *
 * Schema key facts:
 *   exception_cases: id, evaluation_id, level, status, assigned_to,
 *     decided_by, decision_notes, escalated_from (UUID → exception_cases.id),
 *     decided_at
 *   evaluations: id, applicant_id, final_decision, eligible_amount,
 *     interest_rate, evaluated_at
 *   applicants: id, applicant_ref, ...
 *   evaluation_rule_results: evaluation_id, rule_id, result,
 *     actual_value, threshold_at_evaluation + embedded rules
 *   audit_logs: actor_id, action, target_type, target_id, after_value
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { RoleGuard } from "@/components/dashboard/role-guard";
import { DashboardShell } from "@/components/dashboard/shell";
import { IndexCard, IndexCardHeader } from "@/components/ui/index-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ApplicantProfileCard,
  EvalSummaryCard,
  ActionableStepsCard,
  ToolResultsCard,
  XAINarrativeCard,
  WhatIfSimulatorCard,
} from "@/components/dashboard/eval-detail";
import { cn } from "@/lib/utils";
import type { Applicant, Evaluation, EvaluationRuleResult } from "@/lib/mock-data";
import { 
  getExceptionCasesAction, 
  updateExceptionCaseAction, 
  escalateExceptionCaseAction 
} from "@/app/actions/evaluate";

// ─── DB row types ──────────────────────────────────────────────────────────────

type ExceptionStatus = "PENDING" | "APPROVED" | "REJECTED" | "ESCALATED";
type ExceptionLevel  = "L1" | "L2";
type FinalDecision   = "APPROVED" | "HARD_REJECT" | "EXCEPTION_L1" | "EXCEPTION_L2" | "INSUFFICIENT_DATA";

interface ExceptionCaseRow {
  id: string;
  evaluation_id: string;
  level: ExceptionLevel;
  status: ExceptionStatus;
  assigned_to: string | null;
  decided_by: string | null;
  decision_notes: string | null;
  escalated_from: string | null;
  decided_at: string | null;
  // Embedded via PostgREST join
  evaluations: {
    id: string;
    applicant_id: string;
    final_decision: FinalDecision;
    eligible_amount: number | null;
    interest_rate: number | null;
    evaluated_at: string;
    approved_by_email: string | null;
    derived_metrics_json: Record<string, any> | null;
    xai_narrative: string | null;
    tool_results_json: Record<string, any> | null;
    api_budget_json: Record<string, any> | null;
    ml_risk_tier: string | null;
    ml_risk_score: number | null;
    rule_version_snapshot: Record<string, any> | null;
    applicants: {
      id: string;
      applicant_ref: string;
      monthly_income: number | null;
      requested_amount: number | null;
      tenure_months: number | null;
      cibil_score: number | null;
      existing_emi: number | null;
      avg_bank_balance: number | null;
      bounce_count: number | null;
      last_default: boolean | null;
      raw_input_json: Record<string, unknown> | null;
      submitted_by: string | null;
      created_at: string;
    };
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Map an applicants DB row (from nested join) into the legacy Applicant shape */
function rowToApplicant(
  row: ExceptionCaseRow["evaluations"]["applicants"],
): Applicant {
  const raw = (row.raw_input_json ?? {}) as Record<string, unknown>;
  const monthlyIncome =
    row.monthly_income ?? (Number(raw.monthly_income ?? raw.annual_income ?? 0) || 0);
  let foir = 0;
  if (monthlyIncome > 0 && row.existing_emi != null) {
    foir = Math.round((row.existing_emi / monthlyIncome) * 100);
  }
  return {
    id: row.applicant_ref ?? row.id,
    name: (raw.name as string) ?? row.applicant_ref ?? row.id.slice(0, 8),
    email: (raw.email as string) ?? "",
    loanAmount: Number(row.requested_amount ?? raw.requested_amount ?? 0),
    tenureMonths: Number(row.tenure_months ?? raw.tenure_months ?? 0),
    cibilScore: Number(row.cibil_score ?? raw.cibil_score ?? 0),
    foir: Number(raw.foir ?? foir),
    avgMonthlyBalance: Number(row.avg_bank_balance ?? raw.avg_bank_balance ?? 0),
    bounceCount: Number(row.bounce_count ?? raw.bounce_count ?? 0),
    annualIncome: monthlyIncome * 12,
    hasWriteOff: Boolean(
      row.last_default ?? raw.hasWriteOff ?? raw.has_write_off ?? false,
    ),
    submittedAt: row.created_at,
    submittedBy: row.submitted_by ?? "",
  };
}

/** Map a real evaluation + rule results into the legacy Evaluation shape */
function rowToEvaluation(
  evRow: ExceptionCaseRow["evaluations"],
  ruleResults: EvaluationRuleResult[],
): Evaluation {
  const decisionMap: Record<FinalDecision, Evaluation["finalDecision"]> = {
    APPROVED:           "APPROVED",
    HARD_REJECT:        "HARD_REJECT",
    EXCEPTION_L1:       "EXCEPTION_L1",
    EXCEPTION_L2:       "EXCEPTION_L2",
    INSUFFICIENT_DATA:  "HARD_REJECT", // closest legacy mapping
  };
  return {
    id: evRow.id,
    applicantId: evRow.applicants.applicant_ref ?? evRow.applicant_id,
    runAt: evRow.evaluated_at,
    runBy: "—",
    finalDecision: decisionMap[evRow.final_decision] ?? "HARD_REJECT",
    eligibleAmount: evRow.eligible_amount ?? undefined,
    interestRateBand: evRow.interest_rate ? `${evRow.interest_rate}%` : undefined,
    approvedByEmail: evRow.approved_by_email ?? undefined,
    rulesVersion: (evRow.rule_version_snapshot as any)?.version ?? 1,
    ruleResults,
    derivedMetrics: {
      ...evRow.derived_metrics_json,
      xai_narrative: evRow.xai_narrative ?? evRow.derived_metrics_json?.xai_narrative,
      tool_results: evRow.tool_results_json ?? evRow.derived_metrics_json?.tool_results,
      api_budget_summary: evRow.api_budget_json ?? evRow.derived_metrics_json?.api_budget_summary,
      ml_result: {
        risk_tier: evRow.ml_risk_tier ?? evRow.derived_metrics_json?.ml_result?.risk_tier,
        risk_score: evRow.ml_risk_score ?? evRow.derived_metrics_json?.ml_result?.risk_score,
      }
    },
  };
}

// ─── Page shell ────────────────────────────────────────────────────────────────

export default function ExceptionsPage() {
  return (
    <DashboardShell>
      <RoleGuard allowedRoles={["l1-approver", "l2-approver"]}>
        <ExceptionQueueContent />
      </RoleGuard>
    </DashboardShell>
  );
}

// ─── Content ───────────────────────────────────────────────────────────────────

function ExceptionQueueContent() {
  const supabase = createClient();

  const [currentUser, setCurrentUser] = useState<{
    id: string;
    email: string;
    role: string;
    name?: string;
    dbId: string | null; // UUID from users table (for audit_logs.actor_id)
  } | null>(null);

  const [cases, setCases] = useState<ExceptionCaseRow[] | null>(null);
  const [casesError, setCasesError] = useState<string | null>(null);

  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [actionDone, setActionDone] = useState<ExceptionStatus | null>(null);

  // Rule-result cache per evaluation_id
  const [ruleResultsCache, setRuleResultsCache] = useState<
    Record<string, EvaluationRuleResult[] | "loading" | "error">
  >({});

  // ── Resolve current user ─────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data: userData } = await supabase
        .from("users")
        .select("id, name, role")
        .eq("email", user.email)
        .single();

      if (mounted && userData) {
        const mappedRole = userData.role.toLowerCase().replace("_", "-");
        setCurrentUser({
          id: user.id,           // Supabase auth UUID
          email: user.email,
          role: mappedRole,
          name: userData.name,
          dbId: userData.id,     // users table UUID (for FK references)
        });
      }
    }
    loadUser();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  // ── Fetch exception cases (joined with evaluations + applicants) ─────────
  const loadCases = useCallback(async () => {
    try {
      const data = await getExceptionCasesAction();
      setCasesError(null);
      setCases((data ?? []) as unknown as ExceptionCaseRow[]);
    } catch (error: any) {
      setCasesError(error.message);
      setCases([]);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  // ── Fetch rule results for the selected evaluation ───────────────────────
  useEffect(() => {
    const selectedCase = (cases ?? []).find((c) => c.id === selectedCaseId);
    if (!selectedCase) return;
    const evalId = selectedCase.evaluations?.id;
    if (!evalId || ruleResultsCache[evalId]) return;

    setRuleResultsCache((prev) => ({ ...prev, [evalId]: "loading" }));

    supabase
      .from("evaluation_rule_results")
      .select(
        "id, evaluation_id, rule_id, result, actual_value, threshold_at_evaluation, rules:rule_id ( rule_code, description, field_name, operator, outcome, reason_code )",
      )
      .eq("evaluation_id", evalId)
      .then(({ data, error }) => {
        if (error) {
          setRuleResultsCache((prev) => ({ ...prev, [evalId]: "error" }));
          return;
        }
        const mapped: EvaluationRuleResult[] = (data ?? []).map((r: any) => {
          const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
          const outcome = (rule?.outcome ?? "PASS") as
            | "HARD_REJECT" | "EXCEPTION_L1" | "EXCEPTION_L2" | "PASS";
          const mappedOutcome: EvaluationRuleResult["outcome"] =
            outcome === "PASS" ? "APPROVE_FACTOR" : outcome;
          const operator = (rule?.operator ?? "GTE").toLowerCase() as
            EvaluationRuleResult["operator"];
          return {
            ruleId: r.rule_id,
            ruleName: rule?.description ?? rule?.rule_code ?? "Rule",
            reasonCode: rule?.reason_code ?? rule?.rule_code ?? "",
            actualValue: r.actual_value ?? 0,
            thresholdAtEvaluation: r.threshold_at_evaluation,
            operator,
            triggered: r.result === "TRIGGERED",
            outcome: mappedOutcome,
            explanation: rule?.description ?? "",
          };
        });
        setRuleResultsCache((prev) => ({ ...prev, [evalId]: mapped }));
      });
  }, [selectedCaseId, cases, supabase, ruleResultsCache]);

  // ── Derived state ────────────────────────────────────────────────────────
  const myLevel: ExceptionLevel =
    currentUser?.role === "l2-approver" ? "L2" : "L1";

  const pendingCases = (cases ?? []).filter(
    (c) => c.status === "PENDING" && c.level === myLevel,
  );
  const closedCases = (cases ?? []).filter(
    (c) => c.status !== "PENDING" && c.level === myLevel,
  );

  const selectedCase = (cases ?? []).find((c) => c.id === selectedCaseId) ?? null;
  const selectedApplicant = selectedCase
    ? rowToApplicant(selectedCase.evaluations.applicants)
    : null;

  const selectedEvalId = selectedCase?.evaluations?.id ?? null;
  const selectedRuleResults =
    selectedEvalId && Array.isArray(ruleResultsCache[selectedEvalId])
      ? (ruleResultsCache[selectedEvalId] as EvaluationRuleResult[])
      : null;

  const selectedEval: Evaluation | null =
    selectedCase && selectedRuleResults
      ? rowToEvaluation(selectedCase.evaluations, selectedRuleResults)
      : null;

  const selectCase = useCallback((id: string) => {
    setSelectedCaseId(id);
    setActionDone(null);
    setNotes("");
  }, []);

  // ── Write helpers: update exception_cases + insert audit_logs ───────────

  const doDecision = useCallback(
    async (newStatus: "APPROVED" | "REJECTED") => {
      if (!selectedCase || !currentUser?.dbId) return;

      try {
        await updateExceptionCaseAction(
          selectedCase.id,
          selectedCase.evaluation_id,
          newStatus,
          notes || "",
          currentUser.dbId,
          currentUser.email
        );
      } catch (error: any) {
        console.error("Failed to update exception case:", error.message);
        return;
      }

      // Write audit log
      await supabase.from("audit_logs").insert({
        actor_id: currentUser.dbId,
        action: newStatus === "APPROVED" ? "EXCEPTION_APPROVED" : "EXCEPTION_REJECTED",
        target_type: "exception_cases",
        target_id: selectedCase.id,
        after_value: {
          status: newStatus,
          notes: notes || null,
          decided_by: currentUser.email,
        },
      });

      setActionDone(newStatus);
      setNotes("");
      // Refresh list so status updates are reflected
      loadCases();
    },
    [selectedCase, currentUser, notes, supabase, loadCases],
  );

  const handleApprove = useCallback(() => doDecision("APPROVED"), [doDecision]);
  const handleReject  = useCallback(() => doDecision("REJECTED"), [doDecision]);

  const handleEscalate = useCallback(async () => {
    if (!selectedCase || !currentUser?.dbId || myLevel !== "L1") return;

    try {
      await escalateExceptionCaseAction(
        selectedCase.id,
        selectedCase.evaluation_id,
        notes || "",
        currentUser.dbId
      );
    } catch (error: any) {
      console.error("Failed to escalate case:", error.message);
      return;
    }

    // Write audit log
    await supabase.from("audit_logs").insert({
      actor_id: currentUser.dbId,
      action: "EXCEPTION_ESCALATED",
      target_type: "exception_cases",
      target_id: selectedCase.id,
      after_value: {
        status: "ESCALATED",
        notes: notes || null,
        escalated_by: currentUser.email,
        new_level: "L2",
      },
    });

    setActionDone("ESCALATED");
    setNotes("");
    loadCases();
  }, [selectedCase, currentUser, notes, myLevel, supabase, loadCases]);

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className="space-y-6 max-w-6xl">
        <div className="border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)] pb-4">
          <Skeleton className="h-3 w-48 mb-2" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-6 items-start">
          <div className="space-y-4">
            <IndexCard tabTone="exception" as="div">
              <div className="space-y-4 pb-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)]">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            </IndexCard>
          </div>
          <div className="space-y-4">
            <IndexCard tabTone="default" as="div">
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </IndexCard>
          </div>
        </div>
      </div>
    );
  }

  const loadingCases = cases === null;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)] pb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          {myLevel} Approver · Exception review queue · live Supabase data
        </p>
        <h1 className="text-2xl mt-1">Exception Queue</h1>
      </div>

      {casesError && (
        <p className="text-sm text-[var(--reject)]">
          Failed to load cases: {casesError}
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-6 items-start">
        {/* ── Left: case list ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <IndexCard tabTone="exception" as="div">
            <IndexCardHeader
              title={`Pending Cases (${loadingCases ? "…" : pendingCases.length})`}
              meta={`Level ${myLevel} queue`}
            />

            {loadingCases && (
              <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)]">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            )}

            {!loadingCases && pendingCases.length === 0 && (
              <p className="text-sm text-[var(--ink-muted)] mt-2">
                No pending cases. Cases appear here after the rule engine flags
                an evaluation as EXCEPTION_L{myLevel === "L1" ? "1" : "2"}.
              </p>
            )}

            {!loadingCases && pendingCases.length > 0 && (
              <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
                {pendingCases.map((c) => {
                  const applicant = c.evaluations?.applicants;
                  const displayName =
                    (applicant?.raw_input_json as any)?.name ??
                    applicant?.applicant_ref ??
                    c.evaluation_id.slice(0, 8);
                  const isSelected = selectedCaseId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => selectCase(c.id)}
                      className={cn(
                        "w-full flex items-center justify-between gap-4 px-6 py-3 text-left",
                        "border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)] last:border-0",
                        "transition-colors duration-100",
                        isSelected
                          ? "bg-[color-mix(in_oklch,var(--brass),transparent_90%)]"
                          : "hover:bg-[color-mix(in_oklch,var(--paper),var(--ink)_2%)]",
                      )}
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--ink)]">
                          {displayName}
                        </p>
                        <p className="font-mono text-[10px] text-[var(--ink-muted)] mt-0.5">
                          {c.id.slice(0, 8)}
                          {c.escalated_from && " · Escalated from L1"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={cn(
                            "font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border rounded-[2px]",
                            c.level === "L1"
                              ? "border-[var(--exception)] text-[var(--exception)]"
                              : "border-[var(--reject)] text-[var(--reject)]",
                          )}
                        >
                          {c.level}
                        </span>
                        <StatusBadge tone="pending" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </IndexCard>

          {/* Closed cases (collapsed) */}
          {!loadingCases && closedCases.length > 0 && (
            <ClosedCasesSection cases={closedCases} />
          )}
        </div>

        {/* ── Right: decision panel ────────────────────────────────────── */}
        {selectedCase && selectedApplicant ? (
          <div className="space-y-4">
            <ApplicantProfileCard applicant={selectedApplicant} />

            {/* Evaluation summary */}
            {selectedEval ? (
              <div className="space-y-4">
                <EvalSummaryCard evaluation={selectedEval} applicant={selectedApplicant} />
                {selectedEval.derivedMetrics?.tool_results && (
                  <ToolResultsCard toolResults={selectedEval.derivedMetrics.tool_results} />
                )}
                {selectedEval.derivedMetrics?.xai_narrative && (
                  <XAINarrativeCard narrative={selectedEval.derivedMetrics.xai_narrative} />
                )}
              </div>
            ) : selectedCase.evaluations ? (
              <Skeleton className="h-32 w-full" />
            ) : null}

            {/* Decision actions */}
            {actionDone ? (
              <IndexCard
                tabTone={
                  actionDone === "APPROVED"
                    ? "approve"
                    : actionDone === "REJECTED"
                    ? "reject"
                    : "exception"
                }
                as="div"
              >
                <p className="font-mono text-xs uppercase tracking-wider text-[var(--ink-muted)] mb-1">
                  Action recorded
                </p>
                <p className="text-sm text-[var(--ink)]">
                  Case {selectedCase.id.slice(0, 8)} —{" "}
                  <strong>{actionDone}</strong>
                </p>
              </IndexCard>
            ) : selectedCase.status === "PENDING" ? (
              <IndexCard tabTone="brass" as="div">
                <IndexCardHeader
                  title="Make Decision"
                  meta={selectedCase.id.slice(0, 8)}
                />
                <div className="space-y-4 mt-3">
                  <div>
                    <label
                      htmlFor="decision-notes"
                      className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)] block mb-1.5"
                    >
                      Decision notes
                    </label>
                    <textarea
                      id="decision-notes"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add context for the audit trail…"
                      className="w-full bg-[var(--paper)] border border-[color-mix(in_oklch,var(--ink),transparent_75%)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[color-mix(in_oklch,var(--ink-muted),transparent_40%)] focus:outline-none focus:ring-1 focus:ring-[var(--brass)] resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <ActionButton onClick={handleApprove} tone="approve" label="Approve" />
                    <ActionButton onClick={handleReject}  tone="reject"   label="Reject"  />
                    {myLevel === "L1" && (
                      <ActionButton onClick={handleEscalate} tone="exception" label="Escalate → L2" />
                    )}
                  </div>
                </div>
              </IndexCard>
            ) : (
              <IndexCard tabTone="default" as="div">
                <p className="text-xs text-[var(--ink-muted)]">
                  This case is already {selectedCase.status.toLowerCase()}.
                  {selectedCase.decision_notes && (
                    <span className="block mt-1 italic">
                      Notes: {selectedCase.decision_notes}
                    </span>
                  )}
                </p>
              </IndexCard>
            )}

            {/* Actionable steps for context */}
            {selectedEval && (
              <>
                <ActionableStepsCard steps={selectedEval.derivedMetrics?.actionable_steps || []} />
                <WhatIfSimulatorCard evaluationId={selectedEval.id} />
              </>
            )}
            {selectedEvalId && ruleResultsCache[selectedEvalId] === "loading" && (
              <IndexCard tabTone="default" as="div">
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4 mt-2" />
              </IndexCard>
            )}
          </div>
        ) : (
          <IndexCard tabTone="default" as="div">
            <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
              Select a case from the queue to review the applicant profile and
              make a decision.
            </p>
            {!loadingCases && pendingCases.length === 0 && (
              <p className="text-xs text-[var(--ink-muted)] leading-relaxed mt-2">
                Exception cases appear here after an Analyst runs an evaluation
                that the rule engine flags as EXCEPTION_L1 or EXCEPTION_L2.
              </p>
            )}
          </IndexCard>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ActionButton({
  onClick,
  tone,
  label,
}: {
  onClick: () => void;
  tone: "approve" | "reject" | "exception";
  label: string;
}) {
  const colorVar =
    tone === "approve"
      ? "var(--approve)"
      : tone === "reject"
      ? "var(--reject)"
      : "var(--exception)";
  return (
    <button
      onClick={onClick}
      className="flex-1 border rounded-[var(--radius-sm)] px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors duration-150"
      style={{
        borderColor: colorVar,
        color: colorVar,
        backgroundColor: `color-mix(in oklch, ${colorVar}, transparent 93%)`,
      }}
    >
      {label}
    </button>
  );
}

function ClosedCasesSection({ cases }: { cases: ExceptionCaseRow[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <IndexCard tabTone="default" as="div">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <span className="text-sm font-medium text-[var(--ink)]">
          Closed Cases ({cases.length})
        </span>
        <span className="font-mono text-xs text-[var(--ink-muted)]">
          {expanded ? "↑ Collapse" : "↓ Expand"}
        </span>
      </button>
      {expanded && (
        <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
          {cases.map((c) => {
            const applicant = c.evaluations?.applicants;
            const displayName =
              (applicant?.raw_input_json as any)?.name ??
              applicant?.applicant_ref ??
              c.id.slice(0, 8);
            return (
              <div
                key={c.id}
                className="flex items-center justify-between gap-4 px-6 py-3 border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)] last:border-0"
              >
                <div>
                  <p className="text-sm text-[var(--ink)]">{displayName}</p>
                  <p className="font-mono text-[10px] text-[var(--ink-muted)]">
                    {c.id.slice(0, 8)}
                  </p>
                </div>
                <StatusBadge
                  tone={
                    c.status === "APPROVED"
                      ? "approve"
                      : c.status === "REJECTED"
                      ? "reject"
                      : "exception-l1"
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </IndexCard>
  );
}
