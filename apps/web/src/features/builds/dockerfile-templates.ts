export interface DockerfileTemplate {
  id: "node" | "python" | "go" | "static";
  /** i18n key suffix under `builds.templates`. */
  dockerfile: string;
}

/** "Containerize my app" starting points. Each one passes the built-in lint without warnings. */
export const DOCKERFILE_TEMPLATES: readonly DockerfileTemplate[] = [
  {
    id: "node",
    dockerfile: `FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
USER node
HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/ || exit 1
CMD ["node", "server.js"]
`,
  },
  {
    id: "python",
    dockerfile: `FROM python:3.13-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
RUN useradd --create-home app
USER app
HEALTHCHECK CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/')" || exit 1
CMD ["python", "main.py"]
`,
  },
  {
    id: "go",
    dockerfile: `FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/app .

FROM alpine:3.20
RUN adduser -D app
COPY --from=build /out/app /usr/local/bin/app
EXPOSE 8080
USER app
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/ || exit 1
ENTRYPOINT ["app"]
`,
  },
  {
    id: "static",
    dockerfile: `FROM nginx:1.27-alpine
COPY . /usr/share/nginx/html
EXPOSE 80
USER nginx
HEALTHCHECK CMD wget -qO- http://127.0.0.1:80/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
`,
  },
];
