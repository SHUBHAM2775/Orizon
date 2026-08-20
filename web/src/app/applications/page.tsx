"use client";

/**
 * Analyst dashboard — /applications
 *
 * Features:
 *   - Applicant queue table (5 mock applicants, PRD §7)
 *   - Click a row → view applicant profile + "Run evaluation" button
 *   - After evaluation: decision stamp + rule breakdown + eligible amount (if approved)
 *   - Re-run button to demonstrate scenario 5 (rule reconfiguration)
 *   - Role-gated: analyst only
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/mock-store";
import { RoleGuard } from "@/components/dashboard/role-guard";
import { DashboardShell } from "@/components/dashboard/shell";
import { IndexCard, IndexCardHeader } from "@/components/ui/index-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ApplicantProfileCard,
  EvalSummaryCard,
  RuleBreakdownTable,
} from "@/components/dashboard/eval-detail";
import { cn } from "@/lib/utils";
import type { Applicant } from "@/lib/mock-data";

// ─── Types ────────────────────────────────────────────────────────────────────

type DecisionOutcome = "APPROVED" | "HARD_REJECT" | "EXCEPTION_L1" | "EXCEPTION_L2";

function decisionToBadgeTone(d?: DecisionOutcome) {
  if (!d) return "pending" as const;
  switch (d) {
    case "APPROVED":       return "approve" as const;
    case "HARD_REJECT":    return "reject" as const;
    case "EXCEPTION_L1":   return "exception-l1" as const;
    case "EXCEPTION_L2":   return "exception-l2" as const;
  }
}

function fmtINR(n: number) {
  return "₹" + n.toLocaleString("en-IN");
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
  const { applicants, runEvaluation, latestEvaluation } = useStore();
  const [currentUser, setCurrentUser] = useState<{ email: string; role: string; name?: string } | null>(null);
  const supabase = createClient();

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



  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const selectedApplicant = applicants.find((a) => a.id === selectedId) ?? null;
  const latestEval = selectedId ? latestEvaluation(selectedId) : undefined;

  const handleRunEval = useCallback(async () => {
    if (!selectedId || !currentUser) return;
    setIsRunning(true);
    // Small artificial delay to give feedback
    await new Promise((r) => setTimeout(r, 600));
    runEvaluation(selectedId, currentUser.email);
    setIsRunning(false);
  }, [selectedId, currentUser, runEvaluation]);

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
  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Applications"
        meta="Analyst queue · mock data phase"
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 items-start">
        {/* ── Left: applicant queue ─────────────────────────────────── */}
        <IndexCard tabTone="default" as="div">
          <IndexCardHeader
            title="Applicant Queue"
            meta={`${applicants.length} applications`}
          />
          <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)] overflow-x-auto">
            {/* Table head */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-6 py-2 bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)] border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)]">
              {["ID", "Applicant", "Amount", "CIBIL", "Status"].map((h) => (
                <span key={h} className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">{h}</span>
              ))}
            </div>
            {/* Rows */}
            {applicants.map((a) => {
              const ev = latestEvaluation(a.id);
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
                    <StatusBadge tone={decisionToBadgeTone(ev?.finalDecision as DecisionOutcome | undefined)} />
                  </div>
                </button>
              );
            })}
          </div>
        </IndexCard>

        {/* ── Right: detail panel ───────────────────────────────────── */}
        {selectedApplicant ? (
          <div className="space-y-4">
            <ApplicantProfileCard applicant={selectedApplicant} />

            {/* Run / Re-run button */}
            <button
              onClick={handleRunEval}
              disabled={isRunning}
              className={cn(
                "w-full bg-[var(--brass)] text-[var(--paper)]",
                "border border-[var(--brass)] rounded-[var(--radius-sm)]",
                "px-4 py-2.5 text-sm font-medium tracking-wide",
                "hover:bg-[color-mix(in_oklch,var(--brass),var(--ink)_18%)]",
                "transition-colors duration-150",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isRunning ? "Evaluating…" : latestEval ? "Re-run Evaluation" : "Run Evaluation"}
            </button>

            {latestEval && (
              <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] text-center">
                Re-run applies current rule thresholds — useful for demo scenario 5.
              </p>
            )}
          </div>
        ) : (
          <IndexCard tabTone="default" as="div">
            <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
              Select an applicant from the queue to view their profile and run an evaluation.
            </p>
          </IndexCard>
        )}
      </div>

      {/* ── Evaluation result (appears after running) ─────────────── */}
      {latestEval && selectedApplicant && (
        <div className="space-y-4">
          <EvalSummaryCard evaluation={latestEval} applicant={selectedApplicant} />
          <RuleBreakdownTable results={latestEval.ruleResults} />
        </div>
      )}
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
