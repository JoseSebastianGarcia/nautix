# Security

## What Nautix can do on your machine

To manage Docker, Nautix talks to the Docker socket (`/var/run/docker.sock`). **Whoever controls that socket can start a
container that mounts the whole host disk, so it is root-equivalent.** This is true of every Docker management panel.
In practice: the risk is who can reach the Nautix web interface and who knows a password or API token.

## What Nautix already does

- Authentication is always on; the first run needs a one-time setup token printed in the log.
- The port is published on `127.0.0.1` only. HTTPS with a self-signed or your own certificate is built in.
- The container runs as a non-root user, with a read-only filesystem, `no-new-privileges` and **all Linux capabilities
  dropped**.
- Roles (admin, operator, viewer) and API tokens; secrets are encrypted at rest and never logged or returned.
- Destructive actions ask for confirmation; changes can be applied with a plan and undone on failure.
- Nautix cannot stop, restart, remove or edit its own container from the UI or API.

## What you should do

1. **Do not expose Nautix to the internet.** For remote access use a VPN (Tailscale, WireGuard) or an authenticated TLS
   reverse proxy with a second factor in front of it.
2. Give people the least role they need (viewer to look, operator to run, admin only for a few).
3. Back up (Settings → Backup) and keep the backup safe: it contains the encryption key.
4. Keep the image updated (`docker compose pull && docker compose up -d`).

## Stricter setup: rootless Docker or Podman

If the Docker daemon runs as your own user (rootless mode), the socket no longer means root on the host: an attacker
who takes it only reaches that user. Point Nautix at the rootless socket:

```bash
export DOCKER_SOCK=$XDG_RUNTIME_DIR/docker.sock   # usually /run/user/1000/docker.sock
```

and mount it in place of `/var/run/docker.sock` (see `compose.yaml`). Some features need privileges rootless Docker does
not have (ports below 1024, some network drivers) and Swarm or overlay networks have limits there: check Docker's rootless documentation before relying on them.

## Reporting a vulnerability

Please do not open a public issue. Write to the maintainer through https://patterna.dev with the details and steps to
reproduce. You will get an answer as soon as possible, and credit if you wish when the fix is published.
