-- An event can have several check-in rounds (รอบ); a member can be checked in once per round.
alter table public.checkin_events add column rounds int not null default 1 check (rounds between 1 and 20);
alter table public.checkin_records add column round int not null default 1 check (round >= 1);
alter table public.checkin_records drop constraint checkin_records_pkey;
alter table public.checkin_records add primary key (event_id, round, mt_co);

drop function public.checkin_events_list();
drop function public.checkin_event_create(text, date);
drop function public.checkin_event_get(uuid);
drop function public.checkin_list(uuid);
drop function public.checkin_mark(uuid, bigint);
drop function public.checkin_undo(uuid, bigint);

create function public.checkin_events_list()
returns table (id uuid, name text, event_date date, rounds int, n bigint)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.event_date, e.rounds,
         (select count(*) from checkin_records r where r.event_id = e.id)
  from checkin_events e, checkin_ctx() c
  where e.phak = c.phak
  order by e.event_date desc, e.created_at desc
$$;

create function public.checkin_event_create(p_name text, p_date date, p_rounds int default 1)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c record; new_id uuid;
begin
  select * into c from checkin_ctx();
  insert into checkin_events (name, event_date, phak, created_by_mt_co, rounds)
  values (btrim(p_name), p_date, c.phak, c.mt, greatest(1, least(coalesce(p_rounds, 1), 20)))
  returning id into new_id;
  return new_id;
end $$;

create function public.checkin_event_get(p_id uuid)
returns table (name text, event_date date, rounds int, counts int[])
language sql stable security definer set search_path = public as $$
  select e.name, e.event_date, e.rounds,
         array(select (select count(*)::int from checkin_records r where r.event_id = e.id and r.round = g)
               from generate_series(1, e.rounds) g order by g)
  from checkin_events e, checkin_ctx() c
  where e.id = p_id and e.phak = c.phak
$$;

create function public.checkin_round_add(p_event uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare c record; r int;
begin
  select * into c from checkin_ctx();
  update checkin_events e set rounds = e.rounds + 1
  where e.id = p_event and e.phak = c.phak and e.rounds < 20
  returning e.rounds into r;
  if r is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return r;
end $$;

create function public.checkin_list(p_event uuid, p_round int)
returns table (mt_co bigint, name text, khet text, checked_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.mt_co, concat_ws(' ', t.name_t, t.saku_t), t.sh_nt, r.checked_in_at
  from checkin_records r
  join checkin_events e on e.id = r.event_id
  join checkin_ctx() c on c.phak = e.phak
  left join tokan t on t.mt_co = r.mt_co
  where r.event_id = p_event and r.round = p_round
  order by r.checked_in_at desc
$$;

create function public.checkin_mark(p_event uuid, p_round int, p_mt bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from checkin_ctx();
  if not exists (select 1 from checkin_events e where e.id = p_event and e.phak = c.phak and p_round between 1 and e.rounds)
     or not exists (select 1 from tokan t where t.mt_co = p_mt and t.phak_nt = c.phak) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into checkin_records (event_id, round, mt_co, checked_in_by_mt_co)
  values (p_event, p_round, p_mt, c.mt) on conflict do nothing;
end $$;

create function public.checkin_undo(p_event uuid, p_round int, p_mt bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from checkin_ctx();
  delete from checkin_records r using checkin_events e
  where r.event_id = p_event and r.round = p_round and r.mt_co = p_mt and e.id = r.event_id and e.phak = c.phak;
end $$;

revoke all on function
  public.checkin_events_list(), public.checkin_event_create(text, date, int), public.checkin_event_get(uuid),
  public.checkin_round_add(uuid), public.checkin_list(uuid, int), public.checkin_mark(uuid, int, bigint),
  public.checkin_undo(uuid, int, bigint)
from public, anon;
grant execute on function
  public.checkin_events_list(), public.checkin_event_create(text, date, int), public.checkin_event_get(uuid),
  public.checkin_round_add(uuid), public.checkin_list(uuid, int), public.checkin_mark(uuid, int, bigint),
  public.checkin_undo(uuid, int, bigint)
to authenticated;
