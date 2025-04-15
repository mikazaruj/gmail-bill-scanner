-- Create RPC function to get all tables in the public schema
CREATE OR REPLACE FUNCTION public.get_tables_info()
RETURNS TABLE (
  tablename text,
  tableowner text,
  tablespace text,
  hasindexes boolean,
  hasrules boolean,
  hastriggers boolean,
  rowsecurity boolean
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    t.tablename::text,
    t.tableowner::text,
    t.tablespace::text,
    t.hasindexes,
    t.hasrules,
    t.hastriggers,
    t.rowsecurity
  FROM 
    pg_catalog.pg_tables t
  WHERE 
    t.schemaname = 'public';
END;
$$;

-- Add comment to the function
COMMENT ON FUNCTION public.get_tables_info IS 'Gets information about all tables in the public schema';

-- Grant access to the function
GRANT EXECUTE ON FUNCTION public.get_tables_info TO authenticated;

-- Create RPC function to get all views in the public schema
CREATE OR REPLACE FUNCTION public.get_views_info()
RETURNS TABLE (
  viewname text,
  definition text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    v.viewname::text,
    pg_get_viewdef(v.viewname::regclass, true) as definition
  FROM 
    pg_catalog.pg_views v
  WHERE 
    v.schemaname = 'public';
END;
$$;

-- Add comment to the function
COMMENT ON FUNCTION public.get_views_info IS 'Gets information about all views in the public schema, including their definitions';

-- Grant access to the function
GRANT EXECUTE ON FUNCTION public.get_views_info TO authenticated;

-- Create RPC function to get columns for a specific table
CREATE OR REPLACE FUNCTION public.get_table_columns(table_name text)
RETURNS TABLE (
  column_name text,
  data_type text,
  is_nullable text,
  column_default text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    c.column_name::text,
    c.data_type::text,
    c.is_nullable::text,
    c.column_default::text
  FROM 
    information_schema.columns c
  WHERE 
    c.table_schema = 'public' AND 
    c.table_name = table_name
  ORDER BY 
    c.ordinal_position;
END;
$$;

-- Add comment to the function
COMMENT ON FUNCTION public.get_table_columns IS 'Gets column information for a specific table in the public schema';

-- Grant access to the function
GRANT EXECUTE ON FUNCTION public.get_table_columns TO authenticated;

-- Create function to check if views match their expected definitions
CREATE OR REPLACE FUNCTION public.verify_views_match(view_definitions jsonb)
RETURNS TABLE (
  viewname text,
  matches boolean,
  current_definition text,
  expected_definition text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  view_record record;
  current_def text;
  expected_def text;
BEGIN
  FOR view_record IN 
    SELECT 
      v.viewname::text
    FROM 
      pg_catalog.pg_views v
    WHERE 
      v.schemaname = 'public'
  LOOP
    -- Get current definition
    SELECT pg_get_viewdef(view_record.viewname::regclass, true) INTO current_def;
    
    -- Get expected definition from the input parameter
    SELECT view_definitions->>view_record.viewname INTO expected_def;
    
    viewname := view_record.viewname;
    current_definition := current_def;
    expected_definition := expected_def;
    matches := (current_def = expected_def);
    
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$;

-- Add comment to the function
COMMENT ON FUNCTION public.verify_views_match IS 'Compares current view definitions with expected definitions';

-- Grant access to the function
GRANT EXECUTE ON FUNCTION public.verify_views_match TO authenticated;

-- Create function to verify table schemas
CREATE OR REPLACE FUNCTION public.verify_table_schemas(table_schemas jsonb)
RETURNS TABLE (
  tablename text,
  column_name text,
  matches boolean,
  current_type text,
  expected_type text,
  is_nullable_matches boolean
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  table_record record;
  column_record record;
  table_schema jsonb;
  expected_column jsonb;
BEGIN
  FOR table_record IN 
    SELECT 
      t.tablename::text
    FROM 
      pg_catalog.pg_tables t
    WHERE 
      t.schemaname = 'public'
  LOOP
    -- Get expected schema for this table
    table_schema := table_schemas->table_record.tablename;
    
    -- Skip if no schema definition provided for this table
    IF table_schema IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Check each column in the actual table
    FOR column_record IN 
      SELECT 
        c.column_name::text,
        c.data_type::text,
        c.is_nullable::text
      FROM 
        information_schema.columns c
      WHERE 
        c.table_schema = 'public' AND 
        c.table_name = table_record.tablename
    LOOP
      -- Get expected column definition
      expected_column := table_schema->column_record.column_name;
      
      IF expected_column IS NOT NULL THEN
        tablename := table_record.tablename;
        column_name := column_record.column_name;
        current_type := column_record.data_type;
        expected_type := expected_column->>'data_type';
        matches := (column_record.data_type = (expected_column->>'data_type'));
        is_nullable_matches := (column_record.is_nullable = (expected_column->>'is_nullable'));
        
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN;
END;
$$;

-- Add comment to the function
COMMENT ON FUNCTION public.verify_table_schemas IS 'Verifies that table schemas match expected definitions';

-- Grant access to the function
GRANT EXECUTE ON FUNCTION public.verify_table_schemas TO authenticated; 