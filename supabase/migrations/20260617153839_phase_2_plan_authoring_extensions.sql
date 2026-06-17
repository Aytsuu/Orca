alter table public.plan_version
    add column if not exists version integer;

update public.plan_version
set version = coalesce(version, 1)
where version is null;

alter table public.plan_version
    alter column version set not null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'plan_version_version_positive'
          and conrelid = 'public.plan_version'::regclass
    ) then
        alter table public.plan_version
            add constraint plan_version_version_positive
                check (version > 0);
    end if;
end
$$;
