import type { BindingKind, BindingStyle } from "@nautix/contracts";

/** What a strategy needs to know about the provider. */
export interface ProviderInfo {
  /** Container name: how the consumer reaches it on a shared network. */
  host: string;
  /** Environment the provider was created with (its own user, password, database). */
  env: Record<string, string>;
  /** First port the container exposes, used by plain HTTP bindings. */
  port: number | null;
}

/** Turns a secret into what is written: itself, or a mask for the preview. */
export type Secret = (value: string) => string;

export interface BindingStrategy {
  readonly kind: BindingKind;
  /** The variables to give the consumer, by name. */
  variables(
    provider: ProviderInfo,
    name: string,
    style: BindingStyle,
    secret: Secret,
  ): Record<string, string>;
}

/** A value inside a `Key=Value;` connection string: quoted when it holds characters that would break it. */
export const connValue = (value: string): string =>
  /[;"'=\s]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const enc = encodeURIComponent;

const UPPER = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();

/** `ConnectionStrings__Db` for .NET, `DB_URL` for everything else. */
const keyFor = (name: string, style: BindingStyle): string =>
  style === "dotnet" ? `ConnectionStrings__${name}` : `${UPPER(name)}_URL`;

const withPassword = (user: string, password: string, secret: Secret): string =>
  password ? `${enc(user)}:${secret(enc(password))}` : enc(user);

const postgres: BindingStrategy = {
  kind: "postgres",
  variables({ host, env }, name, style, secret) {
    const user = env.POSTGRES_USER ?? "postgres";
    const db = env.POSTGRES_DB ?? user;
    const pw = env.POSTGRES_PASSWORD ?? "";
    return {
      [keyFor(name, style)]:
        style === "dotnet"
          ? `Host=${host};Port=5432;Database=${connValue(db)};Username=${connValue(user)}${pw ? `;Password=${secret(connValue(pw))}` : ""}`
          : `postgres://${withPassword(user, pw, secret)}@${host}:5432/${enc(db)}`,
    };
  },
};

const mysqlLike = (kind: "mysql" | "mariadb"): BindingStrategy => ({
  kind,
  variables({ host, env }, name, style, secret) {
    const prefix = kind === "mysql" ? "MYSQL" : "MARIADB";
    const rootPw = env[`${prefix}_ROOT_PASSWORD`] ?? "";
    const user = env[`${prefix}_USER`] ?? "root";
    const pw = env[`${prefix}_USER`] ? (env[`${prefix}_PASSWORD`] ?? "") : rootPw;
    const db = env[`${prefix}_DATABASE`] ?? "";
    return {
      [keyFor(name, style)]:
        style === "dotnet"
          ? `Server=${host};Port=3306;${db ? `Database=${connValue(db)};` : ""}User=${connValue(user)}${pw ? `;Password=${secret(connValue(pw))}` : ""}`
          : `mysql://${withPassword(user, pw, secret)}@${host}:3306/${enc(db)}`,
    };
  },
});

const redis: BindingStrategy = {
  kind: "redis",
  variables({ host, env }, name, style, secret) {
    const pw = env.REDIS_PASSWORD ?? "";
    return {
      [keyFor(name, style)]:
        style === "dotnet"
          ? `${host}:6379${pw ? `,password=${secret(pw)}` : ""}`
          : `redis://${pw ? `:${secret(enc(pw))}@` : ""}${host}:6379`,
    };
  },
};

const mongodb: BindingStrategy = {
  kind: "mongodb",
  variables({ host, env }, name, style, secret) {
    const user = env.MONGO_INITDB_ROOT_USERNAME ?? "";
    const pw = env.MONGO_INITDB_ROOT_PASSWORD ?? "";
    const db = env.MONGO_INITDB_DATABASE ?? "";
    const auth = user ? `${withPassword(user, pw, secret)}@` : "";
    // The .NET driver takes the same URL, so both styles produce it.
    return {
      [keyFor(name, style)]:
        `mongodb://${auth}${host}:27017/${enc(db)}${user ? "?authSource=admin" : ""}`,
    };
  },
};

const sqlserver: BindingStrategy = {
  kind: "sqlserver",
  variables({ host, env }, name, style, secret) {
    const pw = env.MSSQL_SA_PASSWORD ?? env.SA_PASSWORD ?? "";
    return {
      [keyFor(name, style)]:
        style === "dotnet"
          ? `Server=${host},1433;User Id=sa;${pw ? `Password=${secret(connValue(pw))};` : ""}TrustServerCertificate=True`
          : `sqlserver://${withPassword("sa", pw, secret)}@${host}:1433`,
    };
  },
};

const rabbitmq: BindingStrategy = {
  kind: "rabbitmq",
  variables({ host, env }, name, style, secret) {
    const user = env.RABBITMQ_DEFAULT_USER ?? "guest";
    const pw = env.RABBITMQ_DEFAULT_PASS ?? "guest";
    return { [keyFor(name, style)]: `amqp://${withPassword(user, pw, secret)}@${host}:5672` };
  },
};

const http: BindingStrategy = {
  kind: "http",
  variables({ host, port }, name) {
    // A plain service has no connection string: always `<NAME>_URL`.
    return { [keyFor(name, "url")]: `http://${host}:${port ?? 80}` };
  },
};

export const BINDING_STRATEGIES: Record<BindingKind, BindingStrategy> = {
  postgres,
  mysql: mysqlLike("mysql"),
  mariadb: mysqlLike("mariadb"),
  redis,
  mongodb,
  sqlserver,
  rabbitmq,
  http,
};

export const MASK = "••••••";
export const real: Secret = (v) => v;
export const masked: Secret = () => MASK;
