-- Only listed members may create events and change their setup (add ครั้ง, change dates). Everyone เขต+ can still check in.
create table public.checkin_admins (
  mt_co      bigint primary key,
  created_at timestamptz not null default now()
);
alter table public.checkin_admins enable row level security;
revoke all on public.checkin_admins from anon, authenticated;
comment on table public.checkin_admins is '[APP: Checkin] Members allowed to create/set up check-in events. Edit with SQL / service role only.';
insert into public.checkin_admins (mt_co) values (66221235);

create function public.checkin_is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from checkin_admins a, checkin_ctx() c where a.mt_co = c.mt)
$$;
revoke all on function public.checkin_is_admin() from public, anon;
grant execute on function public.checkin_is_admin() to authenticated;

create or replace function public.checkin_event_create(p_name text, p_dates date[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare c record; new_id uuid;
begin
  select * into c from checkin_ctx();
  if not checkin_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_dates is null or cardinality(p_dates) not between 1 and 20 or array_position(p_dates, null) is not null then
    raise exception 'bad dates' using errcode = '22023';
  end if;
  insert into checkin_events (name, event_date, phak, created_by_mt_co, rounds, round_dates)
  values (btrim(p_name), (select min(d) from unnest(p_dates) d), c.phak, c.mt, cardinality(p_dates), p_dates)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.checkin_round_add(p_event uuid, p_date date)
returns int
language plpgsql security definer set search_path = public as $$
declare c record; r int;
begin
  select * into c from checkin_ctx();
  if not checkin_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_date is null then raise exception 'bad date' using errcode = '22023'; end if;
  update checkin_events e
     set round_dates = e.round_dates || p_date, rounds = e.rounds + 1, event_date = least(e.event_date, p_date)
   where e.id = p_event and e.phak = c.phak and e.rounds < 20
  returning e.rounds into r;
  if r is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return r;
end $$;

create or replace function public.checkin_round_set_date(p_event uuid, p_round int, p_date date)
returns void
language plpgsql security definer set search_path = public as $$
declare c record; ok boolean;
begin
  select * into c from checkin_ctx();
  if not checkin_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_date is null then raise exception 'bad date' using errcode = '22023'; end if;
  update checkin_events e set round_dates[p_round] = p_date
   where e.id = p_event and e.phak = c.phak and p_round between 1 and e.rounds
  returning true into ok;
  if ok is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update checkin_events e set event_date = (select min(d) from unnest(e.round_dates) d) where e.id = p_event;
end $$;
