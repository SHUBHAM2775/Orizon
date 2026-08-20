"use client";

/**
 * role-guard.tsx — Client-side RBAC enforcement.
 *
 * Behaviour:
 *   - Unauthenticated:          redirect to / (the auth screen)
 *   - Wrong role (direct URL):  show an explicit "Unauthorized" card
 *   - Correct role:             render children
 *
 * Built to be replaced with server-side middleware enforcement later (PRD §10)
 * without changing the component API at call sites.
 *
 * Usage:
 *   <RoleGuard allowedRoles={["admin"]}>
 *     <AdminOnlyContent />
 *   </RoleGuard>
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMockAuth } from "@/lib/mock-auth";
import { IndexCard } from "@/components/ui/index-card";
import type { UserRole } from "@/lib/mock-users";

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { currentUser, isAuthenticated } = useMockAuth();
  const router = useRouter();

  // Redirect unauthenticated users to the auth screen at /
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router]);

  // While redirect is in-flight, render nothing
  if (!isAuthenticated || !currentUser) {
    return null;
  }

  // Authenticated but wrong role — show explicit Unauthorized state (PRD §10)
  if (!allowedRoles.includes(currentUser.role as UserRole)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <IndexCard tabTone="reject" as="div" className="max-w-sm w-full">
          <p className="font-mono text-xs uppercase tracking-wider text-[var(--reject)] mb-2">
            Unauthorized
          </p>
          <p className="text-sm text-[var(--ink)]">
            Your role ({currentUser.role}) does not have access to this section.
          </p>
          <p className="mt-2 text-xs text-[var(--ink-muted)]">
            Contact your Admin if you believe this is incorrect.
          </p>
        </IndexCard>
      </div>
    );
  }

  return <>{children}</>;
}
