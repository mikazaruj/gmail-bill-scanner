CREATE OR REPLACE VIEW public.user_stats AS
SELECT 
  u.id,
  u.email,
  u.created_at,
  pu.plan,
  pu.quota_bills_monthly,
  pu.quota_bills_used,
  count(pi.id) AS total_processed_items,
  count(
    CASE
      WHEN pi.status = 'success' THEN 1
      ELSE NULL
    END
  ) AS successful_processed_items,
  max(pi.processed_at) AS last_processed_at
FROM auth.users u
  LEFT JOIN users pu ON pu.id = u.id
  LEFT JOIN processed_items pi ON pi.user_id = u.id
GROUP BY 
  u.id, u.email, u.created_at, pu.plan, pu.quota_bills_monthly, pu.quota_bills_used;