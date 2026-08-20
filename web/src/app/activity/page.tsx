"use client";

/**
 * My Activity — /activity
 *
 * Shows a filtered view of the Audit Log scoped to the logged-in user.
 * Available to Analyst, L1 Approver, and L2 Approver.
 * Admin does not have this view (they have the full Audit Log).
 *
 * Data source: real `audit_logs` table in Supabase, filtered by
 * `actor_id` = the UUID of the currently authenticated user.
 *
 * Schema: audit_logs(id, actor_id UUID, action, target_type,
 *   target_id UUID, before_value JSONB, after_value JSONB, created_at)
 *
 * Previously this file used useStore().auditLog (mock data) with fields
 * like actorEmail / description / meta / timestamp that don't exist in
 * the real table. Those mock fields are replaced below with real columns.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RoleGuard } from "@/components/dashboard/role-guard";
import { DashboardShell } from "@/components/dashboard/shell";
import { IndexCard, IndexCardHeader } from "@/components/ui/index-card";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Action display map ────────────────────────────────────────────────────────
// Keyed by the string action values stored in audit_logs.action (VARCHAR 255).
// The mock AuditAction union is intentionally NOT imported here — the real DB
// stores free-form strings and we need graceful fallback for unknown values.
const ACTION_STYLE: Record<string, { label: string; color: string }> = {
  USER_CREATED:          { label: "User created",          color: "var(--approve)"    },
  USER_ROLE_CHANGED:     { label: "Role changed",          color: "var(--exception)"  },
  RULE_UPDATED:          { label: "Rule updated",          color: "var(--brass)"      },
  APPLICATION_SUBMITTED: { label: "Application submitted", color: "var(--ink-muted)"  },
  EVALUATION_RUN:        { label: "Evaluation run",        color: "var(--ink-muted)"  },
  EXCEPTION_APPROVED:    { label: "Exception approved",    color: "var(--approve)"    },
  EXCEPTION_REJECTED:    { label: "Exception rejected",    color: "var(--reject)"     },
  EXCEPTION_ESCALATED:   { label: "Exception escalated",  color: "var(--exception)"  },
  ACCOUNT_ACTIVATED:     { label: "Account activated",     color: "var(--approve)"    },
  LOGIN:                 { label: "Login",                  color: "var(--ink-muted)"  },
};

// ─── DB row type ───────────────────────────────────────────────────────────────
interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  created_at: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Synthesise a human-readable description from action + target fields. */
function describeAction(row: AuditLogRow): string {
  const style = ACTION_STYLE[row.action];
  const label = style?.label ?? row.action.replace(/_/g, " ").toLowerCase();
  if (row.target_type && row.target_id) {
    return `${label} — ${row.target_type} ${row.target_id.slice(0, 8)}`;
  }
  if (row.target_type) return `${label} — ${row.target_type}`;
  return label;
}

