-- Re-enable RLS on the email_sources table
ALTER TABLE public.email_sources ENABLE ROW LEVEL SECURITY;

-- Add a function to safely get the user ID from request headers
CREATE OR REPLACE FUNCTION public.get_user_id_from_header()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
AS $$
  -- Simply return what's in the standard supabase-user-id header
  -- which is often set by Supabase client libraries
  SELECT 
    CASE 
      WHEN current_setting('request.headers.supabase-user-id', TRUE) IS NOT NULL 
      THEN current_setting('request.headers.supabase-user-id', TRUE)::uuid
      ELSE NULL::uuid
    END;
$$;

-- Make functions accessible to all roles
GRANT EXECUTE ON FUNCTION public.get_user_id_from_header() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_id_from_header() TO authenticated;

-- Policy that matches on auth.uid OR the user ID from headers
CREATE POLICY "Email sources header policy" ON public.email_sources
  FOR ALL 
  USING (
    user_id = auth.uid() 
    OR 
    user_id = public.get_user_id_from_header()
  );

-- IMPORTANT: Grant permissions to both anonymous and authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sources TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sources TO authenticated; 