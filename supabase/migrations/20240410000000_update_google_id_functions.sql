-- Update the link_google_user function to match the exact database schema
CREATE OR REPLACE FUNCTION public.link_google_user(
  p_google_id TEXT,
  p_email TEXT,
  p_name TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_auth_id UUID;
BEGIN
  -- First try to find user by Google ID
  SELECT id INTO v_user_id
  FROM public.users
  WHERE google_user_id = p_google_id;
  
  -- If found, return the user ID
  IF v_user_id IS NOT NULL THEN
    -- Update the last time we saw this user
    UPDATE public.users
    SET updated_at = now()
    WHERE id = v_user_id;
    
    RETURN v_user_id;
  END IF;
  
  -- Try to find user by email
  SELECT id INTO v_user_id
  FROM public.users
  WHERE email = p_email;
  
  -- If found by email, update with Google ID and return
  IF v_user_id IS NOT NULL THEN
    -- Update with Google ID
    UPDATE public.users
    SET 
      google_user_id = p_google_id,
      updated_at = now()
    WHERE id = v_user_id;
    
    RETURN v_user_id;
  END IF;
  
  -- If not found, search in auth.users to see if this user exists there
  SELECT id INTO v_auth_id
  FROM auth.users
  WHERE email = p_email;
  
  IF v_auth_id IS NOT NULL THEN
    -- Try to create the user in public.users with the existing auth ID
    BEGIN
      INSERT INTO public.users (
        id,
        email,
        auth_id,
        created_at,
        updated_at,
        google_user_id,
        plan,
        quota_bills_monthly,
        quota_bills_used
      )
      VALUES (
        v_auth_id,
        p_email,
        v_auth_id::text,
        now(),
        now(),
        p_google_id,
        'free',
        50,
        0
      )
      RETURNING id INTO v_user_id;
      
      RETURN v_user_id;
    EXCEPTION WHEN OTHERS THEN
      -- If that failed, try finding or creating an auth user
      NULL;
    END;
  END IF;
  
  -- Create a new auth user entry (this handle will have to be done in the application code)
  -- For now, return null
  RETURN NULL;
END;
$$;

-- Grant permissions for the function
GRANT EXECUTE ON FUNCTION public.link_google_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_google_user TO anon;

-- Update get_google_user_id function
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
GRANT EXECUTE ON FUNCTION public.get_google_user_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_google_user_id TO anon;

-- Update set_google_user_id to ensure compatibility with null inputs
CREATE OR REPLACE FUNCTION public.set_google_user_id(user_id UUID, google_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_user JSONB;
BEGIN
  -- Skip update if google_id is null
  IF google_id IS NULL THEN
    SELECT to_jsonb(users.*)
    FROM public.users
    WHERE id = user_id
    INTO updated_user;
    
    RETURN updated_user;
  END IF;

  -- Update the user's google_user_id if it doesn't already have one
  UPDATE public.users
  SET 
    google_user_id = google_id,
    updated_at = now()
  WHERE 
    id = user_id 
    AND (google_user_id IS NULL OR google_user_id = '')
  RETURNING to_jsonb(users.*) INTO updated_user;
  
  -- If no update was made (user might not exist or already has a Google ID)
  IF updated_user IS NULL THEN
    -- Check if user exists
    SELECT to_jsonb(users.*)
    FROM public.users
    WHERE id = user_id
    INTO updated_user;
    
    -- Return null if user doesn't exist
    IF updated_user IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;
  
  RETURN updated_user;
END;
$$;

-- Create index for efficient Google ID lookups if it doesn't exist
CREATE INDEX IF NOT EXISTS users_google_user_id_idx ON public.users (google_user_id); 