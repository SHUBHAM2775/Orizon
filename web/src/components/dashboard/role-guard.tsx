"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { IndexCard } from "@/components/ui/index-card";
import type { UserRole } from "@/lib/mock-users";
import { DbUserRole } from "@/lib/auth-utils";

interface RoleGuardProps {
  allowedRoles: UserRole[]; // keeping old type to not break existing pages
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const router = useRouter();
  const supabase = createClient();
  const [currentRole, setCurrentRole] = useState<DbUserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        if (mounted) router.replace("/");
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("role")
        .eq("email", user.email)
        .single();

      if (mounted) {
        if (userData?.role) {
          setCurrentRole(userData.role as DbUserRole);
        } else {
          router.replace("/");
        }
        setLoading(false);
      }
    }

    checkRole();
    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  if (loading) return null;

  // Convert old lowercase mock roles to uppercase DB roles for checking
  const mappedAllowedRoles = allowedRoles.map((role) => 
    role.toUpperCase().replace("-", "_") as DbUserRole
  );

  if (!currentRole || !mappedAllowedRoles.includes(currentRole)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <IndexCard tabTone="reject" as="div" className="max-w-sm w-full">
          <p className="font-mono text-xs uppercase tracking-wider text-[var(--reject)] mb-2">
            Unauthorized
          </p>
          <p className="text-sm text-[var(--ink)]">
            Your role ({currentRole}) does not have access to this section.
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

