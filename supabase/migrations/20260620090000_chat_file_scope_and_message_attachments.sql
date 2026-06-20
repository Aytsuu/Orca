do $$
begin
    if not exists (
        select 1
        from pg_type
        where typnamespace = 'public'::regnamespace
          and typname = 'uploaded_file_purpose'
    ) then
        create type public.uploaded_file_purpose as enum ('chat', 'source');
    end if;
end
$$;

alter table public.chat_message
    add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.chat_message
    drop constraint if exists chat_message_attachments_is_array;

alter table public.chat_message
    add constraint chat_message_attachments_is_array
        check (jsonb_typeof(attachments) = 'array');

alter table public.uploaded_file
    add column if not exists purpose public.uploaded_file_purpose,
    add column if not exists is_ai_context boolean;

update public.uploaded_file
set purpose = (
        case
            when coalesce(is_ai_context, true) then 'source'
            else 'chat'
        end
    )::public.uploaded_file_purpose,
    is_ai_context = coalesce(is_ai_context, true)
where purpose is null
   or is_ai_context is null;

alter table public.uploaded_file
    alter column purpose set default 'source',
    alter column purpose set not null,
    alter column is_ai_context set default true,
    alter column is_ai_context set not null;

create index if not exists uploaded_file_project_ai_context_created_at_idx
    on public.uploaded_file (project_id, is_ai_context, created_at desc);
