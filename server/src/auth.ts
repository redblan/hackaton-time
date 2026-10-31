import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Store } from "./db";

const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

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

export type LoginResult = { ok: true; token: string; playerId: string; name: string } | { ok: false; error: string };

/** Вход или регистрация: новое имя — создаём игрока, знакомое — проверяем пароль. */
export async function login(store: Store, rawName: unknown, rawPassword: unknown): Promise<LoginResult> {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  if (name.length < 2 || name.length > 24) return { ok: false, error: "Имя — от 2 до 24 символов" };
  if (password.length < 1 || password.length > 100) return { ok: false, error: "Введите пароль" };

  let player = await store.findPlayer(name);
  if (player) {
    if (!(await verify(password, player.passHash))) return { ok: false, error: "Неверный пароль" };
  } else {
    player = { id: randomUUID(), name, passHash: await hash(password) };
    await store.createPlayer(player);
  }
  const token = randomBytes(24).toString("base64url");
  await store.createSession(token, player.id);
  return { ok: true, token, playerId: player.id, name: player.name };
}
