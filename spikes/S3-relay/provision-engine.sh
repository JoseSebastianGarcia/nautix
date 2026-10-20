#!/usr/bin/env bash
# Prototype of the ConfigureDistro step (docs/spec/02-engine.md) for a Debian slim rootfs.
# Runs as root inside the freshly imported distro. Idempotent.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
# systemd is not in debian:slim. socat is the dial-stdio fallback transport; vim-tiny/procps are used by the S4 terminal checks.
apt-get install -y --no-install-recommends ca-certificates curl gnupg systemd systemd-sysv dbus iproute2 iptables socat vim-tiny less procps kmod

cat > /etc/wsl.conf <<'CONF'
[boot]
systemd=true

[automount]
enabled=false

[interop]
enabled=false
appendWindowsPath=false
CONF

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${codename} stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin

# No "hosts" key: docker.service already passes -H fd:// (systemd socket activation) and both together make dockerd refuse to start.
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "features": { "containerd-snapshotter": true },
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON

systemctl enable docker.service containerd.service
echo "provision-engine.sh finished: restart the distro (wsl --terminate) so systemd=true takes effect"
