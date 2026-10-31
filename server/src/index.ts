import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer as createHttp } from "node:http";
import { createServer as createHttps } from "node:https";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import express from "express";
import { Server } from "socket.io";
import { createAi } from "@game/ai";
import type { ClientToServer, ServerToClient } from "@game/shared";
import { login } from "./auth";
import { ChunkStore } from "./chunks";
import { config } from "./config";
import { openStore } from "./db";
import { Game, type SocketData } from "./game";
import { dbMemoryStore } from "./memory";

function lanIps(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i!.address);
}

/** Самоподписанный сертификат через openssl (есть на macOS/Linux). Нет openssl — работаем по HTTP. */
function loadCert(): { key: Buffer; cert: Buffer } | null {
  const key = join(config.certsDir, "key.pem");
  const cert = join(config.certsDir, "cert.pem");
  if (!existsSync(key) || !existsSync(cert)) {
    try {
      mkdirSync(config.certsDir, { recursive: true });
      const san = ["DNS:localhost", "IP:127.0.0.1", ...lanIps().map((ip) => `IP:${ip}`)].join(",");
      execFileSync("openssl", [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "825",
        "-keyout", key, "-out", cert, "-subj", "/CN=toltchok-local", "-addext", `subjectAltName=${san}`,
      ], { stdio: "ignore" });
      console.log(`[https] создан самоподписанный сертификат в ${config.certsDir}`);
    } catch {
      console.warn("[https] openssl недоступен — запускаюсь по HTTP");
      return null;
    }
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

const store = await openStore(config.databaseUrl);
const chunks = new ChunkStore(config.chunksDir);
const ai = createAi({ memory: dbMemoryStore(store), ollamaUrl: config.ollamaUrl, model: config.ollamaModel });

const app = express();
app.use(express.json({ limit: "64kb" }));

app.post("/api/login", async (req, res) => {
  try {
    const r = await login(store, req.body?.name, req.body?.password);
    if (!r.ok) {
      res.status(400).json({ error: r.error });
      return;
    }
    res.json({ token: r.token, playerId: r.playerId, name: r.name });
  } catch (e) {
    console.error("[auth]", e);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: store.kind, chunks: chunks.ids().length });
});

// Для /sandbox (просмотр чанков). В игре чанки идут только по сокету с лимитом.
app.get("/api/chunks", (_req, res) => {
  res.json({ ids: chunks.ids() });
});
app.get("/api/chunks/:id", (req, res) => {
  const c = chunks.get(req.params.id);
  if (c) res.json(c);
  else res.status(404).json({ error: "Нет такого чанка" });
});

// Оверлей для жюри (F3): что NPC помнят об игроке и его профиль навыков. Только про себя, по токену.
app.get("/api/debug/me", async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const player = token ? await store.getSession(token).catch(() => null) : null;
  if (!player) {
    res.status(401).json({ error: "Нужен вход" });
    return;
  }
  const [memory, profile] = await Promise.all([store.getMemory(player.id), store.getProfile(player.id)]);
  res.json({ name: player.name, db: store.kind, memory, profile });
});

app.use("/assets", express.static(config.assetsDir, { maxAge: "1h" }));

// Собранный клиент (npm run build). В dev клиент отдаёт Vite.
if (existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
    res.sendFile(join(config.clientDist, "index.html"));
  });
}

const cert = config.https ? loadCert() : null;
const server = cert ? createHttps(cert, app) : createHttp(app);
const io = new Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>(server, {
  cors: { origin: true },
});

io.use(async (socket, next) => {
  const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
  if (typeof token !== "string" || !token) return next(new Error("unauthorized"));
  try {
    const player = await store.getSession(token);
    if (!player) return next(new Error("unauthorized"));
    socket.data = { playerId: player.id, name: player.name, chunks: new Set() };
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

const game = new Game(io, store, ai, chunks);
await game.restore();

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    if (stopping) return;
    stopping = true;
    await game.dispose(); // последний снимок комнат в БД
    process.exit(0);
  });
}

server.listen(config.port, config.host, () => {
  const proto = cert ? "https" : "http";
  console.log(`[server] слушаю ${proto}://${config.host}:${config.port}`);
  for (const ip of ["localhost", ...lanIps()]) console.log(`         ${proto}://${ip}:${config.port}`);
});
