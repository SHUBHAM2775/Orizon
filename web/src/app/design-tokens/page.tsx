"use client";

/**
 * /design-tokens — Shared primitives dev-reference.
 *
 * The step-2 component showcase, moved here from / so the home route can
 * serve the real auth screen. Useful during development to eyeball every
 * primitive without signing in.
 *
 * Not linked from any navigation — reach directly at /design-tokens.
 */

import { useState } from "react";
import { IndexCard, IndexCardHeader } from "@/components/ui/index-card";
import {
  FolderTabSidebar,
  FolderTab,
  FolderTabGroupLabel,
} from "@/components/ui/folder-tab-sidebar";
import { Stamp, type StampTone } from "@/components/ui/stamp";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";

// ─── Icons (inline SVG — no icon lib dep yet) ─────────────────────────────────

function IconFolder() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <path d="M2 4.5A1.5 1.5 0 013.5 3h3.172a1.5 1.5 0 011.06.44l.83.829A1.5 1.5 0 009.62 4.8H12.5A1.5 1.5 0 0114 6.3V12a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12V4.5z" />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <path d="M2 4h12M2 8h12M2 12h8" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4.5V8l2.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_APPLICANTS = [
  { id: "APP1001", name: "Priya Shankar", amount: 500000, tone: "approve" as StatusBadgeTone },
  { id: "APP1002", name: "Rohan Kulkarni", amount: 350000, tone: "exception-l1" as StatusBadgeTone },
  { id: "APP1003", name: "Meera Joshi", amount: 750000, tone: "reject" as StatusBadgeTone },
  { id: "APP1004", name: "Arjun Verma", amount: 200000, tone: "pending" as StatusBadgeTone },
  { id: "APP1005", name: "Sunita Patel", amount: 425000, tone: "exception-l2" as StatusBadgeTone },
] as const;

const NAV_TABS = [
  { id: "applications", label: "Applications", icon: <IconFolder /> },
  { id: "exception-queue", label: "Exception Queue", icon: <IconList /> },
  { id: "rule-config", label: "Rule Config", icon: <IconSettings /> },
  { id: "audit-log", label: "Audit Log", icon: <IconClock /> },
] as const;

