-- Create a function to insert a user into both auth.users and public.users
-- This uses SECURITY DEFINER to elevate privileges for the RPC call
CREATE OR REPLACE FUNCTION public.create_auth_and_public_user(
  user_email TEXT,
  google_id TEXT,
  user_name TEXT DEFAULT NULL,
  avatar_url TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_auth_id UUID;
  v_hashed_password TEXT;
  v_user_metadata JSONB;
  v_result JSONB;
BEGIN
  -- Generate a secure random password hash (actual password doesn't matter, we'll use Google auth)
  v_hashed_password := crypt(gen_random_uuid()::text, gen_salt('bf'));
  
  -- Create user metadata with Google info
  v_user_metadata := jsonb_build_object(
    'provider', 'google',
    'google_user_id', google_id,
    'email_verified', true
  );
  
  -- Add name and avatar if provided
  IF user_name IS NOT NULL THEN
    v_user_metadata := v_user_metadata || jsonb_build_object(
      'name', user_name,
      'full_name', user_name
    );
  END IF;
  
  IF avatar_url IS NOT NULL THEN
    v_user_metadata := v_user_metadata || jsonb_build_object(
      'avatar_url', avatar_url,
      'picture', avatar_url
    );
  END IF;
  
  -- First check if user already exists by email
  SELECT id INTO v_auth_id FROM auth.users WHERE email = user_email;
  
  IF v_auth_id IS NOT NULL THEN
    -- User exists, update their metadata with Google info
    UPDATE auth.users
    SET 
      raw_user_meta_data = v_user_metadata,
      raw_app_meta_data = jsonb_build_object('provider', 'google', 'google_user_id', google_id),
      updated_at = now()
    WHERE id = v_auth_id;
    
    -- Check and update public.users record
    IF EXISTS (SELECT 1 FROM public.users WHERE id = v_auth_id) THEN
      -- Update existing public user record
      UPDATE public.users
      SET 
        google_user_id = google_id,
        updated_at = now()
      WHERE id = v_auth_id;
    ELSE
      -- Create public user record for existing auth user
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
      ) VALUES (
        v_auth_id,
        user_email,
        v_auth_id::text,
        'free',
        50,
        0,
        now(),
        now(),
        google_id
      );
    END IF;
    
    v_result := jsonb_build_object(
      'success', true,
      'user_id', v_auth_id,
      'email', user_email,
      'google_id', google_id,
      'created', false,
      'updated', true
    );
  ELSE
    -- Create new user in auth.users
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new
    ) VALUES (
      (SELECT instance_id FROM auth.instances LIMIT 1),
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      user_email,
      v_hashed_password,
      now(),
      now(),
      jsonb_build_object('provider', 'google', 'google_user_id', google_id),
      v_user_metadata,
      now(),
      now(),
      '',
      '',
      ''
    )
    RETURNING id INTO v_auth_id;
    
    -- Create the user in public.users table
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
    ) VALUES (
      v_auth_id,
      user_email,
      v_auth_id::text,
      'free',
      50,
      0,
      now(),
      now(),
      google_id
    );
    
    v_result := jsonb_build_object(
      'success', true,
      'user_id', v_auth_id,
      'email', user_email,
      'google_id', google_id,
      'created', true,
      'updated', false
    );
  END IF;
  
  RETURN v_result;
  
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'email', user_email,
    'google_id', google_id
  );
END;
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION public.create_auth_and_public_user TO anon;
GRANT EXECUTE ON FUNCTION public.create_auth_and_public_user TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.create_auth_and_public_user IS 'Creates or updates a user in both auth.users and public.users tables with Google account information'; 