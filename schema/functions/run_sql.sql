-- SQL execution function (use with caution, recommended for admin roles only)
CREATE OR REPLACE FUNCTION public.run_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- Add comment to the function
COMMENT ON FUNCTION public.run_sql IS 'Executes raw SQL (use with caution, this function has elevated privileges)';

-- Only grant to authenticated users (in production you might want to restrict this further)
GRANT EXECUTE ON FUNCTION public.run_sql TO authenticated; 