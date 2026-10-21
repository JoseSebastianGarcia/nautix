export type TemplateCategory =
  | "proxy"
  | "gateway"
  | "database"
  | "cache"
  | "broker"
  | "observability"
  | "automation"
  | "dns"
  | "identity"
  | "storage"
  | "secrets"
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
    id: "caddy-https",
    name: "Caddy HTTPS (one site)",
    category: "proxy",
    image: "caddy:2-alpine",
    description:
      "HTTPS in front of one service. Uses localhost with a local certificate; for a VPS put your domain in the command",
    icon: "caddy",
    color: "#1F88C0",
    // `localhost` gets a certificate from Caddy's own local CA (the browser warns until that CA is trusted).
    // With a public domain pointing at this machine and ports 80 and 443 reachable from the internet, Let's
    // Encrypt gives a real certificate: replace localhost by the domain and publish both ports to all interfaces.
    // Certificates are kept in /data, so recreating the container does not ask for new ones.
    ports: [
      { containerPort: 80, label: "http (certificate check)", hostPort: 80 },
      { containerPort: 443, label: "https", hostPort: 443 },
    ],
    command: ["caddy", "reverse-proxy", "--from", "localhost", "--to", "vaultwarden:80"],
    volumes: ["/data"],
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
    image: "dockurr/dnsmasq:2.93",
    description: "Lightweight DNS: edit your own domains in the DNS tab",
    icon: "dnsmasq",
    color: "#3B82F6",
    ports: [
      { containerPort: 53, label: "dns", protocol: "udp", hostPort: 5353 },
      { containerPort: 53, label: "dns", protocol: "tcp", hostPort: 5353 },
    ],
    // Upstream resolvers for names that are not yours; change them if your network blocks these.
    env: { DNS1: "1.1.1.1", DNS2: "1.0.0.1" },
    // Nautix writes /etc/dnsmasq.d/nautix.conf; the volume keeps it when the container is recreated.
    volumes: ["/etc/dnsmasq.d"],
  },
  {
    id: "coredns",
    name: "CoreDNS",
    category: "dns",
    image: "coredns/coredns:1.14.7",
    description:
      "Cloud-native DNS: edit your own domains in the DNS tab (reloads with no downtime)",
    icon: "coredns",
    color: "#1F6FEB",
    ports: [
      { containerPort: 53, label: "dns", protocol: "udp", hostPort: 5353 },
      { containerPort: 53, label: "dns", protocol: "tcp", hostPort: 5353 },
    ],
    // The image has no default config. Deploy it, then press "Save and apply" in the DNS tab:
    // Nautix writes /etc/coredns/Corefile and starts it.
    command: ["-conf", "/etc/coredns/Corefile"],
  },
  {
    id: "keycloak",
    name: "Keycloak",
    category: "identity",
    image: "keycloak/keycloak:26.8.1",
    description: "Identity provider (SSO, OIDC, SAML, LDAP) in dev mode; the admin user is below",
    icon: "keycloak",
    color: "#4D4D4D",
    ports: [{ containerPort: 8080, label: "console", hostPort: 8081 }],
    // Dev mode keeps data in an embedded database and needs no TLS: fine to try it out.
    // For production add a PostgreSQL container and switch to `start`. Change this password first.
    env: { KC_BOOTSTRAP_ADMIN_USERNAME: "admin", KC_BOOTSTRAP_ADMIN_PASSWORD: "change-me" },
    command: ["start-dev"],
    volumes: ["/opt/keycloak/data"],
  },
  {
    id: "pocket-id",
    name: "Pocket ID",
    category: "identity",
    image: "pocketid/pocket-id:v2.18.0",
    description: "Simple OIDC provider with passkey login, one container (set ENCRYPTION_KEY)",
    icon: "openid",
    color: "#F78C40",
    ports: [{ containerPort: 1411, label: "web", hostPort: 1411 }],
    // ENCRYPTION_KEY protects the stored secrets: use your own random value of 16+ characters.
    // APP_URL must be the address you open it with, or logins will be refused.
    env: { APP_URL: "http://localhost:1411", ENCRYPTION_KEY: "change-me-use-16-or-more-chars" },
    volumes: ["/app/data"],
  },
  {
    id: "casdoor",
    name: "Casdoor",
    category: "identity",
    image: "casbin/casdoor-all-in-one:4.22.0",
    description:
      "Identity and access management with its own database included (OAuth, SAML, LDAP)",
    icon: "casdoor",
    color: "#5734D3",
    ports: [{ containerPort: 8000, label: "web", hostPort: 8000 }],
    // The first login is built-in: change that admin password right away.
    volumes: ["/var/lib/mysql"],
  },
  {
    id: "rustfs",
    name: "RustFS",
    category: "storage",
    image: "rustfs/rustfs:1.0.3",
    description: "S3-compatible object storage (buckets, access keys, web console)",
    icon: "rust",
    color: "#DEA584",
    ports: [
      { containerPort: 9000, label: "s3", hostPort: 9000 },
      { containerPort: 9001, label: "console", hostPort: 9001 },
    ],
    // These are the S3 access key and secret key: apps use them to connect. Change them.
    env: {
      RUSTFS_ACCESS_KEY: "nautixadmin",
      RUSTFS_SECRET_KEY: "change-me",
      RUSTFS_VOLUMES: "/data",
      RUSTFS_ADDRESS: ":9000",
      RUSTFS_CONSOLE_ENABLE: "true",
      RUSTFS_CONSOLE_ADDRESS: ":9001",
    },
    volumes: ["/data"],
  },
  {
    id: "azurite",
    name: "Azurite",
    category: "storage",
    image: "mcr.microsoft.com/azure-storage/azurite:3.37.0",
    description: "Azure Blob, Queue and Table storage emulator (fixed well-known dev account)",
    icon: "microsoftazure",
    color: "#0078D4",
    ports: [
      { containerPort: 10000, label: "blob", hostPort: 10000 },
      { containerPort: 10001, label: "queue", hostPort: 10001 },
      { containerPort: 10002, label: "table", hostPort: 10002 },
    ],
    // Connect with the public development account devstoreaccount1: for testing, never production.
    volumes: ["/data"],
  },
  {
    id: "fake-gcs-server",
    name: "fake-gcs-server",
    category: "storage",
    image: "fsouza/fake-gcs-server:1.56.1",
    description: "Google Cloud Storage emulator (buckets and objects over HTTP, no authentication)",
    icon: "googlecloud",
    color: "#4285F4",
    ports: [{ containerPort: 4443, label: "gcs", hostPort: 4443 }],
    // Plain HTTP so clients need no certificate. Point STORAGE_EMULATOR_HOST at http://host:4443.
    command: ["-scheme", "http", "-port", "4443", "-data", "/data"],
    volumes: ["/data"],
  },
  {
    id: "openbao",
    name: "OpenBao",
    category: "secrets",
    image: "openbao/openbao:2.7.1",
    description:
      "Open-source secrets vault (Vault-compatible API). Dev mode: data is lost on restart",
    icon: "openbao",
    color: "#7B61FF",
    ports: [{ containerPort: 8200, label: "api and ui", hostPort: 8200 }],
    // Dev mode: starts unsealed with this root token and keeps everything in memory.
    // For real use run it with a storage backend and initialise it (bao operator init).
    env: { BAO_DEV_ROOT_TOKEN_ID: "change-me", BAO_DEV_LISTEN_ADDRESS: "0.0.0.0:8200" },
    command: ["server", "-dev"],
  },
  {
    id: "vault",
    name: "HashiCorp Vault",
    category: "secrets",
    image: "hashicorp/vault:2.2.0",
    description: "Secrets vault and encryption service. Dev mode: data is lost on restart",
    icon: "vault",
    color: "#FFEC6E",
    ports: [{ containerPort: 8200, label: "api and ui", hostPort: 8201 }],
    // Dev mode: starts unsealed with this root token and keeps everything in memory.
    // Vault is source-available (BUSL); OpenBao is the open-source fork with the same API.
    env: { VAULT_DEV_ROOT_TOKEN_ID: "change-me", VAULT_DEV_LISTEN_ADDRESS: "0.0.0.0:8200" },
    command: ["server", "-dev"],
  },
  {
    id: "openbao-storage",
    name: "OpenBao (with storage)",
    category: "secrets",
    image: "openbao/openbao:2.7.1",
    description: "Secrets vault that keeps its data in a volume. Initialise it once in the web UI",
    icon: "openbao",
    color: "#7B61FF",
    ports: [{ containerPort: 8200, label: "api and ui", hostPort: 8200 }],
    // Data lives in the volume (integrated raft storage). On the first visit to the UI you get an
    // unseal key and a root token: save them. After every restart the vault starts sealed and
    // needs the unseal key again.
    env: {
      BAO_LOCAL_CONFIG:
        '{"storage":{"raft":{"path":"/openbao/file","node_id":"nautix"}},"listener":{"tcp":{"address":"0.0.0.0:8200","tls_disable":true}},"api_addr":"http://127.0.0.1:8200","cluster_addr":"http://127.0.0.1:8201","ui":true,"disable_mlock":true}',
    },
    command: ["server"],
    volumes: ["/openbao/file"],
  },
  {
    id: "vault-storage",
    name: "HashiCorp Vault (with storage)",
    category: "secrets",
    image: "hashicorp/vault:2.2.0",
    description: "Secrets vault that keeps its data in a volume. Initialise it once in the web UI",
    icon: "vault",
    color: "#FFEC6E",
    ports: [{ containerPort: 8200, label: "api and ui", hostPort: 8201 }],
    // Same behaviour as the OpenBao one: save the unseal key and root token shown on first use.
    env: {
      VAULT_LOCAL_CONFIG:
        '{"storage":{"raft":{"path":"/vault/file","node_id":"nautix"}},"listener":{"tcp":{"address":"0.0.0.0:8200","tls_disable":true}},"api_addr":"http://127.0.0.1:8200","cluster_addr":"http://127.0.0.1:8201","ui":true,"disable_mlock":true}',
    },
    command: ["server"],
    volumes: ["/vault/file"],
  },
  {
    id: "lowkey-vault",
    name: "Lowkey Vault",
    category: "secrets",
    image: "nagyesta/lowkey-vault:7.3.127",
    description: "Azure Key Vault emulator (keys, secrets, certificates) for development",
    icon: "microsoftazure",
    color: "#0078D4",
    ports: [
      { containerPort: 8443, label: "https", hostPort: 8443 },
      { containerPort: 8080, label: "http", hostPort: 8080 },
    ],
    // Uses a self-signed certificate on 8443; keeps data in memory. For testing only.
  },
  {
    id: "vaultwarden",
    name: "Vaultwarden",
    category: "secrets",
    image: "vaultwarden/server:1.37.4",
    description:
      "Password and secrets manager for teams (Bitwarden-compatible). The web vault refuses plain HTTP, even on localhost: put Caddy HTTPS in front",
    icon: "vaultwarden",
    color: "#175DDC",
    ports: [{ containerPort: 80, label: "web", hostPort: 8222 }],
    // Everything lives in /data (SQLite database, RSA keys, attachments, config): back up that volume.
    // The web vault only talks to https:// addresses (no exception for localhost), so deploy "Caddy HTTPS" in the
    // same network and open https://localhost. DOMAIN must match the address users type, with https.
    // Registration is open so the first account can be created; set SIGNUPS_ALLOWED=false afterwards
    // (invitations from an organization keep working).
    env: { DOMAIN: "https://localhost", SIGNUPS_ALLOWED: "true" },
    volumes: ["/data"],
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
