-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.check_user_exists_by_email(text);

-- Function to check if a user exists by email
CREATE OR REPLACE FUNCTION public.check_user_exists_by_email(p_email text)
RETURNS TABLE (
  exists boolean,
  user_id uuid
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- First try public.users table
  SELECT id INTO v_user_id
  FROM public.users
  WHERE email = p_email
  LIMIT 1;
  
  -- If not found, try auth.users table
  IF v_user_id IS NULL THEN
    SELECT id::uuid INTO v_user_id
    FROM auth.users
    WHERE email = p_email
    LIMIT 1;
  END IF;
  
  -- Return result
  IF v_user_id IS NOT NULL THEN
    RETURN QUERY SELECT true::boolean, v_user_id;
  ELSE
    RETURN QUERY SELECT false::boolean, NULL::uuid;
  END IF;
END;
$$;

-- Grant execute permission to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.check_user_exists_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_exists_by_email(text) TO anon;

-- Create a more comprehensive view for user data
DROP VIEW IF EXISTS public.user_emails;
CREATE OR REPLACE VIEW public.user_emails AS
SELECT 
  u.id,
  u.email,
  u.created_at,
  p.display_name,
  p.avatar_url
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id;

-- Grant select permission on the view
GRANT SELECT ON public.user_emails TO authenticated;
GRANT SELECT ON public.user_emails TO anon; 