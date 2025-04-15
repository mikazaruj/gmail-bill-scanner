CREATE OR REPLACE VIEW public.user_profiles AS
SELECT 
  u.id,
  u.email,
  u.created_at,
  (u.raw_user_meta_data ->> 'name') AS display_name,
  (u.raw_user_meta_data ->> 'full_name') AS full_name,
  (u.raw_user_meta_data ->> 'picture') AS avatar_url,
  u.last_sign_in_at,
  u.updated_at
FROM auth.users u; 