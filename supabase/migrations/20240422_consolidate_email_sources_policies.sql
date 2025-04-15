-- Consolidate email_sources policies
-- First drop all existing policies
DROP POLICY IF EXISTS "Users can view their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Users can insert their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Users can update their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Users can delete their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Users can manage their own email sources with Google ID" ON public.email_sources;
-- Drop any other policies that might exist
DROP POLICY IF EXISTS "Users can access their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Authenticated users can access their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Email sources are accessible by owner" ON public.email_sources;

-- Create a single consolidated policy for ALL operations
CREATE POLICY "Users can manage their own email sources" ON public.email_sources
  FOR ALL 
  USING (
    -- Auth-based access (when user is logged in with JWT)
    auth.uid()::text = user_id::text 
    OR 
    -- Google ID-based access (for extension with Google Identity)
    user_id IN (
      SELECT id FROM public.users 
      WHERE google_user_id = current_setting('request.headers.google_user_id'::text, true)
    )
  );

-- Let's also log some debug info about the original request to help diagnose
CREATE OR REPLACE FUNCTION public.debug_request_details()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  headers jsonb;
  request_info jsonb;
BEGIN
  -- Capture all possible header variants that might contain our Google ID
  headers := jsonb_build_object(
    'google_user_id', current_setting('request.headers.google_user_id', true),
    'x_application_name', current_setting('request.headers.x-application-name', true),
    'auth_uid', auth.uid()::text,
    'auth_role', current_setting('request.jwt.claims.role', true),
    'request_method', current_setting('request.method', true),
    'request_path', current_setting('request.path', true)
  );
  
  -- Check if we can find any users matching the header
  SELECT jsonb_build_object(
    'found_user', (
      SELECT count(*) > 0 
      FROM public.users 
      WHERE google_user_id = current_setting('request.headers.google_user_id'::text, true)
    )
  ) INTO request_info;
  
  RETURN jsonb_build_object(
    'headers', headers,
    'request_info', request_info
  );
END;
$$;

-- Grant permissions for the function
GRANT EXECUTE ON FUNCTION public.debug_request_details() TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_request_details() TO anon;

-- Add comment to explain this migration
COMMENT ON POLICY "Users can manage their own email sources" ON public.email_sources
  IS 'Consolidated policy that allows users to manage their own email sources via either auth.uid or Google ID in request headers'; 