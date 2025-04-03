-- Update create_public_user function to handle existing users with upsert
CREATE OR REPLACE FUNCTION create_public_user(
  user_id UUID,
  user_email TEXT,
  user_auth_id TEXT,
  user_plan TEXT DEFAULT 'free',
  user_quota INT DEFAULT 50,
  user_google_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- This makes the function run with the privileges of the creator
SET search_path = public
AS $$
DECLARE
  new_user JSONB;
BEGIN
  -- Insert or update the user in the public.users table
  INSERT INTO public.users (
    id, 
    email, 
    auth_id, 
    plan, 
    quota_bills_monthly, 
    quota_bills_used,
    created_at,
    updated_at,
    google_user_id
  )
  VALUES (
    user_id,
    user_email,
    user_auth_id,
    user_plan,
    user_quota,
    0,
    now(),
    now(),
    user_google_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    auth_id = EXCLUDED.auth_id,
    plan = COALESCE(public.users.plan, EXCLUDED.plan),
    quota_bills_monthly = COALESCE(public.users.quota_bills_monthly, EXCLUDED.quota_bills_monthly),
    updated_at = now(),
    -- Always set google_user_id if provided in the function call
    google_user_id = CASE 
      WHEN EXCLUDED.google_user_id IS NOT NULL THEN EXCLUDED.google_user_id 
      ELSE public.users.google_user_id 
    END
  RETURNING to_jsonb(users.*) INTO new_user;
  
  RETURN new_user;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_public_user TO authenticated;

-- Comment on function
COMMENT ON FUNCTION create_public_user IS 'Creates or updates a user record in public.users using upsert. Always sets google_user_id if provided.';

-- Drop the redundant function if it exists
DROP FUNCTION IF EXISTS public.insert_user_bypass_constraints(uuid, text, uuid, text, integer); 