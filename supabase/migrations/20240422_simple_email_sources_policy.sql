-- Re-enable RLS on email_sources table
ALTER TABLE public.email_sources ENABLE ROW LEVEL SECURITY;

-- Create a simple policy for email_sources that directly compares user_id 
-- We use a text conversion to ensure consistent comparison
CREATE POLICY "Email sources direct user id match" ON public.email_sources
  FOR ALL 
  USING (
    -- Direct user_id equality check
    user_id::text = auth.uid()::text
  );

-- Comment to explain the policy
COMMENT ON POLICY "Email sources direct user id match" ON public.email_sources
  IS 'Simple policy that matches rows where user_id equals the authenticated user ID';

-- Grant appropriate permissions to ensure anonymous access works
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sources TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sources TO authenticated; 