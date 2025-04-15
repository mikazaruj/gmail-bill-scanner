CREATE OR REPLACE VIEW public.trusted_sources_view AS
SELECT 
  es.id,
  es.user_id,
  es.email_address,
  es.description,
  es.is_active,
  es.created_at,
  u.plan,
  sp.max_trusted_sources,
  count(*) OVER (PARTITION BY es.user_id) AS total_sources,
  CASE
    WHEN u.plan = 'free' THEN true
    ELSE false
  END AS is_limited
FROM email_sources es
  JOIN users u ON es.user_id = u.id
  LEFT JOIN subscription_plans sp ON sp.name = u.plan; 