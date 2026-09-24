-- Deathspot UG schema.
-- Public visitors never write to tables directly: the Next.js server calls the
-- security-definer functions below with the service role, after validating input,
-- rate limiting and hashing the visitor id. Moderators act through their own JWT,
-- checked by public.is_moderator().

-- ---------------------------------------------------------------- helpers

create or replace function public.is_moderator() returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'moderator')
$$;

create or replace function public.is_admin() returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

create or replace function public.derive_status(confirmations int, denials int) returns text
language sql immutable
as $$
  select case
    when denials > confirmations + 2 then 'disputed'
    when confirmations - denials >= 3 then 'confirmed'
    else 'unverified'
  end
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ---------------------------------------------------------------- tables

create table public.spots (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 3 and 80),
  description text not null default '' check (char_length(description) <= 600),
  lat double precision not null check (lat between -1.6 and 4.3),
  lng double precision not null check (lng between 29.5 and 35.1),
  area text not null default '' check (char_length(area) <= 80),
  category text not null check (category in ('murder', 'mob_action', 'boda_gang', 'robbery', 'stabbing', 'kidnapping', 'other')),
  severity smallint not null check (severity between 1 and 5),
  time_of_day text not null default 'any' check (time_of_day in ('day', 'night', 'any')),
  incident_date date,
  source_url text check (source_url is null or source_url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_confirmed_at timestamptz,
  confirmations int not null default 0,
  denials int not null default 0,
  -- Community verdict from votes.
  status text not null default 'unverified' check (status in ('unverified', 'confirmed', 'disputed')),
  -- Moderator verdict: only 'approved' spots are public.
  moderation text not null default 'approved' check (moderation in ('pending', 'approved', 'rejected')),
  moderator_verified boolean not null default false,
  flag_count int not null default 0,
  seeded boolean not null default false,
  reporter_hash text,
  moderated_by uuid,
  moderated_at timestamptz,
  moderation_note text
);
create index spots_moderation_idx on public.spots (moderation, created_at desc);
create index spots_flagged_idx on public.spots (flag_count desc) where flag_count > 0;
create trigger spots_touch before update on public.spots for each row execute function public.touch_updated_at();

create table public.votes (
  spot_id bigint not null references public.spots (id) on delete cascade,
  voter_hash text not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (spot_id, voter_hash)
);

create table public.flags (
  id bigint generated always as identity primary key,
  spot_id bigint not null references public.spots (id) on delete cascade,
  voter_hash text not null,
  reason text not null check (reason in ('inaccurate', 'names_person', 'duplicate', 'abusive', 'resolved', 'other')),
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  unique (spot_id, voter_hash)
);
create index flags_open_idx on public.flags (spot_id) where resolved_at is null;

create table public.moderation_log (
  id bigint generated always as identity primary key,
  spot_id bigint references public.spots (id) on delete set null,
  spot_title text,
  actor uuid,
  actor_email text,
  action text not null,
  note text,
  created_at timestamptz not null default now()
);
create index moderation_log_created_idx on public.moderation_log (created_at desc);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.settings (key, value) values
  ('require_approval', 'false'),
  ('auto_hide_flag_threshold', '3');

-- ---------------------------------------------------------------- row level security

alter table public.spots enable row level security;
alter table public.votes enable row level security;
alter table public.flags enable row level security;
alter table public.moderation_log enable row level security;
alter table public.settings enable row level security;

create policy "Approved spots are public" on public.spots
  for select to anon, authenticated using (moderation = 'approved');
create policy "Moderators read all spots" on public.spots
  for select to authenticated using (public.is_moderator());

create policy "Moderators read votes" on public.votes
  for select to authenticated using (public.is_moderator());

create policy "Moderators read flags" on public.flags
  for select to authenticated using (public.is_moderator());

create policy "Moderators read the log" on public.moderation_log
  for select to authenticated using (public.is_moderator());

create policy "Settings are public" on public.settings
  for select to anon, authenticated using (true);

-- Hide reporter/voter hashes from the public API even on approved rows.
revoke select on public.spots from anon;
grant select (id, title, description, lat, lng, area, category, severity, time_of_day, incident_date,
  source_url, created_at, updated_at, last_confirmed_at, confirmations, denials, status,
  moderator_verified, seeded) on public.spots to anon;

-- ---------------------------------------------------------------- internal helpers

