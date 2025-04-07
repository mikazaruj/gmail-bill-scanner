-- Test script for Google ID functions
-- Run this in the Supabase SQL Editor to verify functions are working

-- First check if the functions exist
SELECT 
  routine_name,
  routine_type,
  data_type
FROM 
  information_schema.routines
WHERE 
  routine_name IN ('set_google_user_id', 'check_email_exists')
  AND routine_schema = 'public';

-- Test check_email_exists function
-- Replace with a known email in your system
SELECT check_email_exists('test@example.com') AS email_exists;

-- Get a sample user to test with
-- This query finds a user without a Google ID to test with
SELECT id, email, google_user_id 
FROM public.users 
WHERE google_user_id IS NULL OR google_user_id = ''
LIMIT 1;

-- Test set_google_user_id function
-- Replace '00000000-0000-0000-0000-000000000000' with actual user ID from above query
-- Replace 'test-google-id-123' with a test Google ID
SELECT set_google_user_id('00000000-0000-0000-0000-000000000000', 'test-google-id-123');

-- Verify the update
-- Replace with the same user ID you used above
SELECT id, email, google_user_id 
FROM public.users 
WHERE id = '00000000-0000-0000-0000-000000000000';

-- Test update that will be ignored (Google ID already set)
-- This should not change the Google ID since it's already set
SELECT set_google_user_id('00000000-0000-0000-0000-000000000000', 'different-google-id-456');

-- Verify no change occurred
SELECT id, email, google_user_id 
FROM public.users 
WHERE id = '00000000-0000-0000-0000-000000000000';

-- Print success message
SELECT 'Google ID functions test complete' AS result; 