-- Create a function to handle new auth users and ensure public.users records exist
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this user already exists in public.users
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    -- Insert new record into public.users
    INSERT INTO public.users (
      id,
      email,
      auth_id,
      created_at,
      updated_at,
      plan,
      quota_bills_monthly,
      quota_bills_used,
      google_user_id
    ) VALUES (
      NEW.id,
      NEW.email,
      NEW.id,
      NEW.created_at,
      NOW(),
      'free',
      50,
      0,
      NEW.raw_user_meta_data->>'google_user_id'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to automatically create public.users records for new auth.users
DROP TRIGGER IF EXISTS create_public_user_on_auth_insert ON auth.users;
CREATE TRIGGER create_public_user_on_auth_insert
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

-- Update existing auth users to ensure they have public.users records
DO $$
DECLARE
  auth_user RECORD;
BEGIN
  FOR auth_user IN 
    SELECT 
      id, 
      email, 
      created_at, 
      raw_user_meta_data->>'google_user_id' as google_user_id
    FROM auth.users 
    WHERE NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.users.id)
  LOOP
    INSERT INTO public.users (
      id,
      email,
      auth_id,
      created_at,
      updated_at,
      plan,
      quota_bills_monthly,
      quota_bills_used,
      google_user_id
    ) VALUES (
      auth_user.id,
      auth_user.email,
      auth_user.id,
      auth_user.created_at,
      NOW(),
      'free',
      50,
      0,
      auth_user.google_user_id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql; 