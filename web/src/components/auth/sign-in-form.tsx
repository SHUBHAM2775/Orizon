"use client";

/**
 * SignInForm — the email + password form for returning users.
 *
 * Design spec (login-signup-concept.md §Sign In state):
 *   - Fields: email, password
 *   - Error states use --reject in the product's voice, not generic "Error"
 *   - Bottom note: explains the Option-A account model to confused users
 *   - On success: calls onSuccess(roleRedirect) which the shell handles
 */

import { useCallback, useRef, useState } from "react";
import { signIn } from "@/app/actions/auth";
import { AuthInput, AuthButton, AuthError } from "./form-primitives";

export interface SignInFormProps {
  /** Called on successful authentication; receives the role-specific redirect URL. */
  onSuccess: (redirectTo: string) => void;
}

export function SignInForm({ onSuccess }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!email.trim()) {
        setError("Email is required.");
        emailRef.current?.focus();
        return;
      }
      if (!password) {
        setError("Password is required.");
        return;
      }

      setLoading(true);
      const result = await signIn(email.trim(), password);
      setLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.redirectTo) {
        onSuccess(result.redirectTo);
      }
    },
    [email, password, onSuccess],
  );

  // Demo credential hint — visible in non-production environments
  const isDev = process.env.NODE_ENV === "development";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Sign in form"
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">Sign In</h2>
        <p className="text-xs text-[var(--ink-muted)]">
          Internal underwriting portal.
        </p>
      </div>

      {error && <AuthError message={error} />}

      {isDev && (
        <div className="border border-[color-mix(in_oklch,var(--brass),transparent_70%)] bg-[color-mix(in_oklch,var(--brass),transparent_93%)] rounded-[var(--radius-sm)] px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] mb-1">
            Demo credentials
          </p>
          <p className="font-mono text-xs text-[var(--ink-muted)]">
            analyst@orizon.in / l1@orizon.in / l2@orizon.in / admin@orizon.in
          </p>
          <p className="font-mono text-xs text-[var(--ink-muted)]">
            Password: <span className="text-[var(--ink)]">demo</span> (all accounts)
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <AuthInput
          ref={emailRef}
          label="Email"
          id="signin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@orizon.in"
          autoComplete="email"
          autoFocus
          required
        />
        <AuthInput
          label="Password"
          id="signin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </div>

      <AuthButton type="submit" loading={loading}>
        Sign in
      </AuthButton>

      {/* Option-A model explanation — shown below the form, not as a disabled link */}
      <p className="text-xs text-[var(--ink-muted)] leading-relaxed border-t border-[color-mix(in_oklch,var(--ink),transparent_88%)] pt-4">
        Don&apos;t have an account?{" "}
        <span className="text-[var(--ink)]">
          Accounts are created by your Admin — check your email for an
          activation link.
        </span>
      </p>
    </form>
  );
}
