import { bindingKind } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { BINDING_STRATEGIES, connValue, MASK, masked, real } from "./binding-strategies.js";
import { chooseNetwork, planBinding } from "./plan-binding.js";

const vars = (
  kind: keyof typeof BINDING_STRATEGIES,
  env: Record<string, string>,
  style: "dotnet" | "url" = "dotnet",
  name = "Db",
) => BINDING_STRATEGIES[kind].variables({ host: "db", env, port: 8080 }, name, style, real);

describe("bindingKind", () => {
  it.each([
    ["postgres:16-alpine", "postgres"],
    ["docker.io/library/postgres:16", "postgres"],
    ["timescale/timescaledb:2", "postgres"],
    ["mysql:8", "mysql"],
    ["mariadb:11", "mariadb"],
    ["redis:7", "redis"],
    ["valkey/valkey:8", "redis"],
    ["mongo:7", "mongodb"],
    ["mcr.microsoft.com/mssql/server:2022-latest", "sqlserver"],
    ["rabbitmq:4-management", "rabbitmq"],
    ["nginx:1.27", "http"],
    ["myorg/api:1", "http"],
  ])("%s → %s", (image, kind) => {
    expect(bindingKind(image)).toBe(kind);
  });
});

describe("connection settings per kind", () => {
  it("postgres, .NET style and URL style", () => {
    const env = { POSTGRES_USER: "app", POSTGRES_PASSWORD: "s3cret", POSTGRES_DB: "orders" };
    expect(vars("postgres", env)).toEqual({
      ConnectionStrings__Db: "Host=db;Port=5432;Database=orders;Username=app;Password=s3cret",
    });
    expect(vars("postgres", env, "url", "OrdersDb")).toEqual({
      ORDERS_DB_URL: "postgres://app:s3cret@db:5432/orders",
    });
  });

  it("postgres defaults: user postgres, database named after the user", () => {
    expect(vars("postgres", { POSTGRES_PASSWORD: "x" }).ConnectionStrings__Db).toBe(
      "Host=db;Port=5432;Database=postgres;Username=postgres;Password=x",
    );
  });

  it("quotes and escapes awkward passwords in each style", () => {
    const env = { POSTGRES_USER: "app", POSTGRES_PASSWORD: 'a;b"c=d e/@' };
    expect(vars("postgres", env).ConnectionStrings__Db).toContain('Password="a;b""c=d e/@"');
    expect(vars("postgres", env, "url").DB_URL).toBe(
      `postgres://app:${encodeURIComponent('a;b"c=d e/@')}@db:5432/app`,
    );
    expect(connValue("plain")).toBe("plain");
  });

  it("mysql and mariadb read their own variable prefix, falling back to root", () => {
    expect(
      vars("mysql", { MYSQL_USER: "u", MYSQL_PASSWORD: "p", MYSQL_DATABASE: "shop" })
        .ConnectionStrings__Db,
    ).toBe("Server=db;Port=3306;Database=shop;User=u;Password=p");
    expect(vars("mariadb", { MARIADB_ROOT_PASSWORD: "r" }, "url").DB_URL).toBe(
      "mysql://root:r@db:3306/",
    );
  });

  it("redis with and without a password", () => {
    expect(vars("redis", {}).ConnectionStrings__Db).toBe("db:6379");
    expect(vars("redis", { REDIS_PASSWORD: "p" }).ConnectionStrings__Db).toBe("db:6379,password=p");
    expect(vars("redis", { REDIS_PASSWORD: "p" }, "url").DB_URL).toBe("redis://:p@db:6379");
  });

  it("mongodb, sql server, rabbitmq", () => {
    expect(
      vars("mongodb", {
        MONGO_INITDB_ROOT_USERNAME: "root",
        MONGO_INITDB_ROOT_PASSWORD: "pw",
        MONGO_INITDB_DATABASE: "app",
      }).ConnectionStrings__Db,
    ).toBe("mongodb://root:pw@db:27017/app?authSource=admin");
    expect(vars("sqlserver", { MSSQL_SA_PASSWORD: "Str0ng!pw" }).ConnectionStrings__Db).toBe(
      "Server=db,1433;User Id=sa;Password=Str0ng!pw;TrustServerCertificate=True",
    );
    expect(vars("rabbitmq", {}, "url").DB_URL).toBe("amqp://guest:guest@db:5672");
  });

  it("a plain HTTP service gets only a URL, with its port or 80", () => {
    expect(vars("http", {}, "dotnet", "Api")).toEqual({ API_URL: "http://db:8080" });
    expect(
      BINDING_STRATEGIES.http.variables({ host: "x", env: {}, port: null }, "A", "url", real),
    ).toEqual({
      A_URL: "http://x:80",
    });
  });

  it("masks every password in the preview but never in the real value", () => {
    const env = { POSTGRES_USER: "app", POSTGRES_PASSWORD: "s3cret" };
    const preview = BINDING_STRATEGIES.postgres.variables(
      { host: "db", env, port: null },
      "Db",
      "dotnet",
      masked,
    );
    expect(preview.ConnectionStrings__Db).toContain(`Password=${MASK}`);
    expect(preview.ConnectionStrings__Db).not.toContain("s3cret");
    expect(vars("postgres", env).ConnectionStrings__Db).toContain("s3cret");
  });
});

describe("network choice", () => {
  const nets = [
    { name: "bridge", system: true },
    { name: "app", system: false },
    { name: "data", system: false },
  ];
  it("uses a shared user-defined network when there is one", () => {
    expect(
      chooseNetwork({ networks: ["bridge", "app"] }, { networks: ["app", "data"] }, nets),
    ).toEqual({
      network: "app",
      joins: false,
    });
  });
  it("otherwise the consumer joins the provider's first user-defined network", () => {
    expect(chooseNetwork({ networks: ["bridge"] }, { networks: ["bridge", "data"] }, nets)).toEqual(
      {
        network: "data",
        joins: true,
      },
    );
  });
  it("refuses a provider that is only on the default bridge", () => {
    expect(() => chooseNetwork({ networks: ["app"] }, { networks: ["bridge"] }, nets)).toThrow(
      /user-defined network/,
    );
  });
});

describe("planBinding", () => {
  it("returns real variables for the consumer and a masked preview for the screen", () => {
    const out = planBinding({
      consumer: { name: "api", networks: ["bridge"] },
      provider: { name: "db", networks: ["data"], ports: [{ privatePort: 5432, type: "tcp" }] },
      providerEnv: { POSTGRES_USER: "app", POSTGRES_PASSWORD: "pw" },
      networks: [
        { name: "data", system: false },
        { name: "bridge", system: true },
      ],
      kind: "postgres",
      name: "Db",
      style: "dotnet",
    });
    expect(out.variables.ConnectionStrings__Db).toContain("Password=pw");
    expect(out.plan).toMatchObject({
      kind: "postgres",
      network: "data",
      joins: true,
      recreates: true,
    });
    expect(out.plan.variables).toEqual([
      {
        key: "ConnectionStrings__Db",
        preview: `Host=db;Port=5432;Database=app;Username=app;Password=${MASK}`,
      },
    ]);
  });
});
