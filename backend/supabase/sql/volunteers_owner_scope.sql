-- Scope volunteers to the authenticated owner (NGO/user)
-- Run this in Supabase SQL editor.

alter table public.volunteers
  add column if not exists ngo_user_id uuid;

-- Optional default for client inserts
alter table public.volunteers
  alter column ngo_user_id set default auth.uid();

alter table public.volunteers enable row level security;

-- Remove old policies if they exist
drop policy if exists "volunteers_select_own" on public.volunteers;
drop policy if exists "volunteers_insert_own" on public.volunteers;
drop policy if exists "volunteers_update_own" on public.volunteers;
drop policy if exists "volunteers_delete_own" on public.volunteers;

-- Only see your own volunteers
create policy "volunteers_select_own"
on public.volunteers
for select
using (auth.uid() = ngo_user_id);

-- Can only insert volunteers for yourself
create policy "volunteers_insert_own"
on public.volunteers
for insert
with check (auth.uid() = ngo_user_id);

-- Can only edit your own volunteers
create policy "volunteers_update_own"
on public.volunteers
for update
using (auth.uid() = ngo_user_id)
with check (auth.uid() = ngo_user_id);

-- Can only delete your own volunteers
create policy "volunteers_delete_own"
on public.volunteers
for delete
using (auth.uid() = ngo_user_id);
