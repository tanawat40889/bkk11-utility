-- Each check-in session (ครั้ง) of an event has its own date. events.event_date = the earliest of them.
alter table public.checkin_events add column round_dates date[];
update public.checkin_events set round_dates = array_fill(event_date, array[rounds]);
alter table public.checkin_events alter column round_dates set not null;
alter table public.checkin_events add constraint checkin_round_dates_len check (cardinality(round_dates) = rounds);

drop function public.checkin_events_list();
drop function public.checkin_event_create(text, date, int);
drop function public.checkin_event_get(uuid);
drop function public.checkin_round_add(uuid);

create function public.checkin_events_list()
returns table (id uuid, name text, event_date date, last_date date, rounds int, n bigint)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.event_date, (select max(d) from unnest(e.round_dates) d), e.rounds,
         (select count(*) from checkin_records r where r.event_id = e.id)
  from checkin_events e, checkin_ctx() c
  where e.phak = c.phak
  order by e.event_date desc, e.created_at desc
$$;

create function public.checkin_event_create(p_name text, p_dates date[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare c record; new_id uuid;
begin
  select * into c from checkin_ctx();
  if p_dates is null or cardinality(p_dates) not between 1 and 20 or array_position(p_dates, null) is not null then
    raise exception 'bad dates' using errcode = '22023';
  end if;
  insert into checkin_events (name, event_date, phak, created_by_mt_co, rounds, round_dates)
  values (btrim(p_name), (select min(d) from unnest(p_dates) d), c.phak, c.mt, cardinality(p_dates), p_dates)
  returning id into new_id;
  return new_id;
end $$;

create function public.checkin_event_get(p_id uuid)
returns table (name text, event_date date, rounds int, round_dates date[], counts int[])
language sql stable security definer set search_path = public as $$
  select e.name, e.event_date, e.rounds, e.round_dates,
         array(select (select count(*)::int from checkin_records r where r.event_id = e.id and r.round = g)
               from generate_series(1, e.rounds) g order by g)
  from checkin_events e, checkin_ctx() c
  where e.id = p_id and e.phak = c.phak
$$;

create function public.checkin_round_add(p_event uuid, p_date date)
returns int
language plpgsql security definer set search_path = public as $$
declare c record; r int;
begin
  select * into c from checkin_ctx();
  if p_date is null then raise exception 'bad date' using errcode = '22023'; end if;
  update checkin_events e
     set round_dates = e.round_dates || p_date, rounds = e.rounds + 1, event_date = least(e.event_date, p_date)
   where e.id = p_event and e.phak = c.phak and e.rounds < 20
  returning e.rounds into r;
  if r is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return r;
end $$;

create function public.checkin_round_set_date(p_event uuid, p_round int, p_date date)
returns void
language plpgsql security definer set search_path = public as $$
declare c record; ok boolean;
begin
  select * into c from checkin_ctx();
  if p_date is null then raise exception 'bad date' using errcode = '22023'; end if;
  update checkin_events e set round_dates[p_round] = p_date
   where e.id = p_event and e.phak = c.phak and p_round between 1 and e.rounds
  returning true into ok;
  if ok is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update checkin_events e set event_date = (select min(d) from unnest(e.round_dates) d) where e.id = p_event;
end $$;

revoke all on function
  public.checkin_events_list(), public.checkin_event_create(text, date[]), public.checkin_event_get(uuid),
  public.checkin_round_add(uuid, date), public.checkin_round_set_date(uuid, int, date)
from public, anon;
grant execute on function
  public.checkin_events_list(), public.checkin_event_create(text, date[]), public.checkin_event_get(uuid),
  public.checkin_round_add(uuid, date), public.checkin_round_set_date(uuid, int, date)
to authenticated;
