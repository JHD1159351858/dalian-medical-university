begin;

create table if not exists public.encounter_records (
  id uuid primary key,
  student_id uuid not null references auth.users(id) on delete cascade,
  case_id text not null check (char_length(case_id) between 1 and 120),
  patient_name text not null check (char_length(patient_name) between 1 and 120),
  patient_age integer not null check (patient_age between 0 and 130),
  patient_sex text not null check (char_length(patient_sex) between 1 and 40),
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('in_progress', 'completed', 'ended')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  submissions jsonb not null default '[]'::jsonb check (jsonb_typeof(submissions) = 'array'),
  updated_at timestamptz not null default now()
);

create index if not exists encounter_records_student_updated_idx
  on public.encounter_records (student_id, updated_at desc, id desc);

create or replace function public.set_encounter_record_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists encounter_record_updated_at on public.encounter_records;
create trigger encounter_record_updated_at
  before insert or update on public.encounter_records
  for each row execute function public.set_encounter_record_updated_at();

alter table public.encounter_records enable row level security;

drop policy if exists encounter_records_select_own on public.encounter_records;
create policy encounter_records_select_own on public.encounter_records
  for select to authenticated using ((select auth.uid()) = student_id);

drop policy if exists encounter_records_insert_own on public.encounter_records;
create policy encounter_records_insert_own on public.encounter_records
  for insert to authenticated with check ((select auth.uid()) = student_id);

drop policy if exists encounter_records_update_own on public.encounter_records;
create policy encounter_records_update_own on public.encounter_records
  for update to authenticated
  using ((select auth.uid()) = student_id)
  with check ((select auth.uid()) = student_id);

revoke all on public.encounter_records from public, anon, authenticated;
grant select, insert, update on public.encounter_records to authenticated;

commit;
