do $$
begin
    if not exists (
        select 1
        from pg_type
        where typnamespace = 'public'::regnamespace
          and typname = 'agent_run_status'
    ) then
        create type public.agent_run_status as enum ('queued', 'running', 'completed', 'failed');
    end if;

    if not exists (
        select 1
        from pg_type
        where typnamespace = 'public'::regnamespace
          and typname = 'project_memory_kind'
    ) then
        create type public.project_memory_kind as enum (
            'decision',
            'task',
            'risk',
            'requirement',
            'summary',
            'detail'
        );
    end if;

    if not exists (
        select 1
        from pg_type
        where typnamespace = 'public'::regnamespace
          and typname = 'project_memory_confidence'
    ) then
        create type public.project_memory_confidence as enum ('low', 'medium', 'high');
    end if;

    if not exists (
        select 1
        from pg_type
        where typnamespace = 'public'::regnamespace
          and typname = 'project_memory_status'
    ) then
        create type public.project_memory_status as enum ('active', 'resolved', 'superseded');
    end if;
end
$$;

alter type public.plan_proposal_status add value if not exists 'superseded';

create table if not exists public.agent_run (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    triggered_by text not null,
    status public.agent_run_status not null default 'queued',
    new_message_ids jsonb not null default '[]'::jsonb,
    new_file_ids jsonb not null default '[]'::jsonb,
    error_code text,
    error_message text,
    created_at timestamptz not null default timezone('utc', now()),
    started_at timestamptz,
    completed_at timestamptz,
    constraint agent_run_triggered_by_not_blank check (length(btrim(triggered_by)) > 0),
    constraint agent_run_new_message_ids_is_array check (jsonb_typeof(new_message_ids) = 'array'),
    constraint agent_run_new_file_ids_is_array check (jsonb_typeof(new_file_ids) = 'array')
);

create table if not exists public.project_memory (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    kind public.project_memory_kind not null,
    content text not null,
    source_message_ids jsonb not null default '[]'::jsonb,
    source_file_ids jsonb not null default '[]'::jsonb,
    confidence public.project_memory_confidence not null default 'medium',
    status public.project_memory_status not null default 'active',
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint project_memory_content_not_blank check (length(btrim(content)) > 0),
    constraint project_memory_source_message_ids_is_array check (jsonb_typeof(source_message_ids) = 'array'),
    constraint project_memory_source_file_ids_is_array check (jsonb_typeof(source_file_ids) = 'array')
);

create table if not exists public.conversation_summary (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    summary text not null,
    source_message_ids jsonb not null default '[]'::jsonb,
    last_message_created_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    constraint conversation_summary_not_blank check (length(btrim(summary)) > 0),
    constraint conversation_summary_source_message_ids_is_array check (jsonb_typeof(source_message_ids) = 'array')
);

create table if not exists public.agent_artifact (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references public.agent_run (id) on delete cascade,
    project_id uuid not null references public.project (id) on delete cascade,
    agent public.agent_name not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    constraint agent_artifact_payload_is_object check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.project_llm_usage (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    date date not null default current_date,
    call_count integer not null default 0,
    constraint project_llm_usage_call_count_non_negative check (call_count >= 0),
    constraint project_llm_usage_project_date_unique unique (project_id, date)
);

create index if not exists agent_run_project_created_at_idx
    on public.agent_run (project_id, created_at desc);
create index if not exists agent_run_project_status_idx
    on public.agent_run (project_id, status);
create index if not exists project_memory_project_status_updated_at_idx
    on public.project_memory (project_id, status, updated_at desc);
create index if not exists conversation_summary_project_created_at_idx
    on public.conversation_summary (project_id, created_at desc);
create index if not exists agent_artifact_project_created_at_idx
    on public.agent_artifact (project_id, created_at desc);
create index if not exists project_llm_usage_project_date_idx
    on public.project_llm_usage (project_id, date desc);

revoke all on table public.agent_run from anon, authenticated;
revoke all on table public.project_memory from anon, authenticated;
revoke all on table public.conversation_summary from anon, authenticated;
revoke all on table public.agent_artifact from anon, authenticated;
revoke all on table public.project_llm_usage from anon, authenticated;

grant select on table public.agent_artifact to anon, authenticated;

alter table public.agent_run enable row level security;
alter table public.project_memory enable row level security;
alter table public.conversation_summary enable row level security;
alter table public.agent_artifact enable row level security;
alter table public.project_llm_usage enable row level security;

drop policy if exists "demo read access for agent_artifact" on public.agent_artifact;
create policy "demo read access for agent_artifact"
on public.agent_artifact
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
          and tablename = 'agent_artifact'
    ) then
        alter publication supabase_realtime add table public.agent_artifact;
    end if;
end
$$;
