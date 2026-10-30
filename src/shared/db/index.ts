import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Клиент БД. Схема НЕ регистрируется централизованно: каждая фича держит
 * свои таблицы в src/features/<имя>/schema.ts и импортирует их напрямую.
 * Используйте query builder: db.select().from(table)...
 */
// Без DATABASE_URL не падаем при импорте (иначе ломается сборка в CI, где базы нет).
// postgres.js подключается лениво, ошибка будет только при первом запросе.
const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/__DATABASE_URL_not_set__";
if (!process.env.DATABASE_URL && process.env.NEXT_PHASE !== "phase-production-build") {
  console.warn("⚠ DATABASE_URL не задан. Скопируйте .env.example в .env");
}

// Переиспользуем соединение между hot reload в dev
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client = globalForDb.pg ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client);
