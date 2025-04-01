-- Function to upsert a Google token for a user
-- This bypasses JWT auth by using SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.upsert_google_token(
  p_user_id TEXT,
  p_access_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Run with creator's permissions
AS $$
BEGIN
  -- Check if a record already exists
  IF EXISTS (
    SELECT 1 FROM public.google_credentials WHERE user_id = p_user_id
  ) THEN
    -- Update existing record
    UPDATE public.google_credentials 
    SET 
      access_token = p_access_token,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSE
    -- Insert new record
    INSERT INTO public.google_credentials (
      user_id,
      access_token,
      created_at,
      updated_at
    ) VALUES (
      p_user_id,
      p_access_token,
      NOW(),
      NOW()
    );
  END IF;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- Grant execute privileges to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION public.upsert_google_token(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_google_token(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.upsert_google_token(TEXT, TEXT) 
IS 'Upsert a Google token for a user, bypassing JWT verification'; 