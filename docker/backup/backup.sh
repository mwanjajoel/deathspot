#!/bin/sh
# Postgres backups to Cloudflare R2.
#
#   backup.sh daemon   back up now, then every day at BACKUP_HOUR (UTC); prune old copies
#   backup.sh once     one backup, then exit
#   backup.sh list     list the backups in the bucket
#
# Each backup is a `pg_dump --format=custom` of the whole database (public data, auth users,
# moderation log), encrypted with BACKUP_ENCRYPTION_KEY when set. Restore with
# `docker compose exec backup backup.sh restore <file>`, described in the README.
set -eu

# A connection URL (e.g. a managed database's bound DATABASE_URL) takes precedence over PG*.
if [ -n "${DATABASE_URL:-}" ]; then
  rest=${DATABASE_URL#*://}; creds=${rest%%@*}; hostpart=${rest#*@}; hostport=${hostpart%%/*}; query=${hostpart#*/}
  PGUSER=${creds%%:*}
  PGPASSWORD=$(printf '%b' "$(printf '%s' "${creds#*:}" | sed 's/%/\\x/g')")
  PGHOST=${hostport%%:*}
  case "$hostport" in *:*) PGPORT=${hostport##*:}; export PGPORT ;; esac
  PGDATABASE=${query%%\?*}
  sslmode=$(printf '%s' "$query" | sed -n 's/.*[?&]sslmode=\([a-z-]*\).*/\1/p')
  [ -z "$sslmode" ] || export PGSSLMODE="$sslmode"
fi
: "${PGHOST:=db}" "${PGUSER:=postgres}" "${PGDATABASE:=postgres}"
export PGHOST PGUSER PGDATABASE PGPASSWORD
# Restores need a superuser: supabase_admin in the compose stack, the URL's user otherwise.
if [ -n "${DATABASE_URL:-}" ]; then RESTORE_PGUSER="${RESTORE_PGUSER:-$PGUSER}"; else RESTORE_PGUSER="${RESTORE_PGUSER:-supabase_admin}"; fi
BACKUP_HOUR="${BACKUP_HOUR:-1}"                     # 01:00 UTC = 04:00 in Kampala
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_PREFIX="${BACKUP_PREFIX:-deathspot/db}"

# rclone reads its remote from the environment: no config file with keys on disk.
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-}"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-}"
# R2_ENDPOINT overrides the R2 URL, e.g. for another S3-compatible store.
export RCLONE_CONFIG_R2_ENDPOINT="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID:-unset}.r2.cloudflarestorage.com}"
DEST="r2:${R2_BUCKET:-unset}/${BACKUP_PREFIX}"

log() { echo "[backup] $(date -u +%FT%TZ) $*"; }

# Platforms that health-check over HTTP (e.g. InstaCloud, which sets PORT) get a status page.
STATUS_PORT="${BACKUP_STATUS_PORT:-${PORT:-}}"
status() {
  [ -n "$STATUS_PORT" ] || return 0
  mkdir -p /tmp/www && printf 'deathspot backup: %s\n' "$*" > /tmp/www/index.html
}

configured() {
  [ -n "${R2_ACCOUNT_ID:-}${R2_ENDPOINT:-}" ] && [ -n "${R2_BUCKET:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ]
}

backup() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  name="deathspot-${stamp}.dump"
  tmp="/tmp/${name}"
  pg_dump --format=custom --file="$tmp"
  if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_ENCRYPTION_KEY -in "$tmp" -out "$tmp.enc"
    rm -f "$tmp"; tmp="$tmp.enc"; name="$name.enc"
  fi
  size=$(du -h "$tmp" | cut -f1)
  rclone copyto --s3-no-check-bucket "$tmp" "$DEST/$(date -u +%Y/%m)/$name"
  rm -f "$tmp"
  rclone delete --min-age "${BACKUP_RETENTION_DAYS}d" "$DEST" || log "pruning failed (needs list + delete permission)"
  date -u +%s > /tmp/last-success
  status "last backup $name at $(date -u +%FT%TZ)"
  log "uploaded $name ($size) to ${R2_BUCKET}/${BACKUP_PREFIX}; keeping ${BACKUP_RETENTION_DAYS} days"
}

# Supabase Auth runs its own migrations and must own the auth schema's objects; the app's
# migrations run as postgres. Backups made before owners were kept (and any restore as a
# different user) leave them owned by the restoring superuser, so put them back.
fix_owners() {
  PGUSER="$RESTORE_PGUSER" psql -v ON_ERROR_STOP=1 -q <<'SQL'
do $$
declare
  s record;
  r record;
begin
  for s in select * from (values ('auth', 'supabase_auth_admin'), ('public', 'postgres')) v(nsp, owner) loop
    for r in
      select format('alter table %I.%I owner to %I', s.nsp, tablename, s.owner) as q from pg_tables where schemaname = s.nsp
      union all
      select format('alter view %I.%I owner to %I', s.nsp, viewname, s.owner) from pg_views where schemaname = s.nsp
      union all
      select format('alter sequence %I.%I owner to %I', s.nsp, sequencename, s.owner) from pg_sequences where schemaname = s.nsp
        and not exists (select 1 from pg_depend d where d.objid = format('%I.%I', s.nsp, sequencename)::regclass and d.deptype in ('a', 'i'))
      union all
      select format('alter function %s owner to %I', p.oid::regprocedure, s.owner) from pg_proc p
        where p.pronamespace = s.nsp::regnamespace and p.prokind in ('f', 'p')
      union all
      select format('alter type %I.%I owner to %I', s.nsp, t.typname, s.owner) from pg_type t
        where t.typnamespace = s.nsp::regnamespace and t.typtype in ('e', 'd')
    loop
      execute r.q;
    end loop;
  end loop;
end
$$;
SQL
}

restore() {
  file="$1"; tmp="/tmp/$(basename "$file")"
  rclone copyto "$DEST/$file" "$tmp"
  case "$tmp" in *.enc)
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -in "$tmp" -out "${tmp%.enc}"
    rm -f "$tmp"; tmp="${tmp%.enc}" ;;
  esac
  # Data only, into the schema the running stack already has (the app's migrations and Auth's
  # own). Recreating tables and functions from the dump would pick up Supabase's default grants
  # and the restoring user as owner. Each schema's migration history is left alone, so a stack
  # that is newer than the backup keeps its newer migrations. Needs the superuser.
  pg_restore -l "$tmp" | grep -v -E 'TABLE DATA (public deathspot_migrations|auth schema_migrations) ' > "$tmp.list"
  tables=$(PGUSER="$RESTORE_PGUSER" psql -Atq -c "select string_agg(format('%I.%I', schemaname, tablename), ', ')
    from pg_tables where schemaname in ('public', 'auth') and tablename not in ('deathspot_migrations', 'schema_migrations')")
  {
    echo "begin;"
    echo "truncate table $tables;"
    # transaction_timeout is new in Postgres 17; drop it so older servers accept the script.
    pg_restore --data-only --disable-triggers --schema=public --schema=auth -L "$tmp.list" -f - "$tmp" | grep -v '^SET transaction_timeout'
    echo "commit;"
  } | PGUSER="$RESTORE_PGUSER" psql -v ON_ERROR_STOP=1 -q -o /dev/null
  rm -f "$tmp" "$tmp.list"
  log "restored $file"
}

seconds_until_next_run() {
  now=$(date -u +%s)
  next=$((now - now % 86400 + BACKUP_HOUR * 3600))
  [ "$next" -le "$now" ] && next=$((next + 86400))
  echo $((next - now))
}

case "${1:-daemon}" in
  once) backup ;;
  fix-owners) fix_owners && log "owners reset" ;;
  list) rclone lsl "$DEST" ;;
  restore) restore "${2:?usage: backup.sh restore <yyyy/mm/file>}" ;;
  daemon)
    if [ -n "$STATUS_PORT" ]; then
      status "starting"
      httpd -p "$STATUS_PORT" -h /tmp/www
    fi
    if ! configured; then
      status "R2 is not configured; backups are off"
      log "R2 is not configured (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY); backups are off"
      exec sleep infinity
    fi
    [ -n "${BACKUP_ENCRYPTION_KEY:-}" ] || log "warning: BACKUP_ENCRYPTION_KEY is empty, backups are not encrypted"
    backup || log "backup failed"
    while true; do
      wait=$(seconds_until_next_run)
      log "next backup in $((wait / 3600))h $((wait % 3600 / 60))m"
      sleep "$wait"
      backup || log "backup failed"
    done ;;
  *) echo "usage: backup.sh daemon|once|list|restore <file>|fix-owners" >&2; exit 64 ;;
esac