create or replace function public.log_action(p_spot bigint, p_action text, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.moderation_log (spot_id, spot_title, actor, actor_email, action, note)
  values (
    p_spot,
    (select title from public.spots where id = p_spot),
    auth.uid(),
    auth.jwt() ->> 'email',
    p_action,
    nullif(p_note, '')
  );
end
$$;

-- ---------------------------------------------------------------- public actions (service role only)

create or replace function public.report_spot(p jsonb, p_reporter text)
returns public.spots
language plpgsql security definer set search_path = ''
as $$
declare
  needs_review boolean := coalesce((select value::text::boolean from public.settings where key = 'require_approval'), false);
  s public.spots;
begin
  insert into public.spots (title, description, lat, lng, area, category, severity, time_of_day,
    incident_date, source_url, reporter_hash, confirmations, last_confirmed_at, moderation)
  values (
    p ->> 'title', coalesce(p ->> 'description', ''), (p ->> 'lat')::float8, (p ->> 'lng')::float8,
    coalesce(p ->> 'area', ''), p ->> 'category', (p ->> 'severity')::smallint,
    coalesce(p ->> 'time_of_day', 'any'), nullif(p ->> 'incident_date', '')::date,
    nullif(p ->> 'source_url', ''), p_reporter, 1, now(),
    case when needs_review then 'pending' else 'approved' end
  )
  returning * into s;
  -- The reporter's own report counts as their confirmation vote.
  insert into public.votes (spot_id, voter_hash, value) values (s.id, p_reporter, 1);
  return s;
end
$$;

-- Returns the updated spot, or null if the spot is not public. Raises 'already_voted'.
create or replace function public.cast_vote(p_spot bigint, p_voter text, p_value smallint)
returns public.spots
language plpgsql security definer set search_path = ''
as $$
declare
  prev smallint;
  s public.spots;
begin
  perform 1 from public.spots where id = p_spot and moderation = 'approved' for update;
  if not found then
    return null;
  end if;

  select value into prev from public.votes where spot_id = p_spot and voter_hash = p_voter;
  if prev = p_value then
    raise exception 'already_voted' using errcode = 'P0001';
  end if;

  insert into public.votes (spot_id, voter_hash, value) values (p_spot, p_voter, p_value)
  on conflict (spot_id, voter_hash) do update set value = excluded.value, created_at = now();

  update public.spots set
    confirmations = confirmations + (case when p_value = 1 then 1 else 0 end) - (case when prev = 1 then 1 else 0 end),
    denials = denials + (case when p_value = -1 then 1 else 0 end) - (case when prev = -1 then 1 else 0 end),
    last_confirmed_at = case when p_value = 1 then now() else last_confirmed_at end
  where id = p_spot;

  update public.spots set status = public.derive_status(confirmations, denials)
  where id = p_spot
  returning * into s;
  return s;
end
$$;

-- Returns 'flagged', 'hidden' (auto-hidden for review) or null if the spot is not public.
-- Raises 'already_flagged'.
create or replace function public.flag_spot(p_spot bigint, p_voter text, p_reason text, p_note text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  threshold int := coalesce((select value::text::int from public.settings where key = 'auto_hide_flag_threshold'), 3);
  s public.spots;
begin
  perform 1 from public.spots where id = p_spot and moderation = 'approved' for update;
  if not found then
    return null;
  end if;

  begin
    insert into public.flags (spot_id, voter_hash, reason, note) values (p_spot, p_voter, p_reason, coalesce(p_note, ''));
  exception when unique_violation then
    raise exception 'already_flagged' using errcode = 'P0001';
  end;

  update public.spots set flag_count = flag_count + 1 where id = p_spot returning * into s;

  -- Enough flags pull an unverified spot off the public map until a moderator reviews it.
  if threshold > 0 and s.flag_count >= threshold and not s.moderator_verified then
    update public.spots set moderation = 'pending' where id = p_spot;
    insert into public.moderation_log (spot_id, spot_title, action, note)
    values (p_spot, s.title, 'auto_hidden', format('%s open flags', s.flag_count));
    return 'hidden';
  end if;
  return 'flagged';
end
$$;

create or replace function public.spot_stats()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'byCategory', coalesce((
      select jsonb_agg(c order by c.count desc) from (
        select category, count(*)::int as count from public.spots
        where moderation = 'approved' and status <> 'disputed' group by category
      ) c), '[]'::jsonb),
    'byArea', coalesce((
      select jsonb_agg(a order by a.count desc, a.max_severity desc) from (
        select area, count(*)::int as count, max(severity)::int as max_severity from public.spots
        where moderation = 'approved' and status <> 'disputed' and area <> ''
        group by area order by count(*) desc, max(severity) desc limit 8
      ) a), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'total', count(*)::int,
        'confirmed', count(*) filter (where status = 'confirmed' or moderator_verified)::int,
        'unverified', count(*) filter (where status = 'unverified' and not moderator_verified)::int,
        'this_week', count(*) filter (where created_at >= now() - interval '7 days' and not seeded)::int
      ) from public.spots where moderation = 'approved')
  )
