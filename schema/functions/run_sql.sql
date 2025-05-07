-- Function to run SQL statements from JavaScript
-- This is a privileged function that should only be used for admin operations
CREATE OR REPLACE FUNCTION public.run_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- Grant execute permission to the service role only
GRANT EXECUTE ON FUNCTION public.run_sql(text) TO service_role;

-- Comment on function
COMMENT ON FUNCTION public.run_sql IS
  'Executes a SQL statement with security definer privileges. Use with caution!'; 