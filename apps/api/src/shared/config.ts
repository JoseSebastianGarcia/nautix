import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  engine: "socket" | "fake";
  dockerSocket: string;
  webDist: string;
  secureCookies: boolean;
  tls: TlsConfig;
}

export type TlsConfig =
  | { mode: "off" }
  | { mode: "auto"; hosts: string[] }
  | { mode: "files"; certFile: string; keyFile: string };

const loadTlsConfig = (env: NodeJS.ProcessEnv): TlsConfig => {
  if (env.NAUTIX_TLS_CERT && env.NAUTIX_TLS_KEY) {
    return {
      mode: "files",
      certFile: resolve(env.NAUTIX_TLS_CERT),
      keyFile: resolve(env.NAUTIX_TLS_KEY),
    };
  }
  if (env.NAUTIX_TLS === "auto") {
    const hosts = (env.NAUTIX_TLS_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter((h) => h !== "");
    return { mode: "auto", hosts };
  }
  return { mode: "off" };
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const tls = loadTlsConfig(env);
  return {
    host: env.NAUTIX_HOST ?? "127.0.0.1",
    port: Number(env.NAUTIX_PORT ?? 3737),
    dataDir: resolve(env.NAUTIX_DATA ?? "./data"),
    engine: env.NAUTIX_ENGINE === "fake" ? "fake" : "socket",
    dockerSocket: env.NAUTIX_DOCKER_SOCKET ?? "/var/run/docker.sock",
    webDist: resolve(
      env.NAUTIX_WEB_DIST ?? fileURLToPath(new URL("../../../web/dist", import.meta.url)),
    ),
    secureCookies: env.NAUTIX_SECURE_COOKIES === "true" || tls.mode !== "off",
    tls,
  };
};

export const APP_CONFIG = Symbol("APP_CONFIG");
