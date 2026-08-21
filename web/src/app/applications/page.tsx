"use client";

/**
 * Analyst dashboard — /applications
 *
 * Features:
 *   - Applicant queue table, fetched live from Supabase `applicants` table.
 *   - Click a row → view applicant profile. The latest evaluation (if any)
 *     is pulled from the real `evaluations` + `evaluation_rule_results`
 *     tables and rendered with the existing breakdown UI.
 *   - If no evaluation has been run yet, the panel shows that state
 *     explicitly — no crash, no blank content area.
 *   - Evaluation creation is intentionally NOT wired in this pass; the
 *     rule engine migration lives in a dedicated follow-up.
 *   - Role-gated: analyst only.
 */

import { useEffect, useState, useMemo, useTransition } from "react";
import { runEvaluationAction, getEvaluationsAction, getEvaluationRuleResultsAction } from "@/app/actions/evaluate";
import { deleteApplicantAction } from "@/app/actions/upload";
import { createClient } from "@/lib/supabase/client";
import { RoleGuard } from "@/components/dashboard/role-guard";
import { DashboardShell } from "@/components/dashboard/shell";
import { IndexCard, IndexCardHeader } from "@/components/ui/index-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ApplicantProfileCard,
  EvalSummaryCard,
  XAINarrativeCard,
  ActionableStepsCard,
  ToolResultsCard,
  WhatIfSimulatorCard,
} from "@/components/dashboard/eval-detail";
import { cn } from "@/lib/utils";
import { FileUploadSection } from "@/components/applications/file-upload";
import type { Applicant } from "@/lib/mock-data";

// ─── Types ────────────────────────────────────────────────────────────────────

type DecisionOutcome = "APPROVED" | "HARD_REJECT" | "EXCEPTION_L1" | "EXCEPTION_L2";

