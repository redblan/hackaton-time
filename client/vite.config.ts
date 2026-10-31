import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// В dev клиент на :5173, сервер на :3000 — проксируем API, сокеты и ассеты.
// С другого ноута: http://<ip>:5173 (dev) или https://<ip>:3000 (npm run build && npm run start).
const target = process.env.SERVER_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target, secure: false },
      "/assets": { target, secure: false },
      "/socket.io": { target, ws: true, secure: false },
    },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
