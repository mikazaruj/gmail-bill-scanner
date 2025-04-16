-- Check the current schema of the user_preferences table
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_schema = 'public' 
    AND table_name = 'user_preferences'
ORDER BY 
    ordinal_position; 