function decisionToBadgeTone(d?: string) {
  if (!d) return "pending" as const;
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

/** Real applicant row from Supabase `applicants`. */
type ApplicantRow = {
  id: string;
  applicant_ref: string;
  age: number | null;
  employment_type: string | null;
  requested_amount: number | null;
  tenure_months: number | null;
  monthly_income: number | null;
  cibil_score: number | null;
  existing_emi: number | null;
  avg_bank_balance: number | null;
  bounce_count: number | null;
  last_default: boolean | null;
  income_trend: string | null;
  assets_value: number | null;
  raw_input_json: Record<string, any> | null;
  submitted_by: string | null;
  created_at: string;
};

/** Real evaluation row from Supabase `evaluations`. */
type EvaluationRow = {
  id: string;
  applicant_id: string;
  final_decision: DecisionOutcome;
  eligible_amount: number | null;
  interest_rate: number | null;
  risk_grade: string | null;
  derived_metrics_json: Record<string, any> | null;
  xai_narrative: string | null;
  tool_results_json: Record<string, any> | null;
  api_budget_json: Record<string, any> | null;
  ml_risk_tier: string | null;
  ml_risk_score: number | null;
  rule_version_snapshot: Record<string, any> | null;
  evaluated_at: string;
  approved_by_email: string | null;
};

/**
 * Map a real Supabase `applicants` row into the legacy `Applicant` shape
 * the existing UI components expect (eval-detail uses name/email/foir/etc.).
 * Missing fields are derived from `raw_input_json` where the upload pipeline
 * stored the original parsed payload, and fall back to safe defaults.
 */
function applicantRowToApplicant(row: ApplicantRow): Applicant {
  const raw = row.raw_input_json ?? {};
  const monthlyIncome =
    row.monthly_income ??
    (Number(raw.monthly_income ?? raw.annual_income ?? 0) || 0);
  // FOIR = (existing_emi / monthly_income) * 100, if both known
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
    hasWriteOff: Boolean(row.last_default ?? raw.hasWriteOff ?? raw.has_write_off ?? false),
    submittedAt: row.created_at,
    submittedBy: row.submitted_by ?? "",
  };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function ApplicationsDashboard() {
  return (
    <DashboardShell>
      <RoleGuard allowedRoles={["analyst"]}>
        <AnalystContent />
      </RoleGuard>
    </DashboardShell>
  );
}

function AnalystContent() {
  const [currentUser, setCurrentUser] = useState<{ email: string; role: string; name?: string } | null>(null);
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  // Real Supabase state
  const [applicantRows, setApplicantRows] = useState<ApplicantRow[] | null>(null);
  const [applicantsError, setApplicantsError] = useState<string | null>(null);
  const [evaluationRows, setEvaluationRows] = useState<EvaluationRow[] | null>(null);
  const [evaluationsError, setEvaluationsError] = useState<string | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data: userData } = await supabase
        .from("users")
        .select("name, role")
        .eq("email", user.email)
        .single();

      if (userData) {
        const mappedRole = userData.role.toLowerCase().replace("_", "-");
        setCurrentUser({ email: user.email, role: mappedRole, name: userData.name });
      }
    }
    loadUser();
  }, [supabase]);

  // Fetch applicants (RLS: authenticated has SELECT on this table).
  // Re-fetches when `refetchKey` bumps so newly uploaded applicants appear.
  useEffect(() => {
    let cancelled = false;
    async function loadApplicants() {
      const { data, error } = await supabase
        .from("applicants")
        .select(
          "id, applicant_ref, age, employment_type, requested_amount, tenure_months, monthly_income, cibil_score, existing_emi, avg_bank_balance, bounce_count, last_default, income_trend, assets_value, raw_input_json, submitted_by, created_at",
        )
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setApplicantsError(error.message);
        setApplicantRows([]);
      } else {
        setApplicantsError(null);
        setApplicantRows(data ?? []);
      }
    }
    loadApplicants();
    return () => {
      cancelled = true;
    };
  }, [supabase, refetchKey]);

  // Fetch all evaluations once. We filter by selected applicant client-side.
  useEffect(() => {
    let cancelled = false;
    async function loadEvaluations() {
      try {
        const data = await getEvaluationsAction();
        if (cancelled) return;
        setEvaluationsError(null);
        setEvaluationRows(data ?? []);
      } catch (error: any) {
        if (cancelled) return;
        setEvaluationsError(error.message);
        setEvaluationRows([]);
      }
    }
    loadEvaluations();
    return () => {
      cancelled = true;
    };
  }, [supabase, refetchKey]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleDeleteApplicant = async (id: string) => {
    if (!confirm("Are you sure you want to delete this applicant?")) return;
    setIsDeleting(true);
    try {
      const res = await deleteApplicantAction(id);
      if (res.error) alert("Failed to delete: " + res.error);
      else {
        setRefetchKey(k => k + 1);
        if (selectedId === id) setSelectedId(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Map DB rows → legacy Applicant shape for the UI.
  const applicants = useMemo<Applicant[]>(
    () => (applicantRows ?? []).map(applicantRowToApplicant),
    [applicantRows],
  );

  const selectedApplicant = applicants.find((a) => a.id === selectedId) ?? null;

  // Real evaluation lookup: find the latest evaluation for the selected
  // applicant's underlying UUID. We need the ApplicantRow (UUID id) since
  // evaluations.applicant_id references the UUID, not applicant_ref.
  const selectedRow = applicantRows?.find((r) => (r.applicant_ref ?? r.id) === selectedId) ?? null;
  const latestRealEval: EvaluationRow | null = useMemo(() => {
    if (!selectedRow || !evaluationRows) return null;
    const matches = evaluationRows.filter((e) => e.applicant_id === selectedRow.id);
    return matches.length > 0 ? matches[0] : null; // already sorted desc
  }, [selectedRow, evaluationRows]);

  // Per-row decision badge for the queue: derive from real evaluations
  // table so the analyst sees real status even before opening the detail.
  const decisionByApplicantRef = useMemo(() => {
    const map = new Map<string, DecisionOutcome>();
    if (!applicantRows || !evaluationRows) return map;
    // For each evaluation, mark its applicant's ref by the latest decision.
    const seen = new Set<string>();
    for (const ev of evaluationRows) {
      const row = applicantRows.find((r) => r.id === ev.applicant_id);
      if (!row) continue;
      const ref = row.applicant_ref ?? row.id;
      if (seen.has(ref)) continue;
      seen.add(ref);
      map.set(ref, ev.final_decision);
    }
    return map;
  }, [applicantRows, evaluationRows]);

  const [ruleResults, setRuleResults] = useState<any[] | null>(null);
  const [loadingRules, setLoadingRules] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  useEffect(() => {
    if (!latestRealEval) {
      setRuleResults(null);
      return;
    }
    let cancelled = false;
    async function loadRules() {
      setRuleResults(null);
      setLoadingRules(true);
      setRulesError(null);
      try {
        const data = await getEvaluationRuleResultsAction(latestRealEval!.id);
        if (cancelled) return;
        
        const mapped = (data ?? []).map((r: any) => {
          const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
          const outcome = (rule?.outcome ?? "PASS") as
            | "HARD_REJECT"
            | "EXCEPTION_L1"
            | "EXCEPTION_L2"
            | "PASS";
          const mappedOutcome: "HARD_REJECT" | "EXCEPTION_L1" | "EXCEPTION_L2" | "APPROVE_FACTOR" =
            outcome === "PASS" ? "APPROVE_FACTOR" : outcome;
          const operator = (rule?.operator ?? "gte").toLowerCase() as
            | "gte" | "lte" | "gt" | "lt" | "eq" | "neq";
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
        setRuleResults(mapped);
      } catch (error: any) {
        if (cancelled) return;
        setRulesError(error.message);
        setRuleResults([]);
      }
      setLoadingRules(false);
    }
    loadRules();
    return () => {
      cancelled = true;
    };
  }, [latestRealEval]);

  const legacyEvaluation = latestRealEval && selectedRow ? {
    id: latestRealEval.id,
    applicantId: selectedRow.applicant_ref ?? selectedRow.id,
    runAt: latestRealEval.evaluated_at,
    runBy: "—",
    finalDecision: latestRealEval.final_decision,
    eligibleAmount: latestRealEval.eligible_amount ?? undefined,
    interestRateBand: latestRealEval.interest_rate ? `${latestRealEval.interest_rate}%` : undefined,
    approvedByEmail: latestRealEval.approved_by_email ?? undefined,
    rulesVersion: (latestRealEval.rule_version_snapshot as any)?.version ?? 1,
    ruleResults: ruleResults ?? [],
    derivedMetrics: {
      ...latestRealEval.derived_metrics_json,
      xai_narrative: latestRealEval.xai_narrative ?? latestRealEval.derived_metrics_json?.xai_narrative,
      tool_results: latestRealEval.tool_results_json ?? latestRealEval.derived_metrics_json?.tool_results,
      api_budget_summary: latestRealEval.api_budget_json ?? latestRealEval.derived_metrics_json?.api_budget_summary,
      ml_result: {
        risk_tier: latestRealEval.ml_risk_tier ?? latestRealEval.derived_metrics_json?.ml_result?.risk_tier,
        risk_score: latestRealEval.ml_risk_score ?? latestRealEval.derived_metrics_json?.ml_result?.risk_score,
      }
    },
  } : null;

  if (!currentUser) {
    return (
      <div className="space-y-6 max-w-6xl">
        <div className="border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)] pb-4">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 items-start">
          <IndexCard tabTone="default" as="div">
            <div className="space-y-4 pb-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)] overflow-x-auto">
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-6 py-2 bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)] border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)]">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-16" />
              </div>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-full grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 items-center px-6 py-4 border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)]">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          </IndexCard>
          <IndexCard tabTone="default" as="div">
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
            </div>
          </IndexCard>
        </div>
      </div>
    );
  }

  const loadingQueue = applicantRows === null;

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Applications"
        meta="Analyst queue · live Supabase data"
      />

      <FileUploadSection onUploaded={() => setRefetchKey((k) => k + 1)} />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 items-start">
        {/* ── Left: applicant queue & rule breakdown ────────────────── */}
        <div className="space-y-6">
          <IndexCard tabTone="default" as="div">
          <IndexCardHeader
            title="Applicant Queue"
            meta={`${applicants.length} application${applicants.length === 1 ? "" : "s"}`}
          />
          <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)] overflow-x-auto">
            {/* Table head */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-6 py-2 bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)] border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)]">
              {["ID", "Applicant", "Amount", "CIBIL", "Status"].map((h) => (
                <span key={h} className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">{h}</span>
              ))}
            </div>

            {/* Error state */}
            {applicantsError && (
              <p className="px-6 py-4 text-sm text-[var(--reject)]">
                Failed to load applicants: {applicantsError}
              </p>
            )}

            {/* Loading state */}
            {!applicantsError && loadingQueue && (
              <>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-full grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 items-center px-6 py-4 border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)]">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </>
            )}

            {/* Empty state */}
            {!applicantsError && !loadingQueue && applicants.length === 0 && (
              <p className="px-6 py-6 text-sm text-[var(--ink-muted)]">
                No applicants yet. Upload a CSV/JSON/PDF above to add one.
              </p>
            )}

            {/* Rows */}
            {!applicantsError &&
              !loadingQueue &&
              applicants.map((a) => {
                const decision = decisionByApplicantRef.get(a.id);
                const isSelected = selectedId === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={cn(
                      "w-full grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 items-center px-6 py-3 text-left",
                      "border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)] last:border-0",
                      "transition-colors duration-100",
                      isSelected
                        ? "bg-[color-mix(in_oklch,var(--brass),transparent_90%)]"
                        : "hover:bg-[color-mix(in_oklch,var(--paper),var(--ink)_2%)]",
                    )}
                    aria-selected={isSelected}
                    role="row"
                  >
                    <span className="font-mono text-xs text-[var(--ink-muted)]">{a.id}</span>
                    <span className="text-sm text-[var(--ink)] font-medium truncate">{a.name}</span>
                    <span className="font-mono text-xs text-[var(--ink)] tabular-nums">{fmtINR(a.loanAmount)}</span>
                    <span className="font-mono text-xs text-[var(--ink)] tabular-nums">{a.cibilScore}</span>
                    <div className="flex justify-end">
                      <StatusBadge tone={decisionToBadgeTone(decision)} />
                    </div>
                  </button>
                );
              })}
          </div>
        </IndexCard>

        {/* ── Rule Breakdown (shown when an evaluation exists) ──────── */}
        {latestRealEval && (
          loadingRules ? (
            <IndexCard tabTone="default" as="div">
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4 mt-2" />
            </IndexCard>
          ) : rulesError ? (
            <IndexCard tabTone="default" as="div">
              <p className="text-xs text-[var(--reject)]">Failed to load rule breakdown: {rulesError}</p>
            </IndexCard>
          ) : (
            <>
              <ActionableStepsCard steps={latestRealEval.derived_metrics_json?.actionable_steps || []} />
              <div className="mt-4">
                <WhatIfSimulatorCard evaluationId={latestRealEval.id} />
              </div>
            </>
          )
        )}
        </div>

        {/* ── Right: detail panel ───────────────────────────────────── */}
        {selectedApplicant ? (
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <h2 className="font-medium text-lg text-[var(--ink)]">Profile Details</h2>
              <button 
                onClick={() => handleDeleteApplicant(selectedRow!.id)} 
                disabled={isDeleting}
                className="text-xs text-[var(--reject)] font-medium hover:underline disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete Applicant"}
              </button>
            </div>
            <ApplicantProfileCard applicant={selectedApplicant} />

            {/* Evaluation section: real if available, else explicit empty state */}
            {latestRealEval && legacyEvaluation ? (
              <div className="space-y-4">
                {evaluationsError && (
                  <p className="text-xs text-[var(--reject)]">
                    Failed to load evaluations: {evaluationsError}
                  </p>
                )}
                <EvalSummaryCard evaluation={legacyEvaluation} applicant={selectedApplicant} />
                {legacyEvaluation.derivedMetrics?.tool_results && (
                  <ToolResultsCard toolResults={legacyEvaluation.derivedMetrics.tool_results} />
                )}
                {legacyEvaluation.derivedMetrics?.xai_narrative && (
                  <XAINarrativeCard narrative={legacyEvaluation.derivedMetrics.xai_narrative} />
                )}
              </div>
            ) : (
              <IndexCard tabTone="default" as="div">
                <IndexCardHeader title="Evaluation" meta="No run yet" />
                <p className="text-xs text-[var(--ink-muted)] mt-2 leading-relaxed">
                  No evaluation has been recorded for this applicant yet.
                  Click the button below to run the live rule engine and 
                  evaluate this applicant against the latest active policies.
                </p>
                <button
                  disabled={isPending}
                  onClick={() => {
                    if (!selectedRow) return;
                    startTransition(() => {
                      runEvaluationAction(selectedRow.id, selectedRow.applicant_ref ?? selectedRow.id)
                        .then(() => setRefetchKey(k => k + 1))
                        .catch(err => alert("Evaluation failed: " + err.message));
                    });
                  }}
                  className={cn(
                    "w-full mt-3 bg-[color-mix(in_oklch,var(--brass),transparent_60%)] text-[var(--paper)]",
                    "border border-[color-mix(in_oklch,var(--brass),transparent_60%)] rounded-[var(--radius-sm)]",
                    "px-4 py-2.5 text-sm font-medium tracking-wide transition-all",
                    isPending ? "cursor-wait opacity-70" : "hover:bg-[color-mix(in_oklch,var(--brass),transparent_80%)] cursor-pointer"
                  )}
                >
                  {isPending ? "Running..." : "Run Evaluation"}
                </button>
              </IndexCard>
            )}
          </div>
        ) : (
          <IndexCard tabTone="default" as="div">
            <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
              Select an applicant from the queue to view their profile.
            </p>
          </IndexCard>
        )}
      </div>
    </div>
  );
}

function PageHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)] pb-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">{meta}</p>
      <h1 className="text-2xl mt-1">{title}</h1>
    </div>
  );
}
