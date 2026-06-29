drop extension if exists "pg_net";

create extension if not exists "vector" with schema "public";

create type "public"."transcript_status" as enum ('pending', 'processing', 'ready', 'failed', 'unsupported');

drop index if exists "public"."project_last_processed_message_at_idx";


  create table "public"."source_transcript" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid not null,
    "uploaded_file_id" uuid not null,
    "status" public.transcript_status not null default 'pending'::public.transcript_status,
    "extraction_method" text,
    "plain_text" text,
    "total_tokens_estimate" integer,
    "error_message" text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."source_transcript" enable row level security;


  create table "public"."source_transcript_chunk" (
    "id" uuid not null default gen_random_uuid(),
    "transcript_id" uuid not null,
    "project_id" uuid not null,
    "chunk_index" integer not null,
    "chunk_text" text not null,
    "embedding" public.vector(768),
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."source_transcript_chunk" enable row level security;

alter table "public"."project" drop column "last_processed_message_at";

CREATE INDEX source_transcript_chunk_embedding_idx ON public.source_transcript_chunk USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');

CREATE UNIQUE INDEX source_transcript_chunk_order ON public.source_transcript_chunk USING btree (transcript_id, chunk_index);

CREATE UNIQUE INDEX source_transcript_chunk_pkey ON public.source_transcript_chunk USING btree (id);

CREATE INDEX source_transcript_chunk_project_idx ON public.source_transcript_chunk USING btree (project_id);

CREATE INDEX source_transcript_chunk_transcript_idx ON public.source_transcript_chunk USING btree (transcript_id, chunk_index);

CREATE UNIQUE INDEX source_transcript_file_unique ON public.source_transcript USING btree (uploaded_file_id);

CREATE UNIQUE INDEX source_transcript_pkey ON public.source_transcript USING btree (id);

CREATE INDEX source_transcript_project_status_idx ON public.source_transcript USING btree (project_id, status);

CREATE INDEX source_transcript_uploaded_file_idx ON public.source_transcript USING btree (uploaded_file_id);

alter table "public"."source_transcript" add constraint "source_transcript_pkey" PRIMARY KEY using index "source_transcript_pkey";

alter table "public"."source_transcript_chunk" add constraint "source_transcript_chunk_pkey" PRIMARY KEY using index "source_transcript_chunk_pkey";

alter table "public"."source_transcript" add constraint "source_transcript_file_unique" UNIQUE using index "source_transcript_file_unique";

alter table "public"."source_transcript" add constraint "source_transcript_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.project(id) ON DELETE CASCADE not valid;

alter table "public"."source_transcript" validate constraint "source_transcript_project_id_fkey";

alter table "public"."source_transcript" add constraint "source_transcript_uploaded_file_id_fkey" FOREIGN KEY (uploaded_file_id) REFERENCES public.uploaded_file(id) ON DELETE CASCADE not valid;

alter table "public"."source_transcript" validate constraint "source_transcript_uploaded_file_id_fkey";

alter table "public"."source_transcript_chunk" add constraint "source_transcript_chunk_order" UNIQUE using index "source_transcript_chunk_order";

alter table "public"."source_transcript_chunk" add constraint "source_transcript_chunk_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.project(id) ON DELETE CASCADE not valid;

alter table "public"."source_transcript_chunk" validate constraint "source_transcript_chunk_project_id_fkey";

alter table "public"."source_transcript_chunk" add constraint "source_transcript_chunk_transcript_id_fkey" FOREIGN KEY (transcript_id) REFERENCES public.source_transcript(id) ON DELETE CASCADE not valid;

alter table "public"."source_transcript_chunk" validate constraint "source_transcript_chunk_transcript_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.match_source_transcripts(p_project_id uuid, query_embedding public.vector, match_count integer DEFAULT 5, similarity_threshold double precision DEFAULT 0.3)
 RETURNS TABLE(chunk_id uuid, transcript_id uuid, uploaded_file_id uuid, chunk_text text, chunk_index integer, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
    select
        c.id as chunk_id,
        c.transcript_id,
        t.uploaded_file_id,
        c.chunk_text,
        c.chunk_index,
        1 - (c.embedding <=> query_embedding) as similarity
    from public.source_transcript_chunk c
    join public.source_transcript t on t.id = c.transcript_id
    where t.project_id = p_project_id
      and t.status = 'ready'
      and c.embedding is not null
      and 1 - (c.embedding <=> query_embedding) >= similarity_threshold
    order by c.embedding <=> query_embedding
    limit greatest(match_count, 1);
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

grant delete on table "public"."source_transcript" to "service_role";

grant insert on table "public"."source_transcript" to "service_role";

grant references on table "public"."source_transcript" to "service_role";

grant select on table "public"."source_transcript" to "service_role";

grant trigger on table "public"."source_transcript" to "service_role";

grant truncate on table "public"."source_transcript" to "service_role";

grant update on table "public"."source_transcript" to "service_role";

grant delete on table "public"."source_transcript_chunk" to "service_role";

grant insert on table "public"."source_transcript_chunk" to "service_role";

grant references on table "public"."source_transcript_chunk" to "service_role";

grant select on table "public"."source_transcript_chunk" to "service_role";

grant trigger on table "public"."source_transcript_chunk" to "service_role";

grant truncate on table "public"."source_transcript_chunk" to "service_role";

grant update on table "public"."source_transcript_chunk" to "service_role";


