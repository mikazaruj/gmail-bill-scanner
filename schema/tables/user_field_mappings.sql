CREATE TABLE IF NOT EXISTS public.user_field_mappings (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL,
  field_id UUID NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  column_mapping TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT user_field_mappings_user_id_column_mapping_key UNIQUE (user_id, column_mapping),
  CONSTRAINT user_field_mappings_user_id_field_id_key UNIQUE (user_id, field_id),
  CONSTRAINT user_field_mappings_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.field_definitions (id) ON DELETE CASCADE,
  CONSTRAINT user_field_mappings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS user_field_mappings_user_id_idx ON public.user_field_mappings (user_id);
CREATE INDEX IF NOT EXISTS user_field_mappings_field_id_idx ON public.user_field_mappings (field_id);

-- Enable RLS
ALTER TABLE public.user_field_mappings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own field mappings" ON public.user_field_mappings
  FOR SELECT USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Users can insert their own field mappings" ON public.user_field_mappings
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Users can update their own field mappings" ON public.user_field_mappings
  FOR UPDATE USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id())); 