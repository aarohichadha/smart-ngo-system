-- Scope issues to the authenticated owner (NGO/user)
-- Run this in Supabase SQL editor.

alter table public.issues
  add column if not exists ngo_user_id uuid;

-- Optional: set default for future inserts from authenticated clients
alter table public.issues
  alter column ngo_user_id set default auth.uid();

-- Backfill existing rows to current owner only where possible is not safe globally,
-- so we leave existing null rows untouched.

alter table public.issues enable row level security;

-- Remove old policies if they exist
drop policy if exists "issues_select_own" on public.issues;
drop policy if exists "issues_insert_own" on public.issues;
drop policy if exists "issues_update_own" on public.issues;
drop policy if exists "issues_delete_own" on public.issues;

-- Only see your own issues
create policy "issues_select_own"
on public.issues
for select
using (auth.uid() = ngo_user_id);

-- Can only insert issues for yourself
create policy "issues_insert_own"
on public.issues
for insert
with check (auth.uid() = ngo_user_id);

-- Can only edit your own issues
create policy "issues_update_own"
on public.issues
for update
using (auth.uid() = ngo_user_id)
with check (auth.uid() = ngo_user_id);

-- Can only delete your own issues
create policy "issues_delete_own"
on public.issues
for delete
using (auth.uid() = ngo_user_id);
