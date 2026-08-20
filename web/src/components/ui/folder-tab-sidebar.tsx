"use client";

/**
 * FolderTabSidebar — the folder-tab rail primitive.
 *
 * Visual language (design-system.md):
 *   - Narrow vertical rail of physical-looking folder tabs
 *   - Active tab: --brass left-edge accent bar + slightly elevated z-index
 *   - Inactive tabs: recessed bg (paper + 4% ink)
 *   - Active indicator bar animates with 200ms ease (respects prefers-reduced-motion)
 *
 * Architecture:
 *   - Children-driven: callers render <FolderTab> elements
 *   - Role-gating in step 4 = just don't render the <FolderTab> for that section
 *   - Two variants: "nav" (dashboard 4-tab rail) and "auth" (login 2-tab rail)
 *
 * Constraints:
 *   - No auth/role coupling in this component
 *   - No hardcoded hex or font names
 */

import { cn } from "@/lib/utils";

// ─── Container ────────────────────────────────────────────────────────────────

export interface FolderTabSidebarProps {
  children: React.ReactNode;
  /** "nav" = dashboard rail (wider, with icons), "auth" = login rail (narrow, text only) */
  variant?: "nav" | "auth";
  className?: string;
}

export function FolderTabSidebar({
  children,
  variant = "nav",
  className,
}: FolderTabSidebarProps) {
  return (
    <nav
      role="tablist"
      aria-label={variant === "auth" ? "Authentication options" : "Navigation"}
      className={cn(
        // Vertical rail — narrow, sits flush against the content area
        "flex flex-col",
        "border-r border-[color-mix(in_oklch,var(--ink),transparent_85%)]",
        "bg-[var(--paper)]",
        variant === "nav" ? "w-48 min-h-full py-3" : "w-36 py-2",
        className,
      )}
    >
      {children}
    </nav>
  );
}

// ─── Individual Tab ────────────────────────────────────────────────────────────

export interface FolderTabProps {
  id: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  /** Shown as a tooltip when the tab is disabled (e.g. "Activation links are sent by email") */
  disabledReason?: string;
  /** Optional icon — use sparingly, nav variant only */
  icon?: React.ReactNode;
}

export function FolderTab({
  id,
  label,
  isActive,
  onClick,
  disabled = false,
  disabledReason,
  icon,
}: FolderTabProps) {
  return (
    <button
      role="tab"
      id={`tab-${id}`}
      aria-selected={isActive}
      aria-disabled={disabled}
      disabled={disabled}
      title={disabled && disabledReason ? disabledReason : undefined}
      onClick={onClick}
      className={cn(
        // Base tab — full width, left-aligned text, snug padding
        "group relative flex items-center gap-2.5 w-full text-left",
        "px-4 py-3",
        "font-mono text-xs uppercase tracking-[0.1em]",
        // Transition on background — reduced-motion collapses via globals.css
        "transition-colors duration-150",
        // Active state — shaded background to look "highlighted"
        isActive && [
          "bg-[color-mix(in_oklch,var(--paper),var(--ink)_4%)]",
          "text-[var(--ink)]",
          "font-medium",
        ],
        // Inactive state — blends into container
        !isActive && !disabled && [
          "bg-[var(--paper)]",
          "text-[var(--ink-muted)]",
          "hover:bg-[color-mix(in_oklch,var(--paper),var(--ink)_2%)]",
          "hover:text-[var(--ink)]",
        ],
        // Disabled state
        disabled && [
          "bg-[color-mix(in_oklch,var(--paper),var(--ink)_2%)]",
          "text-[color-mix(in_oklch,var(--ink-muted),transparent_50%)]",
          "cursor-not-allowed",
        ],
      )}
    >
      {/* Left-edge brass accent bar — the "active tab pulled forward" signal */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[3px]",
          "transition-[background-color,opacity] duration-200",
          // prefers-reduced-motion handled by globals.css global rule
          isActive
            ? "bg-[var(--brass)] opacity-100"
            : "bg-transparent opacity-0",
        )}
      />
      {/* Icon (nav variant, optional) */}
      {icon && (
        <span
          className={cn(
            "flex-shrink-0 w-4 h-4",
            isActive ? "text-[var(--ink)]" : "text-[var(--ink-muted)]",
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      {/* Label */}
      <span className="truncate">{label}</span>
      {/* Active tab right-edge hairline — mimics physical tab protruding past the rail */}
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute right-0 top-[6px] bottom-[6px] w-px bg-[color-mix(in_oklch,var(--ink),transparent_85%)]"
        />
      )}
    </button>
  );
}

// ─── Convenience export: group label inside the rail (nav variant) ─────────────

export interface FolderTabGroupLabelProps {
  children: React.ReactNode;
}

export function FolderTabGroupLabel({ children }: FolderTabGroupLabelProps) {
  return (
    <p className="px-4 pt-4 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color-mix(in_oklch,var(--ink-muted),transparent_30%)] select-none">
      {children}
    </p>
  );
}
