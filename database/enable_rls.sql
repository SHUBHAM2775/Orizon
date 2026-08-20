-- 1. Enable RLS on the users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Create a SECURITY DEFINER function to securely fetch the current user's role
-- This runs as the table owner and bypasses RLS, avoiding infinite recursion when used in policies.
CREATE OR REPLACE FUNCTION get_my_role() 
RETURNS user_role 
LANGUAGE sql 
SECURITY DEFINER 
SET search_path = public 
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- 3. Policy: Users can read their own row
-- This allows authenticated users to fetch their own profile details
CREATE POLICY "Users can read own row" 
ON public.users 
FOR SELECT 
USING (id = auth.uid());

-- 4. Policy: Admins can read all rows
-- This allows the Admin user list page to fetch all users in the system
CREATE POLICY "Admins can read all rows" 
ON public.users 
FOR SELECT 
USING (get_my_role() = 'ADMIN');

-- 5. Force Supabase's REST API to reload its schema cache so it picks up these new policies
NOTIFY pgrst, 'reload schema';
