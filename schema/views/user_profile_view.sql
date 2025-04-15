CREATE OR REPLACE VIEW public.user_profile_view AS
SELECT 
  u.id,
  u.email,
  u.plan,
  u.quota_bills_monthly,
  u.quota_bills_used,
  u.created_at AS joined_date,
  up.display_name,
  up.avatar_url,
  up.last_sign_in_at,
  us.trial_end,
  us.status AS subscription_status,
  pi_stats.total_items,
  pi_stats.successful_items
FROM users u
  LEFT JOIN user_profiles up ON u.id = up.id
  LEFT JOIN user_subscriptions us ON u.id = us.user_id
  LEFT JOIN (
    SELECT 
      user_id,
      count(id) AS total_items,
      sum(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_items
    FROM processed_items
    GROUP BY user_id
  ) pi_stats ON u.id = pi_stats.user_id; 