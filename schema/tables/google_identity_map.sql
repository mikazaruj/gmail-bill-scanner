-- Creates a table to map Google user IDs to Supabase user IDs
-- This fixes the error: "relation 'public.google_identity_map' does not exist"

CREATE TABLE IF NOT EXISTS public.google_identity_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_user_id TEXT NOT NULL UNIQUE,
  supabase_user_id UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_google_identity_map_google_id ON public.google_identity_map(google_user_id);
CREATE INDEX IF NOT EXISTS idx_google_identity_map_supabase_id ON public.google_identity_map(supabase_user_id);

-- Add RLS policies
ALTER TABLE public.google_identity_map ENABLE ROW LEVEL SECURITY;

-- Grant access to authenticated users and service role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_identity_map TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_identity_map TO service_role;

COMMENT ON TABLE public.google_identity_map IS 'Maps Google user IDs to Supabase user IDs for identity resolution'; 