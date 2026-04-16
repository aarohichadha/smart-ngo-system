-- Bootstrap missing community schema for new Supabase projects
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  user_type text,
  role text not null check (role in ('ngo', 'individual')),
  display_name text not null,
  location text,
  contact_info text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists user_type text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists contact_info text;
alter table public.profiles add column if not exists verification_status text default 'unverified';
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

update public.profiles
set email = coalesce(email, contact_info)
where email is null and contact_info is not null;

update public.profiles
set contact_info = coalesce(contact_info, email)
where contact_info is null and email is not null;

update public.profiles
set role = 'individual'
where role is null;

update public.profiles
set user_type = coalesce(user_type, role, 'individual')
where user_type is null;

update public.profiles
set display_name = coalesce(display_name, split_part(contact_info, '@', 1), 'User')
where display_name is null;

update public.profiles
set username = coalesce(username, display_name, split_part(coalesce(email, contact_info, 'user@example.com'), '@', 1), 'user')
where username is null;

update public.profiles
set full_name = coalesce(full_name, display_name, username, 'User')
where full_name is null;

update public.profiles
set verification_status = 'unverified'
where verification_status is null;

create table if not exists public.ngo_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  ngo_name text not null,
  description text,
  sector text,
  location text,
  contact_info text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ngo_profiles add column if not exists user_id uuid;
alter table public.ngo_profiles add column if not exists ngo_name text;
alter table public.ngo_profiles add column if not exists description text;
alter table public.ngo_profiles add column if not exists sector text;
alter table public.ngo_profiles add column if not exists location text;
alter table public.ngo_profiles add column if not exists contact_info text;
alter table public.ngo_profiles add column if not exists verification_status text default 'unverified';
alter table public.ngo_profiles add column if not exists created_at timestamptz default now();
alter table public.ngo_profiles add column if not exists updated_at timestamptz default now();

create unique index if not exists ngo_profiles_user_id_unique_idx on public.ngo_profiles(user_id);

create table if not exists public.individual_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  full_name text not null,
  skills text[] not null default '{}',
  interests text[] not null default '{}',
  location text,
  availability text,
  contact_info text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.individual_profiles add column if not exists user_id uuid;
alter table public.individual_profiles add column if not exists full_name text;
alter table public.individual_profiles add column if not exists skills text[] default '{}';
alter table public.individual_profiles add column if not exists interests text[] default '{}';
alter table public.individual_profiles add column if not exists location text;
alter table public.individual_profiles add column if not exists availability text;
alter table public.individual_profiles add column if not exists contact_info text;
alter table public.individual_profiles add column if not exists verification_status text default 'unverified';
alter table public.individual_profiles add column if not exists created_at timestamptz default now();
alter table public.individual_profiles add column if not exists updated_at timestamptz default now();

create unique index if not exists individual_profiles_user_id_unique_idx on public.individual_profiles(user_id);

update public.individual_profiles
set full_name = coalesce(full_name, split_part(contact_info, '@', 1), 'User')
where full_name is null;

