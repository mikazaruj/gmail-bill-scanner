CREATE OR REPLACE FUNCTION public.create_public_user(
  user_id UUID,
  user_email TEXT,
  user_auth_id TEXT,
  user_plan TEXT DEFAULT 'free',
  user_quota INTEGER DEFAULT 50,
  user_google_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user JSONB;
BEGIN
  INSERT INTO public.users (
    id, 
    email, 
    auth_id, 
    plan, 
    quota_bills_monthly, 
    quota_bills_used,
    created_at,
    updated_at,
    google_user_id
  )
  VALUES (
    user_id,
    user_email,
    user_auth_id,
    user_plan,
    user_quota,
    0,
    now(),
    now(),
    user_google_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    auth_id = EXCLUDED.auth_id,
    plan = COALESCE(public.users.plan, EXCLUDED.plan),
    quota_bills_monthly = COALESCE(public.users.quota_bills_monthly, EXCLUDED.quota_bills_monthly),
    updated_at = now(),
    google_user_id = CASE 
      WHEN EXCLUDED.google_user_id IS NOT NULL THEN EXCLUDED.google_user_id 
      ELSE public.users.google_user_id 
    END
  RETURNING to_jsonb(users.*) INTO new_user;
  
  RETURN new_user;
END;
$$;