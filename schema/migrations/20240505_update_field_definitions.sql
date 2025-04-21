-- Update field_definitions table to match the existing schema
ALTER TABLE public.field_definitions 
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_column TEXT,
  ADD COLUMN IF NOT EXISTS extraction_priority INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS default_enabled BOOLEAN DEFAULT true;

-- Ensure all required columns exist in the field_definitions table
ALTER TABLE public.field_definitions 
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN display_name SET NOT NULL;

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS field_definitions_name_idx ON public.field_definitions (name);
CREATE INDEX IF NOT EXISTS field_definitions_extraction_priority_idx ON public.field_definitions (extraction_priority);

-- Insert default fields if they don't exist
INSERT INTO public.field_definitions (name, display_name, field_type, default_enabled, default_order, is_system, default_column, extraction_priority)
VALUES
  ('date', 'Date', 'date', true, 1, true, 'A', 10),
  ('amount', 'Amount', 'currency', true, 2, true, 'B', 20),
  ('vendor', 'Vendor', 'text', true, 3, true, 'C', 30),
  ('category', 'Category', 'text', true, 4, true, 'D', 40),
  ('description', 'Description', 'text', true, 5, true, 'E', 50),
  ('invoice_number', 'Invoice Number', 'text', true, 6, true, 'F', 60),
  ('due_date', 'Due Date', 'date', true, 7, true, 'G', 70),
  ('status', 'Status', 'text', true, 8, true, 'H', 80),
  ('payment_method', 'Payment Method', 'text', false, 9, true, 'I', 90),
  ('notes', 'Notes', 'text', false, 10, true, 'J', 100)
ON CONFLICT (name) DO NOTHING; 