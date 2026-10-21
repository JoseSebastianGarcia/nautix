# Templates and builds

## Templates

The palette in the topology has ready-to-run services grouped by category: proxies, API gateways, databases, cache, messaging, identity, storage, secrets, observability, automation and DNS. Drag one onto a network box, check the name and port, and deploy.

Some categories worth knowing:

- **Identity**: Keycloak, Pocket ID and Casdoor.
- **Storage**: RustFS (S3-compatible), Azurite (Azure Blob) and fake-gcs-server (Google Cloud Storage).
- **Proxies**: besides Traefik, Nginx, Caddy and HAProxy, **Caddy HTTPS (one site)** puts a real certificate in front of one service: set your domain and the target in its command (`--from vault.example.com --to vaultwarden:80`). It needs a public domain pointing at the machine and ports 80 and 443 open to the internet, so it fits a VPS, not a laptop.
- **Secrets**: Vaultwarden (password manager for teams, Bitwarden-compatible), OpenBao, HashiCorp Vault and Lowkey Vault (Azure Key Vault). OpenBao and Vault have a variant with storage that can keep their data in a volume so it survives recreating the container.
- **My images**: anything you built or pulled. **Any image** deploys an image by name.

Templates that need a password or an address ask for it in the deploy dialog. Check the environment values before deploying.

## Builds

**Resources, Builds** builds an image on this engine.

![The build page with the Dockerfile editor](img:builds)

1. Write a Dockerfile, or press **Containerize my app** and choose a starter (Node.js, Python, Go, static site) or use the wizard for a .NET or generic project.
2. The **checks** panel flags problems as you type: unpinned base images, running as root, a missing `HEALTHCHECK`. **Fix** applies the suggested change when there is one.
3. Add small text files the Dockerfile can `COPY`, or pick a folder from your computer as the build context. A `.dockerignore` is honoured.
4. Set the tag, an optional target stage and build arguments, and press **Build**. The output streams live.

> Build arguments are kept in the image history. Never put secrets there.

The built image appears under **Images** and in the palette under **My images**.
