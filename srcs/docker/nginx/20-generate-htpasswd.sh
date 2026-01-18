#!/bin/sh
set -eu

USER="${GRAFANA_BASIC_AUTH_USER:-}"
PASS="${GRAFANA_BASIC_AUTH_PASSWORD:-}"

if [ -z "$USER" ] || [ -z "$PASS" ]; then
  echo "GRAFANA_BASIC_AUTH_USER/GRAFANA_BASIC_AUTH_PASSWORD must be set" >&2
  exit 1
fi

htpasswd_file="/etc/nginx/htpasswd"

hash=$(openssl passwd -apr1 "$PASS")
printf '%s:%s
' "$USER" "$hash" > "$htpasswd_file"
chmod 644 "$htpasswd_file" || true
