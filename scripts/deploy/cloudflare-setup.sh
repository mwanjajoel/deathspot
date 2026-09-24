#!/usr/bin/env bash
# Points deathspot.org at the server through Cloudflare's proxy and issues an Origin CA certificate.
#   CLOUDFLARE_API_TOKEN=… scripts/deploy/cloudflare-setup.sh <server-ip>
# Token permissions (zone deathspot.org): DNS Edit, Zone Settings Edit, SSL and Certificates Edit.
# Writes docker/caddy/certs/origin.pem + origin.key (git-ignored). Safe to re-run.
set -euo pipefail

IP=${1:?usage: cloudflare-setup.sh <server-ip>}
ZONE_NAME=${ZONE_NAME:-deathspot.org}
HOSTS=("$ZONE_NAME" "supabase.$ZONE_NAME")
CERTS=docker/caddy/certs
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"

cf() {
  local method=$1 path=$2 body=${3:-}
  curl -fsS -X "$method" "https://api.cloudflare.com/client/v4$path" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" ${body:+--data "$body"}
}
json() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }

ZONE=$(cf GET "/zones?name=$ZONE_NAME" | json "d['result'][0]['id']")
echo "==> Zone $ZONE_NAME"

for host in "${HOSTS[@]}"; do
  existing=$(cf GET "/zones/$ZONE/dns_records?type=A&name=$host" | json "(d['result'] or [{}])[0].get('id','')")
  record="{\"type\":\"A\",\"name\":\"$host\",\"content\":\"$IP\",\"proxied\":true,\"ttl\":1}"
  if [ -n "$existing" ]; then cf PUT "/zones/$ZONE/dns_records/$existing" "$record" >/dev/null; else cf POST "/zones/$ZONE/dns_records" "$record" >/dev/null; fi
  echo "==> DNS $host -> $IP (proxied)"
done

cf PATCH "/zones/$ZONE/settings/ssl" '{"value":"strict"}' >/dev/null
cf PATCH "/zones/$ZONE/settings/always_use_https" '{"value":"on"}' >/dev/null
cf PATCH "/zones/$ZONE/settings/min_tls_version" '{"value":"1.2"}' >/dev/null
echo "==> SSL: Full (strict), Always Use HTTPS, TLS 1.2+"

if [ ! -s "$CERTS/origin.pem" ]; then
  mkdir -p "$CERTS"
  openssl req -new -newkey rsa:2048 -nodes -keyout "$CERTS/origin.key" -out "$CERTS/origin.csr" \
    -subj "/CN=$ZONE_NAME" 2>/dev/null
  chmod 600 "$CERTS/origin.key"
  csr=$(python3 -c "import json,sys; print(json.dumps(open(sys.argv[1]).read()))" "$CERTS/origin.csr")
  cf POST "/certificates" "{\"hostnames\":[\"$ZONE_NAME\",\"*.$ZONE_NAME\"],\"requested_validity\":5475,\"request_type\":\"origin-rsa\",\"csr\":$csr}" \
    | json "d['result']['certificate']" > "$CERTS/origin.pem"
  rm -f "$CERTS/origin.csr"
  echo "==> Origin CA certificate for $ZONE_NAME, *.$ZONE_NAME (15 years)"
else
  echo "==> Origin certificate already present"
fi
