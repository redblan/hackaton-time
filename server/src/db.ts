/**
 * Хранилище: Postgres. Память процесса разрешена только явно для временного демо.
 * Схема создаётся при старте (CREATE TABLE IF NOT EXISTS), миграций нет.
 */
import pg from "pg";
import type { PlayerId, PlayerMemory, PlayerProfile, StageId, Vec3 } from "@game/shared";
import type { RoomSnapshot } from "./rooms";

/** Срок жизни сессии (дублирует auth.ts, чтобы не тянуть зависимость по кругу) */
const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;

export interface PlayerRow {
  id: PlayerId;
  name: string;
  passHash: string;
}

export interface Progress {
  roomId: string;
  stage: StageId | null;
  pos: Vec3;
}

export interface Store {
  readonly kind: "postgres" | "memory";
  close?(): Promise<void>;
  findPlayer(name: string): Promise<PlayerRow | null>;
  createPlayer(row: PlayerRow): Promise<void>;
  createSession(token: string, playerId: PlayerId): Promise<void>;
  getSession(token: string): Promise<PlayerRow | null>;
  deleteSession(token: string): Promise<void>;
  getProfile(playerId: PlayerId): Promise<PlayerProfile>;
  saveProfile(p: PlayerProfile): Promise<void>;
  getMemory(playerId: PlayerId): Promise<PlayerMemory>;
  saveMemory(m: PlayerMemory): Promise<void>;
  saveProgress(playerId: PlayerId, p: Progress): Promise<void>;
  getProgress(playerId: PlayerId): Promise<Progress | null>;
  /** Снимок запущенной комнаты (восстановление после перезапуска) */
  saveRoom(snapshot: RoomSnapshot): Promise<void>;
  /** Незаконченные комнаты, обновлённые за последние maxAgeMs */
  loadRooms(maxAgeMs: number): Promise<RoomSnapshot[]>;
}

