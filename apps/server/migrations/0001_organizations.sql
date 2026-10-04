-- Format: one file = one forward-only step, run in order.
-- Every business table carries organization_id from the start (ADR-0004).

-- PG18 owns uuidv7; older servers receive a compatible function without an extension.
do $bootstrap$
begin
  if current_setting('server_version_num')::integer < 180000
     and to_regprocedure('public.uuidv7()') is null then
    execute $definition$
      create function public.uuidv7() returns uuid language sql volatile as $function$
        select encode(
          set_byte(
            decode(lpad(to_hex(floor(extract(epoch from clock_timestamp()) * 1000)::bigint), 12, '0'), 'hex')
              || substring(uuid_send(gen_random_uuid()) from 7),
            6, (get_byte(uuid_send(gen_random_uuid()), 6) & 15) | 112
          ), 'hex'
        )::uuid
      $function$
    $definition$;
  end if;
end
$bootstrap$;

create table if not exists organizations (
  id uuid primary key default uuidv7(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
