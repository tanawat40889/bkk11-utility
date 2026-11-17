-- Meeting level (ระดับการประชุม): รวมภาค / ภาค / เขต.
-- Events are shared across the whole รวมภาค; the level decides which members a staff member can search and check in:
--   รวมภาค -> members of the staff's own รวมภาค (tokan.rwp_nt)
--   ภาค    -> members of the staff's own ภาค    (tokan.phak_nt)
--   เขต    -> members of the staff's own เขต    (tokan.sh_nt)
alter table public.checkin_events add column level text not null default 'ภาค'
  check (level in ('รวมภาค', 'ภาค', 'เขต'));
alter table public.checkin_events add column rwp text;
update public.checkin_events e set rwp = coalesce((select t.rwp_nt from tokan t where t.mt_co = e.created_by_mt_co), 'กรุงเทพ 11');
alter table public.checkin_events alter column rwp set not null;

drop function public.checkin_ctx();
create function public.checkin_ctx(out mt bigint, out rwp text, out phak text, out sh text)
language plpgsql stable security definer set search_path = public as $$
declare
  claim text := auth.jwt() -> 'app_metadata' ->> 'mt_co';
  po    text;
begin
  if claim is null or claim !~ '^\d{1,12}$' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  mt := claim::bigint;
  select t.po_nt, t.rwp_nt, t.phak_nt, t.sh_nt into po, rwp, phak, sh from tokan t where t.mt_co = mt;
  if po is null or rwp is null or phak is null
     or po !~ 'ภาค|เขต|ฝ่าย'
     or exists (select 1 from member_blocks b where b.mt_co = mt) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;
revoke all on function public.checkin_ctx() from public, anon;

-- is member t inside the staff's scope for an event of this level?
create function public.checkin_in_scope(lvl text, t_rwp text, t_phak text, t_sh text, c_rwp text, c_phak text, c_sh text)
returns boolean
language sql immutable as $$
  select t_rwp is not distinct from c_rwp and case lvl
    when 'รวมภาค' then true
    when 'ภาค'    then t_phak is not distinct from c_phak
    else               t_phak is not distinct from c_phak and t_sh is not distinct from c_sh and c_sh is not null
  end
