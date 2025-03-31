-- Create or replace the soft_delete_user function
CREATE OR REPLACE FUNCTION public.soft_delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _user_id uuid;
BEGIN
  -- Get the current user ID
  _user_id := auth.uid();
  
  -- Check if user exists
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = _user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Update the user record with deleted_at timestamp
  UPDATE public.users
  SET deleted_at = now()
  WHERE id = _user_id;
  
  -- You can also add additional cleanup here if needed
  -- For example, revoking refresh tokens, etc.
  
  RETURN;
END;
$$; 