-- SQL script to examine database schema
-- Run this in Supabase SQL Editor

-- Check if google_user_id column exists in users table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'users'
ORDER BY ordinal_position;

-- See actual table structure
SELECT pg_get_tabledef('public.users'::regclass::oid);

-- List all tables for reference
SELECT table_name 
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check RLS policies on users table
SELECT *
FROM pg_policies
WHERE tablename = 'users';
