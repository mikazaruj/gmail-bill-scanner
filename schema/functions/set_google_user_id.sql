CREATE OR REPLACE FUNCTION public.set_google_user_id(
  user_id UUID,
  google_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_user JSONB;
BEGIN
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