-- Add auto_export_to_sheets column to user_preferences table
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS auto_export_to_sheets boolean DEFAULT true;

-- Update user_settings_view to include the new column
DROP VIEW IF EXISTS public.user_settings_view;

CREATE OR REPLACE VIEW public.user_settings_view AS
SELECT 
    u.id,
    u.email,
    u.plan,
    u.quota_bills_monthly,
    u.quota_bills_used,
    -- Basic processing options
    p.automatic_processing AS immediate_processing,
    p.process_attachments,
    p.trusted_sources_only,
    p.capture_important_notices,
    p.auto_export_to_sheets,
    -- Schedule options
    p.schedule_enabled,
    p.schedule_frequency,
    p.schedule_day_of_week,
    p.schedule_day_of_month,
    p.schedule_time,
    p.run_initial_scan,
    -- Search parameters
    p.search_days,
    -- Language options
    p.input_language,
    p.output_language,
    -- Notification preferences
    p.notify_processed,
    p.notify_high_amount,
    p.notify_errors,
    p.high_amount_threshold,
    -- Connection status
    COALESCE(uc.gmail_connected, false) AS gmail_connected,
    uc.gmail_email,
    CASE 
        WHEN us.sheet_id IS NOT NULL THEN true
        ELSE false
    END AS sheets_connected,
    us.sheet_name,
    us.sheet_id
FROM 
    public.users u
    LEFT JOIN public.user_preferences p ON u.id = p.user_id
    LEFT JOIN public.user_connections uc ON u.id = uc.user_id
    LEFT JOIN public.user_sheets us ON u.id = us.user_id AND us.is_default = true;

-- Grant privileges on the view
GRANT SELECT ON public.user_settings_view TO authenticated;
GRANT SELECT ON public.user_settings_view TO service_role; 