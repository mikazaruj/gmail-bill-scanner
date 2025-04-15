-- Create a debugging function to check what headers are being received by Supabase
-- This will help us diagnose issues with the Google ID header

CREATE OR REPLACE FUNCTION public.debug_get_headers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  headers jsonb;
BEGIN
  -- Create a JSON object with the headers we're interested in
  headers := jsonb_build_object(
    'google_user_id', current_setting('request.headers.google_user_id', true),
    'x_application_name', current_setting('request.headers.x-application-name', true),
    'auth_uid', auth.uid()::text
  );
  
  -- Add any custom headers you want to check here
  
  RETURN headers;
END;
$$;

-- Grant permissions for the function
GRANT EXECUTE ON FUNCTION public.debug_get_headers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_get_headers() TO anon; 