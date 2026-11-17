-- Check-in app. Additive only: two new tables + RPCs, nothing existing is touched.
-- Staff = members whose current position (tokan.po_nt) is เขต or higher; they only ever see their own ภาค (tokan.phak_nt).

create table public.checkin_events (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(name) between 1 and 200),
  event_date       date not null default current_date,
  phak             text not null,
  created_by_mt_co bigint not null,
  created_at       timestamptz not null default now()
);

create table public.checkin_records (
  event_id            uuid not null references public.checkin_events (id) on delete cascade,
  mt_co               bigint not null,
  checked_in_by_mt_co bigint not null,
  checked_in_at       timestamptz not null default now(),
  primary key (event_id, mt_co)
);

alter table public.checkin_events  enable row level security;
alter table public.checkin_records enable row level security;
-- no policies on purpose: only the security-definer functions below read or write these tables

comment on table public.checkin_events  is '[APP: Checkin] Events staff check members into. One ภาค per event. Reached only through checkin_* functions.';
comment on table public.checkin_records is '[APP: Checkin] Who was checked in to which event, and by whom. Reached only through checkin_* functions.';

-- caller context: who is signed in (mt_co from the JWT), re-validated against the CURRENT tokan row on every call
create function public.checkin_ctx(out mt bigint, out phak text)
language plpgsql stable security definer set search_path = public as $$
declare
  claim text := auth.jwt() -> 'app_metadata' ->> 'mt_co';
  po    text;
begin
  if claim is null or claim !~ '^\d{1,12}$' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  mt := claim::bigint;
  select t.po_nt, t.phak_nt into po, phak from tokan t where t.mt_co = mt;
  if po is null or phak is null
     or po !~ 'ภาค|เขต|ฝ่าย'
     or exists (select 1 from member_blocks b where b.mt_co = mt) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create function public.checkin_events_list()
returns table (id uuid, name text, event_date date, n bigint)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.event_date,
         (select count(*) from checkin_records r where r.event_id = e.id)
  from checkin_events e, checkin_ctx() c
  where e.phak = c.phak
  order by e.event_date desc, e.created_at desc
$$;

create function public.checkin_event_create(p_name text, p_date date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c record; new_id uuid;
begin
  select * into c from checkin_ctx();
  insert into checkin_events (name, event_date, phak, created_by_mt_co)
  values (btrim(p_name), p_date, c.phak, c.mt) returning id into new_id;
  return new_id;
end $$;

create function public.checkin_event_get(p_id uuid)
returns table (name text, event_date date)
language sql stable security definer set search_path = public as $$
  select e.name, e.event_date from checkin_events e, checkin_ctx() c
  where e.id = p_id and e.phak = c.phak
$$;

create function public.checkin_search(p_q text)
returns table (mt_co bigint, name text, khet text)
language sql stable security definer set search_path = public as $$
  select t.mt_co, concat_ws(' ', t.name_t, t.saku_t), t.sh_nt
  from tokan t, checkin_ctx() c
  where t.phak_nt = c.phak
    and length(btrim(p_q)) >= 1
    and case when btrim(p_q) ~ '^\d+$'
             then starts_with(t.mt_co::text, btrim(p_q))
             else length(btrim(p_q)) >= 2
                  and strpos(lower(concat_ws(' ', t.name_t, t.saku_t)), lower(btrim(p_q))) > 0 end
  order by t.mt_co
  limit 20
$$;

create function public.checkin_list(p_event uuid)
returns table (mt_co bigint, name text, khet text, checked_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.mt_co, concat_ws(' ', t.name_t, t.saku_t), t.sh_nt, r.checked_in_at
  from checkin_records r
  join checkin_events e on e.id = r.event_id
  join checkin_ctx() c on c.phak = e.phak
  left join tokan t on t.mt_co = r.mt_co
  where r.event_id = p_event
  order by r.checked_in_at desc
$$;

create function public.checkin_mark(p_event uuid, p_mt bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from checkin_ctx();
  if not exists (select 1 from checkin_events e where e.id = p_event and e.phak = c.phak)
     or not exists (select 1 from tokan t where t.mt_co = p_mt and t.phak_nt = c.phak) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into checkin_records (event_id, mt_co, checked_in_by_mt_co)
  values (p_event, p_mt, c.mt) on conflict do nothing;
end $$;

create function public.checkin_undo(p_event uuid, p_mt bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from checkin_ctx();
  delete from checkin_records r using checkin_events e
  where r.event_id = p_event and r.mt_co = p_mt and e.id = r.event_id and e.phak = c.phak;
end $$;

-- lock down: callable by signed-in users only (ctx still rejects anyone below เขต)
revoke all on function
  public.checkin_ctx(), public.checkin_events_list(), public.checkin_event_create(text, date),
  public.checkin_event_get(uuid), public.checkin_search(text), public.checkin_list(uuid),
  public.checkin_mark(uuid, bigint), public.checkin_undo(uuid, bigint)
from public, anon;
grant execute on function
  public.checkin_events_list(), public.checkin_event_create(text, date),
  public.checkin_event_get(uuid), public.checkin_search(text), public.checkin_list(uuid),
  public.checkin_mark(uuid, bigint), public.checkin_undo(uuid, bigint)
to authenticated;

-- tables are reachable only through the functions above
revoke all on public.checkin_events, public.checkin_records from anon, authenticated;
