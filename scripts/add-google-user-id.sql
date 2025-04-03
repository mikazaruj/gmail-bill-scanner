-- Migration to add google_user_id column to users table

-- First, check if the column already exists to avoid errors
DO $$
BEGIN
    -- Check if the column exists
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'google_user_id'
    ) THEN
        -- Add the column if it doesn't exist
        ALTER TABLE public.users ADD COLUMN google_user_id TEXT;
        
        -- Add an index to improve query performance
        CREATE INDEX idx_users_google_user_id ON public.users(google_user_id);
        
        -- Add a comment to explain the purpose of the column
        COMMENT ON COLUMN public.users.google_user_id IS 'The user ID from Google OAuth, used for linking accounts';
    END IF;
END
$$;

-- Verify the column exists after the migration
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_schema = 'public'
AND 
    table_name = 'users'
AND 
    column_name = 'google_user_id';
