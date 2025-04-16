-- Function to check if a view exists in the public schema
CREATE OR REPLACE FUNCTION public.check_if_view_exists(view_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  view_exists boolean;
  result json;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.views 
    WHERE table_schema = 'public' 
    AND table_name = view_name
  ) INTO view_exists;
  
  result := json_build_object('exists', view_exists);
  RETURN result;
END;
$$;

-- Add comment to the function
COMMENT ON FUNCTION public.check_if_view_exists IS 'Checks if a view exists in the public schema';

-- Grant access to the function
GRANT EXECUTE ON FUNCTION public.check_if_view_exists TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_if_view_exists TO anon; 