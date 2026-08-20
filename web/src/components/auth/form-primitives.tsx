"use client";

/**
 * form-primitives.tsx — Shared input/button components for auth forms.
 *
 * Keeps styling consistent across SignInForm and ActivateForm.
 * All values reference CSS tokens — no hardcoded hex or font names.
 *
 * Exported:
 *   AuthInput   — labeled text/email/password input with optional error
 *   AuthButton  — primary CTA button (brass fill)
 *   AuthError   — form-level error message in --reject
 */

import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

// ─── AuthInput ─────────────────────────────────────────────────────────────────

export interface AuthInputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]"
        >
          {label}
        </label>

        <input
          ref={ref}
          id={inputId}
          aria-describedby={
            [hintId, errorId].filter(Boolean).join(" ") || undefined
          }
          aria-invalid={!!error}
          className={cn(
            // Base
            "w-full bg-[var(--paper)]",
            "border border-[color-mix(in_oklch,var(--ink),transparent_75%)]",
            "rounded-[var(--radius-sm)] px-3 py-2",
            "text-sm text-[var(--ink)]",
            "placeholder:text-[color-mix(in_oklch,var(--ink-muted),transparent_40%)]",
            // Focus — brass ring, no outline
            "focus:outline-none focus:ring-1 focus:ring-[var(--brass)] focus:border-[var(--brass)]",
            // Transition
            "transition-[border-color,box-shadow] duration-150",
            // Error state — reject border + ring
            error && "border-[var(--reject)] focus:ring-[var(--reject)] focus:border-[var(--reject)]",
            // Disabled / read-only
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "read-only:bg-[color-mix(in_oklch,var(--paper),var(--ink)_4%)] read-only:cursor-default",
            className,
          )}
          {...props}
        />

        {hint && !error && (
          <p id={hintId} className="text-xs text-[var(--ink-muted)] leading-relaxed">
            {hint}
          </p>
        )}

        {error && (
          <p
            id={errorId}
            role="alert"
            className="font-mono text-xs text-[var(--reject)] leading-relaxed"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);
AuthInput.displayName = "AuthInput";

// ─── AuthButton ────────────────────────────────────────────────────────────────

export interface AuthButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: React.ReactNode;
}

export function AuthButton({
  loading = false,
  disabled,
  children,
  className,
  ...props
}: AuthButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        // Brass fill — the primary action color
        "w-full bg-[var(--brass)] text-[var(--paper)]",
        "border border-[var(--brass)]",
        "rounded-[var(--radius-sm)] px-4 py-2.5",
        "text-sm font-medium tracking-wide",
        // Hover — darken brass slightly toward ink
        "hover:bg-[color-mix(in_oklch,var(--brass),var(--ink)_18%)]",
        "hover:border-[color-mix(in_oklch,var(--brass),var(--ink)_18%)]",
        // Focus
        "focus:outline-none focus:ring-2 focus:ring-[var(--brass)] focus:ring-offset-1",
        "focus:ring-offset-[var(--paper)]",
        // State
        "transition-colors duration-150",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <LoadingDots />
          <span>{children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

// Three animated dots — CSS only, collapses under prefers-reduced-motion
function LoadingDots() {
  return (
    <span aria-hidden="true" className="flex gap-[3px] items-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-1 h-1 rounded-full bg-current animate-bounce"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

// ─── AuthError ────────────────────────────────────────────────────────────────

export function AuthError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "border border-[var(--reject)] bg-[color-mix(in_oklch,var(--reject),transparent_93%)]",
        "rounded-[var(--radius-sm)] px-3 py-2.5",
        "font-mono text-xs text-[var(--reject)] leading-relaxed",
      )}
    >
      {message}
    </div>
  );
}
