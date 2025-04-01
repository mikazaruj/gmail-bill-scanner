-- First, enable RLS on the public.users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policy for users to access their own data
CREATE POLICY "Users can view own data"
  ON public.users
  FOR ALL
  USING (auth.uid() = id);

-- Create policy for users to access their own processed items
CREATE POLICY "Users can view own processed items"
  ON public.processed_items
  FOR ALL
  USING (auth.uid() = user_id);

-- Create policy for users to manage their own Google credentials
CREATE POLICY "Users can manage own Google credentials"
  ON public.google_credentials
  FOR ALL
  USING (auth.uid() = user_id);

-- Create policy for users to manage their own email sources
CREATE POLICY "Users can manage own email sources"
  ON public.email_sources
  FOR ALL
  USING (auth.uid() = user_id);

-- Grant necessary permissions
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT ON public.processed_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.google_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.email_sources TO authenticated;

-- Our views will now automatically inherit these RLS policies
-- No need to set RLS on the views themselves

-- Drop the incorrect RLS settings from views if they exist
DROP POLICY IF EXISTS "Allow users to view their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow users to view their own stats" ON public.user_stats;

-- Remove RLS from views (since they inherit from tables)
ALTER VIEW public.user_profiles SECURITY INVOKER;
ALTER VIEW public.user_stats SECURITY INVOKER; 