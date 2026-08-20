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
import type { ExceptionCase } from "@/lib/mock-data";

export default function ExceptionsPage() {
  return (
    <DashboardShell>
      <RoleGuard allowedRoles={["l1-approver", "l2-approver"]}>
        <ExceptionQueueContent />
      </RoleGuard>
    </DashboardShell>
  );
}

function ExceptionQueueContent() {
  const {
    applicants,
    evaluations,
    exceptionCases,
    approveException,
    rejectException,
    escalateException,
    latestEvaluation,
  } = useStore();

  const [currentUser, setCurrentUser] = useState<{ email: string; role: string; name?: string } | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [actionDone, setActionDone] = useState<string | null>(null);

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



  const myLevel: "L1" | "L2" =
    currentUser?.role === "l2-approver" ? "L2" : "L1";

  const pendingCases = exceptionCases.filter(
    (c) =>
      c.status === "PENDING" && c.level === myLevel,
  );

  const closedCases = exceptionCases.filter(
    (c) =>
      c.status !== "PENDING" && c.level === myLevel,
  );

  const selectedCase = exceptionCases.find((c) => c.id === selectedCaseId);
  const selectedApplicant = selectedCase
    ? applicants.find((a) => a.id === selectedCase.applicantId)
    : null;
  const selectedEval = selectedCase
    ? evaluations.find((e) => e.id === selectedCase.evaluationId)
    : null;

  const handleApprove = useCallback(() => {
    if (!selectedCase || !currentUser) return;
    approveException(selectedCase.id, notes, currentUser.email, currentUser.role);
    setActionDone("APPROVED");
    setNotes("");
  }, [selectedCase, notes, currentUser, approveException]);

  const handleReject = useCallback(() => {
    if (!selectedCase || !currentUser) return;
    rejectException(selectedCase.id, notes, currentUser.email, currentUser.role);
    setActionDone("REJECTED");
    setNotes("");
  }, [selectedCase, notes, currentUser, rejectException]);

  const handleEscalate = useCallback(() => {
    if (!selectedCase || !currentUser) return;
    escalateException(selectedCase.id, notes, currentUser.email);
    setActionDone("ESCALATED");
    setNotes("");
  }, [selectedCase, notes, currentUser, escalateException]);

  const selectCase = useCallback((id: string) => {
    setSelectedCaseId(id);
    setActionDone(null);
    setNotes("");
  }, []);

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

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)] pb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          {myLevel} Approver · Exception review queue
        </p>
        <h1 className="text-2xl mt-1">Exception Queue</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-6 items-start">
        {/* ── Left: case list ──────────────────────────────────────── */}
        <div className="space-y-4">
          <IndexCard tabTone="exception" as="div">
            <IndexCardHeader
              title={`Pending Cases (${pendingCases.length})`}
              meta={`Level ${myLevel} queue`}
            />
            {pendingCases.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)] mt-2">
                No pending cases. Cases are routed here by the rule engine.
              </p>
            ) : (
              <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
                {pendingCases.map((c) => {
                  const applicant = applicants.find((a) => a.id === c.applicantId);
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
                          {applicant?.name ?? c.applicantId}
                        </p>
                        <p className="font-mono text-[10px] text-[var(--ink-muted)] mt-0.5">
                          {c.id} · {c.applicantId}
                          {c.escalatedFrom && " · Escalated from L1"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={cn(
                          "font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border rounded-[2px]",
                          c.level === "L1"
                            ? "border-[var(--exception)] text-[var(--exception)]"
                            : "border-[var(--reject)] text-[var(--reject)]",
                        )}>
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
          {closedCases.length > 0 && (
            <ClosedCasesSection cases={closedCases} applicants={applicants} />
          )}
        </div>

        {/* ── Right: decision panel ────────────────────────────────── */}
        {selectedCase && selectedApplicant ? (
          <div className="space-y-4">
            <ApplicantProfileCard applicant={selectedApplicant} />

            {/* Evaluation summary (if available) */}
            {selectedEval && (
              <IndexCard tabTone="default" as="div">
                <IndexCardHeader
                  title="Triggering Evaluation"
                  meta={selectedEval.id}
                  action={<StatusBadge tone={
                    selectedEval.finalDecision === "EXCEPTION_L1" ? "exception-l1" : "exception-l2"
                  } />}
                />
                <p className="text-xs text-[var(--ink-muted)] mt-2">
                  {selectedEval.ruleResults.filter((r) => r.triggered).map((r) => r.explanation).join(" · ")}
                </p>
              </IndexCard>
            )}

            {/* Decision actions */}
            {actionDone ? (
              <IndexCard tabTone={actionDone === "APPROVED" ? "approve" : "reject"} as="div">
                <p className="font-mono text-xs uppercase tracking-wider text-[var(--ink-muted)] mb-1">
                  Action recorded
                </p>
                <p className="text-sm text-[var(--ink)]">
                  Case {selectedCase.id} — <strong>{actionDone}</strong>
                </p>
              </IndexCard>
            ) : selectedCase.status === "PENDING" ? (
              <IndexCard tabTone="brass" as="div">
                <IndexCardHeader title="Make Decision" meta={selectedCase.id} />
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
                    <ActionButton
                      onClick={handleApprove}
                      tone="approve"
                      label="Approve"
                    />
                    <ActionButton
                      onClick={handleReject}
                      tone="reject"
                      label="Reject"
                    />
                    {myLevel === "L1" && (
                      <ActionButton
                        onClick={handleEscalate}
                        tone="exception"
                        label="Escalate → L2"
                      />
                    )}
                  </div>
                </div>
              </IndexCard>
            ) : (
              <IndexCard tabTone="default" as="div">
                <p className="text-xs text-[var(--ink-muted)]">
                  This case is already {selectedCase.status.toLowerCase()}.
                </p>
              </IndexCard>
            )}

            {/* Rule breakdown for context */}
            {selectedEval && (
              <RuleBreakdownTable results={selectedEval.ruleResults} />
            )}
          </div>
        ) : (
          <IndexCard tabTone="default" as="div">
            <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
              Select a case from the queue to review the applicant profile and make a decision.
            </p>
            {pendingCases.length === 0 && (
              <p className="text-xs text-[var(--ink-muted)] leading-relaxed mt-2">
                Exception cases appear here after an Analyst runs an evaluation that triggers a rule.
                Go to Applications and run an evaluation for APP1003 (Scenario 3) or APP1004 (Scenario 4).
              </p>
            )}
          </IndexCard>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  tone,
  label,
}: {
  onClick: () => void;
  tone: "approve" | "reject" | "exception";
  label: string;
}) {
  const colorVar = tone === "approve" ? "var(--approve)" : tone === "reject" ? "var(--reject)" : "var(--exception)";
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

function ClosedCasesSection({
  cases,
  applicants,
}: {
  cases: ExceptionCase[];
  applicants: { id: string; name: string }[];
}) {
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
            const applicant = applicants.find((a) => a.id === c.applicantId);
            return (
              <div
                key={c.id}
                className="flex items-center justify-between gap-4 px-6 py-3 border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)] last:border-0"
              >
                <div>
                  <p className="text-sm text-[var(--ink)]">{applicant?.name ?? c.applicantId}</p>
                  <p className="font-mono text-[10px] text-[var(--ink-muted)]">{c.id}</p>
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
