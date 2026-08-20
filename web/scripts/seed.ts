import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase URL or Service Role Key in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const USERS_TO_SEED = [
  { email: "admin@orizon.in", name: "Demo Admin", role: "ADMIN" },
  { email: "analyst@orizon.in", name: "Demo Analyst", role: "ANALYST" },
  { email: "l1@orizon.in", name: "Demo L1 Approver", role: "L1_APPROVER" },
  { email: "l2@orizon.in", name: "Demo L2 Approver", role: "L2_APPROVER" },
];

const DEMO_PASSWORD = "demo";

async function seedUsers() {
  console.log("Seeding demo users...");

  for (const user of USERS_TO_SEED) {
    console.log(`\nProcessing: ${user.email} (${user.role})`);

    // 1. Create or verify user in Supabase Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });

    let userId = authUser?.user?.id;

    if (authError) {
      if ((authError as any).code === "email_exists" || authError.message.includes("already been registered") || authError.message.includes("already exists")) {
        console.log(" -> Auth user already exists. Resolving ID...");
        
        // Update password just in case
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existing = existingUsers.users.find((u) => u.email === user.email);
        
        if (existing) {
          userId = existing.id;
          await supabase.auth.admin.updateUserById(userId, { password: DEMO_PASSWORD });
          console.log(" -> Password reset to demo.");
        } else {
            console.error(" -> Could not resolve existing user ID.");
            continue;
        }
      } else {
        console.error(" -> Error creating auth user:", authError);
        continue;
      }
    } else {
      console.log(" -> Auth user created. ID:", userId);
    }

    if (!userId) continue;

    // 2. Upsert into public.users
    console.log(" -> Upserting into public.users...");
    const { error: dbError } = await supabase.from("users").upsert({
      id: userId,
      email: user.email,
      name: user.name,
      role: user.role,
      status: "ACTIVE",
    }, { onConflict: "email" });

    if (dbError) {
      console.error(" -> Error creating public.users record:", dbError);
    } else {
      console.log(" -> Successfully seeded!");
    }
  }

  console.log("\nDone seeding.");
}

seedUsers();
