-- Alternative policy if the direct auth.uid() comparison doesn't work
-- This policy uses both standard and custom claim JWT methods for checking user identity

-- Re-enable RLS on email_sources table
ALTER TABLE public.email_sources ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows operations if:
-- 1. user_id matches auth.uid() directly
-- 2. OR anon users can access their own data via request header
CREATE POLICY "Email sources alternative policy" ON public.email_sources
  FOR ALL 
  USING (
    (user_id::text = auth.uid()::text)
    OR
    (
      -- For anonymous access with headers
      auth.role() = 'anon' AND 
      user_id::text = current_setting('request.jwt.claims.sub', true)::text
    )
  );

-- Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sources TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sources TO authenticated; 