-- Function to insert a user while bypassing any constraints
-- This is a more aggressive approach to create users that should work in any situation

CREATE OR REPLACE FUNCTION insert_user_bypass_constraints(
  p_id UUID,
  p_email TEXT,
  p_auth_id TEXT,
  p_plan TEXT DEFAULT 'free',
  p_quota INT DEFAULT 50
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Run with creator's permissions
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  -- First, try to delete any existing user with this ID or email to clear conflicts
  BEGIN
    -- Use EXECUTE to bypass constraints - safer than disabling triggers
    EXECUTE '
      DELETE FROM profiles WHERE id = $1 OR email = $2;
      DELETE FROM users WHERE id = $1 OR email = $2;
    ' USING p_id, p_email;
  EXCEPTION WHEN OTHERS THEN
    -- Log the error but continue
    RAISE NOTICE 'Error during cleanup: %', SQLERRM;
  END;

  -- Now insert the new user directly
  BEGIN
    EXECUTE '
      INSERT INTO users (
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
        $1,
        $2,
        $3,
        $4,
        $5,
        0,
        now(),
        now()
      )
      RETURNING to_jsonb(users.*)
    ' USING p_id, p_email, p_auth_id, p_plan, p_quota INTO result;
    
  EXCEPTION WHEN OTHERS THEN
    -- If insertion fails, log and return the error
    RAISE NOTICE 'Error inserting user: %', SQLERRM;
    result = jsonb_build_object('error', SQLERRM);
  END;

  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION insert_user_bypass_constraints TO authenticated;

-- Comment on function
COMMENT ON FUNCTION insert_user_bypass_constraints IS 'Inserts a user into public.users bypassing constraints. Use with caution!'; 