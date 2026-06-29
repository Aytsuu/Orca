alter table public.project
add column if not exists last_processed_message_at timestamptz;

create index if not exists project_last_processed_message_at_idx
    on public.project (last_processed_message_at desc);
