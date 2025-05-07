-- Function to get Supabase user ID from Google ID
-- Uses the new google_identity_map_view for more efficient lookup

CREATE OR REPLACE FUNCTION public.get_supabase_user_id_from_google_id(p_google_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id UUID;
BEGIN
  -- Use the google_identity_map_view to look up the Supabase user ID
  SELECT supabase_user_id INTO user_id
  FROM public.google_identity_map_view
  WHERE google_user_id = p_google_id;
  
  RETURN user_id;
EXCEPTION WHEN OTHERS THEN
  -- Fallback to querying the users table directly if view doesn't exist
  BEGIN
    SELECT id INTO user_id
    FROM public.users
    WHERE google_user_id = p_google_id;
    
    RETURN user_id;
  EXCEPTION WHEN OTHERS THEN
    -- Return null if any error occurs
    RETURN NULL;
  END;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_supabase_user_id_from_google_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supabase_user_id_from_google_id(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_supabase_user_id_from_google_id(TEXT) TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_supabase_user_id_from_google_id IS 'Gets the Supabase user ID from a Google user ID using the google_identity_map_view'; 