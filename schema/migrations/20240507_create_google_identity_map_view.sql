-- Migration: Create Google Identity Map View
-- Date: 2024-05-07

-- Create a view for mapping Google user IDs to Supabase user IDs
-- This provides an efficient lookup while avoiding data duplication

CREATE OR REPLACE VIEW public.google_identity_map_view AS
SELECT 
  id AS supabase_user_id,
  google_user_id,
  created_at,
  updated_at
FROM 
  public.users
WHERE 
  google_user_id IS NOT NULL;

-- Grant access to authenticated users and service role
GRANT SELECT ON public.google_identity_map_view TO authenticated;
GRANT SELECT ON public.google_identity_map_view TO service_role;

COMMENT ON VIEW public.google_identity_map_view IS 'Maps Google user IDs to Supabase user IDs for identity resolution';

-- Remove the old physical table if it exists
DROP TABLE IF EXISTS public.google_identity_map; 