-- Field Nexus auth setup for Supabase
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  user_type text not null check (user_type in ('individual', 'ngo')),
  location text,
  contact_number text,
  ngo_type text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  event_type text not null check (event_type in ('signup', 'login')),
  logged_at timestamptz not null default timezone('utc', now()),
  metadata jsonb
);

create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_auth_events_user_id on public.auth_events(user_id);
create index if not exists idx_auth_events_logged_at on public.auth_events(logged_at desc);

alter table public.profiles enable row level security;
alter table public.auth_events enable row level security;

-- Profiles policies
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Auth event policies
drop policy if exists "auth_events_select_own" on public.auth_events;
create policy "auth_events_select_own"
on public.auth_events
for select
using (auth.uid() = user_id);

drop policy if exists "auth_events_insert_own" on public.auth_events;
create policy "auth_events_insert_own"
on public.auth_events
for insert
with check (auth.uid() = user_id);

-- Optional: auto-create basic profile row when auth user is created.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, user_type, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'user_type', 'individual'),
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();
