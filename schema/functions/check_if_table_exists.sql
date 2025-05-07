-- Function to check if a table exists in the database
-- Returns true if the table exists, false otherwise
CREATE OR REPLACE FUNCTION public.check_if_table_exists(table_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  table_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public'
      AND table_name = check_if_table_exists.table_name
  ) INTO table_exists;
  
  RETURN json_build_object('exists', table_exists);
END;
$$;

-- Grant execute permission to the service role
GRANT EXECUTE ON FUNCTION public.check_if_table_exists(text) TO service_role;

-- Comment on function
COMMENT ON FUNCTION public.check_if_table_exists IS
  'Checks if a table exists in the public schema. Returns {"exists": true/false}.'; 