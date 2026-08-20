"use client";

/**
 * ActivateForm — account activation form for new users arriving via tokenized link.
 *
 * Design spec (login-signup-concept.md §Activate Account state):
 *   - Pre-filled email from the token payload (read-only field)
 *   - Fields: new password + confirm password
 *   - On success: ACTIVATED stamp (--approve, Fraunces) animates in for ~1.5s
 *     then redirects to /login for explicit sign-in
 *   - If reached without a valid token: the tab is disabled (shell handles this),
 *     but the form itself shows a clear disabled state as a fallback
 *
 * The stamp here is the one deliberate use outside the underwriting flow —
 * "account activated" is genuinely a decision event. Do not add more.
 */

import { useCallback, useEffect, useState } from "react";
import { activateAccount, getActivationEmail } from "@/app/actions/auth";
import { Stamp } from "@/components/ui/stamp";
import { AuthInput, AuthButton, AuthError } from "./form-primitives";

export interface ActivateFormProps {
  /** Token from ?token= URL param. Null if accessed without a valid link. */
  token: string | null;
  /** Called after the success animation completes — shell redirects to /login. */
  onActivationComplete: () => void;
}

type FormState = "idle" | "loading" | "success" | "error";

export function ActivateForm({ token, onActivationComplete }: ActivateFormProps) {
  const hasValidToken = !!token;

  const [activationEmail, setActivationEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(hasValidToken);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Fetch the email associated with the token on mount
  useEffect(() => {
    if (!hasValidToken || !token) return;
    let mounted = true;

    async function fetchEmail() {
      setEmailLoading(true);
      const res = await getActivationEmail(token!);
      if (!mounted) return;
      if (res.error) {
        setEmailError(res.error);
      } else if (res.email) {
        setActivationEmail(res.email);
      }
      setEmailLoading(false);
    }

    fetchEmail();
    return () => {
      mounted = false;
    };
  }, [hasValidToken, token]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>("idle");

  // After success stamp plays, redirect to /login
  useEffect(() => {
    if (formState !== "success") return;
    const timer = setTimeout(() => {
      onActivationComplete();
    }, 1800); // stamp animation 180ms + hold time
    return () => clearTimeout(timer);
  }, [formState, onActivationComplete]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!hasValidToken || !token) return;

      setPasswordError(null);
      setConfirmError(null);
      setFormError(null);

      let hasError = false;

      if (!password || password.length < 8) {
        setPasswordError("Password must be at least 8 characters.");
        hasError = true;
      }
      if (password !== confirmPassword) {
        setConfirmError("Passwords don't match.");
        hasError = true;
      }
      if (hasError) return;

      setFormState("loading");
      const res = await activateAccount(token, password);
      
      if (res.error) {
        setFormState("error");
        setFormError(res.error);
      } else {
        setFormState("success");
      }
    },
    [password, confirmPassword, hasValidToken, token],
  );

  // ── No-token disabled state ──────────────────────────────────────────────
  if (!hasValidToken) {
    return (
      <div className="flex flex-col gap-5" aria-label="Activate account — no token">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg">Activate Account</h2>
          <p className="text-xs text-[var(--ink-muted)]">
            Set your password to activate your account.
          </p>
        </div>
        <div className="border border-[color-mix(in_oklch,var(--ink),transparent_82%)] bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)] rounded-[var(--radius-sm)] px-4 py-5 text-center">
          <p className="font-mono text-xs text-[var(--ink-muted)] leading-relaxed">
            Activation links are sent by email.
            <br />
            Check your inbox for an invitation from your Admin.
          </p>
        </div>
      </div>
    );
  }

  // ── Success state — stamp moment ─────────────────────────────────────────
  if (formState === "success") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 min-h-[280px]"
        aria-live="polite"
        aria-label="Account activated"
      >
        {/* The one deliberate use of the stamp outside evaluation views */}
        <Stamp
          tone="approve"
          reason={`${activationEmail} — account activated`}
        />
        <p className="text-xs text-[var(--ink-muted)] font-mono text-center">
          Redirecting to sign in…
        </p>
      </div>
    );
  }

  // ── Main activation form ────────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Activate account form"
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">Activate Account</h2>
        <p className="text-xs text-[var(--ink-muted)]">
          Set your password to complete account setup.
        </p>
      </div>

      {formError && <AuthError message={formError} />}

      <div className="flex flex-col gap-4">
        {/* Pre-filled email — read-only context for the user */}
        <AuthInput
          label="Your email"
          id="activate-email"
          type="email"
          value={activationEmail}
          readOnly
          tabIndex={-1}
          hint="Pre-filled from your activation link. Contact your Admin if this is incorrect."
        />

        <AuthInput
          label="New password"
          id="activate-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimum 8 characters"
          autoComplete="new-password"
          autoFocus
          required
          error={passwordError ?? undefined}
        />

        <AuthInput
          label="Confirm password"
          id="activate-confirm"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repeat your new password"
          autoComplete="new-password"
          required
          error={confirmError ?? undefined}
        />
      </div>

      <AuthButton type="submit" loading={formState === "loading"}>
        Activate account
      </AuthButton>

      <p className="text-xs text-[var(--ink-muted)] leading-relaxed border-t border-[color-mix(in_oklch,var(--ink),transparent_88%)] pt-4">
        After activation you&apos;ll be prompted to sign in with your new password.
      </p>
    </form>
  );
}
