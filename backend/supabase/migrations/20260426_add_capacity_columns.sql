alter table public.smart_predictions add column if not exists capacity_gap boolean default false;
alter table public.smart_predictions add column if not exists missing_resources text[] default '{}';