$$;

-- ---------------------------------------------------------------- moderator actions

create or replace function public.moderate_spot(p_spot bigint, p_action text, p_note text default null)
returns public.spots
language plpgsql security definer set search_path = ''
as $$
declare
  s public.spots;
begin
  if not public.is_moderator() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'reject', 'verify', 'unverify', 'dismiss_flags') then
    raise exception 'unknown action %', p_action;
  end if;

  update public.spots set
    moderation = case p_action
      when 'approve' then 'approved'
      when 'verify' then 'approved'
      when 'reject' then 'rejected'
      when 'dismiss_flags' then 'approved'
      else moderation end,
    moderator_verified = case p_action
      when 'verify' then true
      when 'unverify' then false
      when 'reject' then false
      else moderator_verified end,
    flag_count = case when p_action in ('approve', 'verify', 'reject', 'dismiss_flags') then 0 else flag_count end,
    moderated_by = auth.uid(),
    moderated_at = now(),
    moderation_note = coalesce(nullif(p_note, ''), moderation_note)
  where id = p_spot
  returning * into s;

  if s.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_action in ('approve', 'verify', 'reject', 'dismiss_flags') then
    update public.flags set resolved_at = now(), resolved_by = auth.uid()
    where spot_id = p_spot and resolved_at is null;
  end if;

  perform public.log_action(p_spot, p_action, p_note);
  return s;
end
$$;

create or replace function public.admin_update_spot(p_spot bigint, p jsonb, p_note text default null)
returns public.spots
language plpgsql security definer set search_path = ''
as $$
declare
  s public.spots;
begin
  if not public.is_moderator() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.spots set
    title = coalesce(p ->> 'title', title),
    description = coalesce(p ->> 'description', description),
    lat = coalesce((p ->> 'lat')::float8, lat),
    lng = coalesce((p ->> 'lng')::float8, lng),
    area = coalesce(p ->> 'area', area),
    category = coalesce(p ->> 'category', category),
    severity = coalesce((p ->> 'severity')::smallint, severity),
    time_of_day = coalesce(p ->> 'time_of_day', time_of_day),
    incident_date = case when p ? 'incident_date' then nullif(p ->> 'incident_date', '')::date else incident_date end,
    source_url = case when p ? 'source_url' then nullif(p ->> 'source_url', '') else source_url end,
    moderated_by = auth.uid(),
    moderated_at = now()
  where id = p_spot
  returning * into s;

  if s.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.log_action(p_spot, 'edit', p_note);
  return s;
end
$$;

create or replace function public.admin_delete_spot(p_spot bigint, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.log_action(p_spot, 'delete', p_note);
  delete from public.spots where id = p_spot;
end
$$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.settings set value = p_value, updated_at = now(), updated_by = auth.uid() where key = p_key;
  if not found then
    raise exception 'unknown setting %', p_key;
  end if;
  insert into public.moderation_log (actor, actor_email, action, note)
  values (auth.uid(), auth.jwt() ->> 'email', 'setting', format('%s = %s', p_key, p_value));
end
$$;

-- ---------------------------------------------------------------- function privileges

revoke execute on function public.report_spot(jsonb, text) from public, anon, authenticated;
revoke execute on function public.cast_vote(bigint, text, smallint) from public, anon, authenticated;
revoke execute on function public.flag_spot(bigint, text, text, text) from public, anon, authenticated;
revoke execute on function public.log_action(bigint, text, text) from public, anon, authenticated;
grant execute on function public.report_spot(jsonb, text) to service_role;
grant execute on function public.cast_vote(bigint, text, smallint) to service_role;
grant execute on function public.flag_spot(bigint, text, text, text) to service_role;

revoke execute on function public.moderate_spot(bigint, text, text) from public, anon;
revoke execute on function public.admin_update_spot(bigint, jsonb, text) from public, anon;
revoke execute on function public.admin_delete_spot(bigint, text) from public, anon;
revoke execute on function public.admin_set_setting(text, jsonb) from public, anon;
grant execute on function public.moderate_spot(bigint, text, text) to authenticated;
grant execute on function public.admin_update_spot(bigint, jsonb, text) to authenticated;
grant execute on function public.admin_delete_spot(bigint, text) to authenticated;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;

grant execute on function public.spot_stats() to anon, authenticated, service_role;
