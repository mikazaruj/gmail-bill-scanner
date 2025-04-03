-- Migration: Add google_user_id column to users table
-- This migration adds the google_user_id column which is required for Google OAuth integration

-- Add column if it doesn't exist
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS google_user_id TEXT;

-- Add index for better query performance
DROP INDEX IF EXISTS idx_users_google_user_id;
CREATE INDEX idx_users_google_user_id ON public.users(google_user_id);

-- Add a comment explaining the column's purpose
COMMENT ON COLUMN public.users.google_user_id IS 'Google user ID from OAuth authentication, used for account linking';

-- Update RLS policy to allow access to google_user_id
DROP POLICY IF EXISTS "Users can view their own google_user_id" ON public.users;
CREATE POLICY "Users can view their own google_user_id" 
ON public.users
FOR SELECT
USING (auth.uid() = id);

-- Update RLS policy to allow updating google_user_id through RPC function
DROP POLICY IF EXISTS "Enable update via create_public_user function" ON public.users;
CREATE POLICY "Enable update via create_public_user function" 
ON public.users
FOR UPDATE 
USING (true)
WITH CHECK (true);
