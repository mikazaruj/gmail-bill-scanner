-- Migration: Create Google Identity Map table and populate it
-- Date: 2024-05-07

-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.google_identity_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_user_id TEXT NOT NULL UNIQUE,
  supabase_user_id UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_google_identity_map_google_id ON public.google_identity_map(google_user_id);
CREATE INDEX IF NOT EXISTS idx_google_identity_map_supabase_id ON public.google_identity_map(supabase_user_id);

-- Add RLS policies
ALTER TABLE public.google_identity_map ENABLE ROW LEVEL SECURITY;

-- Grant access to authenticated users and service role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_identity_map TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_identity_map TO service_role;

-- Populate with existing user data (if any)
INSERT INTO public.google_identity_map (google_user_id, supabase_user_id)
SELECT google_user_id, id
FROM public.users
WHERE google_user_id IS NOT NULL
ON CONFLICT (google_user_id) DO NOTHING;

-- Add function to update the identity map whenever a user is created or updated
CREATE OR REPLACE FUNCTION public.update_identity_map()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update the mapping
  INSERT INTO public.google_identity_map (google_user_id, supabase_user_id)
  VALUES (NEW.google_user_id, NEW.id)
  ON CONFLICT (google_user_id) 
  DO UPDATE SET 
    supabase_user_id = NEW.id,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS user_identity_map_trigger ON public.users;
CREATE TRIGGER user_identity_map_trigger
AFTER INSERT OR UPDATE OF google_user_id ON public.users
FOR EACH ROW
WHEN (NEW.google_user_id IS NOT NULL)
EXECUTE FUNCTION public.update_identity_map(); 