create table if not exists public.ngo_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  category text not null,
  urgency text not null default 'medium' check (urgency in ('low', 'medium', 'high', 'critical')),
  location text,
  volunteers_needed int not null default 1,
  skills_needed text[] not null default '{}',
  deadline date,
  contact_method text,
  status text not null default 'open' check (status in ('open', 'pending', 'matched', 'in_progress', 'completed', 'closed', 'fulfilled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.volunteer_offers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  skills text[] not null default '{}',
  availability text,
  preferred_causes text[] not null default '{}',
  location text,
  mode text not null default 'remote' check (mode in ('remote', 'on_ground', 'hybrid')),
  contact_method text,
  status text not null default 'open' check (status in ('open', 'pending', 'matched', 'in_progress', 'completed', 'closed', 'unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.connections_or_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.ngo_requests(id) on delete set null,
  offer_id uuid references public.volunteer_offers(id) on delete set null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'completed', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connection_target_check check (request_id is not null or offer_id is not null)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_type text not null check (post_type in ('ngo_request', 'volunteer_offer')),
  request_id uuid references public.ngo_requests(id) on delete cascade,
  offer_id uuid references public.volunteer_offers(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comment_target_check check (
    (post_type = 'ngo_request' and request_id is not null and offer_id is null)
    or (post_type = 'volunteer_offer' and offer_id is not null and request_id is null)
  )
);

create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_type text not null check (post_type in ('ngo_request', 'volunteer_offer')),
  request_id uuid references public.ngo_requests(id) on delete cascade,
  offer_id uuid references public.volunteer_offers(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_posts_unique unique (user_id, post_type, request_id, offer_id),
  constraint saved_target_check check (
    (post_type = 'ngo_request' and request_id is not null and offer_id is null)
    or (post_type = 'volunteer_offer' and offer_id is not null and request_id is null)
  )
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  title text not null,
  body text,
  related_request_id uuid references public.ngo_requests(id) on delete set null,
  related_offer_id uuid references public.volunteer_offers(id) on delete set null,
  related_connection_id uuid references public.connections_or_responses(id) on delete set null,
  related_comment_id uuid references public.post_comments(id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists set_ngo_profiles_updated_at on public.ngo_profiles;
create trigger set_ngo_profiles_updated_at before update on public.ngo_profiles for each row execute function public.set_updated_at();

drop trigger if exists set_individual_profiles_updated_at on public.individual_profiles;
create trigger set_individual_profiles_updated_at before update on public.individual_profiles for each row execute function public.set_updated_at();

drop trigger if exists set_ngo_requests_updated_at on public.ngo_requests;
create trigger set_ngo_requests_updated_at before update on public.ngo_requests for each row execute function public.set_updated_at();

drop trigger if exists set_volunteer_offers_updated_at on public.volunteer_offers;
create trigger set_volunteer_offers_updated_at before update on public.volunteer_offers for each row execute function public.set_updated_at();

drop trigger if exists set_connections_updated_at on public.connections_or_responses;
create trigger set_connections_updated_at before update on public.connections_or_responses for each row execute function public.set_updated_at();

drop trigger if exists set_comments_updated_at on public.post_comments;
create trigger set_comments_updated_at before update on public.post_comments for each row execute function public.set_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
as $$
declare
  selected_role text;
  selected_name text;
begin
  selected_role := coalesce(new.raw_user_meta_data ->> 'role', 'individual');
  if selected_role not in ('ngo', 'individual') then
    selected_role := 'individual';
  end if;

  selected_name := coalesce(new.raw_user_meta_data ->> 'displayName', split_part(new.email, '@', 1), 'User');

  insert into public.profiles (id, email, user_type, role, username, full_name, display_name, contact_info)
  values (new.id, new.email, selected_role, selected_role, selected_name, selected_name, selected_name, new.email)
  on conflict (id) do update set
    email = excluded.email,
    user_type = excluded.user_type,
    role = excluded.role,
    username = excluded.username,
    full_name = excluded.full_name,
    display_name = excluded.display_name,
    contact_info = excluded.contact_info,
    updated_at = now();

  if selected_role = 'ngo' then
    insert into public.ngo_profiles (user_id, ngo_name, description, location, contact_info)
    values (new.id, selected_name, '', '', new.email)
    on conflict (user_id) do nothing;
  else
    insert into public.individual_profiles (user_id, full_name, skills, interests, availability, location, contact_info)
    values (new.id, selected_name, '{}', '{}', '', '', new.email)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user_profile();

alter table public.profiles enable row level security;
alter table public.ngo_profiles enable row level security;
alter table public.individual_profiles enable row level security;
alter table public.ngo_requests enable row level security;
alter table public.volunteer_offers enable row level security;
alter table public.connections_or_responses enable row level security;
alter table public.post_comments enable row level security;
alter table public.saved_posts enable row level security;
alter table public.notifications enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles readable by all authenticated') then
    create policy "profiles readable by all authenticated" on public.profiles for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles writable by owner') then
    create policy "profiles writable by owner" on public.profiles for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ngo_profiles' and policyname = 'ngo profiles readable by all authenticated') then
    create policy "ngo profiles readable by all authenticated" on public.ngo_profiles for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ngo_profiles' and policyname = 'ngo profiles writable by owner') then
    create policy "ngo profiles writable by owner" on public.ngo_profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'individual_profiles' and policyname = 'individual profiles readable by all authenticated') then
    create policy "individual profiles readable by all authenticated" on public.individual_profiles for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'individual_profiles' and policyname = 'individual profiles writable by owner') then
    create policy "individual profiles writable by owner" on public.individual_profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ngo_requests' and policyname = 'requests readable by all authenticated') then
    create policy "requests readable by all authenticated" on public.ngo_requests for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ngo_requests' and policyname = 'requests writable by ngo owner') then
    create policy "requests writable by ngo owner" on public.ngo_requests for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'volunteer_offers' and policyname = 'offers readable by all authenticated') then
    create policy "offers readable by all authenticated" on public.volunteer_offers for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'volunteer_offers' and policyname = 'offers writable by individual owner') then
    create policy "offers writable by individual owner" on public.volunteer_offers for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'connections_or_responses' and policyname = 'connections readable by participants') then
    create policy "connections readable by participants" on public.connections_or_responses for select to authenticated using (auth.uid() = sender_id or auth.uid() = receiver_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'connections_or_responses' and policyname = 'connections insert by authenticated') then
    create policy "connections insert by authenticated" on public.connections_or_responses for insert to authenticated with check (auth.uid() = sender_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'connections_or_responses' and policyname = 'connections update by participants') then
    create policy "connections update by participants" on public.connections_or_responses for update to authenticated using (auth.uid() = sender_id or auth.uid() = receiver_id) with check (auth.uid() = sender_id or auth.uid() = receiver_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_comments' and policyname = 'comments readable by all authenticated') then
    create policy "comments readable by all authenticated" on public.post_comments for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_comments' and policyname = 'comments writable by author') then
    create policy "comments writable by author" on public.post_comments for all to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'saved_posts' and policyname = 'saved posts readable by owner') then
    create policy "saved posts readable by owner" on public.saved_posts for select to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'saved_posts' and policyname = 'saved posts writable by owner') then
    create policy "saved posts writable by owner" on public.saved_posts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications readable by owner') then
    create policy "notifications readable by owner" on public.notifications for select to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications owner update') then
    create policy "notifications owner update" on public.notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end
