alter table public.smart_predictions add column if not exists ready_volunteers jsonb default '[]';
