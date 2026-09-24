#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu/Debian VPS for Deathspot UG. Run as root (or with sudo):
#   ssh root@SERVER 'bash -s' < scripts/deploy/server-setup.sh
# Installs Docker, adds swap for the Next.js build, and firewalls the server so only SSH is open to
# everyone while ports 80/443 accept Cloudflare only.
set -euo pipefail

APP_DIR=/opt/deathspot

echo "==> Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl ufw rsync iptables >/dev/null

if ! command -v docker >/dev/null; then
  echo "==> Docker"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null

# Building the Next.js image needs more memory than a 2 GB server has free.
if ! swapon --show | grep -q /swapfile; then
  echo "==> 2 GB swap"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Firewall: SSH open; 80/443 from Cloudflare only"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
for ip in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
  ufw allow proto tcp from "$ip" to any port 80,443 >/dev/null
done
ufw --force enable >/dev/null

# Docker publishes container ports through its own iptables chain, bypassing ufw. Restrict new
# connections to the published web ports in DOCKER-USER as well, and re-apply after reboots.
cat > /usr/local/sbin/deathspot-firewall <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
apply() {
  local ipt=$1 list=$2
  command -v "$ipt" >/dev/null || return 0
  $ipt -N DEATHSPOT-CF 2>/dev/null || $ipt -F DEATHSPOT-CF
  for ip in $(curl -fsS "https://www.cloudflare.com/$list"); do $ipt -A DEATHSPOT-CF -s "$ip" -j RETURN; done
  $ipt -A DEATHSPOT-CF -j DROP
  $ipt -N DOCKER-USER 2>/dev/null || true
  rule=(-p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -j DEATHSPOT-CF)
  $ipt -C DOCKER-USER "${rule[@]}" 2>/dev/null || $ipt -I DOCKER-USER "${rule[@]}"
}
apply iptables ips-v4
apply ip6tables ips-v6
SCRIPT
chmod 755 /usr/local/sbin/deathspot-firewall
cat > /etc/systemd/system/deathspot-firewall.service <<'UNIT'
[Unit]
Description=Allow only Cloudflare to reach Docker-published web ports
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/deathspot-firewall
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now deathspot-firewall >/dev/null
systemctl restart deathspot-firewall

mkdir -p "$APP_DIR/docker/caddy/certs"
chmod 700 "$APP_DIR/docker/caddy/certs"
echo "==> Ready: $(docker --version)"
