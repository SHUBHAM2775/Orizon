-- Grant usage on schema public
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant select, insert, update on all tables to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant select on all tables to anon (optional, depending on your needs, but good for public read)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Apply these defaults to future tables as well
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;

-- Force Supabase's REST API (PostgREST) to reload its schema cache
NOTIFY pgrst, 'reload schema';
