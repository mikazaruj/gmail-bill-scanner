-- Re-enable RLS on the email_sources table
ALTER TABLE public.email_sources ENABLE ROW LEVEL SECURITY;

-- Simple policy with explicit focus on the user_id column
CREATE POLICY "Email sources user_id policy" ON public.email_sources
  FOR ALL 
  USING (
    -- Simple equality check without type casting to avoid potential issues
    user_id = auth.uid()
  );

-- IMPORTANT: Grant permissions to both anonymous and authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sources TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sources TO authenticated;

-- Add a comment explaining the permission model
COMMENT ON TABLE public.email_sources IS 'Email sources table with RLS based on user_id'; 