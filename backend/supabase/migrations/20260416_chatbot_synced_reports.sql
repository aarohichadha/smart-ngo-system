create extension if not exists pgcrypto;

create table if not exists public.chatbot_synced_reports (
  id uuid primary key default gen_random_uuid(),
  ngo_user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null default 'supabase_history',
  report_title text not null,
  report_summary text not null,
  report_count integer not null default 0,
  knowledge_chunks integer not null default 0,
  report_data jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_chatbot_synced_reports_ngo_user_id_created_at
  on public.chatbot_synced_reports (ngo_user_id, created_at desc);

alter table public.chatbot_synced_reports enable row level security;

drop policy if exists "Users can read own chatbot synced reports" on public.chatbot_synced_reports;
drop policy if exists "Users can insert own chatbot synced reports" on public.chatbot_synced_reports;
drop policy if exists "Users can update own chatbot synced reports" on public.chatbot_synced_reports;
drop policy if exists "Users can delete own chatbot synced reports" on public.chatbot_synced_reports;

create policy "Users can read own chatbot synced reports"
  on public.chatbot_synced_reports
  for select
  using (auth.uid() = ngo_user_id);

create policy "Users can insert own chatbot synced reports"
  on public.chatbot_synced_reports
  for insert
  with check (auth.uid() = ngo_user_id);

create policy "Users can update own chatbot synced reports"
  on public.chatbot_synced_reports
  for update
  using (auth.uid() = ngo_user_id)
  with check (auth.uid() = ngo_user_id);

create policy "Users can delete own chatbot synced reports"
  on public.chatbot_synced_reports
  for delete
  using (auth.uid() = ngo_user_id);