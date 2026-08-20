/**
 * / — Home page (the Sign In / Activate screen).
 *
 * Server component: reads searchParams to detect ?token= for activation links,
 * then delegates all client-side auth logic to <HomeClient>.
 *
 * Flow:
 *   - Unauthenticated user hits /      → Sign In form
 *   - Unauthenticated user hits /?token=X → Activate tab pre-selected
 *   - Already-authenticated user hits / → redirect to role dashboard
 */

import { Suspense } from "react";
import { HomeClient } from "./home-client";

export const metadata = {
  title: "Orizon — Credit Underwriting",
  description:
    "Sign in to the Orizon internal credit underwriting portal.",
};

interface HomeProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const token = params.token ?? null;

  return (
    <Suspense fallback={null}>
      <HomeClient token={token} />
    </Suspense>
  );
}
