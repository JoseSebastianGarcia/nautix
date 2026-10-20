FROM node:22-bookworm-slim AS build
RUN corepack enable
# Optional corporate root CA: put *.crt files in ./certs and the build trusts them (see certs/README.md).
COPY certs /certs
RUN cat /certs/*.crt > /certs/extra.pem 2>/dev/null || true; touch /certs/extra.pem
WORKDIR /repo
COPY . .
RUN if [ -s /certs/extra.pem ]; then export NODE_EXTRA_CA_CERTS=/certs/extra.pem; fi \
 && pnpm install --frozen-lockfile && pnpm build \
 && pnpm --filter @nautix/api deploy --prod --legacy /out/api \
 && cp -r apps/web/dist /out/web

FROM docker:27-cli AS docker-cli

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    NAUTIX_HOST=0.0.0.0 \
    NAUTIX_PORT=3737 \
    NAUTIX_DATA=/data \
    NAUTIX_WEB_DIST=/app/web \
    NAUTIX_DOCKER_SOCKET=/var/run/docker.sock
# The compose editor shells out to `docker compose` (argument arrays, no shell).
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
WORKDIR /app/api
COPY --from=build /out/api /app/api
COPY --from=build /out/web /app/web
# The socket's group id differs per host; the compose file passes it with group_add.
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3737
# Works with HTTPS (self-signed/local CA) and plain HTTP.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const m=require('node:'+(process.env.NAUTIX_TLS||process.env.NAUTIX_TLS_CERT?'https':'http'));m.get({host:'127.0.0.1',port:process.env.NAUTIX_PORT,path:'/api/v1/health',rejectUnauthorized:false},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "dist/main.js"]
