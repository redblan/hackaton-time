import { existsSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..");

const envFile = join(ROOT, ".env");
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* битый .env — живём на дефолтах */
  }
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  /** HTTPS с самоподписанным сертификатом. По умолчанию включён в `npm run start`, выключен в dev. */
  https: process.env.HTTPS ? process.env.HTTPS === "1" : isProd,
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/hackaton",
  ollamaUrl: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
  ollamaModel: process.env.OLLAMA_MODEL,
  chunksDir: join(ROOT, "world", "chunks"),
  assetsDir: join(ROOT, "world", "assets"),
  clientDist: join(ROOT, "client", "dist"),
  certsDir: join(ROOT, "server", ".certs"),
};
