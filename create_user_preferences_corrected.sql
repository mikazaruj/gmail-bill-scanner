-- Corrected script to create user preferences with only the columns that exist in the database
BEGIN;

-- Create preferences for the specified user
DO $$
DECLARE
    v_user_id UUID := '4c2ea24d-0141-4500-be70-e9a51fa1c63c';
    v_user_exists BOOLEAN;
BEGIN
    -- Check if the user exists
    SELECT EXISTS (
        SELECT 1 FROM public.users WHERE id = v_user_id
    ) INTO v_user_exists;
    
    IF v_user_exists THEN
        RAISE NOTICE 'User % exists, proceeding with preference creation', v_user_id;
        
        -- Delete any existing preferences for this user
        DELETE FROM public.user_preferences WHERE user_id = v_user_id;
        
        -- Insert new preferences with only the columns that likely exist
        -- Based on the error message, we'll use the original schema
        INSERT INTO public.user_preferences
        (
            id,
            user_id,
            automatic_processing,
            weekly_schedule,
            schedule_day,
            schedule_time,
            process_attachments,
            max_results,
            search_days,
            created_at,
            updated_at,
            apply_labels,
            label_name
        )
        VALUES
        (
            gen_random_uuid(),
            v_user_id,
            false, -- automatic_processing
            false, -- weekly_schedule (equivalent to schedule_enabled)
            'monday', -- schedule_day
            '09:00', -- schedule_time
            true,  -- process_attachments
            50,    -- max_results
            30,    -- search_days
            now(), -- created_at
            now(), -- updated_at
            false, -- apply_labels
            null   -- label_name
        );
        
        RAISE NOTICE 'Successfully created preferences for user %', v_user_id;
    ELSE
        RAISE EXCEPTION 'User % does not exist', v_user_id;
    END IF;
END $$;

-- Verify the user now has preferences
SELECT * FROM public.user_preferences WHERE user_id = '4c2ea24d-0141-4500-be70-e9a51fa1c63c';

COMMIT; 