# Templates and builds

## Templates

The palette in the topology has ready-to-run services grouped by category: proxies, API gateways, databases, cache, messaging, identity, storage, secrets, observability, automation and DNS. Drag one onto a network box, check the name and port, and deploy.

Some categories worth knowing:

- **Identity**: Keycloak, Pocket ID and Casdoor.
- **Storage**: RustFS (S3-compatible), Azurite (Azure Blob) and fake-gcs-server (Google Cloud Storage).
- **Proxies**: besides Traefik, Nginx, Caddy and HAProxy, **Caddy HTTPS (one site)** puts HTTPS in front of one service: its command is `--from localhost --to vaultwarden:80`. On your own machine `localhost` gets a local certificate (the browser warns once). On a VPS replace `localhost` by your domain: it needs a public domain pointing at the machine and ports 80 and 443 open to the internet, and then gets a real certificate.
- **Secrets**: Vaultwarden (password manager for teams, Bitwarden-compatible), OpenBao, HashiCorp Vault and Lowkey Vault (Azure Key Vault). OpenBao and Vault have a variant with storage that can keep their data in a volume so it survives recreating the container.
- **My images**: anything you built or pulled. **Any image** deploys an image by name.

Templates that need a password or an address ask for it in the deploy dialog. Check the environment values before deploying.

**Your own templates**: **New template** saves ports, variables, volumes and command under *My images*. Built-in templates cannot be changed, but hovering one shows a copy icon (**Customize template**) that opens the editor with its values and saves your own version; the original stays. Your templates can be edited or removed at any time.

## Elasticsearch and Kibana

Two templates that work together on your own machine. They are close to a production setup for one node, with these choices made for you: **security on** (every request needs a password, the user is `elastic`), a **fixed 1 GB heap**, a **data volume** and a published port on `127.0.0.1` only. TLS on the HTTP port is **off** because the traffic stays on the Docker network; turn it on before opening the port to other machines. It is one node: for real production use three or more nodes and snapshots.

1. **Prepare the host** once. Elasticsearch needs `vm.max_map_count=262144`: on Linux `sudo sysctl -w vm.max_map_count=262144` (put it in `/etc/sysctl.d/` to keep it). On WSL2 add `kernelCommandLine = sysctl.vm.max_map_count=262144` under `[wsl2]` in `.wslconfig` and run `wsl --shutdown`. Leave at least 2 GB of memory free.
2. **Deploy Elasticsearch** on a network of its own (name it `elasticsearch`, the default). The password is generated for you: read `ELASTIC_PASSWORD` in its environment. It takes about a minute to be ready.
3. **Deploy Kibana** on the **same network**. It signs in as `kibana_system`, not as `elastic`, and Elasticsearch does not know that password yet. Open the **Terminal** of the Elasticsearch container and run the command below, with the two passwords you read in the environments, and then restart Kibana.
4. Open `http://localhost:5601` and sign in as `elastic` with `ELASTIC_PASSWORD`.

The command of step 3:

```
curl -u elastic:<ELASTIC_PASSWORD> -X POST http://localhost:9200/_security/user/kibana_system/_password -H "Content-Type: application/json" -d '{"password":"<ELASTICSEARCH_PASSWORD of Kibana>"}'
```

The three Kibana encryption keys are generated too and must not change: they protect saved objects, sessions and reports.

## Builds

**Resources, Builds** builds an image on this engine.

![The build page with the Dockerfile editor](img:builds)

1. Write a Dockerfile, or press **Containerize my app** and choose a starter (Node.js, Python, Go, static site) or use the wizard for a .NET or generic project.
2. The **checks** panel flags problems as you type: unpinned base images, running as root, a missing `HEALTHCHECK`. **Fix** applies the suggested change when there is one.
3. Add small text files the Dockerfile can `COPY`, or pick a folder from your computer as the build context. A `.dockerignore` is honoured.
4. Set the tag, an optional target stage and build arguments, and press **Build**. The output streams live.

> Build arguments are kept in the image history. Never put secrets there.

The built image appears under **Images** and in the palette under **My images**.
