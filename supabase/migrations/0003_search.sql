-- Search: fuzzy matching over mapped spots, proximity lookups, and a geocoding cache.

create extension if not exists pg_trgm with schema extensions;

-- Speeds up ILIKE / trigram matching on the text people search for.
create index if not exists spots_search_trgm
  on public.spots using gin ((title || ' ' || area) extensions.gin_trgm_ops);

-- Approved spots matching `q`, best first. Tolerates typos ("Kalerw", "Nansna") via trigram
-- word similarity, and ranks prefix and substring hits above fuzzy ones.
create or replace function public.search_spots(q text, lim int default 8)
returns table (
  id bigint,
  title text,
  area text,
  category text,
  severity smallint,
  status text,
  moderator_verified boolean,
  lat double precision,
  lng double precision,
  score real
)
language sql stable security definer set search_path = ''
as $$
  with input as (select lower(trim(q)) as term),
  scored as (
    select s.*,
      greatest(
        extensions.word_similarity((select term from input), lower(s.title)),
        extensions.word_similarity((select term from input), lower(s.area)) * 0.95,
        extensions.word_similarity((select term from input), lower(s.description)) * 0.6
      )
      + case when lower(s.title) like (select term from input) || '%' then 0.5 else 0 end
      + case when lower(s.title || ' ' || s.area) like '%' || (select term from input) || '%' then 0.3 else 0 end
      as score
    from public.spots s
    where s.moderation = 'approved' and char_length((select term from input)) >= 2
  )
  select id, title, area, category, severity, status, moderator_verified, lat, lng, score::real
  from scored
  where score > 0.5
  order by score desc, severity desc, id desc
  limit greatest(1, least(lim, 25))
$$;

-- Approved, non-disputed spots within `radius_m` metres of a point, nearest first.
create or replace function public.spots_near(p_lat double precision, p_lng double precision, p_radius_m double precision default 2000, lim int default 5)
returns table (
  id bigint,
  title text,
  area text,
  category text,
  severity smallint,
  status text,
  moderator_verified boolean,
  lat double precision,
  lng double precision,
  distance_m double precision
)
language sql stable security definer set search_path = ''
as $$
  select * from (
    select s.id, s.title, s.area, s.category, s.severity, s.status, s.moderator_verified, s.lat, s.lng,
      2 * 6371000 * asin(sqrt(
        power(sin(radians(s.lat - p_lat) / 2), 2) +
        cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2)
      )) as distance_m
    from public.spots s
    where s.moderation = 'approved' and s.status <> 'disputed'
      -- Cheap bounding box before the exact distance (1° latitude ≈ 111 km).
      and s.lat between p_lat - p_radius_m / 111000.0 and p_lat + p_radius_m / 111000.0
  ) near
  where distance_m <= p_radius_m
  order by distance_m
  limit greatest(1, least(lim, 25))
$$;

grant execute on function public.search_spots(text, int) to anon, authenticated, service_role;
grant execute on function public.spots_near(double precision, double precision, double precision, int) to anon, authenticated, service_role;

-- Nominatim results by normalised query, so repeat searches are served from the database and we
-- stay well inside OpenStreetMap's usage policy. Written only by the server (service role).
create table public.geocode_cache (
  query text primary key,
  places jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.geocode_cache enable row level security;
