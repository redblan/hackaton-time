import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// В dev клиент на :5173, сервер на :3000 — проксируем API, сокеты и ассеты.
// С другого ноута: http://<ip>:5173 (dev) или https://<ip>:3000 (npm run build && npm run start).
const target = process.env.SERVER_URL ?? "http://127.0.0.1:3000";

// Шифрование в dev: сертификат создаёт scripts/dev.mjs (npm run dev). Проксирование к серверу — по loopback.
const certs = join(import.meta.dirname, "..", "server", ".certs");
const https =
  process.env.CLIENT_HTTPS !== "0" && existsSync(join(certs, "cert.pem"))
    ? { key: readFileSync(join(certs, "key.pem")), cert: readFileSync(join(certs, "cert.pem")) }
    : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    https,
    proxy: {
      "/api": { target, secure: false },
      "/assets": { target, secure: false },
      "/socket.io": { target, ws: true, secure: false },
    },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
