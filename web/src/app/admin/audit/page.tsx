"use client";

/**
 * Admin — Audit Log /admin/audit
 *
 * Full chronological log of every privileged action:
 *   - Evaluations run
 *   - Exceptions approved/rejected/escalated
 *   - Rules updated (with version + threshold change)
 *   - Users created
 *   - Account activations
 *
 * Display: most-recent-first, with actor, action, target, timestamp.
 * No pagination in mock phase — the log stays short during a demo session.
 */

import { useStore } from "@/lib/mock-store";
import { RoleGuard } from "@/components/dashboard/role-guard";
import { DashboardShell } from "@/components/dashboard/shell";
import { IndexCard, IndexCardHeader } from "@/components/ui/index-card";
import { cn } from "@/lib/utils";
import type { AuditAction } from "@/lib/mock-data";

export default function AuditLogPage() {
  return (
    <DashboardShell>
      <RoleGuard allowedRoles={["admin"]}>
        <AuditContent />
      </RoleGuard>
    </DashboardShell>
  );
}

const ACTION_STYLE: Record<AuditAction, { label: string; color: string }> = {
  USER_CREATED:          { label: "User created",          color: "var(--approve)" },
  USER_ROLE_CHANGED:     { label: "Role changed",          color: "var(--exception)" },
  RULE_UPDATED:          { label: "Rule updated",          color: "var(--brass)" },
  APPLICATION_SUBMITTED: { label: "Application submitted", color: "var(--ink-muted)" },
  EVALUATION_RUN:        { label: "Evaluation run",        color: "var(--ink-muted)" },
  EXCEPTION_APPROVED:    { label: "Exception approved",    color: "var(--approve)" },
  EXCEPTION_REJECTED:    { label: "Exception rejected",    color: "var(--reject)" },
  EXCEPTION_ESCALATED:   { label: "Exception escalated",   color: "var(--exception)" },
  ACCOUNT_ACTIVATED:     { label: "Account activated",     color: "var(--approve)" },
  LOGIN:                 { label: "Login",                  color: "var(--ink-muted)" },
};

function AuditContent() {
  const { auditLog } = useStore();

  // Most-recent first
  const sorted = [...auditLog].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)] pb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Admin · System</p>
        <h1 className="text-2xl mt-1">Audit Log</h1>
      </div>

      <IndexCard tabTone="default" as="div">
        <IndexCardHeader
          title="All Actions"
          meta={`${sorted.length} entries · most recent first`}
        />
        <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
          {/* Header */}
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 px-6 py-2 bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)] border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)]">
            {["Time", "Description", "Actor", "Action"].map((h) => (
              <span key={h} className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">{h}</span>
            ))}
          </div>

          {sorted.length === 0 && (
            <p className="px-6 py-6 text-sm text-[var(--ink-muted)]">No actions recorded yet.</p>
          )}

          {sorted.map((entry) => {
            const style = ACTION_STYLE[entry.action] ?? { label: entry.action, color: "var(--ink-muted)" };
            return (
              <div
                key={entry.id}
                className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 items-start px-6 py-3 border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)] last:border-0"
              >
                <span className="font-mono text-[10px] text-[var(--ink-muted)] whitespace-nowrap pt-0.5">
                  {new Date(entry.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  <br />
                  {new Date(entry.timestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-[var(--ink)] leading-snug">{entry.description}</p>
                  <p className="font-mono text-[10px] text-[var(--ink-muted)] mt-0.5">
                    {entry.targetType} · {entry.targetId}
                  </p>
                  {entry.meta && (
                    <p className="font-mono text-[10px] text-[var(--ink-muted)] mt-0.5">
                      {Object.entries(entry.meta).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    </p>
                  )}
                </div>
                <span className="font-mono text-[10px] text-[var(--ink-muted)] whitespace-nowrap">
                  {entry.actorEmail.split("@")[0]}
                </span>
                <span
                  className="font-mono text-[10px] uppercase tracking-wider whitespace-nowrap"
                  style={{ color: style.color }}
                >
                  {style.label}
                </span>
              </div>
            );
          })}
        </div>
      </IndexCard>
    </div>
  );
}
