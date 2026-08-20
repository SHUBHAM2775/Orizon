"use client";

/**
 * home-client.tsx — Client component for the home/auth route.
 *
 * Responsibilities:
 *   1. If the user is already authenticated, immediately redirect to their
 *      role's landing page (avoids showing the login form to a logged-in user).
 *   2. Otherwise, render the AuthShell (folder-tab drawer: Sign In / Activate).
 *
 * The server component (page.tsx) reads searchParams and passes `token`
 * here so the ACTIVATE tab can be pre-selected on activation links.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMockAuth } from "@/lib/mock-auth";
import { AuthShell } from "@/components/auth/auth-shell";

export interface HomeClientProps {
  token: string | null;
}

export function HomeClient({ token }: HomeClientProps) {
  const { isAuthenticated, roleRedirect } = useMockAuth();
  const router = useRouter();

  useEffect(() => {
    // Already logged in → send to role dashboard
    if (isAuthenticated) {
      router.replace(roleRedirect());
    }
  }, [isAuthenticated, roleRedirect, router]);

  // Render nothing while redirect is in-flight
  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          Redirecting…
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <AuthShell initialToken={token} />
    </main>
  );
}
