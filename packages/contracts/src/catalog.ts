export type TemplateCategory =
  | "proxy"
  | "gateway"
  | "database"
  | "cache"
  | "broker"
  | "observability"
  | "automation"
  | "dns"
  | "app"
  | "custom";

export interface TemplatePort {
  containerPort: number;
  label: string;
  /** Defaults to tcp. */
  protocol?: "tcp" | "udp";
  /** Suggested host port (e.g. 53 for DNS); the user can change it. */
  hostPort?: number;
}

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  image: string;
  description: string;
  /** simple-icons slug; the UI falls back to initials when the logo is missing. */
  icon: string;
  /** Brand color used to tint the node. */
  color: string;
  ports: TemplatePort[];
  env?: Record<string, string>;
  volumes?: string[];
  command?: string[];
  /** True for templates a user saved on this server (they can be deleted). */
  custom?: boolean;
}

/** Curated, version-pinned-by-tag images. Keep it small; users can deploy any image too. */
export const TEMPLATES: readonly Template[] = [
  {
    id: "traefik",
    name: "Traefik",
    category: "proxy",
    image: "traefik:v3.1",
    description: "Reverse proxy",
    icon: "traefikproxy",
    color: "#24A1C1",
    ports: [{ containerPort: 80, label: "http" }],
    // The file provider lets the Gateway page publish routes by writing a file; the mounted
    // directory also guarantees it exists when Traefik starts.
    command: [
      "--providers.docker=false",
      "--providers.file.directory=/etc/traefik/dynamic",
      "--providers.file.watch=true",
      "--entrypoints.web.address=:80",
      "--api.insecure=false",
    ],
    volumes: ["/etc/traefik/dynamic"],
  },
  {
    id: "nginx",
    name: "Nginx",
    category: "proxy",
    image: "nginx:1.27-alpine",
    description: "Reverse proxy / web server",
    icon: "nginx",
    color: "#009639",
    ports: [{ containerPort: 80, label: "http" }],
  },
  {
    id: "caddy",
    name: "Caddy",
    category: "proxy",
    image: "caddy:2-alpine",
    description: "Reverse proxy, automatic TLS",
    icon: "caddy",
    color: "#1F88C0",
    ports: [{ containerPort: 80, label: "http" }],
  },
  {
    id: "haproxy",
    name: "HAProxy",
    category: "proxy",
    image: "haproxy:3.0-alpine",
    description: "Load balancer",
    icon: "haproxy",
    color: "#106DA9",
    ports: [{ containerPort: 80, label: "http" }],
    // The image ships no config and runs unprivileged: start with a tiny stub on :8404 plus the config directory
    // Nautix fills from the Gateway page (its haproxy.cfg adds the real frontend on :80).
    command: [
      "sh",
      "-c",
      "printf '%s\\n' 'global' '    maxconn 256' 'defaults' '    mode http' '    timeout connect 5s' '    timeout client 30s' '    timeout server 30s' 'frontend nautix_stub' '    bind :8404' '    http-request return status 404 content-type text/plain string no-route' > /tmp/nautix-stub.cfg; exec haproxy -W -db -f /tmp/nautix-stub.cfg -f /usr/local/etc/haproxy/",
    ],
    volumes: ["/usr/local/etc/haproxy"],
  },
  {
    id: "kong",
    name: "Kong",
    category: "gateway",
    image: "kong:3.7",
    description: "API gateway (APIM)",
    icon: "kong",
    color: "#003459",
    ports: [
      { containerPort: 8000, label: "proxy" },
      { containerPort: 8001, label: "admin" },
    ],
    env: { KONG_DATABASE: "off", KONG_ADMIN_LISTEN: "0.0.0.0:8001" },
  },
  {
    id: "apisix",
    name: "Apache APISIX",
    category: "gateway",
    image: "apache/apisix:3.9.1-debian",
    description: "API gateway (APIM)",
    icon: "apacheapisix",
    color: "#E8433E",
    ports: [{ containerPort: 9080, label: "gateway" }],
  },
  {
    id: "wso2-apim",
    name: "WSO2 API Manager",
    category: "gateway",
    image: "wso2/wso2am:4.3.0",
    description: "Full API management",
    icon: "wso2",
    color: "#FF7300",
    ports: [
      { containerPort: 9443, label: "console" },
      { containerPort: 8243, label: "gateway" },
    ],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    category: "database",
    image: "postgres:16-alpine",
    description: "Relational database",
    icon: "postgresql",
    color: "#4169E1",
    ports: [{ containerPort: 5432, label: "sql" }],
    env: { POSTGRES_PASSWORD: "change-me" },
    volumes: ["/var/lib/postgresql/data"],
  },
  {
    id: "mysql",
    name: "MySQL",
    category: "database",
    image: "mysql:8.4",
    description: "Relational database",
    icon: "mysql",
    color: "#4479A1",
    ports: [{ containerPort: 3306, label: "sql" }],
    env: { MYSQL_ROOT_PASSWORD: "change-me" },
    volumes: ["/var/lib/mysql"],
  },
  {
    id: "mongo",
    name: "MongoDB",
    category: "database",
    image: "mongo:7",
    description: "Document database",
    icon: "mongodb",
    color: "#47A248",
    ports: [{ containerPort: 27017, label: "mongo" }],
    volumes: ["/data/db"],
  },
  {
    id: "mssql",
    name: "SQL Server",
    category: "database",
    image: "mcr.microsoft.com/mssql/server:2022-latest",
    description: "Microsoft SQL Server (needs ≥ 2 GB RAM; accepts the Microsoft EULA)",
    icon: "microsoftsqlserver",
    color: "#CC2927",
    ports: [{ containerPort: 1433, label: "sql" }],
    env: { ACCEPT_EULA: "Y", MSSQL_SA_PASSWORD: "change-me", MSSQL_PID: "Developer" },
    volumes: ["/var/opt/mssql"],
  },
  {
    id: "redis",
    name: "Redis",
    category: "cache",
    image: "redis:7-alpine",
    description: "Cache / key-value",
    icon: "redis",
    color: "#DC382D",
    ports: [{ containerPort: 6379, label: "redis" }],
  },
  {
    id: "rabbitmq",
    name: "RabbitMQ",
    category: "broker",
    image: "rabbitmq:3-management-alpine",
    description: "Queues and topics",
    icon: "rabbitmq",
    color: "#FF6600",
    ports: [
      { containerPort: 5672, label: "amqp" },
      { containerPort: 15672, label: "console" },
    ],
  },
  {
    id: "adguardhome",
    name: "AdGuard Home",
    category: "dns",
    image: "adguard/adguardhome:v0.107.78",
    description: "DNS server with custom records (DNS rewrites) and ad blocking",
    icon: "adguard",
    color: "#68BC71",
    ports: [
      { containerPort: 53, label: "dns", protocol: "udp", hostPort: 53 },
      { containerPort: 53, label: "dns", protocol: "tcp", hostPort: 53 },
      { containerPort: 3000, label: "setup" },
    ],
    volumes: ["/opt/adguardhome/work", "/opt/adguardhome/conf"],
  },
  {
    id: "pihole",
    name: "Pi-hole",
    category: "dns",
    image: "pihole/pihole:2026.09.0",
    description: "DNS server with local DNS records and ad blocking",
    icon: "pihole",
    color: "#96060C",
    ports: [
      { containerPort: 53, label: "dns", protocol: "udp", hostPort: 53 },
      { containerPort: 53, label: "dns", protocol: "tcp", hostPort: 53 },
      { containerPort: 80, label: "web" },
    ],
    env: { FTLCONF_webserver_api_password: "change-me", FTLCONF_dns_listeningMode: "ALL" },
    volumes: ["/etc/pihole"],
  },
  {
    id: "dnsmasq",
    name: "dnsmasq",
    category: "dns",
    image: "jpillora/dnsmasq:1.1",
    description: "Lightweight DNS with a web editor for custom domains",
    icon: "dnsmasq",
    color: "#3B82F6",
    ports: [
      { containerPort: 53, label: "dns", protocol: "udp", hostPort: 5353 },
      { containerPort: 8080, label: "web" },
    ],
    env: { HTTP_USER: "admin", HTTP_PASS: "change-me" },
  },
  {
    id: "kafka",
    name: "Kafka",
    category: "broker",
    image: "apache/kafka:4.3.1",
    description: "Event streaming, single node (KRaft)",
    icon: "apachekafka",
    color: "#231F20",
    ports: [{ containerPort: 9092, label: "broker" }],
    volumes: ["/var/lib/kafka/data"],
  },
  {
    id: "n8n",
    name: "n8n",
    category: "automation",
    image: "n8nio/n8n:2.44.4",
    description: "Workflow automation",
    icon: "n8n",
    color: "#EA4B71",
    ports: [{ containerPort: 5678, label: "web" }],
    env: { N8N_SECURE_COOKIE: "false", GENERIC_TIMEZONE: "UTC" },
    volumes: ["/home/node/.n8n"],
  },
  {
    id: "prometheus",
    name: "Prometheus",
    category: "observability",
    image: "prom/prometheus:v2.54.0",
    description: "Metrics",
    icon: "prometheus",
    color: "#E6522C",
    ports: [{ containerPort: 9090, label: "web" }],
  },
  {
    id: "grafana",
    name: "Grafana",
    category: "observability",
    image: "grafana/grafana:11.2.0",
    description: "Dashboards",
    icon: "grafana",
    color: "#F46800",
    ports: [{ containerPort: 3000, label: "web" }],
    volumes: ["/var/lib/grafana"],
  },
] as const;

export const findTemplate = (id: string): Template | undefined =>
  TEMPLATES.find((t) => t.id === id);
