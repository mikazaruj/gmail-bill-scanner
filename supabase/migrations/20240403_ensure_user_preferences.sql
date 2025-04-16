-- Ensure user_preferences records exist for all users
BEGIN;

-- Create a function to ensure user preferences exists
CREATE OR REPLACE FUNCTION ensure_user_preferences() RETURNS void AS $$
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
            -- Basic processing options
            automatic_processing,
            process_attachments,
            trusted_sources_only,
            capture_important_notices,
            -- Schedule options
            schedule_enabled,
            schedule_frequency,
            schedule_day_of_week,
            schedule_day_of_month,
            schedule_time,
            run_initial_scan,
            -- Search parameters
            max_results,
            search_days,
            -- Language options
            input_language,
            output_language,
            -- Notification preferences
            notify_processed,
            notify_high_amount,
            notify_errors,
            high_amount_threshold,
            -- Timestamps
            created_at,
            updated_at
        )
        VALUES
        (
            u_record.id,
            -- Basic processing options
            false, -- automatic_processing
            true,  -- process_attachments
            true,  -- trusted_sources_only
            false, -- capture_important_notices
            -- Schedule options
            false,     -- schedule_enabled
            'weekly',  -- schedule_frequency
            'monday',  -- schedule_day_of_week
            '1',       -- schedule_day_of_month
            '09:00',   -- schedule_time
            true,      -- run_initial_scan
            -- Search parameters
            50,    -- max_results
            30,    -- search_days
            -- Language options
            'auto',    -- input_language
            'english', -- output_language
            -- Notification preferences
            true,  -- notify_processed
            false, -- notify_high_amount
            true,  -- notify_errors
            100.00,-- high_amount_threshold
            -- Timestamps
            now(),
            now()
        );
        
        RAISE NOTICE 'Created default preferences for user %', u_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the function
SELECT ensure_user_preferences();

-- Drop the function when done
DROP FUNCTION ensure_user_preferences();

COMMIT; 