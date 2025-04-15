CREATE OR REPLACE VIEW public.user_settings_view AS
SELECT 
  u.id,
  u.plan,
  up.automatic_processing,
  up.weekly_schedule,
  up.process_attachments,
  up.max_results,
  up.search_days,
  up.apply_labels,
  up.label_name,
  us.sheet_id,
  us.sheet_name
FROM users u
  LEFT JOIN user_preferences up ON u.id = up.user_id
  LEFT JOIN (
    SELECT 
      user_id,
      sheet_id,
      sheet_name
    FROM user_sheets
    WHERE is_default = true
  ) us ON u.id = us.user_id; 