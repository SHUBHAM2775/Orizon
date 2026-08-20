"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRoleRedirect, type DbUserRole } from "@/lib/auth-utils";

export async function signIn(email: string, password: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Fetch user role from public.users table
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("role, status")
    .ilike("email", email)
    .single();

  if (userError || !userData) {
    console.error("userError in signIn:", userError);
    // If they aren't in our users table, log them out.
    await supabase.auth.signOut();
    return { error: "User record not found in system." };
  }

  if (userData.status !== "ACTIVE") {
    await supabase.auth.signOut();
    return { error: "Account is not active. Please activate first." };
  }

  return { 
    user: data.user, 
    role: userData.role,
    redirectTo: getRoleRedirect(userData.role)
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function getActivationEmail(token: string) {
  const adminClient = createAdminClient();
  
  const { data, error } = await adminClient
    .from("password_setup_tokens")
    .select("user_id, expires_at, used_at, users(email)")
    .eq("token", token)
    .single();

  if (error || !data) {
    return { error: "Invalid token." };
  }

  if (data.used_at) {
    return { error: "Token already used." };
  }

  if (new Date(data.expires_at) < new Date()) {
    return { error: "Token expired." };
  }
  
  // @ts-ignore - Supabase types are not generated, so users is returned as an object
  const email = data.users?.email || (Array.isArray(data.users) ? data.users[0]?.email : null);
  
  if (!email) {
    return { error: "Associated user not found." };
  }

  return { email };
}

export async function activateAccount(token: string, password: string) {
  const adminClient = createAdminClient();

  // 1. Validate token again
  const { data: tokenData, error: tokenError } = await adminClient
    .from("password_setup_tokens")
    .select("id, user_id, expires_at, used_at, users(email)")
    .eq("token", token)
    .single();

  if (tokenError || !tokenData || tokenData.used_at || new Date(tokenData.expires_at) < new Date()) {
    return { error: "Invalid or expired token." };
  }

  // @ts-ignore
  const email = tokenData.users?.email || (Array.isArray(tokenData.users) ? tokenData.users[0]?.email : null);
  if (!email) {
    return { error: "Associated user not found." };
  }

  // 2. Set password for the existing auth user via Admin API
  // We use updateUserById because the auth user was already created (with the exact same ID as public.users)
  // during the admin user creation step.
  const { data: authUser, error: authError } = await adminClient.auth.admin.updateUserById(tokenData.user_id, {
    password,
    email_confirm: true,
  });

  if (authError) {
    console.error("Failed to update user password in Supabase Auth:", authError);
    return { error: "Failed to set user password: " + authError.message };
  }

  // 3. Mark token as used
  const { error: markTokenError } = await adminClient
    .from("password_setup_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenData.id);

  if (markTokenError) {
    return { error: "Failed to update token." };
  }

  // 4. Set user status to ACTIVE
  const { error: updateUserError } = await adminClient
    .from("users")
    .update({ status: "ACTIVE" })
    .eq("id", tokenData.user_id);

  if (updateUserError) {
    return { error: "Failed to update user status." };
  }

  return { success: true };
}
