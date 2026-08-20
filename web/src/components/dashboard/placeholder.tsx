"use client";

/**
 * DashboardPlaceholder — temporary stand-in for step 3.
 *
 * Rendered at each role's landing route (/applications, /exceptions, /admin/users)
 * until step 4 builds the real dashboards. Shows auth state, the active user,
 * and a logout button so the auth flow is testable end-to-end.
 *
 * Step 4 will delete this file and replace each page with real content.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMockAuth } from "@/lib/mock-auth";
import { IndexCard, IndexCardHeader } from "@/components/ui/index-card";
import { StatusBadge } from "@/components/ui/status-badge";

const ROLE_LABELS: Record<string, string> = {
  analyst: "Analyst",
  "l1-approver": "L1 Approver",
  "l2-approver": "L2 / Credit Head",
  admin: "Admin",
};

interface DashboardPlaceholderProps {
  /** Page title shown in the heading */
  pageTitle: string;
  /** Optional brief description */
  description?: string;
}

export function DashboardPlaceholder({
  pageTitle,
  description,
}: DashboardPlaceholderProps) {
  const router = useRouter();
  const { currentUser, logout } = useMockAuth();

  const handleLogout = useCallback(() => {
    logout();
    router.push("/login");
  }, [logout, router]);

  // If not authenticated (direct URL access), redirect to login
  if (!currentUser) {
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        <IndexCard tabTone="brass" as="div">
          <IndexCardHeader
            title={pageTitle}
            meta="Step 4 dashboard — coming soon"
            action={
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] border border-[color-mix(in_oklch,var(--ink),transparent_80%)] px-1.5 py-0.5 rounded-[var(--radius-sm)]">
                Placeholder
              </span>
            }
          />

          {description && (
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed mb-4">
              {description}
            </p>
          )}

          {/* Authenticated user info */}
          <div className="mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_88%)] pt-4 space-y-2">
            <Row label="Signed in as" value={currentUser.name} />
            <Row label="Email" value={currentUser.email} mono />
            <Row
              label="Role"
              value={ROLE_LABELS[currentUser.role] ?? currentUser.role}
            />
            <div className="flex items-center justify-between py-0.5">
              <span className="text-xs text-[var(--ink-muted)]">
                Auth state
              </span>
              <StatusBadge tone="approve" />
            </div>
          </div>
        </IndexCard>

        {/* Sign out */}
        <div className="flex justify-center">
          <button
            onClick={handleLogout}
            className="font-mono text-xs uppercase tracking-[0.1em] text-[var(--ink-muted)] hover:text-[var(--ink)] border border-[color-mix(in_oklch,var(--ink),transparent_80%)] hover:border-[color-mix(in_oklch,var(--ink),transparent_60%)] px-4 py-2 rounded-[var(--radius-sm)] transition-colors duration-150"
          >
            Sign out
          </button>
        </div>

        <p className="text-center font-mono text-[10px] text-[color-mix(in_oklch,var(--ink-muted),transparent_40%)] uppercase tracking-[0.14em]">
          Real dashboard builds in step 4.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-[var(--ink-muted)]">{label}</span>
      <span
        className={mono ? "font-mono text-xs text-[var(--ink)]" : "text-sm text-[var(--ink)]"}
      >
        {value}
      </span>
    </div>
  );
}
