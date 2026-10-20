import "reflect-metadata";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import express from "express";
import { AppModule } from "./app.module.js";
import { loadConfig } from "./shared/config.js";
import { ProblemFilter } from "./shared/problem.filter.js";
import { loadTls } from "./shared/tls.js";

const config = loadConfig();
const tls = await loadTls(config);
const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
  logger: ["error", "warn"],
  ...(tls ? { httpsOptions: tls } : {}),
});

app.use(cookieParser());
app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  );
  next();
});
app.useGlobalFilters(new ProblemFilter());

if (existsSync(join(config.webDist, "index.html"))) {
  const server = app.getHttpAdapter().getInstance() as express.Express;
  server.use(express.static(config.webDist));
  // SPA fallback for non-API routes
  server.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(config.webDist, "index.html")));
}

await app.listen(config.port, config.host);
console.log(
  `Nautix listening on ${tls ? "https" : "http"}://${config.host}:${config.port} (engine: ${config.engine})`,
);
