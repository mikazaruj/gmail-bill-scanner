-- Function to create a user in public.users bypassing RLS
-- This allows our extension to create users without hitting RLS issues

CREATE OR REPLACE FUNCTION create_public_user(
  user_id UUID,
  user_email TEXT,
  user_auth_id TEXT,
  user_plan TEXT DEFAULT 'free',
  user_quota INT DEFAULT 50
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- This makes the function run with the privileges of the creator
SET search_path = public
AS $$
DECLARE
  new_user JSONB;
BEGIN
  -- Insert the user into the public.users table
  INSERT INTO public.users (
    id, 
    email, 
    auth_id, 
    plan, 
    quota_bills_monthly, 
    quota_bills_used,
    created_at,
    updated_at
  )
  VALUES (
    user_id,
    user_email,
    user_auth_id,
    user_plan,
    user_quota,
    0,
    now(),
    now()
  )
  RETURNING to_jsonb(users.*) INTO new_user;
  
  RETURN new_user;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_public_user TO authenticated;

-- Comment on function
COMMENT ON FUNCTION create_public_user IS 'Creates a user record in public.users bypassing RLS policies. Used by the Chrome extension.'; 