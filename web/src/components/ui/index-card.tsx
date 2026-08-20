/**
 * IndexCard — the case-file card primitive.
 *
 * Visual language (design-system.md):
 *   - --paper background, 1px hairline border in --ink at ~15% opacity
 *   - Top-edge "tab" strip: 3px thick, default --ink/20, accent via tabTone
 *   - Flat paper-like depth: 2px offset box-shadow, no blur
 *   - Radius: 2px (--radius-sm) — "official document," not consumer app
 *
 * Constraints:
 *   - No className override for color. tabTone is the only color hook.
 *   - All values reference CSS tokens — no hardcoded hex or px for spacing.
 */

import { cn } from "@/lib/utils";

// The top-tab accent strip color per tone.
// Only the defined tokens are allowed; enforced by the type.
const TAB_TONE_STYLES = {
  default:   "bg-[color-mix(in_oklch,var(--ink),transparent_80%)]",
  brass:     "bg-[var(--brass)]",
  approve:   "bg-[var(--approve)]",
  reject:    "bg-[var(--reject)]",
  exception: "bg-[var(--exception)]",
} as const;

export type IndexCardTone = keyof typeof TAB_TONE_STYLES;

export interface IndexCardProps {
  children: React.ReactNode;
  /** Accent color of the top-edge tab strip. Defaults to muted ink. */
  tabTone?: IndexCardTone;
  className?: string;
  /** Rendered HTML element. Default: "article". */
  as?: React.ElementType;
}

export function IndexCard({
  children,
  tabTone = "default",
  className,
  as: Root = "article",
}: IndexCardProps) {
  return (
    <Root
      className={cn(
        // Paper background, hairline border, document radius
        "relative bg-[var(--paper)] rounded-[var(--radius-sm)]",
        // Hairline border — ink at ~15% opacity
        "border border-[color-mix(in_oklch,var(--ink),transparent_85%)]",
        // Flat paper offset shadow — depth without blur
        "shadow-[2px_2px_0px_color-mix(in_oklch,var(--ink),transparent_90%)]",
        className,
      )}
    >
      {/* Top-edge tab strip */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-[3px] rounded-t-[var(--radius-sm)]",
          TAB_TONE_STYLES[tabTone],
        )}
        aria-hidden="true"
      />
      {/* Content — top padding accounts for the 3px strip */}
      <div className="pt-[calc(theme(spacing.6)+3px)] px-6 pb-6">
        {children}
      </div>
    </Root>
  );
}

/**
 * IndexCardHeader — optional convenience wrapper for card title + meta.
 * Not mandatory; callers can lay out children freely inside IndexCard.
 */
export interface IndexCardHeaderProps {
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}

export function IndexCardHeader({ title, meta, action }: IndexCardHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4 mb-4">
      <div className="min-w-0">
        {typeof title === "string" ? (
          <h2 className="text-base font-semibold leading-snug text-[var(--ink)] truncate">
            {title}
          </h2>
        ) : (
          title
        )}
        {meta && (
          <p className="mt-0.5 font-mono text-xs text-[var(--ink-muted)]">
            {meta}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </header>
  );
}
