-- Create user preferences for the specific user with the correct schema
BEGIN;

-- Insert preferences for user 4c2ea24d-0141-4500-be70-e9a51fa1c63c
DO $$
DECLARE
    v_user_id UUID := '4c2ea24d-0141-4500-be70-e9a51fa1c63c';
BEGIN
    -- Delete any existing preferences for this user
    DELETE FROM public.user_preferences WHERE user_id = v_user_id;
    
    -- Insert with the correct schema
    INSERT INTO public.user_preferences
    (
        id,
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
        gen_random_uuid(),
        v_user_id,
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
        now(), -- created_at
        now()  -- updated_at
    );
    
    RAISE NOTICE 'Successfully created preferences for user %', v_user_id;
END $$;

-- Verify the user now has preferences
SELECT * FROM public.user_preferences WHERE user_id = '4c2ea24d-0141-4500-be70-e9a51fa1c63c';

COMMIT; 