create extension if not exists pgcrypto;

do $$
begin
    if not exists (
        select 1
        from pg_type
        where typnamespace = 'public'::regnamespace
          and typname = 'project_member_role'
    ) then
        create type public.project_member_role as enum ('creator', 'approver', 'member');
    end if;

    if not exists (
        select 1
        from pg_type
        where typnamespace = 'public'::regnamespace
          and typname = 'agent_name'
    ) then
        create type public.agent_name as enum ('monitor', 'analyzer', 'planner', 'updater');
    end if;

    if not exists (
        select 1
        from pg_type
        where typnamespace = 'public'::regnamespace
          and typname = 'agent_state'
    ) then
        create type public.agent_state as enum ('idle', 'queued', 'running', 'completed', 'failed');
    end if;

    if not exists (
        select 1
        from pg_type
        where typnamespace = 'public'::regnamespace
          and typname = 'plan_proposal_status'
    ) then
        create type public.plan_proposal_status as enum ('pending', 'approved', 'rejected', 'applied');
    end if;
end
$$;

create table if not exists public.project (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text not null default '',
    created_at timestamptz not null default timezone('utc', now()),
    constraint project_name_not_blank check (length(btrim(name)) > 0)
);

create table if not exists public.project_member (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    session_id text not null,
    role public.project_member_role not null,
    can_approve boolean not null default false,
    can_edit boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    constraint project_member_session_id_not_blank check (length(btrim(session_id)) > 0),
    constraint project_member_project_session_unique unique (project_id, session_id)
);

create table if not exists public.chat_message (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    session_id text not null,
    content text not null,
    created_at timestamptz not null default timezone('utc', now()),
    constraint chat_message_session_id_not_blank check (length(btrim(session_id)) > 0),
    constraint chat_message_content_not_blank check (length(btrim(content)) > 0)
);

create table if not exists public.uploaded_file (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    session_id text not null,
    storage_path text not null,
    mime_type text not null,
    created_at timestamptz not null default timezone('utc', now()),
    constraint uploaded_file_session_id_not_blank check (length(btrim(session_id)) > 0),
    constraint uploaded_file_storage_path_not_blank check (length(btrim(storage_path)) > 0),
    constraint uploaded_file_mime_type_not_blank check (length(btrim(mime_type)) > 0),
    constraint uploaded_file_storage_path_unique unique (storage_path)
);

create table if not exists public.agent_status (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    agent public.agent_name not null,
    status public.agent_state not null default 'idle',
    updated_at timestamptz not null default timezone('utc', now()),
    constraint agent_status_project_agent_unique unique (project_id, agent)
);

create table if not exists public.plan_proposal (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    status public.plan_proposal_status not null default 'pending',
    changes jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    constraint plan_proposal_changes_is_array check (jsonb_typeof(changes) = 'array')
);

create table if not exists public.project_plan (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    content jsonb not null default '{}'::jsonb,
    version integer not null default 1,
    finalized_at timestamptz,
    constraint project_plan_project_unique unique (project_id),
    constraint project_plan_version_positive check (version > 0),
    constraint project_plan_content_is_object check (jsonb_typeof(content) = 'object')
);

create table if not exists public.plan_version (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    content jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    constraint plan_version_content_is_object check (jsonb_typeof(content) = 'object')
);

create index if not exists project_created_at_idx on public.project (created_at desc);
create index if not exists project_member_project_id_idx on public.project_member (project_id);
create index if not exists project_member_session_id_idx on public.project_member (session_id);
create index if not exists chat_message_project_created_at_idx on public.chat_message (project_id, created_at);
create index if not exists uploaded_file_project_created_at_idx on public.uploaded_file (project_id, created_at);
create index if not exists agent_status_project_id_idx on public.agent_status (project_id);
create index if not exists plan_proposal_project_created_at_idx on public.plan_proposal (project_id, created_at desc);
create index if not exists project_plan_project_id_idx on public.project_plan (project_id);
create index if not exists plan_version_project_created_at_idx on public.plan_version (project_id, created_at desc);

revoke all on table public.project from anon, authenticated;
revoke all on table public.project_member from anon, authenticated;
revoke all on table public.chat_message from anon, authenticated;
revoke all on table public.uploaded_file from anon, authenticated;
revoke all on table public.agent_status from anon, authenticated;
revoke all on table public.plan_proposal from anon, authenticated;
revoke all on table public.project_plan from anon, authenticated;
revoke all on table public.plan_version from anon, authenticated;

grant select on table public.chat_message to anon, authenticated;
grant select on table public.agent_status to anon, authenticated;
grant select on table public.plan_proposal to anon, authenticated;
grant select on table public.project_plan to anon, authenticated;

alter table public.project enable row level security;
alter table public.project_member enable row level security;
alter table public.chat_message enable row level security;
alter table public.uploaded_file enable row level security;
alter table public.agent_status enable row level security;
alter table public.plan_proposal enable row level security;
alter table public.project_plan enable row level security;
alter table public.plan_version enable row level security;

drop policy if exists "demo read access for chat_message" on public.chat_message;
create policy "demo read access for chat_message"
on public.chat_message
for select
to anon, authenticated
using (true);

drop policy if exists "demo read access for agent_status" on public.agent_status;
create policy "demo read access for agent_status"
on public.agent_status
for select
to anon, authenticated
using (true);

drop policy if exists "demo read access for plan_proposal" on public.plan_proposal;
create policy "demo read access for plan_proposal"
on public.plan_proposal
for select
to anon, authenticated
using (true);

drop policy if exists "demo read access for project_plan" on public.project_plan;
create policy "demo read access for project_plan"
on public.project_plan
for select
to anon, authenticated
using (true);

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'chat_message'
    ) then
        alter publication supabase_realtime add table public.chat_message;
    end if;

    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'agent_status'
    ) then
        alter publication supabase_realtime add table public.agent_status;
    end if;

    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'plan_proposal'
    ) then
        alter publication supabase_realtime add table public.plan_proposal;
    end if;

    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'project_plan'
    ) then
        alter publication supabase_realtime add table public.project_plan;
    end if;
end
$$;

insert into storage.buckets (id, name, public)
values ('orca-uploads', 'orca-uploads', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;