export const emptyProfile = (playerId: PlayerId): PlayerProfile => ({ playerId, runs: 0, skills: {} });
export const emptyMemory = (playerId: PlayerId): PlayerMemory => ({
  playerId,
  toldFacts: {},
  usedExplanations: {},
  mistakes: {},
  npc: {},
  recent: [],
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS profiles (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS npc_memory (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  finished BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS run_progress (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  stage TEXT,
  pos JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

class PgStore implements Store {
  async saveRoom(snap: RoomSnapshot) {
    await this.pool.query(
      `INSERT INTO rooms (id, data, finished, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, finished = EXCLUDED.finished, updated_at = now()`,
      [snap.id, JSON.stringify(snap), snap.finished],
    );
  }
  async loadRooms(maxAgeMs: number) {
    const r = await this.pool.query(
      "SELECT data FROM rooms WHERE NOT finished AND updated_at > now() - make_interval(secs => $1)",
      [maxAgeMs / 1000],
    );
    return r.rows.map((row) => row.data as RoomSnapshot).filter((s) => s?.v === 1);
  }

  readonly kind = "postgres";
  constructor(private pool: pg.Pool) {}

  close() {
    return this.pool.end();
  }

  async findPlayer(name: string) {
    const r = await this.pool.query("SELECT id, name, pass_hash FROM players WHERE name = $1", [name]);
    const row = r.rows[0];
    return row ? { id: row.id, name: row.name, passHash: row.pass_hash } : null;
  }
  async createPlayer(p: PlayerRow) {
    await this.pool.query("INSERT INTO players (id, name, pass_hash) VALUES ($1, $2, $3)", [p.id, p.name, p.passHash]);
  }
  async createSession(token: string, playerId: PlayerId) {
    await this.pool.query("INSERT INTO sessions (token, player_id) VALUES ($1, $2)", [token, playerId]);
  }
  async getSession(token: string) {
    const r = await this.pool.query(
      `SELECT p.id, p.name, p.pass_hash FROM sessions s JOIN players p ON p.id = s.player_id
       WHERE s.token = $1 AND s.created_at > now() - make_interval(secs => $2)`,
      [token, SESSION_TTL_MS / 1000],
    );
    const row = r.rows[0];
    return row ? { id: row.id, name: row.name, passHash: row.pass_hash } : null;
  }
  async deleteSession(token: string) {
    await this.pool.query("DELETE FROM sessions WHERE token = $1", [token]);
  }
  private async getJson<T>(table: string, playerId: PlayerId): Promise<T | null> {
    const r = await this.pool.query(`SELECT data FROM ${table} WHERE player_id = $1`, [playerId]);
    return (r.rows[0]?.data as T | undefined) ?? null;
  }
  private async putJson(table: string, playerId: PlayerId, data: unknown) {
    await this.pool.query(
      `INSERT INTO ${table} (player_id, data) VALUES ($1, $2)
       ON CONFLICT (player_id) DO UPDATE SET data = EXCLUDED.data`,
      [playerId, JSON.stringify(data)],
    );
  }
  async getProfile(playerId: PlayerId) {
    return (await this.getJson<PlayerProfile>("profiles", playerId)) ?? emptyProfile(playerId);
  }
  saveProfile(p: PlayerProfile) {
    return this.putJson("profiles", p.playerId, p);
  }
  async getMemory(playerId: PlayerId) {
    return (await this.getJson<PlayerMemory>("npc_memory", playerId)) ?? emptyMemory(playerId);
  }
  saveMemory(m: PlayerMemory) {
    return this.putJson("npc_memory", m.playerId, m);
  }
  async saveProgress(playerId: PlayerId, p: Progress) {
    await this.pool.query(
      `INSERT INTO run_progress (player_id, room_id, stage, pos, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (player_id) DO UPDATE SET room_id = EXCLUDED.room_id, stage = EXCLUDED.stage,
         pos = EXCLUDED.pos, updated_at = now()`,
      [playerId, p.roomId, p.stage, JSON.stringify(p.pos)],
    );
  }
  async getProgress(playerId: PlayerId) {
    const r = await this.pool.query("SELECT room_id, stage, pos FROM run_progress WHERE player_id = $1", [playerId]);
    const row = r.rows[0];
    return row ? { roomId: row.room_id, stage: row.stage, pos: row.pos as Vec3 } : null;
  }
}

export class MemStore implements Store {
  readonly kind = "memory";
  private players = new Map<string, PlayerRow>();
  private sessions = new Map<string, { playerId: PlayerId; at: number }>();
  private profiles = new Map<PlayerId, PlayerProfile>();
  private memory = new Map<PlayerId, PlayerMemory>();
  private progress = new Map<PlayerId, Progress>();
  private rooms = new Map<string, { snap: RoomSnapshot; at: number }>();

  async saveRoom(snap: RoomSnapshot) {
    this.rooms.set(snap.id, { snap: structuredClone(snap), at: Date.now() });
  }
  async loadRooms(maxAgeMs: number) {
    const now = Date.now();
    return [...this.rooms.values()].filter((r) => !r.snap.finished && now - r.at < maxAgeMs).map((r) => structuredClone(r.snap));
  }

  async findPlayer(name: string) {
    return this.players.get(name) ?? null;
  }
  async createPlayer(p: PlayerRow) {
    this.players.set(p.name, p);
  }
  async createSession(token: string, playerId: PlayerId) {
    this.sessions.set(token, { playerId, at: Date.now() });
  }
  async getSession(token: string) {
    const s = this.sessions.get(token);
    if (!s || Date.now() - s.at > SESSION_TTL_MS) return null;
    return [...this.players.values()].find((p) => p.id === s.playerId) ?? null;
  }
  async deleteSession(token: string) {
    this.sessions.delete(token);
  }
  async getProfile(id: PlayerId) {
    return structuredClone(this.profiles.get(id) ?? emptyProfile(id));
  }
  async saveProfile(p: PlayerProfile) {
    this.profiles.set(p.playerId, structuredClone(p));
  }
  async getMemory(id: PlayerId) {
    return structuredClone(this.memory.get(id) ?? emptyMemory(id));
  }
  async saveMemory(m: PlayerMemory) {
    this.memory.set(m.playerId, structuredClone(m));
  }
  async saveProgress(id: PlayerId, p: Progress) {
    this.progress.set(id, p);
  }
  async getProgress(id: PlayerId) {
    return this.progress.get(id) ?? null;
  }
}

export async function openStore(databaseUrl: string, options: { allowMemoryFallback?: boolean } = {}): Promise<Store> {
  const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
  pool.on("error", (e) => console.error("[db] ошибка пула:", e.message));
  try {
    await pool.query(SCHEMA);
    console.log("[db] Postgres подключён");
    return new PgStore(pool);
  } catch (e) {
    await pool.end().catch(() => {});
    if (!options.allowMemoryFallback) {
      throw new Error(
        "PostgreSQL недоступен: аккаунты и прогресс должны сохраняться в БД. " +
        "Запустите npm run db и проверьте DATABASE_URL. " +
        "Для временного демо без сохранения можно явно задать ALLOW_MEMORY_STORE=1.",
        { cause: e },
      );
    }
    console.warn(
      `[db] Postgres недоступен (${(e as Error).message}). Работаю в памяти — данные пропадут при перезапуске.\n` +
        "     Поднять базу: npm run db  (docker compose up -d db)",
    );
    return new MemStore();
  }
}
