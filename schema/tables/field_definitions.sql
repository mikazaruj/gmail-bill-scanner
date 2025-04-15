CREATE TABLE IF NOT EXISTS public.field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  field_type TEXT DEFAULT 'text',
  default_enabled BOOLEAN DEFAULT true,
  default_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS field_definitions_name_idx ON public.field_definitions (name);
CREATE INDEX IF NOT EXISTS field_definitions_default_order_idx ON public.field_definitions (default_order);

-- Enable RLS
ALTER TABLE public.field_definitions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can read field definitions" ON public.field_definitions
  FOR SELECT USING (true);

CREATE POLICY "Only service role can modify field definitions" ON public.field_definitions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Default fields
INSERT INTO public.field_definitions (name, display_name, field_type, default_enabled, default_order) 
VALUES
  ('date', 'Date', 'date', true, 1),
  ('amount', 'Amount', 'currency', true, 2),
  ('vendor', 'Vendor', 'text', true, 3),
  ('category', 'Category', 'text', true, 4),
  ('description', 'Description', 'text', true, 5),
  ('invoice_number', 'Invoice Number', 'text', true, 6),
  ('due_date', 'Due Date', 'date', true, 7),
  ('status', 'Status', 'enum', true, 8),
  ('payment_method', 'Payment Method', 'text', false, 9),
  ('notes', 'Notes', 'text', false, 10)
ON CONFLICT (name) DO NOTHING; 