/** Render key/value pairs from after_value JSONB as a summary line. */
function renderAfterValue(json: Record<string, unknown> | null): string | null {
  if (!json) return null;
  return Object.entries(json)
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function MyActivityPage() {
  return (
    <DashboardShell>
      <RoleGuard allowedRoles={["analyst", "l1-approver", "l2-approver"]}>
        <ActivityContent />
      </RoleGuard>
    </DashboardShell>
  );
}

// ─── Content ───────────────────────────────────────────────────────────────────

function ActivityContent() {
  const supabase = createClient();

  // Current user identity (UUID + profile from users table)
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    email: string;
    role: string;
    name?: string;
  } | null>(null);

  // Real audit log rows from Supabase, filtered by actor_id
  const [auditRows, setAuditRows] = useState<AuditLogRow[] | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Step 1: resolve the Supabase auth user + their profile row
  useEffect(() => {
    let mounted = true;
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data: userData } = await supabase
        .from("users")
        .select("name, role")
        .eq("email", user.email)
        .single();

      if (mounted && userData) {
        const mappedRole = userData.role.toLowerCase().replace("_", "-");
        setCurrentUser({
          id: user.id,       // the Supabase auth UUID — used to filter audit_logs
          email: user.email,
          role: mappedRole,
          name: userData.name,
        });
      }
    }
    loadUser();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  // Step 2: once we have the user's UUID, fetch their audit log entries
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    async function loadAuditLog() {
      const { data, error } = await supabase
        .from("audit_logs")
        .select(
          "id, actor_id, action, target_type, target_id, before_value, after_value, created_at",
        )
        .eq("actor_id", currentUser!.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (cancelled) return;
      if (error) {
        setAuditError(error.message);
        setAuditRows([]);
      } else {
        setAuditError(null);
        setAuditRows((data as AuditLogRow[]) ?? []);
      }
    }

    loadAuditLog();
    return () => {
      cancelled = true;
    };
  }, [currentUser, supabase]);

  // ── Loading skeleton (before user resolves) ───────────────────────────────
  if (!currentUser) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)] pb-4">
          <Skeleton className="h-3 w-32 mb-2" />
          <Skeleton className="h-8 w-48" />
        </div>
        <IndexCard tabTone="default" as="div">
          <div className="space-y-4 pb-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
            <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 px-6 py-2 bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)] border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)]">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_auto] gap-x-4 items-start px-6 py-4 border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)]">
                <div className="space-y-2 pt-0.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </IndexCard>
      </div>
    );
  }

  // ── Loading skeleton (user resolved but audit log still fetching) ─────────
  const loadingAudit = auditRows === null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)] pb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          {currentUser.role.replace("-", " ")}
        </p>
        <h1 className="text-2xl mt-1">My Activity</h1>
      </div>

      <IndexCard tabTone="default" as="div">
        <IndexCardHeader
          title="Recent Actions"
          meta={
            loadingAudit
              ? "Loading…"
              : auditError
              ? "Error loading"
              : `${auditRows!.length} entries · most recent first`
          }
        />
        <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
          {/* Column header */}
          <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 px-6 py-2 bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)] border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)]">
            {["Time", "Description", "Action"].map((h) => (
              <span key={h} className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
                {h}
              </span>
            ))}
          </div>

          {/* Error state */}
          {auditError && (
            <p className="px-6 py-4 text-sm text-[var(--reject)]">
              Failed to load activity: {auditError}
            </p>
          )}

          {/* Audit log row skeletons while fetching */}
          {!auditError && loadingAudit && (
            <>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_auto] gap-x-4 items-start px-6 py-4 border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)]">
                  <div className="space-y-2 pt-0.5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </>
          )}

          {/* Empty state */}
          {!auditError && !loadingAudit && auditRows!.length === 0 && (
            <p className="px-6 py-6 text-sm text-[var(--ink-muted)]">
              No actions recorded yet.
            </p>
          )}

          {/* Real rows */}
          {!auditError &&
            !loadingAudit &&
            auditRows!.map((row) => {
              const style = ACTION_STYLE[row.action] ?? {
                label: row.action.replace(/_/g, " ").toLowerCase(),
                color: "var(--ink-muted)",
              };
              const afterSummary = renderAfterValue(row.after_value);
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[auto_1fr_auto] gap-x-4 items-start px-6 py-3 border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)] last:border-0"
                >
                  {/* Time column */}
                  <span className="font-mono text-[10px] text-[var(--ink-muted)] whitespace-nowrap pt-0.5">
                    {new Date(row.created_at).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                    <br />
                    {new Date(row.created_at).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>

                  {/* Description column */}
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--ink)] leading-snug">
                      {describeAction(row)}
                    </p>
                    <p className="font-mono text-[10px] text-[var(--ink-muted)] mt-0.5">
                      {row.target_type}
                      {row.target_id && ` · ${row.target_id.slice(0, 8)}`}
                    </p>
                    {afterSummary && (
                      <p className="font-mono text-[10px] text-[var(--ink-muted)] mt-0.5">
                        {afterSummary}
                      </p>
                    )}
                  </div>

                  {/* Action label column */}
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