const STAMP_SHOWCASE: { tone: StampTone; reason: string }[] = [
  { tone: "approve", reason: "RULE-CIBIL-001 · Score 742 ≥ 700" },
  { tone: "reject", reason: "RULE-FOIR-003 · FOIR 67% > 55% threshold" },
  { tone: "exception-l1", reason: "RULE-LTV-002 · Referred for L1 review" },
  { tone: "exception-l2", reason: "RULE-AMT-004 · Amount > ₹5,00,000 cap" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DesignTokensPage() {
  const [activeNavTab, setActiveNavTab] = useState<string>("applications");
  const [activeAuthTab, setActiveAuthTab] = useState<"sign-in" | "activate">("sign-in");

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12 space-y-20">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <header className="border-b border-[color-mix(in_oklch,var(--ink),transparent_85%)] pb-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          Orizon · Dev reference · /design-tokens
        </p>
        <h1 className="mt-2 text-4xl">Shared Primitives</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">
          Dev-reference for the four building blocks used across all screens.
          Each component consumes only design tokens — no hardcoded values.
          Reach this page at <code className="font-mono text-xs">/design-tokens</code>.
        </p>
      </header>

      {/* ── 1. IndexCard ─────────────────────────────────────────────────── */}
      <section>
        <SectionHeading index="01" title="IndexCard" />
        <p className="mb-6 text-sm text-[var(--ink-muted)] max-w-xl">
          Case-file card. Hairline border, flat paper-like depth, top-edge tab
          strip. The <code className="font-mono text-xs">tabTone</code> prop is
          the only color hook — callers cannot override colors via className.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <IndexCard tabTone="default">
            <IndexCardHeader title="APP1001" meta="Priya Shankar · ₹5,00,000" />
            <div className="space-y-2 mt-2">
              <DataRow label="CIBIL score" value="742" />
              <DataRow label="FOIR" value="38%" />
              <DataRow label="Decision" value={<StatusBadge tone="approve" />} />
            </div>
          </IndexCard>

          <IndexCard tabTone="brass">
            <IndexCardHeader title="APP1002" meta="Rohan Kulkarni · ₹3,50,000" action={<StatusBadge tone="exception-l1" />} />
            <div className="space-y-2 mt-2">
              <DataRow label="CIBIL score" value="681" />
              <DataRow label="FOIR" value="52%" />
              <DataRow label="Tab tone" value={<Chip label="brass (active)" />} />
            </div>
          </IndexCard>

          <IndexCard tabTone="reject">
            <IndexCardHeader title="APP1003" meta="Meera Joshi · ₹7,50,000" action={<StatusBadge tone="reject" />} />
            <div className="space-y-2 mt-2">
              <DataRow label="CIBIL score" value="589" />
              <DataRow label="FOIR" value="67%" />
              <DataRow label="Tab tone" value={<Chip label="reject" />} />
            </div>
          </IndexCard>

          <IndexCard tabTone="approve">
            <IndexCardHeader title="APP1004" meta="Arjun Verma · ₹2,00,000" action={<StatusBadge tone="approve" />} />
            <div className="space-y-2 mt-2">
              <DataRow label="CIBIL score" value="761" />
              <DataRow label="FOIR" value="31%" />
              <DataRow label="Tab tone" value={<Chip label="approve" />} />
            </div>
          </IndexCard>

          <IndexCard tabTone="exception">
            <IndexCardHeader title="APP1005" meta="Sunita Patel · ₹4,25,000" action={<StatusBadge tone="exception-l2" />} />
            <div className="space-y-2 mt-2">
              <DataRow label="CIBIL score" value="704" />
              <DataRow label="FOIR" value="48%" />
              <DataRow label="Tab tone" value={<Chip label="exception" />} />
            </div>
          </IndexCard>

          <IndexCard as="div" tabTone="default">
            <p className="text-xs font-mono text-[var(--ink-muted)] uppercase tracking-wider mb-2">
              as=&quot;div&quot; variant
            </p>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              The <code className="font-mono text-xs">as</code> prop changes the
              rendered element without affecting styles.
            </p>
          </IndexCard>
        </div>
      </section>

      {/* ── 2. FolderTabSidebar ─────────────────────────────────────────── */}
      <section>
        <SectionHeading index="02" title="FolderTabSidebar" />
        <p className="mb-6 text-sm text-[var(--ink-muted)] max-w-xl">
          The vertical folder-tab rail. Two variants: <code className="font-mono text-xs">nav</code>{" "}
          (dashboard 4-tab rail) and <code className="font-mono text-xs">auth</code>{" "}
          (login 2-tab rail). Children-driven — role-gating means
          not rendering a tab, not passing a config flag.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <IndexCard tabTone="default" as="div">
            <IndexCardHeader title="Nav variant" meta="dashboard · 4 tabs · with icons" />
            <div className="flex mt-4 -mx-6 -mb-6 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
              <FolderTabSidebar variant="nav">
                <FolderTabGroupLabel>Workspace</FolderTabGroupLabel>
                {NAV_TABS.map((tab) => (
                  <FolderTab
                    key={tab.id}
                    id={tab.id}
                    label={tab.label}
                    isActive={activeNavTab === tab.id}
                    onClick={() => setActiveNavTab(tab.id)}
                    icon={tab.icon}
                  />
                ))}
              </FolderTabSidebar>
              <div className="flex-1 p-5 bg-[color-mix(in_oklch,var(--paper),var(--ink)_2%)]">
                <p className="font-mono text-xs text-[var(--ink-muted)] uppercase tracking-wider mb-2">
                  Active panel
                </p>
                <p className="text-sm text-[var(--ink)]">
                  {NAV_TABS.find((t) => t.id === activeNavTab)?.label} content.
                </p>
              </div>
            </div>
          </IndexCard>

          <IndexCard tabTone="default" as="div">
            <IndexCardHeader title="Auth variant" meta="login · 2 tabs · text only" />
            <div className="flex mt-4 -mx-6 -mb-6 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
              <FolderTabSidebar variant="auth">
                <FolderTab
                  id="sign-in"
                  label="SIGN IN"
                  isActive={activeAuthTab === "sign-in"}
                  onClick={() => setActiveAuthTab("sign-in")}
                />
                <FolderTab
                  id="activate"
                  label="ACTIVATE"
                  isActive={activeAuthTab === "activate"}
                  onClick={() => setActiveAuthTab("activate")}
                  disabled={activeAuthTab !== "activate"}
                  disabledReason="Activation links are sent by email"
                />
              </FolderTabSidebar>
              <div className="flex-1 p-5 bg-[color-mix(in_oklch,var(--paper),var(--ink)_2%)]">
                <p className="text-sm text-[var(--ink)]">
                  {activeAuthTab === "sign-in" ? "Sign in form." : "Activate form."}
                </p>
              </div>
            </div>
          </IndexCard>
        </div>
      </section>

      {/* ── 3. Stamp ─────────────────────────────────────────────────────── */}
      <section>
        <SectionHeading index="03" title="Stamp" />
        <p className="mb-2 text-sm text-[var(--ink-muted)] max-w-xl">
          The ink-stamp decision element. CSS-drawn, SVG ink-edge filter, −5° rotation,
          180ms press-down animation on mount.
        </p>
        <p className="mb-6 text-xs font-mono text-[var(--ink-muted)] max-w-xl bg-[color-mix(in_oklch,var(--ink),transparent_93%)] border border-[color-mix(in_oklch,var(--ink),transparent_85%)] px-3 py-2 rounded-[var(--radius-sm)]">
          ⚠ Shown side-by-side here for dev reference only. In production, one
          stamp appears per evaluation view — not all four simultaneously.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {STAMP_SHOWCASE.map(({ tone, reason }) => (
            <div key={tone} className="flex flex-col items-center gap-2">
              <Stamp tone={tone} reason={reason} />
              <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink-muted)] mt-2">
                {tone}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. StatusBadge ───────────────────────────────────────────────── */}
      <section>
        <SectionHeading index="04" title="StatusBadge" />
        <p className="mb-6 text-sm text-[var(--ink-muted)] max-w-xl">
          Inline decision-state badges. Five exhaustive variants — three
          reserved semantic decision colors plus a neutral pending state.
        </p>

        <div className="flex flex-wrap gap-4 mb-10">
          <StatusBadge tone="approve" />
          <StatusBadge tone="reject" />
          <StatusBadge tone="exception-l1" />
          <StatusBadge tone="exception-l2" />
          <StatusBadge tone="pending" />
        </div>

        <IndexCard tabTone="default" as="div">
          <IndexCardHeader title="Applications" meta="Mock queue — 5 demo applicants (PRD §7)" />
          <div className="mt-4 -mx-6 -mb-6 border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)]">
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-6 px-6 py-2 border-b border-[color-mix(in_oklch,var(--ink),transparent_85%)] bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)]">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">ID</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">Applicant</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] text-right">Amount</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] text-right">Status</span>
            </div>
            {MOCK_APPLICANTS.map((app) => (
              <div
                key={app.id}
                className="grid grid-cols-[auto_1fr_auto_auto] gap-x-6 items-center px-6 py-3 border-b border-[color-mix(in_oklch,var(--ink),transparent_90%)] last:border-b-0 hover:bg-[color-mix(in_oklch,var(--paper),var(--ink)_2%)] transition-colors"
              >
                <span className="font-mono text-xs text-[var(--ink-muted)]">{app.id}</span>
                <span className="text-sm text-[var(--ink)]">{app.name}</span>
                <span className="font-mono text-xs text-right text-[var(--ink)] tabular-nums">
                  ₹{app.amount.toLocaleString("en-IN")}
                </span>
                <div className="flex justify-end">
                  <StatusBadge tone={app.tone} />
                </div>
              </div>
            ))}
          </div>
        </IndexCard>
      </section>

      <footer className="border-t border-[color-mix(in_oklch,var(--ink),transparent_85%)] pt-6">
        <p className="font-mono text-xs text-[var(--ink-muted)]">
          Primitives reference · Source of truth: docs/design-system.md ·{" "}
          <a href="/" className="underline hover:text-[var(--ink)]">Back to sign in</a>
        </p>
      </footer>

    </div>
  );
}

// ─── Local helpers ─────────────────────────────────────────────────────────────

function SectionHeading({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <span className="font-mono text-xs text-[var(--ink-muted)]">{index}</span>
      <h2 className="text-2xl">{title}</h2>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-xs text-[var(--ink-muted)] flex-shrink-0">{label}</span>
      {typeof value === "string" ? (
        <span className="font-mono text-xs text-[var(--ink)]">{value}</span>
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] border border-[color-mix(in_oklch,var(--ink),transparent_80%)] px-1.5 py-0.5 rounded-[var(--radius-sm)]">
      {label}
    </span>
  );
}
