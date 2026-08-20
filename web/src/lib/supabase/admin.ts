import { createClient } from "@supabase/supabase-js";

/**
 * An admin Supabase client instantiated with the service role key.
 * 
 * WARNING: This client bypasses Row Level Security (RLS) entirely.
 * It should ONLY be used in secure Server Actions or Route Handlers
 * for operations that require elevated privileges, such as validating
 * tokens and creating accounts during the activation flow.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
