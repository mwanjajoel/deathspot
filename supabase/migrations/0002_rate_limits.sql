-- Shared rate limiting.
-- Counters live in Postgres so limits hold across app restarts and replicas. Keys are
-- "<policy>:<visitor hash>" (never raw IPs). The algorithm is a sliding-window counter:
-- the previous fixed window's count is weighted by how much of it still overlaps the
-- sliding window, which smooths out the 2x burst a plain fixed window allows at boundaries.

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- No policies: only the security-definer function below touches this table.
alter table public.rate_limits enable row level security;

create or replace function public.hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns table (allowed boolean, remaining int, reset_seconds int)
language plpgsql security definer set search_path = ''
as $$
declare
  win interval := make_interval(secs => p_window_seconds);
  now_ts timestamptz := clock_timestamp();
  curr_start timestamptz := to_timestamp(floor(extract(epoch from now_ts) / p_window_seconds) * p_window_seconds);
  elapsed float8 := extract(epoch from now_ts - curr_start) / p_window_seconds;
  curr int;
  prev int;
  estimate float8;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, curr_start, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into curr;

  select coalesce(max(count), 0) into prev
  from public.rate_limits
  where key = p_key and window_start = curr_start - win;

  estimate := prev * (1 - elapsed) + curr;

  -- Opportunistic cleanup keeps the table small without needing a scheduler.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now_ts - interval '2 days';
  end if;

  return query select
    estimate <= p_limit,
    greatest(floor(p_limit - estimate)::int, 0),
    greatest(ceil(extract(epoch from (curr_start + win) - now_ts))::int, 1);
end
$$;

revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
