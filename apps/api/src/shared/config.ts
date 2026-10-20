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
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => ({
  host: env.NAUTIX_HOST ?? "127.0.0.1",
  port: Number(env.NAUTIX_PORT ?? 3737),
  dataDir: resolve(env.NAUTIX_DATA ?? "./data"),
  engine: env.NAUTIX_ENGINE === "fake" ? "fake" : "socket",
  dockerSocket: env.NAUTIX_DOCKER_SOCKET ?? "/var/run/docker.sock",
  webDist: resolve(
    env.NAUTIX_WEB_DIST ?? fileURLToPath(new URL("../../../web/dist", import.meta.url)),
  ),
  secureCookies: env.NAUTIX_SECURE_COOKIES === "true",
});

export const APP_CONFIG = Symbol("APP_CONFIG");
