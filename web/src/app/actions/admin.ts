"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type DbUserRole } from "@/lib/auth-utils";
import { sendActivationEmail } from "@/lib/email";
import crypto from "crypto";

export async function createUserAction(email: string, name: string, role: string) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  try {
    // 1. Verify caller is an Admin
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return { error: "Unauthorized" };
    }

    const { data: callerData } = await supabase
      .from("users")
      .select("id, role")
      .eq("email", authUser.email)
      .single();

    if (!callerData || callerData.role !== "ADMIN") {
      return { error: "Forbidden: Admin access required." };
    }

    // 2. Insert into `users` table
    const dbRole = role.toUpperCase().replace("-", "_") as DbUserRole;
    
    const { data: newUser, error: insertError } = await adminClient
      .from("users")
      .insert({
        email,
        name,
        role: dbRole,
        status: "PENDING_SETUP",
        created_by: callerData.id,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") { // Unique violation
        return { error: "User with this email already exists." };
      }
      console.error("Error creating user:", insertError);
      return { error: "Failed to create user." };
    }

    // 3. Generate token and insert into `password_setup_tokens`
    const token = crypto.randomBytes(32).toString("hex");
    // 48 hours from now
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { error: tokenError } = await adminClient
      .from("password_setup_tokens")
      .insert({
        user_id: newUser.id,
        token,
        expires_at: expiresAt,
      });

    if (tokenError) {
      console.error("Error inserting token:", tokenError);
      return { error: "Failed to create setup token." };
    }

    // 4. Audit Log
    await adminClient
      .from("audit_logs")
      .insert({
        actor_id: callerData.id,
        action: "USER_CREATED",
        target_type: "user",
        target_id: newUser.id,
        after_value: {
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          status: newUser.status,
        },
      });

    // 5. Send Email
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const activationLink = `${appUrl}/?token=${token}`;
    
    const emailResult = await sendActivationEmail({
      to: email,
      activationLink,
    });

    if (!emailResult.success) {
      console.error("Warning: User created but email failed to send.");
      // We still return success but maybe warn, or just return success
    }

    return { success: true };
  } catch (err) {
    console.error("Unexpected error in createUserAction:", err);
    return { error: "An unexpected error occurred." };
  }
}
