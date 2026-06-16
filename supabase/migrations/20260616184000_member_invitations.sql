create table if not exists public.project_invitation (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    token text not null unique,
    invitee_name text not null,
    invitee_email text not null,
    role public.project_member_role not null,
    can_approve boolean not null default false,
    can_edit boolean not null default true,
    created_by_session_id text not null,
    created_at timestamptz not null default timezone('utc', now()),
    redeemed_at timestamptz,
    redeemed_by_session_id text,
    constraint project_invitation_token_not_blank check (length(btrim(token)) > 0),
    constraint project_invitation_invitee_name_not_blank check (length(btrim(invitee_name)) > 0),
    constraint project_invitation_invitee_email_not_blank check (length(btrim(invitee_email)) > 0),
    constraint project_invitation_creator_session_not_blank check (length(btrim(created_by_session_id)) > 0)
);

create index if not exists project_invitation_project_created_at_idx
on public.project_invitation (project_id, created_at desc);

create index if not exists project_invitation_token_idx
on public.project_invitation (token);

revoke all on table public.project_invitation from anon, authenticated;

alter table public.project_invitation enable row level security;
