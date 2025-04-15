CREATE OR REPLACE FUNCTION public.create_auth_and_public_user(
  p_email TEXT,
  p_google_id TEXT,
  p_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auth_id UUID;
  v_hashed_password TEXT;
  v_user_metadata JSONB;
  v_result JSONB;
BEGIN
  -- Generate a secure random password hash
  v_hashed_password := crypt(gen_random_uuid()::text, gen_salt('bf'));
  
  -- Create user metadata with Google info
  v_user_metadata := jsonb_build_object(
    'provider', 'google',
    'google_user_id', p_google_id,
    'email_verified', true
  );
  
  -- Add name and avatar if provided
  IF p_name IS NOT NULL THEN
    v_user_metadata := v_user_metadata || jsonb_build_object(
      'name', p_name,
      'full_name', p_name
    );
  END IF;
  
  IF p_avatar_url IS NOT NULL THEN
    v_user_metadata := v_user_metadata || jsonb_build_object(
      'avatar_url', p_avatar_url,
      'picture', p_avatar_url
    );
  END IF;
  
  -- First check if user already exists by email
  SELECT id INTO v_auth_id FROM auth.users WHERE email = p_email;
  
  IF v_auth_id IS NULL THEN
    -- Create new user in auth.users FIRST
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
      p_email,
      v_hashed_password,
      now(),
      now(),
      jsonb_build_object('provider', 'google', 'google_user_id', p_google_id),
      v_user_metadata,
      now(),
      now(),
      '',
      '',
      ''
    )
    RETURNING id INTO v_auth_id;
    
    -- Now create the user in public.users table with the SAME ID
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
      p_email,
      v_auth_id::text,
      'free',
      50,
      0,
      now(),
      now(),
      p_google_id
    );
    
    v_result := jsonb_build_object(
      'success', true,
      'user_id', v_auth_id,
      'email', p_email,
      'google_id', p_google_id,
      'created', true,
      'updated', false
    );
  ELSE
    -- User exists, update their metadata with Google info
    UPDATE auth.users
    SET 
      raw_user_meta_data = v_user_metadata,
      raw_app_meta_data = jsonb_build_object('provider', 'google', 'google_user_id', p_google_id),
      updated_at = now()
    WHERE id = v_auth_id;
    
    -- Check and update public.users record
    IF EXISTS (SELECT 1 FROM public.users WHERE id = v_auth_id) THEN
      -- Update existing public user record
      UPDATE public.users
      SET 
        google_user_id = p_google_id,
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
        p_email,
        v_auth_id::text,
        'free',
        50,
        0,
        now(),
        now(),
        p_google_id
      );
    END IF;
    
    v_result := jsonb_build_object(
      'success', true,
      'user_id', v_auth_id,
      'email', p_email,
      'google_id', p_google_id,
      'created', false,
      'updated', true
    );
  END IF;
  
  RETURN v_result;
  
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'email', p_email,
    'google_id', p_google_id
  );
END;
$$; 