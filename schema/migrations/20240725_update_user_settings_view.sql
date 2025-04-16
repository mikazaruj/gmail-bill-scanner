-- Migration: Update user_settings_view to remove max_results field and improve sheet handling
-- Date: 2024-07-25

-- Update the user_settings_view
CREATE OR REPLACE VIEW public.user_settings_view AS
SELECT 
  u.id,
  u.email,
  u.plan,
  u.quota_bills_monthly,
  u.quota_bills_used,
  up.automatic_processing,
  up.process_attachments,
  up.trusted_sources_only,
  up.capture_important_notices,
  up.schedule_enabled,
  up.schedule_frequency,
  up.schedule_day_of_week,
  up.schedule_day_of_month,
  up.schedule_time,
  up.run_initial_scan,
  up.search_days,
  up.input_language,
  up.output_language,
  up.notify_processed,
  up.notify_high_amount,
  up.notify_errors,
  up.high_amount_threshold,
  c.gmail_connected,
  c.gmail_email,
  CASE WHEN s.sheet_id IS NOT NULL THEN true ELSE false END as sheets_connected,
  s.sheet_name,
  s.sheet_id
FROM public.users u
LEFT JOIN public.user_preferences up ON u.id = up.user_id
LEFT JOIN public.user_connections c ON u.id = c.user_id
LEFT JOIN (
  SELECT 
    user_id,
    sheet_id,
    sheet_name
  FROM public.user_sheets
  WHERE is_default = true
) s ON u.id = s.user_id;

-- Grant access to the view
GRANT SELECT ON public.user_settings_view TO authenticated;
GRANT SELECT ON public.user_settings_view TO anon; 