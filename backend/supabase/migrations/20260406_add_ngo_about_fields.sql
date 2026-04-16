alter table public.ngo_profiles add column if not exists address text;
alter table public.ngo_profiles add column if not exists email text;
alter table public.ngo_profiles add column if not exists contact_number text;
alter table public.ngo_profiles add column if not exists bank_details text;
alter table public.ngo_profiles add column if not exists image_url text;
alter table public.ngo_profiles add column if not exists work_area text;
alter table public.ngo_profiles add column if not exists past_works text;

update public.ngo_profiles
set email = coalesce(email, contact_info)
where email is null and contact_info is not null;
