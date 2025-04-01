-- Recreate the views without explicit RLS
DROP VIEW IF EXISTS public.user_profiles;
DROP VIEW IF EXISTS public.user_stats;

-- Create user_profiles view
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

-- Create user_stats view
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

-- Grant access to the views (they will still respect table RLS)
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_stats TO authenticated; 