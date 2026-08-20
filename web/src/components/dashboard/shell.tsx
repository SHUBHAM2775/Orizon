"use client";

/**
 * DashboardShell — shared layout for all four role dashboards.
 *
 * Structure:
 *   [FolderTabSidebar (nav variant)] | [main content area]
 *
 * Tabs are rendered based on the current user's role — inaccessible sections
 * are simply not rendered (children-driven gating per step 2 design).
 * The role-guard on each route provides the explicit "Unauthorized" state
 * for direct URL access.
 *
 * Includes:
 *   - Top header bar with wordmark + current user + sign-out
 *   - Sidebar with role-filtered nav tabs
 *   - Main scrollable content area
 */

import { useCallback, useState, useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/client";
import {
  FolderTabSidebar,
  FolderTab,
  FolderTabGroupLabel,
} from "@/components/ui/folder-tab-sidebar";

// ─── Nav tab definitions ──────────────────────────────────────────────────────

interface NavTab {
  id: string;
  label: string;
  href: string;
  /** Roles that can see this tab */
  roles: string[];
  icon: ReactNode;
}

function IconFolder() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <path d="M2 4.5A1.5 1.5 0 013.5 3h3.172a1.5 1.5 0 011.06.44l.83.829A1.5 1.5 0 009.62 4.8H12.5A1.5 1.5 0 0114 6.3V12a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12V4.5z" />
    </svg>
  );
}
function IconQueue() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <rect x="2" y="2" width="12" height="3" rx="0.5" />
      <rect x="2" y="7" width="12" height="3" rx="0.5" />
      <rect x="2" y="12" width="8" height="2" rx="0.5" />
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
function IconUsers() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1 13c0-2.76 2.24-5 5-5s5 2.24 5 5" strokeLinecap="round" />
      <path d="M11 4c1.38 0 2.5 1.12 2.5 2.5S12.38 9 11 9" strokeLinecap="round" />
      <path d="M13 13c0-1.657-1.12-3-2.5-3.5" strokeLinecap="round" />
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

function IconActivity() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <path d="M2 8l3-4 3 8 3-6 3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_TABS: NavTab[] = [
  {
    id: "applications",
    label: "Applications",
    href: "/applications",
    roles: ["analyst"],
    icon: <IconFolder />,
  },
  {
    id: "exception-queue",
    label: "Exception Queue",
    href: "/exceptions",
    roles: ["l1-approver", "l2-approver"],
    icon: <IconQueue />,
  },
  {
    id: "activity",
    label: "My Activity",
    href: "/activity",
    roles: ["analyst", "l1-approver", "l2-approver"],
    icon: <IconActivity />,
  },
  {
    id: "rule-config",
    label: "Rule Config",
    href: "/admin/rules",
    roles: ["admin"],
    icon: <IconSettings />,
  },
  {
    id: "users",
    label: "Users",
    href: "/admin/users",
    roles: ["admin"],
    icon: <IconUsers />,
  },
  {
    id: "audit-log",
    label: "Audit Log",
    href: "/admin/audit",
    roles: ["admin"],
    icon: <IconClock />,
  },
];

// ─── Shell ────────────────────────────────────────────────────────────────────

export interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [currentUser, setCurrentUser] = useState<{ name: string; role: string; originalRole: string } | null>(null);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from("users")
        .select("name, role")
        .eq("email", user.email)
        .single();
      
      if (userData) {
        // Map db role format to UI format so tabs work
        const mappedRole = userData.role.toLowerCase().replace("_", "-");
        setCurrentUser({ name: userData.name, role: mappedRole, originalRole: userData.role });
      }
    }
    loadUser();
  }, [supabase]);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/");
  }, [router]);

  const handleTabClick = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  if (!currentUser) return null;

  const visibleTabs = NAV_TABS.filter((t) => t.roles.includes(currentUser.role));

  // Derive active state strictly from usePathname()
  const activeTabId = visibleTabs.find((t) => {
    const isExactMatch = pathname === t.href;
    const isSubPath = pathname.startsWith(t.href + "/");
    return isExactMatch || isSubPath;
  })?.id ?? visibleTabs[0]?.id;

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Top header bar ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-[color-mix(in_oklch,var(--ink),transparent_85%)] bg-[var(--paper)]">
        <div className="flex items-center gap-3">
          <span className="font-display text-lg leading-none">Orizon</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)] border-l border-[color-mix(in_oklch,var(--ink),transparent_80%)] pl-3">
            Credit Underwriting
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-[var(--ink)]">{currentUser.name}</p>
            <p className="font-mono text-[10px] text-[var(--ink-muted)] uppercase tracking-wider">
              {currentUser.originalRole}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)] hover:text-[var(--ink)] border border-[color-mix(in_oklch,var(--ink),transparent_80%)] px-2.5 py-1 rounded-[var(--radius-sm)] transition-colors duration-150"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Body: sidebar + content ─────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        <FolderTabSidebar variant="nav" className="flex-shrink-0">
          <FolderTabGroupLabel>Workspace</FolderTabGroupLabel>
          {visibleTabs.map((tab) => (
            <FolderTab
              key={tab.id}
              id={tab.id}
              label={tab.label}
              isActive={activeTabId === tab.id}
              onClick={() => handleTabClick(tab.href)}
              icon={tab.icon}
            />
          ))}
        </FolderTabSidebar>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
