-- Drop unused functions
DROP FUNCTION IF EXISTS public.check_email_exists(text);
DROP FUNCTION IF EXISTS public.check_user_exists_by_email(text);
DROP FUNCTION IF EXISTS public.count_users_with_email(text);
DROP FUNCTION IF EXISTS public.create_public_user(uuid, text);
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.increment_bills_used();

-- Keep and update the functions we actually use

-- Function to bypass constraints when inserting users
CREATE OR REPLACE FUNCTION public.insert_user_bypass_constraints(
  p_id uuid,
  p_email text,
  p_auth_id uuid,
  p_plan text DEFAULT 'free',
  p_quota integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Delete any existing user with the same ID or email (if exists)
  DELETE FROM public.users WHERE id = p_id OR email = p_email;
  
  -- Insert the new user
  INSERT INTO public.users (
    id,
    email,
    auth_id,
    plan,
    quota_bills_monthly,
    quota_bills_used,
    created_at,
    updated_at
  ) VALUES (
    p_id,
    p_email,
    p_auth_id,
    p_plan,
    p_quota,
    0,
    NOW(),
    NOW()
  )
  RETURNING jsonb_build_object(
    'id', id,
    'email', email,
    'plan', plan,
    'quota_bills_monthly', quota_bills_monthly,
    'created_at', created_at
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Function to safely upsert Google tokens
CREATE OR REPLACE FUNCTION public.upsert_google_token(
  p_user_id uuid,
  p_access_token text,
  p_refresh_token text DEFAULT NULL,
  p_expires_at timestamp with time zone DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete any existing token for this user
  DELETE FROM public.google_credentials WHERE user_id = p_user_id;
  
  -- Insert new token
  INSERT INTO public.google_credentials (
    user_id,
    access_token,
    refresh_token,
    expires_at,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_access_token,
    COALESCE(p_refresh_token, p_access_token),
    COALESCE(p_expires_at, NOW() + interval '1 hour'),
    NOW(),
    NOW()
  );
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

-- Grant appropriate permissions
GRANT EXECUTE ON FUNCTION public.insert_user_bypass_constraints(uuid, text, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_google_token(uuid, text, text, timestamp with time zone) TO authenticated; 