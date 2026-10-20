export type TemplateCategory =
  | "proxy"
  | "gateway"
  | "database"
  | "cache"
  | "broker"
  | "observability"
  | "app";

export interface TemplatePort {
  containerPort: number;
  label: string;
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
    command: ["--providers.docker=false", "--entrypoints.web.address=:80", "--api.insecure=false"],
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
