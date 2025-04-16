-- Update user_preferences table with new structure
BEGIN;

-- First, drop existing constraints and indexes to allow table restructuring
ALTER TABLE IF EXISTS public.user_preferences 
  DROP CONSTRAINT IF EXISTS user_preferences_user_id_fkey;

-- Then recreate the table with the new structure
DROP TABLE IF EXISTS public.user_preferences_old;
ALTER TABLE IF EXISTS public.user_preferences RENAME TO user_preferences_old;

CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NULL,
  -- Basic processing options
  automatic_processing boolean NULL DEFAULT false,
  process_attachments boolean NULL DEFAULT true,
  trusted_sources_only boolean NULL DEFAULT true,
  capture_important_notices boolean NULL DEFAULT false,
  -- Schedule options
  schedule_enabled boolean NULL DEFAULT false,
  schedule_frequency text NULL DEFAULT 'weekly',
  schedule_day_of_week text NULL DEFAULT 'monday',
  schedule_day_of_month text NULL DEFAULT '1',
  schedule_time text NULL DEFAULT '09:00',
  run_initial_scan boolean NULL DEFAULT true,
  -- Search parameters
  max_results integer NULL DEFAULT 50,
  search_days integer NULL DEFAULT 30,
  -- Language options
  input_language text NULL DEFAULT 'auto',
  output_language text NULL DEFAULT 'english',
  -- Notification preferences
  notify_processed boolean NULL DEFAULT true,
  notify_high_amount boolean NULL DEFAULT false,
  notify_errors boolean NULL DEFAULT true,
  high_amount_threshold decimal NULL DEFAULT 100.00,
  -- Timestamps
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  -- Constraints
  CONSTRAINT user_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT user_preferences_user_id_key UNIQUE (user_id),
  CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Migrate data from old table to new table
INSERT INTO public.user_preferences (
  id, user_id, automatic_processing, process_attachments,
  schedule_enabled, schedule_time, max_results, search_days,
  created_at, updated_at
)
SELECT 
  id, user_id, automatic_processing, process_attachments,
  weekly_schedule, schedule_time, max_results, search_days,
  created_at, updated_at
FROM public.user_preferences_old;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS user_preferences_user_id_idx ON public.user_preferences (user_id);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;

CREATE POLICY "Users can view their own preferences" ON public.user_preferences
  FOR SELECT USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Users can update their own preferences" ON public.user_preferences
  FOR UPDATE USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

-- Drop old table if migration successful
DROP TABLE IF EXISTS public.user_preferences_old;

COMMIT; 