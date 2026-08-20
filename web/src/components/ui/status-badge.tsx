/**
 * StatusBadge — inline decision-state badge.
 *
 * Design-system.md rules:
 *   - 1px border in semantic color
 *   - Background: semantic color at 5% opacity
 *   - IBM Plex Mono, text-xs, tracking-[0.12em], uppercase
 *   - Leading ● dot in semantic color
 *   - Radius: 2px (document-style, not pill)
 *
 * Tone variants (exhaustive — no others are permitted):
 *   approve       → --approve    APPROVED
 *   reject        → --reject     HARD REJECT
 *   exception-l1  → --exception  EXCEPTION · L1
 *   exception-l2  → --exception  EXCEPTION · L2
 *   pending       → --ink-muted  PENDING (neutral — not a decision color)
 *
 * Constraints:
 *   - className is for layout (margin, display) only — not color.
 *   - Semantic colors are never reused outside these decision tones.
 */

import { cn } from "@/lib/utils";

// ─── Tone configuration ────────────────────────────────────────────────────────

const TONE_CONFIG = {
  approve: {
    label: "APPROVED",
    colorVar: "var(--approve)",
    borderClass: "border-[var(--approve)]",
    textClass: "text-[var(--approve)]",
    bgClass: "bg-[color-mix(in_oklch,var(--approve),transparent_95%)]",
  },
  reject: {
    label: "HARD REJECT",
    colorVar: "var(--reject)",
    borderClass: "border-[var(--reject)]",
    textClass: "text-[var(--reject)]",
    bgClass: "bg-[color-mix(in_oklch,var(--reject),transparent_95%)]",
  },
  "exception-l1": {
    label: "EXCEPTION · L1",
    colorVar: "var(--exception)",
    borderClass: "border-[var(--exception)]",
    textClass: "text-[var(--exception)]",
    bgClass: "bg-[color-mix(in_oklch,var(--exception),transparent_95%)]",
  },
  "exception-l2": {
    label: "EXCEPTION · L2",
    colorVar: "var(--exception)",
    borderClass: "border-[var(--exception)]",
    textClass: "text-[var(--exception)]",
    bgClass: "bg-[color-mix(in_oklch,var(--exception),transparent_95%)]",
  },
  pending: {
    label: "PENDING",
    colorVar: "var(--ink-muted)",
    borderClass: "border-[var(--ink-muted)]",
    textClass: "text-[var(--ink-muted)]",
    bgClass: "bg-[color-mix(in_oklch,var(--ink-muted),transparent_95%)]",
  },
} as const;

export type StatusBadgeTone = keyof typeof TONE_CONFIG;

export interface StatusBadgeProps {
  tone: StatusBadgeTone;
  /** Layout overrides only (margin, display). Do not pass color utilities. */
  className?: string;
}

export function StatusBadge({ tone, className }: StatusBadgeProps) {
  const config = TONE_CONFIG[tone];

  return (
    <span
      className={cn(
        // Base badge — mono face, uppercase, tight tracking
        "inline-flex items-center gap-1.5",
        "border px-2.5 py-0.5",
        "font-mono text-xs uppercase tracking-[0.12em]",
        // Radius: 2px — "official document" not pill
        "rounded-[var(--radius-sm)]",
        // Tone-driven colors
        config.borderClass,
        config.textClass,
        config.bgClass,
        className,
      )}
      // Screen readers get the full label without the decorative dot
      aria-label={config.label}
    >
      {/* Decorative dot — aria-hidden so screen readers don't read "● APPROVED" */}
      <span aria-hidden="true" className="text-[0.6em] leading-none">
        ●
      </span>
      <span>{config.label}</span>
    </span>
  );
}
