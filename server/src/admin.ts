/**
 * Админка (01.11): состояние комнат и клиентов с метриками (FPS, ping), управление вселенной
 * (флаги, толчок, объекты через world:patch, телепорт, кик) и агентами (карточки NPC у Матвея, сказать от имени NPC).
 * Вход по ADMIN_PASSWORD (по умолчанию «admin»): заголовок `x-admin-token`. Опрос с клиента раз в 2 с.
 */
import { timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Router, type Request, type Response } from "express";
import type { AiModule, NpcId, Vec3, WorldObject, WorldPatch } from "@game/shared";
import { config } from "./config";
import type { Game } from "./game";
import type { ChunkStore } from "./chunks";

const PASSWORD = process.env.ADMIN_PASSWORD ?? "admin";

function authorized(req: Request): boolean {
  const got = String(req.headers["x-admin-token"] ?? "");
  const a = Buffer.from(got);
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Пресет палитры (формат Никиты, N14): части-коробки в локальных координатах, Y=0 — низ, X/Z — от точки установки */
interface PaletteEntry {
  id: string;
  label: string;
  size: Vec3;
  color: string;
  parts: { pos: Vec3; size: Vec3; color: string }[];
}

/** Встроенная палитра, пока Никита не положил world/chunks/palette.json */
const DEFAULT_PALETTE: PaletteEntry[] = [
  { id: "crate", label: "Коробка", size: [0.6, 0.6, 0.6], color: "#b0885a", parts: [{ pos: [0, 0.3, 0], size: [0.6, 0.6, 0.6], color: "#b0885a" }] },
  { id: "barrier", label: "Ограждение", size: [2, 1, 0.1], color: "#d9534f", parts: [{ pos: [0, 0.5, 0], size: [2, 1, 0.1], color: "#d9534f" }] },
  { id: "rubble", label: "Завал", size: [1.6, 0.6, 1.2], color: "#8b817c", parts: [{ pos: [0, 0.3, 0], size: [1.6, 0.6, 1.2], color: "#8b817c" }] },
  { id: "firstaid", label: "Аптечка", size: [0.35, 0.25, 0.25], color: "#e63946", parts: [{ pos: [0, 0.125, 0], size: [0.35, 0.25, 0.25], color: "#e63946" }] },
  { id: "water", label: "Вода (ящик)", size: [0.5, 0.35, 0.35], color: "#4f9fd8", parts: [{ pos: [0, 0.175, 0], size: [0.5, 0.35, 0.35], color: "#4f9fd8" }] },
  { id: "ladder", label: "Лестница", size: [0.5, 3, 0.15], color: "#c9c2bb", parts: [{ pos: [0, 1.5, 0], size: [0.5, 3, 0.15], color: "#c9c2bb" }] },
  { id: "blanket", label: "Одеяла", size: [0.8, 0.3, 0.6], color: "#9b6b9e", parts: [{ pos: [0, 0.15, 0], size: [0.8, 0.3, 0.6], color: "#9b6b9e" }] },
];

function loadPalette(): PaletteEntry[] {
  const file = join(config.chunksDir, "palette.json");
  if (!existsSync(file)) return DEFAULT_PALETTE;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const list = Array.isArray(raw) ? raw : (raw as { presets?: unknown; PALETTE?: unknown }).presets ?? (raw as { PALETTE?: unknown }).PALETTE;
    if (Array.isArray(list) && list.every((e) => e && typeof e.id === "string" && Array.isArray(e.parts))) return list as PaletteEntry[];
  } catch {
    /* битый файл — встроенная */
  }
  return DEFAULT_PALETTE;
}

/** Пресет → коробки мира (как paletteObjects у Никиты): части поворачиваем вокруг точки установки, id с общим префиксом экземпляра */
function placePreset(preset: PaletteEntry, instanceId: string, pos: Vec3, rotY = 0, collide = true): WorldObject[] {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  return preset.parts.map((part, i) => ({
    id: `${instanceId}-${i}`,
    kind: "box" as const,
    pos: [pos[0] + part.pos[0] * cos + part.pos[2] * sin, pos[1] + part.pos[1], pos[2] - part.pos[0] * sin + part.pos[2] * cos] as Vec3,
    size: part.size,
    color: part.color,
    rotY,
    collide,
  }));
}

