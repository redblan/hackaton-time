/**
 * Вход и регистрация. Пароли — scrypt с солью, сравнение за постоянное время.
 * Сессия — случайный токен (192 бита) в БД, живёт SESSION_TTL_MS. Перебор паролей ограничен.
 */
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Store } from "./db";

const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

export const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
const FAIL_WINDOW_MS = 5 * 60_000;
const MAX_FAILS = 8;

async function hash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, 32);
  return `${salt}:${key.toString("hex")}`;
}

async function verify(password: string, stored: string): Promise<boolean> {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const key = await scryptAsync(password, salt, 32);
  const want = Buffer.from(hex, "hex");
  return want.length === key.length && timingSafeEqual(want, key);
}

export type AuthResult =
  | { ok: true; token: string; playerId: string; name: string }
  | { ok: false; error: string; status: number };

const NAME_RE = /^[\p{L}\p{N} _.-]{2,24}$/u;

function validate(rawName: unknown, rawPassword: unknown): { name: string; password: string } | AuthResult {
  const name = typeof rawName === "string" ? rawName.trim().replace(/\s+/g, " ") : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  if (!NAME_RE.test(name)) return { ok: false, status: 400, error: "Имя — от 2 до 24 символов: буквы, цифры, пробел, _ . -" };
  if (password.length < 4) return { ok: false, status: 400, error: "Пароль — не короче 4 символов" };
  if (password.length > 100) return { ok: false, status: 400, error: "Пароль слишком длинный" };
  return { name, password };
}

/** Ограничение перебора: не больше MAX_FAILS неудачных входов на имя за FAIL_WINDOW_MS */
export class LoginLimiter {
  private fails = new Map<string, number[]>();
  blocked(key: string, now = Date.now()): boolean {
    const list = (this.fails.get(key) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
    this.fails.set(key, list);
    return list.length >= MAX_FAILS;
  }
  fail(key: string, now = Date.now()) {
    this.fails.set(key, [...(this.fails.get(key) ?? []), now]);
  }
  reset(key: string) {
    this.fails.delete(key);
  }
}

async function newSession(store: Store, player: { id: string; name: string }): Promise<AuthResult> {
  const token = randomBytes(24).toString("base64url");
  await store.createSession(token, player.id);
  return { ok: true, token, playerId: player.id, name: player.name };
}

export async function register(store: Store, rawName: unknown, rawPassword: unknown): Promise<AuthResult> {
  const v = validate(rawName, rawPassword);
  if ("ok" in v) return v;
  if (await store.findPlayer(v.name)) return { ok: false, status: 409, error: "Такое имя уже занято — войдите или выберите другое" };
  const player = { id: randomUUID(), name: v.name, passHash: await hash(v.password) };
  await store.createPlayer(player);
  return newSession(store, player);
}

export async function login(store: Store, limiter: LoginLimiter, rawName: unknown, rawPassword: unknown): Promise<AuthResult> {
  const v = validate(rawName, rawPassword);
  if ("ok" in v) return v;
  const key = v.name.toLowerCase();
  if (limiter.blocked(key)) return { ok: false, status: 429, error: "Слишком много попыток. Подождите 5 минут" };
  const player = await store.findPlayer(v.name);
  // Одинаковый ответ на «нет игрока» и «неверный пароль» — не выдаём, какие имена существуют
  if (!player || !(await verify(v.password, player.passHash))) {
    limiter.fail(key);
    return { ok: false, status: 401, error: "Неверное имя или пароль" };
  }
  limiter.reset(key);
  return newSession(store, player);
}
