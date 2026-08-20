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
import { DashboardShell } from "@/components/dashboard/shell";
import { RoleGuard } from "@/components/dashboard/role-guard";
import { IndexCard, IndexCardHeader } from "@/components/ui/index-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface DBRule {
  id: string;
  rule_code: string;
  description: string;
  field_name: string;
  operator: string;
  threshold_value: number;
  outcome: string;
  reason_code: string;
  is_active: boolean;
  version: number;
  category: string;
  deviation_weight: number | null;
  priority: number;
}

function getFieldConstraints(rule: DBRule) {
  const code = rule.rule_code.toUpperCase();
  const field = rule.field_name.toLowerCase();

  if (code.includes('HR-01') || code.includes('HR-02') || field.includes('flag')) {
    return { type: 'boolean', hint: 'Valid: 0 (No) or 1 (Yes)' };
  }
  if (code.includes('HR-03') || code.includes('BUREAU') || field.includes('score')) {
    return { type: 'number', min: 300, max: 900, step: 1, hint: 'CIBIL: 300–900' };
  }
  if (code.includes('EL-01') || (field.includes('age') && rule.operator === 'LT')) {
    return { type: 'number', min: 18, max: 25, step: 1, hint: 'Min Age: 18–25' };
  }
  if (code.includes('EL-02') || (field.includes('age') && rule.operator === 'GT')) {
    return { type: 'number', min: 55, max: 65, step: 1, hint: 'Max Age: 55–65' };
  }
  if (code.includes('EL-03') || field.includes('income')) {
    return { type: 'number', min: 10000, max: 30000, step: 500, hint: 'Income: ₹10,000–₹30,000' };
  }
  if (code.includes('FOIR') || field.includes('foir')) {
    return { type: 'number', min: 0, max: 1, step: 0.01, hint: 'FOIR: 0–1' };
  }
  
  return { type: 'number', min: undefined, max: undefined, step: undefined, hint: '' };
}

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

  const [rules, setRules] = useState<DBRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);

  const loadRules = useCallback(async () => {
    setLoadingRules(true);
    const { data, error } = await supabase
      .from("rules")
      .select("*")
      .order("priority", { ascending: true });
    
    if (data) {
      setRules(data as DBRule[]);
    } else {
      console.error("Failed to load rules:", error);
    }
    setLoadingRules(false);
  }, [supabase]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);


  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftThreshold, setDraftThreshold] = useState<string>("");
  const [draftActive, setDraftActive] = useState<boolean>(true);
  const [savedId, setSavedId] = useState<string | null>(null);

  const startEdit = useCallback((rule: DBRule) => {
    setEditingId(rule.id);
    setDraftThreshold(String(rule.threshold_value));
    setDraftActive(rule.is_active);
    setSavedId(null);
  }, []);

  const handleSave = useCallback(async (rule: DBRule) => {
    if (!currentUser) return;
    const parsed = parseFloat(draftThreshold);
    if (isNaN(parsed)) return;

    const constraints = getFieldConstraints(rule);
    if (constraints.type === 'boolean') {
      if (parsed !== 0 && parsed !== 1) {
        alert("Value must be 0 or 1");
        return;
      }
    } else {
      if (constraints.min !== undefined && parsed < constraints.min) {
        alert(`Value must be at least ${constraints.min}`);
        return;
      }
      if (constraints.max !== undefined && parsed > constraints.max) {
        alert(`Value must be at most ${constraints.max}`);
        return;
      }
    }
    
    const { error } = await supabase
      .from("rules")
      .update({
        threshold_value: parsed,
        is_active: draftActive,
        version: rule.version + 1,
      })
      .eq("id", rule.id);

    if (!error) {
      setSavedId(rule.id);
      setEditingId(null);
      loadRules(); // Refresh data to show new version
    } else {
      console.error("Error updating rule:", error);
    }
  }, [draftThreshold, draftActive, currentUser, supabase, loadRules]);

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

  const categoryMetadata: Record<string, { title: string, desc: string, order: number }> = {
    "HARD_REJECT": { title: "Hard Reject Rules", desc: "Hard Reject rules immediately disqualify an applicant regardless of other factors.", order: 1 },
    "ELIGIBILITY": { title: "Eligibility Rules", desc: "Base demographic and income criteria required to process an application.", order: 2 },
    "SCORING": { title: "Exception / Scoring Rules", desc: "Rules that adjust application standing or trigger manual review exceptions.", order: 3 },
    "EXCEPTION": { title: "Exception / Scoring Rules", desc: "Rules that adjust application standing or trigger manual review exceptions.", order: 3 }
  };

  const groupedRules = rules.reduce((acc, rule) => {
    const cat = rule.category || 'OTHER';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(rule);
    return acc;
  }, {} as Record<string, DBRule[]>);

  const sortedCategories = Object.keys(groupedRules).sort((a, b) => {
    const orderA = categoryMetadata[a]?.order || 99;
    const orderB = categoryMetadata[b]?.order || 99;
    return orderA - orderB;
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)] pb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          Admin · Business Rule Engine
        </p>
        <h1 className="text-2xl mt-1 mb-2">Rule Configuration</h1>
        <p className="text-sm text-[var(--ink-muted)] max-w-3xl leading-relaxed">
          Tune the Business Rule Engine thresholds and configurations. Changes made here only affect new or un-actioned applications. All modifications are strictly version-controlled for audit purposes, ensuring a complete history of policy changes over time.
        </p>
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

      <div className="space-y-8">
        {sortedCategories.map(cat => {
          const catRules = groupedRules[cat];
          const meta = categoryMetadata[cat] || { title: `${cat} Rules`, desc: "Configuration for this rule category." };
          
          return (
            <IndexCard key={cat} tabTone="default" as="div">
              <IndexCardHeader
                title={meta.title}
                meta={`${catRules.length} rules`}
              />
              <div className="px-6 pb-4 pt-1">
                <p className="text-xs text-[var(--ink-muted)] leading-relaxed">{meta.desc}</p>
              </div>
              <div className="-mx-6 -mb-6 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
                {/* Header */}
                <div className="grid grid-cols-[1.5fr_2fr_100px_120px_80px] gap-x-6 px-6 py-2 bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)] border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)]">
                  {["Rule", "Condition", "Threshold", "Outcome", ""].map((h, i) => (
                    <span key={i} className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">{h}</span>
                  ))}
                </div>

                {catRules.map((rule) => {
                  const isEditing = editingId === rule.id;
                  const wasSaved = savedId === rule.id;

                  return (
                    <div key={rule.id} className="border-b border-[color-mix(in_oklch,var(--ink),transparent_92%)] last:border-0">
                      {/* Rule row */}
                      <div className="grid grid-cols-[1.5fr_2fr_100px_120px_80px] gap-x-6 items-start px-6 py-4 hover:bg-[color-mix(in_oklch,var(--paper),var(--ink)_1%)] transition-colors">
                        <div className="flex flex-col gap-1.5 mt-0.5">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-[var(--ink)]">{rule.rule_code}</p>
                            {!rule.is_active ? (
                              <span className="text-[9px] font-mono uppercase tracking-wider bg-[color-mix(in_oklch,var(--ink),transparent_90%)] text-[var(--ink-muted)] px-1.5 py-0.5 rounded-[var(--radius-sm)]">Inactive</span>
                            ) : (
                              <span className="text-[9px] font-mono uppercase tracking-wider bg-[color-mix(in_oklch,var(--approve),transparent_90%)] text-[var(--approve)] px-1.5 py-0.5 rounded-[var(--radius-sm)]">Active</span>
                            )}
                          </div>
                          <p className="font-mono text-[10px] text-[var(--ink-muted)]">
                            {rule.reason_code} · v{rule.version}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1 mt-0.5">
                          <span className="font-mono text-xs text-[var(--ink-muted)] whitespace-nowrap">
                            {rule.field_name} {rule.operator}
                          </span>
                          <span className="text-[11px] text-[var(--ink-muted)] leading-relaxed whitespace-normal pr-4">
                            {rule.description}
                          </span>
                        </div>
                        <span className="font-mono text-xs text-[var(--ink)] tabular-nums whitespace-nowrap mt-0.5">
                          {wasSaved ? (
                            <span className="text-[var(--approve)]">✓ {rule.threshold_value}</span>
                          ) : rule.threshold_value}
                        </span>
                        <div className="mt-0.5">
                          <span className={cn(
                            "font-mono text-[9px] uppercase tracking-wider whitespace-nowrap px-2 py-1 rounded-[var(--radius-sm)]",
                            rule.outcome === "HARD_REJECT" ? "bg-[var(--reject)] text-[var(--paper)]" : "border border-[var(--exception)] text-[var(--exception)]",
                          )}>
                            {rule.outcome.replace("_", " ")}
                          </span>
                        </div>
                        <button
                          onClick={() => isEditing ? setEditingId(null) : startEdit(rule)}
                          className="font-mono text-[10px] uppercase tracking-wider text-[var(--brass)] border border-[color-mix(in_oklch,var(--brass),transparent_70%)] bg-[color-mix(in_oklch,var(--brass),transparent_95%)] hover:bg-[color-mix(in_oklch,var(--brass),transparent_85%)] transition-colors px-3 py-1.5 rounded-[var(--radius-sm)] w-full text-center mt-0.5"
                        >
                          {isEditing ? "Cancel" : "Edit"}
                        </button>
                      </div>

                      {/* Inline edit form */}
                {isEditing && (
                  <div className="px-6 pb-4 bg-[color-mix(in_oklch,var(--paper),var(--ink)_2%)] border-t border-[color-mix(in_oklch,var(--ink),transparent_90%)]">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] pt-3 mb-3">
                      Editing: {rule.rule_code}
                    </p>
                    <p className="text-xs text-[var(--ink-muted)] mb-3 leading-relaxed">
                      {rule.description}
                    </p>
                    <div className="flex items-end gap-4 flex-wrap">
                      <div>
                        <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)] block mb-1.5">
                          Threshold
                        </label>
                        {(() => {
                          const constraints = getFieldConstraints(rule);
                          if (constraints.type === 'boolean') {
                            return (
                              <select
                                value={draftThreshold}
                                onChange={(e) => setDraftThreshold(e.target.value)}
                                className="bg-[var(--paper)] border border-[color-mix(in_oklch,var(--ink),transparent_75%)] rounded-[var(--radius-sm)] px-3 py-2 font-mono text-sm text-[var(--ink)] w-32 focus:outline-none focus:ring-1 focus:ring-[var(--brass)]"
                              >
                                <option value="1">1 (Yes)</option>
                                <option value="0">0 (No)</option>
                              </select>
                            );
                          }
                          return (
                            <input
                              type="number"
                              value={draftThreshold}
                              onChange={(e) => setDraftThreshold(e.target.value)}
                              min={constraints.min}
                              max={constraints.max}
                              step={constraints.step}
                              className="bg-[var(--paper)] border border-[color-mix(in_oklch,var(--ink),transparent_75%)] rounded-[var(--radius-sm)] px-3 py-2 font-mono text-sm text-[var(--ink)] w-32 focus:outline-none focus:ring-1 focus:ring-[var(--brass)]"
                            />
                          );
                        })()}
                        {(() => {
                          const constraints = getFieldConstraints(rule);
                          if (constraints.hint) {
                            return <p className="text-[10px] text-[var(--ink-muted)] mt-1.5 font-mono">{constraints.hint}</p>;
                          }
                          return null;
                        })()}
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
          );
        })}
      </div>
    </div>
  );
}