$$;
revoke all on function public.checkin_in_scope(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.checkin_in_scope(text, text, text, text, text, text, text) to authenticated;

drop function public.checkin_events_list();
drop function public.checkin_event_create(text, date[]);
drop function public.checkin_event_get(uuid);
drop function public.checkin_search(text);

create function public.checkin_events_list()
returns table (id uuid, name text, event_date date, last_date date, rounds int, n bigint, level text)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.event_date, (select max(d) from unnest(e.round_dates) d), e.rounds,
         (select count(*) from checkin_records r join tokan t on t.mt_co = r.mt_co
           where r.event_id = e.id and checkin_in_scope(e.level, t.rwp_nt, t.phak_nt, t.sh_nt, c.rwp, c.phak, c.sh)),
         e.level
  from checkin_events e, checkin_ctx() c
  where e.rwp = c.rwp
  order by e.event_date desc, e.created_at desc
$$;

create function public.checkin_event_create(p_name text, p_dates date[], p_level text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c record; new_id uuid;
begin
  select * into c from checkin_ctx();
  if not checkin_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_level is null or p_level not in ('รวมภาค', 'ภาค', 'เขต') then raise exception 'bad level' using errcode = '22023'; end if;
  if p_dates is null or cardinality(p_dates) not between 1 and 20 or array_position(p_dates, null) is not null then
    raise exception 'bad dates' using errcode = '22023';
  end if;
  insert into checkin_events (name, event_date, phak, rwp, level, created_by_mt_co, rounds, round_dates)
  values (btrim(p_name), (select min(d) from unnest(p_dates) d), c.phak, c.rwp, p_level, c.mt, cardinality(p_dates), p_dates)
  returning id into new_id;
  return new_id;
end $$;

create function public.checkin_event_get(p_id uuid)
returns table (name text, event_date date, rounds int, round_dates date[], counts int[], level text, scope text)
language sql stable security definer set search_path = public as $$
  select e.name, e.event_date, e.rounds, e.round_dates,
         array(select (select count(*)::int from checkin_records r join tokan t on t.mt_co = r.mt_co
                        where r.event_id = e.id and r.round = g
                          and checkin_in_scope(e.level, t.rwp_nt, t.phak_nt, t.sh_nt, c.rwp, c.phak, c.sh))
               from generate_series(1, e.rounds) g order by g),
         e.level,
         case e.level when 'รวมภาค' then 'รวมภาค ' || c.rwp when 'ภาค' then 'ภาค ' || c.phak else 'เขต ' || coalesce(c.sh, '-') end
  from checkin_events e, checkin_ctx() c
  where e.id = p_id and e.rwp = c.rwp
$$;

create function public.checkin_event_set_level(p_event uuid, p_level text)
returns void
language plpgsql security definer set search_path = public as $$
declare c record; ok boolean;
begin
  select * into c from checkin_ctx();
  if not checkin_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_level is null or p_level not in ('รวมภาค', 'ภาค', 'เขต') then raise exception 'bad level' using errcode = '22023'; end if;
  update checkin_events e set level = p_level where e.id = p_event and e.rwp = c.rwp returning true into ok;
  if ok is null then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

create function public.checkin_search(p_event uuid, p_q text)
returns table (mt_co bigint, name text, khet text)
language sql stable security definer set search_path = public as $$
  select t.mt_co, concat_ws(' ', t.name_t, t.saku_t), t.sh_nt
  from checkin_events e, checkin_ctx() c, tokan t
  where e.id = p_event and e.rwp = c.rwp
    and checkin_in_scope(e.level, t.rwp_nt, t.phak_nt, t.sh_nt, c.rwp, c.phak, c.sh)
    and length(btrim(p_q)) >= 1
    and case when btrim(p_q) ~ '^\d+$'
             then starts_with(t.mt_co::text, btrim(p_q))
             else length(btrim(p_q)) >= 2
                  and strpos(lower(concat_ws(' ', t.name_t, t.saku_t)), lower(btrim(p_q))) > 0 end
  order by t.mt_co
  limit 20
$$;

create or replace function public.checkin_list(p_event uuid, p_round int)
returns table (mt_co bigint, name text, khet text, checked_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.mt_co, concat_ws(' ', t.name_t, t.saku_t), t.sh_nt, r.checked_in_at
  from checkin_records r
  join checkin_events e on e.id = r.event_id
  join checkin_ctx() c on c.rwp = e.rwp
  join tokan t on t.mt_co = r.mt_co
  where r.event_id = p_event and r.round = p_round
    and checkin_in_scope(e.level, t.rwp_nt, t.phak_nt, t.sh_nt, c.rwp, c.phak, c.sh)
  order by r.checked_in_at desc
$$;

create or replace function public.checkin_mark(p_event uuid, p_round int, p_mt bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from checkin_ctx();
  if not exists (
       select 1 from checkin_events e, tokan t
        where e.id = p_event and e.rwp = c.rwp and p_round between 1 and e.rounds and t.mt_co = p_mt
          and checkin_in_scope(e.level, t.rwp_nt, t.phak_nt, t.sh_nt, c.rwp, c.phak, c.sh)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into checkin_records (event_id, round, mt_co, checked_in_by_mt_co)
  values (p_event, p_round, p_mt, c.mt) on conflict do nothing;
end $$;

create or replace function public.checkin_undo(p_event uuid, p_round int, p_mt bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from checkin_ctx();
  delete from checkin_records r using checkin_events e, tokan t
  where r.event_id = p_event and r.round = p_round and r.mt_co = p_mt and e.id = r.event_id and e.rwp = c.rwp
    and t.mt_co = r.mt_co
    and checkin_in_scope(e.level, t.rwp_nt, t.phak_nt, t.sh_nt, c.rwp, c.phak, c.sh);
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
   where e.id = p_event and e.rwp = c.rwp and e.rounds < 20
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
   where e.id = p_event and e.rwp = c.rwp and p_round between 1 and e.rounds
  returning true into ok;
  if ok is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update checkin_events e set event_date = (select min(d) from unnest(e.round_dates) d) where e.id = p_event;
end $$;

revoke all on function
  public.checkin_events_list(), public.checkin_event_create(text, date[], text), public.checkin_event_get(uuid),
  public.checkin_event_set_level(uuid, text), public.checkin_search(uuid, text)
from public, anon;
grant execute on function
  public.checkin_events_list(), public.checkin_event_create(text, date[], text), public.checkin_event_get(uuid),
  public.checkin_event_set_level(uuid, text), public.checkin_search(uuid, text)
to authenticated;

create function public.checkin_event_rename(p_event uuid, p_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare c record; ok boolean;
begin
  select * into c from checkin_ctx();
  if not checkin_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'bad name' using errcode = '22023'; end if;
  update checkin_events e set name = btrim(p_name) where e.id = p_event and e.rwp = c.rwp returning true into ok;
  if ok is null then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;
revoke all on function public.checkin_event_rename(uuid, text) from public, anon;
grant execute on function public.checkin_event_rename(uuid, text) to authenticated;
