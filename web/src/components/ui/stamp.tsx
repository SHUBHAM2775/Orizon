"use client";

/**
 * Stamp — the ink-stamp decision element.
 *
 * Design-system.md rules:
 *   - CSS-drawn (not an image). Circular/rounded-rect outline in semantic color.
 *   - Rotation: -5deg (fixed; not randomized per render to avoid jitter).
 *   - SVG feTurbulence + feDisplacementMap for ink-irregular edge.
 *   - Decision text in Fraunces (display face), uppercase, inside the stamp.
 *   - Beneath stamp: reason code in IBM Plex Mono at text-xs.
 *   - Animates in once on mount: 180ms scale/rotate "press down".
 *   - prefers-reduced-motion → instant appearance (handled by globals.css + inline guard).
 *
 * Usage discipline (caller's responsibility):
 *   - Appears once per evaluation view (Approved/Reject/Exception).
 *   - Appears once on account activation (ACTIVATED, approve tone).
 *   - Do not scatter elsewhere — the spec is explicit on this.
 *
 * Constraints:
 *   - tone prop fully determines color — no separate color/borderColor prop.
 *   - className is for layout (margin, position) only — not color.
 *   - All color values reference CSS tokens.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// ─── Tone configuration ────────────────────────────────────────────────────────

const TONE_CONFIG = {
  approve: {
    color: "var(--approve)",
    label: "APPROVED",
    ariaLabel: "Decision: Approved",
  },
  reject: {
    color: "var(--reject)",
    label: "HARD REJECT",
    ariaLabel: "Decision: Hard Reject",
  },
  "exception-l1": {
    color: "var(--exception)",
    label: "EXCEPTION · L1",
    ariaLabel: "Decision: Exception — Level 1 review required",
  },
  "exception-l2": {
    color: "var(--exception)",
    label: "EXCEPTION · L2",
    ariaLabel: "Decision: Exception — Level 2 review required",
  },
  pending: {
    color: "var(--ink-muted)",
    label: "PENDING",
    ariaLabel: "Decision: Pending",
  },
} as const;

export type StampTone = keyof typeof TONE_CONFIG;

export interface StampProps {
  tone: StampTone;
  /** Rule or reason code annotation rendered beneath the stamp in mono type. */
  reason?: string;
  /** Layout overrides only (margin, position). Do not pass color utilities. */
  className?: string;
}

// ─── SVG filter — ink-irregular edge ─────────────────────────────────────────
// One filter definition, referenced by all Stamp instances on the page.
// Rendered once in the DOM; subsequent stamps share it.

const STAMP_FILTER_ID = "stamp-ink-edge";

function StampInkFilter() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="0"
      height="0"
      aria-hidden="true"
      style={{ position: "absolute", overflow: "hidden" }}
    >
      <defs>
        <filter id={STAMP_FILTER_ID} x="-5%" y="-5%" width="110%" height="110%">
          {/* Subtle turbulence — gives the border a slightly irregular ink quality */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.065"
            numOctaves="4"
            seed="2"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="2.5"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}

// ─── Main Stamp component ─────────────────────────────────────────────────────

export function Stamp({ tone, reason, className }: StampProps) {
  const config = TONE_CONFIG[tone];
  const stampRef = useRef<HTMLDivElement>(null);

  // Trigger the animation once on mount.
  // The globals.css prefers-reduced-motion rule collapses all animation
  // durations to 0.001ms, so the animation "plays" but is imperceptible.
  useEffect(() => {
    const el = stampRef.current;
    if (!el) return;
    // Remove any leftover class before re-triggering (e.g. in dev hot-reload)
    el.classList.remove("stamp-animate");
    // Force reflow to reset the animation
    void el.offsetWidth;
    el.classList.add("stamp-animate");
  }, []);

  return (
    <figure
      className={cn("inline-flex flex-col items-center gap-3", className)}
      role="img"
      aria-label={config.ariaLabel}
    >
      {/* Shared SVG filter — only renders its definition, zero visual output */}
      <StampInkFilter />

      {/* The stamp body */}
      <div
        ref={stampRef}
        className="stamp-body"
        style={{
          // All color via token — no hardcoded hex
          "--stamp-color": config.color,
          // Inline style used for the dynamic token reference; Tailwind can't
          // generate arbitrary CSS-variable color values at build time.
        } as React.CSSProperties}
      >
        <span className="stamp-label">{config.label}</span>
      </div>

      {/* Reason code annotation — beneath the stamp, mono type */}
      {reason && (
        <figcaption className="font-mono text-xs text-[var(--ink-muted)] tracking-[0.08em] text-center max-w-[16rem]">
          {reason}
        </figcaption>
      )}

      {/* Scoped keyframe + stamp styles — self-contained so tree-shaking works */}
      <style>{`
        .stamp-body {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 9rem;
          height: 9rem;
          border-radius: var(--radius-lg); /* 6px — only allowed exception to 4px cap */
          border: 3px solid var(--stamp-color);
          background: color-mix(in oklch, var(--stamp-color), transparent 92%);
          transform: rotate(-5deg);
          filter: url(#${STAMP_FILTER_ID});
          /* Outer border double-ring effect to mimic a rubber stamp */
          box-shadow:
            0 0 0 1.5px color-mix(in oklch, var(--stamp-color), transparent 60%),
            inset 0 0 0 1.5px color-mix(in oklch, var(--stamp-color), transparent 70%);
        }

        .stamp-label {
          font-family: var(--font-fraunces), Georgia, serif;
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--stamp-color);
          text-align: center;
          padding: 0.5rem;
          line-height: 1.3;
          /* Counter-rotate the text so it reads flat inside the rotated container */
          transform: rotate(5deg);
        }

        /* --- Animation --- */
        @keyframes stamp-press {
          0% {
            transform: rotate(-5deg) scale(1.3);
            opacity: 0;
          }
          55% {
            transform: rotate(-5deg) scale(0.96);
            opacity: 1;
          }
          100% {
            transform: rotate(-5deg) scale(1);
            opacity: 1;
          }
        }

        .stamp-animate {
          animation: stamp-press 180ms ease-out both;
        }
      `}</style>
    </figure>
  );
}
