-- EditMind - migracao incremental para projetos, cortes por usuario e editor
-- Seguro para reexecucao no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.cortes (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  video_url text not null,
  titulo text not null default 'Recorte',
  criado_em timestamptz not null default now()
);

create table if not exists public.projetos (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  titulo_original text not null default 'Video',
  source text not null default 'upload',
  thumbnail_url text,
  duration_seconds numeric,
  status text not null default 'processado',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.projetos add column if not exists user_email text;
alter table public.projetos add column if not exists thumbnail_url text;
alter table public.projetos add column if not exists duration_seconds numeric;
alter table public.projetos add column if not exists status text not null default 'processado';
alter table public.projetos add column if not exists atualizado_em timestamptz not null default now();

alter table public.cortes add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.cortes add column if not exists project_id text;
alter table public.cortes add column if not exists original_clip_id uuid;
alter table public.cortes add column if not exists parent_corte_id uuid;
alter table public.cortes add column if not exists is_edited boolean not null default false;
alter table public.cortes add column if not exists storage_path text;
alter table public.cortes add column if not exists duracao_segundos numeric;
alter table public.cortes add column if not exists atualizado_em timestamptz not null default now();

update public.cortes c
set user_id = u.id
from auth.users u
where c.user_id is null
  and c.user_email is not null
  and lower(c.user_email) = lower(u.email);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cortes_project_id_fkey'
  ) then
    alter table public.cortes
      add constraint cortes_project_id_fkey
      foreign key (project_id) references public.projetos(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cortes_original_clip_id_fkey'
  ) then
    alter table public.cortes
      add constraint cortes_original_clip_id_fkey
      foreign key (original_clip_id) references public.cortes(id)
      on delete set null
      not valid;
  end if;
end $$;

create index if not exists idx_projetos_user_criado on public.projetos (user_id, criado_em desc);
create index if not exists idx_cortes_user_id_criado on public.cortes (user_id, criado_em desc);
create index if not exists idx_cortes_project_user on public.cortes (project_id, user_id);
create index if not exists idx_cortes_original_clip on public.cortes (original_clip_id);
create index if not exists idx_cortes_storage_path on public.cortes (storage_path);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_projetos_updated_at on public.projetos;
create trigger trg_projetos_updated_at
before update on public.projetos
for each row execute function public.set_updated_at();

drop trigger if exists trg_cortes_updated_at on public.cortes;
create trigger trg_cortes_updated_at
before update on public.cortes
for each row execute function public.set_updated_at();

alter table public.projetos enable row level security;
alter table public.cortes enable row level security;

drop policy if exists "Usuarios veem os proprios cortes" on public.cortes;
drop policy if exists "Usuarios inserem os proprios cortes" on public.cortes;
drop policy if exists "cortes_select_own" on public.cortes;
drop policy if exists "cortes_insert_own" on public.cortes;
drop policy if exists "cortes_update_own" on public.cortes;
drop policy if exists "cortes_delete_own" on public.cortes;

create policy "cortes_select_own"
on public.cortes
for select
to authenticated
using (auth.uid() = user_id or (user_id is null and auth.email() = user_email));

create policy "cortes_insert_own"
on public.cortes
for insert
to authenticated
with check (auth.uid() = user_id or (user_id is null and auth.email() = user_email));

create policy "cortes_update_own"
on public.cortes
for update
to authenticated
using (auth.uid() = user_id or (user_id is null and auth.email() = user_email))
with check (auth.uid() = user_id or (user_id is null and auth.email() = user_email));

create policy "cortes_delete_own"
on public.cortes
for delete
to authenticated
using (auth.uid() = user_id or (user_id is null and auth.email() = user_email));

drop policy if exists "projetos_select_own" on public.projetos;
drop policy if exists "projetos_insert_own" on public.projetos;
drop policy if exists "projetos_update_own" on public.projetos;
drop policy if exists "projetos_delete_own" on public.projetos;

create policy "projetos_select_own"
on public.projetos
for select
to authenticated
using (auth.uid() = user_id);

create policy "projetos_insert_own"
on public.projetos
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "projetos_update_own"
on public.projetos
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "projetos_delete_own"
on public.projetos
for delete
to authenticated
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('cortes', 'cortes', false)
on conflict (id) do update set public = false;

drop policy if exists "storage_cortes_select_public" on storage.objects;
drop policy if exists "storage_cortes_select_own" on storage.objects;
drop policy if exists "storage_cortes_insert_own" on storage.objects;
drop policy if exists "storage_cortes_update_own" on storage.objects;
drop policy if exists "storage_cortes_delete_own" on storage.objects;
drop policy if exists "storage_cortes_service_role_all" on storage.objects;

create policy "storage_cortes_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'cortes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "storage_cortes_service_role_all"
on storage.objects
for all
to service_role
using (bucket_id = 'cortes')
with check (bucket_id = 'cortes');
