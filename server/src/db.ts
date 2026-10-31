/**
 * Хранилище: Postgres, а если он недоступен — память процесса (демо не падает).
 * Схема создаётся при старте (CREATE TABLE IF NOT EXISTS), миграций нет.
 */
import pg from "pg";
import type { PlayerId, PlayerMemory, PlayerProfile, StageId, Vec3 } from "@game/shared";

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
  findPlayer(name: string): Promise<PlayerRow | null>;
  createPlayer(row: PlayerRow): Promise<void>;
  createSession(token: string, playerId: PlayerId): Promise<void>;
  getSession(token: string): Promise<PlayerRow | null>;
  getProfile(playerId: PlayerId): Promise<PlayerProfile>;
  saveProfile(p: PlayerProfile): Promise<void>;
  getMemory(playerId: PlayerId): Promise<PlayerMemory>;
  saveMemory(m: PlayerMemory): Promise<void>;
  saveProgress(playerId: PlayerId, p: Progress): Promise<void>;
  getProgress(playerId: PlayerId): Promise<Progress | null>;
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
CREATE TABLE IF NOT EXISTS run_progress (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  stage TEXT,
  pos JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

class PgStore implements Store {
  readonly kind = "postgres";
  constructor(private pool: pg.Pool) {}

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
      "SELECT p.id, p.name, p.pass_hash FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token = $1",
      [token],
    );
    const row = r.rows[0];
    return row ? { id: row.id, name: row.name, passHash: row.pass_hash } : null;
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
  private sessions = new Map<string, PlayerId>();
  private profiles = new Map<PlayerId, PlayerProfile>();
  private memory = new Map<PlayerId, PlayerMemory>();
  private progress = new Map<PlayerId, Progress>();

  async findPlayer(name: string) {
    return this.players.get(name) ?? null;
  }
  async createPlayer(p: PlayerRow) {
    this.players.set(p.name, p);
  }
  async createSession(token: string, playerId: PlayerId) {
    this.sessions.set(token, playerId);
  }
  async getSession(token: string) {
    const id = this.sessions.get(token);
    return [...this.players.values()].find((p) => p.id === id) ?? null;
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

export async function openStore(databaseUrl: string): Promise<Store> {
  const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
  pool.on("error", (e) => console.error("[db] ошибка пула:", e.message));
  try {
    await pool.query(SCHEMA);
    console.log("[db] Postgres подключён");
    return new PgStore(pool);
  } catch (e) {
    console.warn(
      `[db] Postgres недоступен (${(e as Error).message}). Работаю в памяти — данные пропадут при перезапуске.\n` +
        "     Поднять базу: npm run db  (docker compose up -d db)",
    );
    await pool.end().catch(() => {});
    return new MemStore();
  }
}
