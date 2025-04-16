-- Run the ensure_user_preferences function to create preferences for all users without them
-- Then run a specific check for the provided user ID
BEGIN;

-- First run the function for all users
SELECT ensure_user_preferences();

-- Now check if the specified user has preferences
DO $$
DECLARE
    v_user_id UUID := '4c2ea24d-0141-4500-be70-e9a51fa1c63c';
    v_prefs_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_prefs_count
    FROM public.user_preferences
    WHERE user_id = v_user_id;
    
    -- If user doesn't have preferences, ensure one exists
    IF v_prefs_count = 0 THEN
        RAISE NOTICE 'Creating preferences for user %', v_user_id;
        
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
            v_user_id,
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
    ELSE
        RAISE NOTICE 'User % already has preferences', v_user_id;
    END IF;
END $$;

-- Verify the user now has preferences
SELECT * FROM public.user_preferences WHERE user_id = '4c2ea24d-0141-4500-be70-e9a51fa1c63c';

COMMIT; 