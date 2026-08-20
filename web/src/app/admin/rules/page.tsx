"use client";

/**
 * Admin — Rule Configuration /admin/rules
 *
 * The "configurable BRE" admin interface.
 * Critical for demo scenario 5: Admin changes a threshold → Analyst re-runs
 * APP1005 → different outcome. This panel is where that change happens.
 *
 * Features:
 *   - Table of all rules (active + inactive)
 *   - Click a rule → inline edit form (threshold, active toggle)
 *   - Save writes to the store + appends to audit log
 *   - Version counter increments on each save
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/mock-store";
import { DashboardShell } from "@/components/dashboard/shell";
import { RoleGuard } from "@/components/dashboard/role-guard";
import { IndexCard, IndexCardHeader } from "@/components/ui/index-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Rule } from "@/lib/mock-data";

export default function RuleConfigPage() {
  return (
    <DashboardShell>
      <RoleGuard allowedRoles={["admin"]}>
        <RuleConfigContent />
      </RoleGuard>
    </DashboardShell>
  );
}

function RuleConfigContent() {
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

  const { rules, updateRule } = useStore();


  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftThreshold, setDraftThreshold] = useState<string>("");
  const [draftActive, setDraftActive] = useState<boolean>(true);
  const [savedId, setSavedId] = useState<string | null>(null);

  const startEdit = useCallback((rule: Rule) => {
    setEditingId(rule.id);
    setDraftThreshold(String(rule.threshold));
    setDraftActive(rule.isActive);
    setSavedId(null);
  }, []);

  const handleSave = useCallback((rule: Rule) => {
    if (!currentUser) return;
    const parsed = parseFloat(draftThreshold);
    if (isNaN(parsed)) return;
    updateRule(
      { ...rule, threshold: parsed, isActive: draftActive },
      currentUser.email,
      currentUser.role,
    );
    setSavedId(rule.id);
    setEditingId(null);
  }, [draftThreshold, draftActive, currentUser, updateRule]);

  if (!currentUser) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)] pb-4">
          <Skeleton className="h-3 w-48 mb-2" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-20 w-full" />
        <IndexCard tabTone="default" as="div">
          <div className="space-y-4 pb-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-6 py-2 bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)] border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)]">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-8" />
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 items-center px-6 py-4 border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)]">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
        </IndexCard>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)] pb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          Admin · Business Rule Engine
        </p>
        <h1 className="text-2xl mt-1">Rule Configuration</h1>
      </div>

      <div className="bg-[color-mix(in_oklch,var(--exception),transparent_92%)] border border-[color-mix(in_oklch,var(--exception),transparent_70%)] rounded-[var(--radius-sm)] px-4 py-3">
        <p className="font-mono text-xs text-[var(--exception)] uppercase tracking-wider mb-1">
          Demo scenario 5
        </p>
        <p className="text-xs text-[var(--ink)] leading-relaxed">
          Change the threshold for <strong>Borderline CIBIL — L1 Exception</strong> (RULE-CIBIL-006) from <strong>720 → 715</strong>,
          then ask the Analyst to re-run <strong>APP1005</strong> (Sunita Patel, CIBIL 716).
          The outcome changes from EXCEPTION_L1 to APPROVED — proving the engine is genuinely configurable.
        </p>
      </div>

      <IndexCard tabTone="default" as="div">
        <IndexCardHeader
          title="Active Rules"
          meta={`${rules.length} rules · engine version ${Math.max(...rules.map((r) => r.version))}`}
        />
        <div className="-mx-6 -mb-6 mt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-6 py-2 bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)] border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)]">
            {["Rule", "Condition", "Threshold", "Outcome", ""].map((h, i) => (
              <span key={i} className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">{h}</span>
            ))}
          </div>

          {rules.map((rule) => {
            const isEditing = editingId === rule.id;
            const wasSaved = savedId === rule.id;

            return (
              <div key={rule.id} className="border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)] last:border-0">
                {/* Rule row */}
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 items-center px-6 py-3">
                  <div>
                    <p className="text-xs font-medium text-[var(--ink)]">{rule.name}</p>
                    <p className="font-mono text-[10px] text-[var(--ink-muted)]">
                      {rule.reasonCode} · v{rule.version}
                      {!rule.isActive && " · INACTIVE"}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-[var(--ink-muted)] whitespace-nowrap">
                    {rule.field} {rule.operator}
                  </span>
                  <span className="font-mono text-xs text-[var(--ink)] tabular-nums whitespace-nowrap">
                    {wasSaved ? (
                      <span className="text-[var(--approve)]">✓ {rule.threshold}</span>
                    ) : rule.threshold}
                  </span>
                  <span className={cn(
                    "font-mono text-[10px] uppercase tracking-wider whitespace-nowrap",
                    rule.outcome === "HARD_REJECT" ? "text-[var(--reject)]" : "text-[var(--exception)]",
                  )}>
                    {rule.outcome.replace("_", " ")}
                  </span>
                  <button
                    onClick={() => isEditing ? setEditingId(null) : startEdit(rule)}
                    className="font-mono text-[10px] uppercase tracking-wider text-[var(--brass)] hover:text-[color-mix(in_oklch,var(--brass),var(--ink)_20%)] transition-colors"
                  >
                    {isEditing ? "Cancel" : "Edit"}
                  </button>
                </div>

                {/* Inline edit form */}
                {isEditing && (
                  <div className="px-6 pb-4 bg-[color-mix(in_oklch,var(--paper),var(--ink)_2%)] border-t border-[color-mix(in_oklch,var(--ink),transparent_90%)]">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] pt-3 mb-3">
                      Editing: {rule.name}
                    </p>
                    <p className="text-xs text-[var(--ink-muted)] mb-3 leading-relaxed">
                      {rule.description}
                    </p>
                    <div className="flex items-end gap-4 flex-wrap">
                      <div>
                        <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)] block mb-1.5">
                          Threshold
                        </label>
                        <input
                          type="number"
                          value={draftThreshold}
                          onChange={(e) => setDraftThreshold(e.target.value)}
                          className="bg-[var(--paper)] border border-[color-mix(in_oklch,var(--ink),transparent_75%)] rounded-[var(--radius-sm)] px-3 py-2 font-mono text-sm text-[var(--ink)] w-32 focus:outline-none focus:ring-1 focus:ring-[var(--brass)]"
                        />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draftActive}
                          onChange={(e) => setDraftActive(e.target.checked)}
                          className="accent-[var(--brass)] w-4 h-4"
                        />
                        <span className="font-mono text-xs text-[var(--ink)]">Active</span>
                      </label>
                      <button
                        onClick={() => handleSave(rule)}
                        className="bg-[var(--brass)] text-[var(--paper)] border border-[var(--brass)] rounded-[var(--radius-sm)] px-4 py-2 text-xs font-mono uppercase tracking-wider hover:bg-[color-mix(in_oklch,var(--brass),var(--ink)_18%)] transition-colors"
                      >
                        Save & Version
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </IndexCard>
    </div>
  );
}
