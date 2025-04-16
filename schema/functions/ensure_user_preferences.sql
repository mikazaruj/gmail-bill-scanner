-- Ensure user_preferences records exist for all users
CREATE OR REPLACE FUNCTION public.ensure_user_preferences() RETURNS void AS $$
DECLARE
    u_record RECORD;
BEGIN
    -- Loop through all users without preferences
    FOR u_record IN 
        SELECT u.id 
        FROM public.users u
        LEFT JOIN public.user_preferences p ON u.id = p.user_id
        WHERE p.id IS NULL
        AND u.deleted_at IS NULL
    LOOP
        INSERT INTO public.user_preferences
        (
            user_id,
            automatic_processing,
            process_attachments,
            trusted_sources_only,
            capture_important_notices,
            schedule_enabled,
            schedule_frequency,
            schedule_day_of_week,
            schedule_day_of_month,
            schedule_time,
            run_initial_scan,
            search_days,
            input_language,
            output_language,
            notify_processed,
            notify_high_amount,
            notify_errors,
            high_amount_threshold,
            created_at,
            updated_at
        )
        VALUES
        (
            u_record.id,
            false, -- automatic_processing
            true,  -- process_attachments
            true,  -- trusted_sources_only
            false, -- capture_important_notices
            false,     -- schedule_enabled
            'weekly',  -- schedule_frequency
            'monday',  -- schedule_day_of_week
            '1',       -- schedule_day_of_month
            '09:00',   -- schedule_time
            true,      -- run_initial_scan
            30,    -- search_days
            'auto',    -- input_language
            'english', -- output_language
            true,  -- notify_processed
            false, -- notify_high_amount
            true,  -- notify_errors
            100.00,-- high_amount_threshold
            now(),
            now()
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql; 