-- Drop existing redundant views
DROP VIEW IF EXISTS public.user_emails;
DROP VIEW IF EXISTS public.public_user_emails;
DROP FUNCTION IF EXISTS public.check_user_exists_by_email(text);
DROP FUNCTION IF EXISTS public.check_email_exists();
DROP FUNCTION IF EXISTS public.count_users_with_email(text);

-- Create a comprehensive user profile view
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT 
    u.id,
    u.email,
    u.created_at,
    u.deleted_at,
    p.display_name,
    p.first_name,
    p.last_name,
    p.avatar_url,
    u.last_sign_in_at,
    u.updated_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id;

-- Create a user statistics view
CREATE OR REPLACE VIEW public.user_stats AS
SELECT 
    u.id,
    u.email,
    u.created_at,
    pu.plan,
    pu.quota_bills_monthly,
    pu.quota_bills_used,
    COUNT(pi.id) as total_processed_items,
    COUNT(CASE WHEN pi.status = 'success' THEN 1 END) as successful_processed_items,
    MAX(pi.processed_at) as last_processed_at
FROM auth.users u
LEFT JOIN public.users pu ON pu.id = u.id
LEFT JOIN public.processed_items pi ON pi.user_id = u.id
GROUP BY u.id, u.email, u.created_at, pu.plan, pu.quota_bills_monthly, pu.quota_bills_used;

-- Grant appropriate permissions
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_stats TO authenticated;

-- For checking user existence, we can simply use a direct query on auth.users
-- Example query:
-- SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = $1); 