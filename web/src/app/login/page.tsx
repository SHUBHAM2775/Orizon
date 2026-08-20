/**
 * /login — Permanent redirect to the home page.
 *
 * The auth screen now lives at /. This page forwards anyone who has a
 * bookmarked /login URL (or an old activation link) to the equivalent
 * path at /, preserving the ?token= param if present.
 */

import { redirect } from "next/navigation";

interface LoginRedirectProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function LoginRedirect({ searchParams }: LoginRedirectProps) {
  const params = await searchParams;
  // Forward the activation token if present so the Activate tab pre-selects
  const target = params.token ? `/?token=${params.token}` : "/";
  redirect(target);
}