export function adminRouter(game: Game, ai: AiModule, chunks: ChunkStore, startedAt: number) {
  const r = Router();
  r.use((req, res, next) => {
    if (!authorized(req)) {
      res.status(401).json({ error: "Нужен пароль админки (x-admin-token)" });
      return;
    }
    next();
  });

  r.post("/login", (_req, res) => res.json({ ok: true }));

  r.get("/state", (_req, res) => {
    const mem = process.memoryUsage();
    res.json({
      ...game.adminState(),
      server: {
        uptimeMs: Date.now() - startedAt,
        rssMb: Math.round(mem.rss / 1048576),
        heapMb: Math.round(mem.heapUsed / 1048576),
        chunks: chunks.ids().length,
        ai: ai.getStats?.() ?? null,
        node: process.version,
      },
      characters: ai.getCharacters?.() ?? null,
      at: Date.now(),
    });
  });

  r.get("/palette", (_req, res) => res.json(loadPalette()));

  /** Поставить пресет палитры в чанк: local — координаты внутри чанка (x,z от min, y над полом чанка) */
  r.post("/room/:id/place", (req, res) => {
    const { chunkId, presetId, local, rotY, collide } = (req.body ?? {}) as { chunkId?: unknown; presetId?: unknown; local?: unknown; rotY?: unknown; collide?: unknown };
    const chunk = typeof chunkId === "string" ? chunks.get(chunkId) : undefined;
    const preset = loadPalette().find((p) => p.id === presetId);
    const l = Array.isArray(local) && local.length === 3 && local.every((n) => typeof n === "number") ? (local as Vec3) : null;
    if (!chunk || !preset || !l) {
      res.status(400).json({ error: "Нужны chunkId, presetId и local [x,y,z]" });
      return;
    }
    const instanceId = `admin-${preset.id}-${Date.now().toString(36)}`;
    const base = chunk.bounds.min;
    const add = placePreset(preset, instanceId, [base[0] + l[0], base[1] + l[1], base[2] + l[2]], Number(rotY) || 0, collide !== false);
    if (!game.patchWorld(req.params.id, { chunkId: chunk.id, add, remove: [] })) {
      res.status(404).json({ error: "Нет такой комнаты" });
      return;
    }
    res.json({ ok: true, instanceId, ids: add.map((o) => o.id) });
  });

  r.get("/chunks/:id", (req, res) => {
    const c = chunks.get(req.params.id);
    if (c) res.json(c);
    else res.status(404).json({ error: "Нет такого чанка" });
  });

  const ok = (res: Response, done: boolean) => (done ? res.json({ ok: true }) : res.status(404).json({ error: "Не найдено или не прошло" }));

  r.post("/room/:id/flag", (req, res) => {
    const { flag, on } = req.body ?? {};
    ok(res, typeof flag === "string" && game.setFlag(req.params.id, flag, Boolean(on)));
  });
  r.post("/room/:id/quake", (req, res) => {
    const { strength, durationMs } = req.body ?? {};
    ok(res, game.quake(req.params.id, Number(strength) || 0.8, Number(durationMs) || 4000));
  });
  r.post("/room/:id/patch", (req, res) => {
    const p = req.body as Partial<WorldPatch> | undefined;
    if (!p || typeof p.chunkId !== "string") {
      res.status(400).json({ error: "Нужен chunkId" });
      return;
    }
    ok(res, game.patchWorld(req.params.id, { chunkId: p.chunkId, add: p.add ?? [], remove: p.remove ?? [] }));
  });
  r.post("/room/:id/reset-world", (req, res) => ok(res, game.clearPatches(req.params.id)));
  r.post("/room/:id/say", (req, res) => {
    const { npcId, text, playerId } = req.body ?? {};
    ok(res, typeof text === "string" && game.sayAs(req.params.id, npcId as NpcId, text, typeof playerId === "string" ? playerId : undefined));
  });
  r.post("/player/:id/teleport", (req, res) => {
    const { pos, rotY } = req.body ?? {};
    ok(res, game.teleport(req.params.id, pos, Number(rotY) || 0));
  });
  r.post("/player/:id/kick", (req, res) => ok(res, game.kick(req.params.id)));

  r.post("/characters/:npcId", (req, res) => {
    if (!ai.setCharacter) {
      res.status(501).json({ error: "Модуль ИИ пока не умеет менять карточки (M22)" });
      return;
    }
    const card = ai.setCharacter(req.params.npcId as NpcId, req.body ?? {});
    if (card) res.json(card);
    else res.status(404).json({ error: "Нет такого персонажа" });
  });

  return r;
}
