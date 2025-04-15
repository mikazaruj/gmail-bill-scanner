-- Fix for email_sources RLS policies
-- Issue: The RLS policy is using current_setting('request.headers.google_user_id') but we need a get_google_user_id() function without parameters

-- Create no-argument get_google_user_id function that extracts the Google ID from request headers
CREATE OR REPLACE FUNCTION public.get_google_user_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  header_value TEXT;
BEGIN
  -- Get the google_user_id from request headers using the current_setting function
  -- This is what's used in the RLS policies
  BEGIN
    header_value := current_setting('request.headers.google_user_id', true);
  EXCEPTION WHEN OTHERS THEN
    -- Default to NULL if header is not present
    header_value := NULL;
  END;
  
  RETURN header_value;
END;
$$;

-- Grant permissions for the function
GRANT EXECUTE ON FUNCTION public.get_google_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_google_user_id() TO anon;

-- Ensure the overloaded function with parameter still works
CREATE OR REPLACE FUNCTION public.get_google_user_id(google_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id UUID;
BEGIN
  SELECT id INTO user_id
  FROM public.users
  WHERE google_user_id = google_id;
  
  RETURN user_id;
END;
$$;

-- Grant permissions for the function
GRANT EXECUTE ON FUNCTION public.get_google_user_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_google_user_id(TEXT) TO anon; 