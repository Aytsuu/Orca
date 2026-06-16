alter table public.uploaded_file
    add column if not exists filename text,
    add column if not exists size_bytes bigint;

update public.uploaded_file
set filename = coalesce(nullif(filename, ''), regexp_replace(storage_path, '^.*/', '')),
    size_bytes = coalesce(size_bytes, 0)
where filename is null
   or size_bytes is null;

alter table public.uploaded_file
    alter column filename set not null,
    alter column size_bytes set not null;

alter table public.uploaded_file
    add constraint uploaded_file_filename_not_blank
        check (length(btrim(filename)) > 0);

alter table public.uploaded_file
    add constraint uploaded_file_size_bytes_non_negative
        check (size_bytes >= 0);

grant select on table public.uploaded_file to anon, authenticated;

drop policy if exists "demo read access for uploaded_file" on public.uploaded_file;
create policy "demo read access for uploaded_file"
on public.uploaded_file
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
          and tablename = 'uploaded_file'
    ) then
        alter publication supabase_realtime add table public.uploaded_file;
    end if;
end
$$;
