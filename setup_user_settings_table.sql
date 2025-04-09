-- Create user_settings table if it doesn't exist
create table if not exists public.user_settings (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  spreadsheet_id text null,
  spreadsheet_name text null,
  scan_frequency text not null default 'manual'::text,
  apply_labels boolean not null default false,
  label_name text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint user_settings_pkey primary key (id),
  constraint user_settings_user_id_key unique (user_id),
  constraint user_settings_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE,
  constraint user_settings_scan_frequency_check check (
    (
      scan_frequency = any (
        array['manual'::text, 'daily'::text, 'weekly'::text]
      )
    )
  )
) TABLESPACE pg_default;

-- Create index for user_id field
create index IF not exists idx_user_settings_user_id on public.user_settings using btree (user_id) TABLESPACE pg_default; 