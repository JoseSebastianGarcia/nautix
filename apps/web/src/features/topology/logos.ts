import {
  siApachekafka,
  siCaddy,
  siDocker,
  siGrafana,
  siKong,
  siMongodb,
  siMysql,
  siN8n,
  siNginx,
  siPostgresql,
  siPrometheus,
  siRabbitmq,
  siRedis,
  siTraefikproxy,
  siVaultwarden,
} from "simple-icons";

export interface Logo {
  /** SVG path (24x24 viewBox); null means "use initials". */
  path: string | null;
  hex: string;
  initials: string;
}

interface Brand {
  match: RegExp;
  path: string | null;
  hex: string;
  initials: string;
}

// Logos from simple-icons (CC0). Brands without an icon there use a tinted initials badge.
const BRANDS: Brand[] = [
  { match: /traefik/, path: siTraefikproxy.path, hex: `#${siTraefikproxy.hex}`, initials: "TR" },
  { match: /nginx/, path: siNginx.path, hex: `#${siNginx.hex}`, initials: "NG" },
  { match: /caddy/, path: siCaddy.path, hex: `#${siCaddy.hex}`, initials: "CD" },
  { match: /haproxy/, path: null, hex: "#106DA9", initials: "HA" },
  { match: /kong/, path: siKong.path, hex: `#${siKong.hex}`, initials: "KG" },
  { match: /apisix/, path: null, hex: "#E8433E", initials: "AX" },
  { match: /wso2/, path: null, hex: "#FF7300", initials: "W2" },
  { match: /mssql|sqlserver|sql-server/, path: null, hex: "#CC2927", initials: "SQ" },
  { match: /kafka/, path: siApachekafka.path, hex: "#8b7cf6", initials: "KF" },
  { match: /n8n/, path: siN8n.path, hex: `#${siN8n.hex}`, initials: "N8" },
  { match: /adguard/, path: null, hex: "#68BC71", initials: "AG" },
  { match: /pihole/, path: null, hex: "#96060C", initials: "PH" },
  { match: /dnsmasq/, path: null, hex: "#3B82F6", initials: "DM" },
  { match: /postgres/, path: siPostgresql.path, hex: `#${siPostgresql.hex}`, initials: "PG" },
  { match: /mysql|mariadb/, path: siMysql.path, hex: `#${siMysql.hex}`, initials: "MY" },
  { match: /mongo/, path: siMongodb.path, hex: `#${siMongodb.hex}`, initials: "MG" },
  { match: /redis/, path: siRedis.path, hex: `#${siRedis.hex}`, initials: "RD" },
  { match: /rabbitmq/, path: siRabbitmq.path, hex: `#${siRabbitmq.hex}`, initials: "RQ" },
  {
    match: /prometheus|prom\//,
    path: siPrometheus.path,
    hex: `#${siPrometheus.hex}`,
    initials: "PM",
  },
  {
    match: /vaultwarden/,
    path: siVaultwarden.path,
    hex: `#${siVaultwarden.hex}`,
    initials: "VW",
  },
  { match: /grafana/, path: siGrafana.path, hex: `#${siGrafana.hex}`, initials: "GF" },
];

const FALLBACK_HEX = "#8b7cf6";

/** Picks a logo from an image reference like `docker.io/library/nginx:1.27`. */
export const logoFor = (image: string, name = ""): Logo => {
  const ref = image.toLowerCase();
  const brand = BRANDS.find((b) => b.match.test(ref));
  if (brand) return { path: brand.path, hex: brand.hex, initials: brand.initials };
  const initials =
    (name || image)
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase() || "··";
  return { path: siDocker.path, hex: FALLBACK_HEX, initials };
};
