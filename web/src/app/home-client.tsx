"use client";

import { AuthShell } from "@/components/auth/auth-shell";

export interface HomeClientProps {
  token: string | null;
}

export function HomeClient({ token }: HomeClientProps) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <AuthShell initialToken={token} />
    </main>
  );
}
