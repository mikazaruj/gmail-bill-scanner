-- Table: public.user_settings

-- Comment: User preferences and settings

CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  spreadsheet_id text,
  spreadsheet_name text
);
