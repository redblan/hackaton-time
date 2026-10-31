/**
 * JWT (HS256) без зависимостей — на node:crypto. Формат стандартный: header.payload.signature в base64url,
 * проверяется любой библиотекой. Секрет — JWT_SECRET из окружения, иначе файл server/.certs/jwt.secret,
 * который создаётся при первом запуске (чтобы токены переживали перезапуск сервера).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface JwtClaims {
  /** id игрока */
  sub: string;
  name: string;
  /** id сессии в БД — по нему токен можно отозвать (выход) */
  jti: string;
  iat: number;
  exp: number;
}

const b64 = (data: Buffer | string) => Buffer.from(data).toString("base64url");
const HEADER = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));

export function signJwt(claims: Omit<JwtClaims, "iat" | "exp">, secret: string, ttlMs: number, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const payload = b64(JSON.stringify({ ...claims, iat, exp: iat + Math.floor(ttlMs / 1000) }));
  const signature = createHmac("sha256", secret).update(`${HEADER}.${payload}`).digest("base64url");
  return `${HEADER}.${payload}.${signature}`;
}

/** null — подпись не сошлась, токен просрочен или это не JWT. */
export function verifyJwt(token: string, secret: string, now = Date.now()): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  const want = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  const got = Buffer.from(signature, "base64url");
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const head = JSON.parse(Buffer.from(header, "base64url").toString()) as { alg?: unknown };
    if (head.alg !== "HS256") return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<JwtClaims>;
    if (typeof claims.sub !== "string" || typeof claims.jti !== "string" || typeof claims.exp !== "number") return null;
    if (claims.exp * 1000 <= now) return null;
    return claims as JwtClaims;
  } catch {
    return null;
  }
}

/** Секрет подписи: окружение → файл (создаётся) → случайный на время процесса. */
export function loadJwtSecret(dir: string, env = process.env.JWT_SECRET): string {
  if (env && env.length >= 16) return env;
  const file = join(dir, "jwt.secret");
  try {
    if (existsSync(file)) return readFileSync(file, "utf8").trim();
    mkdirSync(dir, { recursive: true });
    const secret = randomBytes(32).toString("base64url");
    writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  } catch {
    console.warn("[auth] не удалось сохранить jwt.secret — после перезапуска сервера придётся войти заново");
    return randomBytes(32).toString("base64url");
  }
}
