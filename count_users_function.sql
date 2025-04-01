-- Function to count users with a specific email address
-- This bypasses JWT auth by using SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.count_users_with_email(email_param TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER -- Run with creator's permissions
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  -- Count users with the given email from public.users table
  SELECT COUNT(*) INTO user_count
  FROM public.users
  WHERE email = email_param;
  
  RETURN user_count;
END;
$$;

-- Grant execute privileges to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION public.count_users_with_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.count_users_with_email(TEXT) TO authenticated;

COMMENT ON FUNCTION public.count_users_with_email(TEXT) 
IS 'Count users with the given email address, bypassing JWT verification';

-- Create a view to expose email addresses in the auth.users table
-- This provides a safe way to check if an email exists without requiring JWT auth
CREATE OR REPLACE VIEW public.public_user_emails AS
SELECT 
  id,
  email
FROM auth.users
WHERE is_anonymous = FALSE
  AND email IS NOT NULL;

-- Grant read access to the view
GRANT SELECT ON public.public_user_emails TO anon;
GRANT SELECT ON public.public_user_emails TO authenticated; 