-- Sahayak community + collaboration schema
-- This migration keeps existing tables and adds role-based community features.

create extension if not exists pgcrypto;

-- Rename the role column to user_type to match auth_setup.sql schema
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  user_type text not null check (user_type in ('ngo', 'individual')),
  display_name text,
  location text,
  contact_number text,
  contact_info text,
  ngo_type text,
  verification_status text default 'unverified' check (verification_status in ('unverified', 'pending', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_ngo_profiles_updated_at
before update on public.ngo_profiles
for each row execute function public.set_updated_at();

create trigger set_individual_profiles_updated_at
before update on public.individual_profiles
for each row execute function public.set_updated_at();

create trigger set_ngo_requests_updated_at
before update on public.ngo_requests
for each row execute function public.set_updated_at();

create trigger set_volunteer_offers_updated_at
before update on public.volunteer_offers
for each row execute function public.set_updated_at();

create trigger set_connections_updated_at
before update on public.connections_or_responses
for each row execute function public.set_updated_at();

create trigger set_comments_updated_at
before update on public.post_comments
for each row execute function public.set_updated_at();

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

  selected_name := coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'User');

  insert into public.profiles (id, role, display_name, contact_info)
  values (new.id, selected_role, selected_name, new.email)
  on conflict (id) do nothing;

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
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

create or replace function public.notify_connection_events()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, actor_id, event_type, title, body, related_connection_id, related_request_id, related_offer_id)
    values (
      new.receiver_id,
      new.sender_id,
      'connection_created',
      'New response received',
      coalesce(new.message, 'You have a new response on your post.'),
      new.id,
      new.request_id,
      new.offer_id
    );
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.notifications (user_id, actor_id, event_type, title, body, related_connection_id, related_request_id, related_offer_id)
    values (
      new.sender_id,
      new.receiver_id,
      'connection_status_changed',
      'Your response was updated',
      'Status changed to ' || new.status,
      new.id,
      new.request_id,
      new.offer_id
    );
  end if;

  return new;
end;
$$;

create trigger on_connection_event
after insert or update on public.connections_or_responses
for each row execute function public.notify_connection_events();

create or replace function public.notify_comment_events()
returns trigger
language plpgsql
security definer
as $$
declare
  target_owner uuid;
begin
  if new.request_id is not null then
    select owner_id into target_owner from public.ngo_requests where id = new.request_id;
  else
    select owner_id into target_owner from public.volunteer_offers where id = new.offer_id;
  end if;

  if target_owner is not null and target_owner <> new.author_id then
    insert into public.notifications (user_id, actor_id, event_type, title, body, related_comment_id, related_request_id, related_offer_id)
    values (
      target_owner,
      new.author_id,
      'new_comment',
      'New comment on your post',
      left(new.content, 140),
      new.id,
      new.request_id,
      new.offer_id
    );
  end if;

  return new;
end;
$$;

create trigger on_comment_created
after insert on public.post_comments
for each row execute function public.notify_comment_events();

alter table public.profiles enable row level security;
alter table public.ngo_profiles enable row level security;
alter table public.individual_profiles enable row level security;
alter table public.ngo_requests enable row level security;
alter table public.volunteer_offers enable row level security;
alter table public.connections_or_responses enable row level security;
alter table public.post_comments enable row level security;
alter table public.saved_posts enable row level security;
alter table public.notifications enable row level security;

create policy "profiles readable by all authenticated"
on public.profiles for select
to authenticated
using (true);

create policy "profiles writable by owner"
on public.profiles for all
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "ngo profiles readable by all authenticated"
on public.ngo_profiles for select
to authenticated
using (true);

create policy "ngo profiles writable by owner"
on public.ngo_profiles for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "individual profiles readable by all authenticated"
on public.individual_profiles for select
to authenticated
using (true);

create policy "individual profiles writable by owner"
on public.individual_profiles for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "requests readable by all authenticated"
on public.ngo_requests for select
to authenticated
using (true);

create policy "requests writable by ngo owner"
on public.ngo_requests for all
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "offers readable by all authenticated"
on public.volunteer_offers for select
to authenticated
using (true);

create policy "offers writable by individual owner"
on public.volunteer_offers for all
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "connections readable by participants"
on public.connections_or_responses for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "connections insert by authenticated"
on public.connections_or_responses for insert
to authenticated
with check (auth.uid() = sender_id);

create policy "connections update by participants"
on public.connections_or_responses for update
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id)
with check (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "comments readable by all authenticated"
on public.post_comments for select
to authenticated
using (true);

create policy "comments writable by author"
on public.post_comments for all
to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

create policy "saved posts readable by owner"
on public.saved_posts for select
to authenticated
using (auth.uid() = user_id);

create policy "saved posts writable by owner"
on public.saved_posts for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "notifications readable by owner"
on public.notifications for select
to authenticated
using (auth.uid() = user_id);

create policy "notifications owner update"
on public.notifications for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_requests_owner on public.ngo_requests(owner_id);
create index if not exists idx_requests_status on public.ngo_requests(status);
create index if not exists idx_offers_owner on public.volunteer_offers(owner_id);
create index if not exists idx_offers_status on public.volunteer_offers(status);
create index if not exists idx_connections_sender on public.connections_or_responses(sender_id);
create index if not exists idx_connections_receiver on public.connections_or_responses(receiver_id);
create index if not exists idx_comments_request_id on public.post_comments(request_id);
create index if not exists idx_comments_offer_id on public.post_comments(offer_id);
create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);
