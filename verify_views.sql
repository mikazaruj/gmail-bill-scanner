-- First, let's check and recreate our views with proper schema references
DROP VIEW IF EXISTS public.user_profiles;
DROP VIEW IF EXISTS public.user_stats;

-- Create user_profiles view with explicit schema references
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT 
  u.id,
  u.email,
  u.created_at,
  u.raw_user_meta_data->>'name' as display_name,
  u.raw_user_meta_data->>'full_name' as full_name,
  u.raw_user_meta_data->>'picture' as avatar_url,
  u.last_sign_in_at,
  u.updated_at
FROM auth.users u;

-- Grant access to the view
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_profiles TO anon;

-- Create user_stats view with explicit schema references
CREATE OR REPLACE VIEW public.user_stats AS
SELECT 
  u.id,
  u.email,
  u.created_at,
  pu.plan,
  pu.quota_bills_monthly,
  pu.quota_bills_used,
  count(pi.id) as total_processed_items,
  count(
    CASE
      WHEN pi.status = 'success' THEN 1
      ELSE null
    END
  ) as successful_processed_items,
  max(pi.processed_at) as last_processed_at
FROM auth.users u
LEFT JOIN public.users pu ON pu.id = u.id
LEFT JOIN public.processed_items pi ON pi.user_id = u.id
GROUP BY
  u.id,
  u.email,
  u.created_at,
  pu.plan,
  pu.quota_bills_monthly,
  pu.quota_bills_used;

-- Grant access to the view
GRANT SELECT ON public.user_stats TO authenticated;
GRANT SELECT ON public.user_stats TO anon;

-- Verify the views exist and are accessible
SELECT EXISTS (
  SELECT FROM pg_views
  WHERE schemaname = 'public' 
  AND viewname = 'user_profiles'
);

SELECT EXISTS (
  SELECT FROM pg_views
  WHERE schemaname = 'public' 
  AND viewname = 'user_stats'
);

-- Add RLS policies to the views
ALTER VIEW public.user_profiles OWNER TO postgres;
ALTER VIEW public.user_stats OWNER TO postgres;

-- Enable RLS on the views
ALTER VIEW public.user_profiles SET ROW LEVEL SECURITY TO ON;
ALTER VIEW public.user_stats SET ROW LEVEL SECURITY TO ON;

-- Create policies for the views
CREATE POLICY "Allow users to view their own profile"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Allow users to view their own stats"
  ON public.user_stats
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id); 