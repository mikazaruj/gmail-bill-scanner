-- Check if a view exists function
CREATE OR REPLACE FUNCTION public.check_if_view_exists(view_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  view_exists boolean;
  result json;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.views 
    WHERE table_schema = 'public' 
    AND table_name = view_name
  ) INTO view_exists;
  
  result := json_build_object('exists', view_exists);
  RETURN result;
END;
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.check_if_view_exists TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_if_view_exists TO anon;

-- SQL execution function (use with caution, recommended for admin roles only)
CREATE OR REPLACE FUNCTION public.run_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- Only grant to authenticated users (in production you might want to restrict this further)
GRANT EXECUTE ON FUNCTION public.run_sql TO authenticated;

-- Create the user_settings_view
CREATE OR REPLACE VIEW public.user_settings_view AS
SELECT 
  u.id,
  u.email,
  u.plan,
  u.quota_bills_monthly,
  u.quota_bills_used,
  p.automatic_processing,
  p.process_attachments,
  p.trusted_sources_only,
  p.capture_important_notices,
  p.schedule_enabled,
  p.schedule_frequency,
  p.schedule_day_of_week,
  p.schedule_day_of_month,
  p.schedule_time,
  p.run_initial_scan,
  p.search_days,
  p.input_language,
  p.output_language,
  p.notify_processed,
  p.notify_high_amount,
  p.notify_errors,
  p.high_amount_threshold,
  c.gmail_connected,
  c.gmail_email,
  CASE WHEN s.sheet_id IS NOT NULL THEN true ELSE false END as sheets_connected,
  s.sheet_name,
  s.sheet_id
FROM public.users u
LEFT JOIN public.user_preferences p ON u.id = p.user_id
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