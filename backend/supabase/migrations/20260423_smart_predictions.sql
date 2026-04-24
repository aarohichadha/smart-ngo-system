create table public.smart_predictions (
  id uuid primary key default gen_random_uuid(),
  ngo_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  sector text not null,
  urgency text not null,
  confidence text,
  timeframe text,
  resolution text,
  resource_allocation jsonb,
  overall_risk_assessment text,
  created_at timestamptz not null default now()
);

-- set up row level security
alter table public.smart_predictions enable row level security;

-- create policy for select
create policy "Users can view their own smart predictions"
  on public.smart_predictions
  for select
  using (auth.uid() = ngo_user_id);

-- create policy for insert
create policy "Users can insert their own smart predictions"
  on public.smart_predictions
  for insert
  with check (auth.uid() = ngo_user_id);

-- create policy for update
create policy "Users can update their own smart predictions"
  on public.smart_predictions
  for update
  using (auth.uid() = ngo_user_id);

-- create policy for delete
create policy "Users can delete their own smart predictions"
  on public.smart_predictions
  for delete
  using (auth.uid() = ngo_user_id);
