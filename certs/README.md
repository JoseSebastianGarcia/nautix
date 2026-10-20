# Corporate CA certificates (optional)

If your network inspects HTTPS (corporate proxy), `docker compose build` fails with
`x509: certificate signed by unknown authority`.

1. Install the root CA on the Docker host so the daemon can pull images:
   `sudo cp corp.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates && sudo service docker restart`
2. Copy the same PEM file(s) here as `certs/*.crt` so `pnpm install` inside the build trusts them too.

Files here are ignored by git and never end up in the final image (only in the build stage).
