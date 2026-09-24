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

: "${PGHOST:=db}" "${PGUSER:=postgres}" "${PGDATABASE:=postgres}"
export PGHOST PGUSER PGDATABASE PGPASSWORD
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

configured() {
  [ -n "${R2_ACCOUNT_ID:-}${R2_ENDPOINT:-}" ] && [ -n "${R2_BUCKET:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ]
}

backup() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  name="deathspot-${stamp}.dump"
  tmp="/tmp/${name}"
  pg_dump --format=custom --no-owner --file="$tmp"
  if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_ENCRYPTION_KEY -in "$tmp" -out "$tmp.enc"
    rm -f "$tmp"; tmp="$tmp.enc"; name="$name.enc"
  fi
  size=$(du -h "$tmp" | cut -f1)
  rclone copyto --s3-no-check-bucket "$tmp" "$DEST/$(date -u +%Y/%m)/$name"
  rm -f "$tmp"
  rclone delete --min-age "${BACKUP_RETENTION_DAYS}d" "$DEST" || log "pruning failed (needs list + delete permission)"
  date -u +%s > /tmp/last-success
  log "uploaded $name ($size) to ${R2_BUCKET}/${BACKUP_PREFIX}; keeping ${BACKUP_RETENTION_DAYS} days"
}

restore() {
  file="$1"; tmp="/tmp/$(basename "$file")"
  rclone copyto "$DEST/$file" "$tmp"
  case "$tmp" in *.enc)
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -in "$tmp" -out "${tmp%.enc}"
    rm -f "$tmp"; tmp="${tmp%.enc}" ;;
  esac
  # Only the schemas with our data: app tables and moderator accounts. The rest belongs to the
  # Supabase image and already exists in a fresh stack. Needs the superuser (supabase_admin).
  PGUSER="${RESTORE_PGUSER:-supabase_admin}" pg_restore --clean --if-exists --no-owner --single-transaction \
    --schema=public --schema=auth --dbname="$PGDATABASE" "$tmp"
  rm -f "$tmp"
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
  list) rclone lsl "$DEST" ;;
  restore) restore "${2:?usage: backup.sh restore <yyyy/mm/file>}" ;;
  daemon)
    if ! configured; then
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
  *) echo "usage: backup.sh daemon|once|list|restore <file>" >&2; exit 64 ;;
esac
