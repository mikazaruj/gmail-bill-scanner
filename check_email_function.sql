-- Function to check if an email exists in the public.users table
CREATE OR REPLACE FUNCTION public.check_email_exists(email_to_check TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with the privileges of the function creator
AS $$
DECLARE
  user_exists BOOLEAN;
BEGIN
  -- Check if the email exists in public.users table
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE email = email_to_check
  ) INTO user_exists;
  
  RETURN user_exists;
END;
$$;

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO authenticated;

COMMENT ON FUNCTION public.check_email_exists(TEXT) IS 'Check if an email exists in public.users without requiring JWT verification';

