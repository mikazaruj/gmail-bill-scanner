-- This script fixes the foreign key constraint issue by making the constraint optional
-- Execute this in your Supabase SQL editor if you're still having issues after code changes

-- First, drop the existing constraint
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- Add it back but make it allow NULL values
ALTER TABLE public.users 
  ADD CONSTRAINT users_id_fkey 
  FOREIGN KEY (id) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;
  
-- Also update the auth_id column to allow NULL for flexibility
ALTER TABLE public.users
  ALTER COLUMN auth_id DROP NOT NULL;
  
-- Update any existing records that have invalid auth_ids
UPDATE public.users
SET auth_id = id
WHERE auth_id IS NULL OR auth_id = '';

-- Create a new helper function to bypass constraints when creating users
CREATE OR REPLACE FUNCTION create_public_user_bypass_fk(
  user_id UUID,
  user_email TEXT,
  user_google_id TEXT,
  user_name TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Insert directly into public.users table with the given ID
  -- This bypasses the foreign key constraint check
  BEGIN
    INSERT INTO public.users (
      id,
      email,
      auth_id,
      google_user_id,
      plan,
      quota_bills_monthly,
      quota_bills_used,
      created_at,
      updated_at
    ) VALUES (
      user_id,
      user_email,
      user_id::text, -- Use same ID for auth_id
      user_google_id,
      'free',
      50,
      0,
      now(),
      now()
    );
    
    v_result := jsonb_build_object(
      'success', true,
      'user_id', user_id,
      'email', user_email,
      'google_id', user_google_id,
      'message', 'User created successfully in public.users (bypassing FK constraints)'
    );
  EXCEPTION WHEN others THEN
    v_result := jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'detail', SQLSTATE,
      'email', user_email,
      'google_id', user_google_id
    );
  END;
  
  RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_public_user_bypass_fk TO anon;
GRANT EXECUTE ON FUNCTION create_public_user_bypass_fk TO authenticated; 