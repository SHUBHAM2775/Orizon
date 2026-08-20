"use client";

/**
 * AuthShell — the outer auth screen layout.
 *
 * Implements the "Folder Tabs" concept from login-signup-concept.md:
 *   Left:  FolderTabSidebar (auth variant, 2 tabs: SIGN IN / ACTIVATE)
 *   Right: The active "case file" card — slides like pulling a different
 *          file forward in a drawer (200ms ease).
 *
 * Animation spec:
 *   - Track is 200% wide; each panel is 50% of the track = 100% of visible area
 *   - translateX(0)     → SIGN IN visible
 *   - translateX(-50%)  → ACTIVATE visible  (50% of 200% track = 100% of container)
 *   - Transition: 220ms ease-in-out
 *   - prefers-reduced-motion: globals.css collapses transition-duration to 0.001ms
 *
 * Role-guard note: This component has no auth coupling. The caller (page.tsx)
 * passes initialToken; the shell reads it to pre-select the active tab and
 * disable ACTIVATE when the token is absent.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { FolderTabSidebar, FolderTab } from "@/components/ui/folder-tab-sidebar";
import { SignInForm } from "./sign-in-form";
import { ActivateForm } from "./activate-form";

type AuthTab = "sign-in" | "activate";

export interface AuthShellProps {
  /** Token from ?token= URL param. Non-null value pre-selects the ACTIVATE tab. */
  initialToken?: string | null;
}

export function AuthShell({ initialToken }: AuthShellProps) {
  const router = useRouter();
  const hasToken = !!initialToken;

  // Pre-select ACTIVATE tab if a token is present in the URL
  const [activeTab, setActiveTab] = useState<AuthTab>(
    hasToken ? "activate" : "sign-in",
  );

  const handleSignInSuccess = useCallback(
    (redirectTo: string) => {
      router.push(redirectTo);
    },
    [router],
  );

  const handleActivationComplete = useCallback(() => {
    // After the stamp moment, go back to SIGN IN tab rather than redirecting
    // away — the user still needs to sign in with their new password.
    setActiveTab("sign-in");
  }, []);

  const handleTabChange = useCallback((tab: AuthTab) => {
    setActiveTab(tab);
  }, []);

  return (
    <div className="w-full max-w-[520px]">
      {/* Product wordmark */}
      <div className="mb-8 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          Orizon
        </p>
        <h1 className="text-3xl mt-1">The Case File</h1>
        <p className="mt-1.5 font-mono text-xs tracking-[0.12em] text-[var(--ink-muted)] uppercase">
          Credit Underwriting Portal
        </p>
      </div>

      {/* The "folder drawer" — tab rail + sliding card in one bordered container */}
      <div
        className={cn(
          "flex",
          "border border-[color-mix(in_oklch,var(--ink),transparent_82%)]",
          "shadow-[3px_3px_0px_color-mix(in_oklch,var(--ink),transparent_88%)]",
          "rounded-[var(--radius-sm)]",
          "bg-[var(--paper)]",
          "overflow-hidden",
        )}
      >
        {/* Left: folder tab rail */}
        <FolderTabSidebar variant="auth">
          <FolderTab
            id="sign-in"
            label="SIGN IN"
            isActive={activeTab === "sign-in"}
            onClick={() => handleTabChange("sign-in")}
          />
          <FolderTab
            id="activate"
            label="ACTIVATE"
            isActive={activeTab === "activate"}
            onClick={() => handleTabChange("activate")}
            disabled={!hasToken && activeTab !== "activate"}
            disabledReason="Activation links are sent by email"
          />
        </FolderTabSidebar>

        {/* Right: sliding panel container */}
        <div className="flex-1 overflow-hidden min-w-0">
          {/*
           * Track — 200% wide, slides left to reveal the second panel.
           * Each panel is 50% of the track = 100% of the visible container.
           * translateX(0)    → Sign In panel visible
           * translateX(-50%) → Activate panel visible
           *
           * The global prefers-reduced-motion rule in globals.css overrides
           * transition-duration to 0.001ms — no special handling needed here.
           */}
          <div
            className={cn(
              "flex w-[200%]",
              "transition-transform ease-in-out duration-[220ms]",
              activeTab === "sign-in" ? "translate-x-0" : "-translate-x-1/2",
            )}
          >
            {/* Panel 0 — Sign In */}
            <div className="w-1/2 flex-shrink-0 p-7">
              <SignInForm onSuccess={handleSignInSuccess} />
            </div>

            {/* Panel 1 — Activate */}
            <div className="w-1/2 flex-shrink-0 p-7">
              <ActivateForm
                token={initialToken ?? null}
                onActivationComplete={handleActivationComplete}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Version footnote */}
      <p className="mt-6 text-center font-mono text-[10px] text-[color-mix(in_oklch,var(--ink-muted),transparent_40%)] uppercase tracking-[0.14em]">
        Orizon v0.1 · Mock data phase
      </p>
    </div>
  );
}
