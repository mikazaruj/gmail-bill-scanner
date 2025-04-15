-- Create debug function that returns all relevant information
CREATE OR REPLACE FUNCTION public.debug_auth_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  header_names text[];
  i text;
BEGIN
  -- Collect standard auth info
  result = jsonb_build_object(
    'auth_uid', auth.uid(),
    'auth_role', auth.role(),
    'timestamp', now()
  );
  
  -- Add headers we care about
  result = result || jsonb_build_object(
    'google_user_id_header', current_setting('request.headers.google_user_id', true),
    'supabase_user_id_header', current_setting('request.headers.supabase-user-id', true),
    'authorization_header', substring(current_setting('request.headers.authorization', true), 1, 20) || '...'
  );

  RETURN result;
END;
$$;

-- Make function accessible to anonymous users
GRANT EXECUTE ON FUNCTION public.debug_auth_info() TO anon;
GRANT EXECUTE ON FUNCTION public.debug_auth_info() TO authenticated; 