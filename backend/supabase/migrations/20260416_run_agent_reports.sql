create extension if not exists pgcrypto;

create table if not exists public.run_agent_reports (
  id uuid primary key default gen_random_uuid(),
  ngo_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  raw_input text,
  source_type text not null check (source_type in ('manual', 'files', 'smart_analysis_predictions')),
  source_files jsonb not null default '[]'::jsonb,
  processed_output jsonb,
  pipeline_result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_run_agent_reports_ngo_user_id_created_at
  on public.run_agent_reports (ngo_user_id, created_at desc);

alter table public.run_agent_reports enable row level security;

drop policy if exists "Users can read own run agent reports" on public.run_agent_reports;
drop policy if exists "Users can insert own run agent reports" on public.run_agent_reports;
drop policy if exists "Users can update own run agent reports" on public.run_agent_reports;
drop policy if exists "Users can delete own run agent reports" on public.run_agent_reports;

create policy "Users can read own run agent reports"
  on public.run_agent_reports
  for select
  using (auth.uid() = ngo_user_id);

create policy "Users can insert own run agent reports"
  on public.run_agent_reports
  for insert
  with check (auth.uid() = ngo_user_id);

create policy "Users can update own run agent reports"
  on public.run_agent_reports
  for update
  using (auth.uid() = ngo_user_id)
  with check (auth.uid() = ngo_user_id);

create policy "Users can delete own run agent reports"
  on public.run_agent_reports
  for delete
  using (auth.uid() = ngo_user_id);
