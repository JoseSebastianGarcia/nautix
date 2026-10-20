#!/usr/bin/env bash
# Fixes "x509: certificate signed by unknown authority" on networks that inspect HTTPS.
# For every host Nautix's build needs, it checks whether the certificate is trusted; if not,
# it installs the top certificate the network presents as a trusted CA, restarts Docker and
# copies the certificates into ./certs so the image build trusts them too.
#
#   sudo bash scripts/trust-corp-ca.sh
set -u

HOSTS=(registry-1.docker.io auth.docker.io production.cloudfront.docker.com registry.npmjs.org)
DEST=/usr/local/share/ca-certificates
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
installed=0

if [ "$(id -u)" -ne 0 ]; then
  echo "Run it with sudo:  sudo bash scripts/trust-corp-ca.sh" >&2
  exit 1
fi

for host in "${HOSTS[@]}"; do
  if curl -sS -o /dev/null --max-time 15 "https://$host/" 2>"$TMP/err"; then
    echo "ok        $host (already trusted)"
    continue
  fi
  if ! grep -qiE "certificate|SSL" "$TMP/err"; then
    echo "skipped   $host ($(head -c 120 "$TMP/err" | tr '\n' ' '))"
    continue
  fi
  # Everything the server sent, split into one file per certificate.
  echo | openssl s_client -showcerts -connect "$host:443" -servername "$host" 2>/dev/null \
    | sed -n '/BEGIN CERTIFICATE/,/END CERTIFICATE/p' > "$TMP/$host.pem"
  csplit -z -s -f "$TMP/$host-" -b '%d.crt' "$TMP/$host.pem" '/BEGIN CERTIFICATE/' '{*}' 2>/dev/null
  last="$(ls "$TMP/$host-"*.crt 2>/dev/null | sort -V | tail -n 1)"
  if [ -z "$last" ]; then
    echo "failed    $host (no certificate received)"
    continue
  fi
  name="nautix-$(openssl x509 -in "$last" -noout -fingerprint -sha1 | cut -d= -f2 | tr -d ':' | cut -c1-12).crt"
  cp "$last" "$DEST/$name"
  mkdir -p "$HERE/certs" && cp "$last" "$HERE/certs/$name"
  echo "installed $host -> $(openssl x509 -in "$last" -noout -subject | sed 's/^subject= *//')"
  installed=1
done

if [ "$installed" -eq 1 ]; then
  update-ca-certificates >/dev/null
  echo "restarting docker..."
  (service docker restart || systemctl restart docker) >/dev/null 2>&1
  sleep 3
fi

echo
echo "Re-checking:"
fail=0
for host in "${HOSTS[@]}"; do
  if curl -sS -o /dev/null --max-time 15 "https://$host/" 2>/dev/null; then echo "ok        $host"; else echo "STILL BAD $host"; fail=1; fi
done
[ "$fail" -eq 0 ] && echo "All good. Now run:  docker compose up -d --build"
exit "$fail"