$$;

-- Dummy records for currently available users.
insert into public.profiles (id, email, user_type, role, username, full_name, display_name, contact_info)
select
  u.id,
  coalesce(u.email, concat('user-', left(u.id::text, 8), '@example.com')),
  case when row_number() over (order by u.created_at) % 2 = 0 then 'ngo' else 'individual' end,
  case when row_number() over (order by u.created_at) % 2 = 0 then 'ngo' else 'individual' end,
  coalesce(u.raw_user_meta_data ->> 'displayName', split_part(coalesce(u.email, concat('user-', left(u.id::text, 8), '@example.com')), '@', 1), 'User'),
  coalesce(u.raw_user_meta_data ->> 'displayName', split_part(coalesce(u.email, concat('user-', left(u.id::text, 8), '@example.com')), '@', 1), 'User'),
  coalesce(u.raw_user_meta_data ->> 'displayName', split_part(coalesce(u.email, concat('user-', left(u.id::text, 8), '@example.com')), '@', 1), 'User'),
  coalesce(u.email, concat('user-', left(u.id::text, 8), '@example.com'))
from auth.users u
on conflict (id) do nothing;

insert into public.ngo_profiles (user_id, ngo_name, description, sector, location, contact_info)
select
  p.id,
  p.display_name,
  'Community support organization',
  'Healthcare Outreach',
  coalesce(p.location, 'Delhi'),
  p.contact_info
from public.profiles p
where p.role = 'ngo'
on conflict (user_id) do nothing;

insert into public.individual_profiles (user_id, full_name, skills, interests, location, availability, contact_info)
select
  p.id,
  p.display_name,
  array['community outreach','first aid'],
  array['Healthcare Outreach','Education Support'],
  coalesce(p.location, 'Delhi'),
  'Weekends',
  p.contact_info
from public.profiles p
where p.role = 'individual'
on conflict (user_id) do nothing;

insert into public.ngo_requests (owner_id, title, description, category, urgency, location, volunteers_needed, skills_needed, status)
select
  p.id,
  'Need volunteers for field drive',
  'Urgent support needed for local community outreach and on-ground operations.',
  'Healthcare Outreach',
  'high',
  coalesce(p.location, 'Delhi'),
  5,
  array['outreach','logistics'],
  'open'
from public.profiles p
where p.role = 'ngo'
limit 5;

insert into public.volunteer_offers (owner_id, title, description, skills, availability, preferred_causes, location, mode, status)
select
  p.id,
  'Available for NGO support',
  'Can support events, registration, and community coordination.',
  array['communication','coordination'],
  'Weekends',
  array['Healthcare Outreach'],
  coalesce(p.location, 'Delhi'),
  'hybrid',
  'open'
from public.profiles p
where p.role = 'individual'
limit 5;
