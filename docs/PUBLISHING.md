# Publishing the image to Docker Hub

The workflow `.github/workflows/release.yml` builds a multi-arch image (amd64 + arm64, with SBOM and
provenance) and pushes it as `<DOCKERHUB_USERNAME>/nautix`.

## One-time setup

1. Create a Docker Hub account and a **public repository** named `nautix`
   (hub.docker.com → Repositories → Create).
2. Create an **access token** (Account settings → Personal access tokens) with *Read & Write*.
3. In the GitHub repository: Settings → Secrets and variables → Actions → *New repository secret*:
   - `DOCKERHUB_USERNAME`: your Docker Hub user name
   - `DOCKERHUB_TOKEN`: the token from step 2

## Publish a version

```bash
git tag v0.1.0
git push origin v0.1.0
```

The tag triggers the workflow (Actions tab). It publishes `0.1.0`, `0.1` and `latest`. You can also run
it by hand from the Actions tab (*release → Run workflow*) and type the version.

## Use it

```bash
export NAUTIX_IMAGE=<dockerhub-user>/nautix
export DOCKER_GID=$(stat -c %g /var/run/docker.sock)
docker compose -f compose.hub.yaml up -d
docker compose -f compose.hub.yaml logs nautix        # one-time setup token
```

Or without Compose:

```bash
docker run -d --name nautix --restart unless-stopped \
  -p 127.0.0.1:3737:3737 \
  -v /var/run/docker.sock:/var/run/docker.sock -v nautix-data:/data \
  --group-add "$(stat -c %g /var/run/docker.sock)" \
  -e NAUTIX_TLS=auto \
  <dockerhub-user>/nautix:latest
```

Mounting the Docker socket is root-equivalent on the host: keep the port on `127.0.0.1` or put an
authenticated TLS reverse proxy in front.

## Updating a running install

```bash
docker compose -f compose.hub.yaml pull && docker compose -f compose.hub.yaml up -d
```

Settings → Backup first if the data matters (it includes the encryption key).
