import "server-only";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/shared/db";
import { users } from "@/shared/db/users.schema";
import { requests } from "./schema";
import { CATEGORIES, PAGE_SIZE, STATUSES, type Category, type Status } from "./constants";

/** Чтение данных. Только сервер. Изменения — в actions.ts */

export type ListFilters = {
  q?: string;
  status?: string;
  category?: string;
  page?: number;
};

function buildWhere(f: ListFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(or(ilike(requests.title, like), ilike(requests.address, like))!);
  }
  if (f.status && STATUSES.includes(f.status as Status)) conds.push(eq(requests.status, f.status as Status));
  if (f.category && CATEGORIES.includes(f.category as Category))
    conds.push(eq(requests.category, f.category as Category));
  return conds.length ? and(...conds) : undefined;
}

export async function listRequests(f: ListFilters) {
  const where = buildWhere(f);
  const page = Math.max(1, f.page ?? 1);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: requests.id,
        title: requests.title,
        status: requests.status,
        priority: requests.priority,
        category: requests.category,
        amount: requests.amount,
        address: requests.address,
        createdAt: requests.createdAt,
        authorName: users.name,
      })
      .from(requests)
      .leftJoin(users, eq(requests.authorId, users.id))
      .where(where)
      .orderBy(desc(requests.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(requests).where(where),
  ]);

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Для экспорта: все строки по фильтру, без пагинации */
export async function listAllRequests(f: ListFilters) {
  return db
    .select({
      id: requests.id,
      title: requests.title,
      status: requests.status,
      priority: requests.priority,
      category: requests.category,
      amount: requests.amount,
      address: requests.address,
      createdAt: requests.createdAt,
      authorName: users.name,
    })
    .from(requests)
    .leftJoin(users, eq(requests.authorId, users.id))
    .where(buildWhere(f))
    .orderBy(desc(requests.createdAt));
}

export async function getRequest(id: number) {
  const [row] = await db
    .select({ request: requests, authorName: users.name })
    .from(requests)
    .leftJoin(users, eq(requests.authorId, users.id))
    .where(eq(requests.id, id))
    .limit(1);
  return row ?? null;
}

/** Точки для карты */
export async function listRequestPoints() {
  return db
    .select({
      id: requests.id,
      title: requests.title,
      status: requests.status,
      address: requests.address,
      lat: requests.lat,
      lng: requests.lng,
    })
    .from(requests)
    .where(sql`${requests.lat} is not null and ${requests.lng} is not null`);
}

/** Агрегаты для дашборда и ИИ-ассистента */
export async function getRequestStats() {
  const [byStatus, byCategory, byDay, [totals]] = await Promise.all([
    db.select({ key: requests.status, value: count() }).from(requests).groupBy(requests.status),
    db.select({ key: requests.category, value: count() }).from(requests).groupBy(requests.category),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${requests.createdAt}), 'YYYY-MM-DD')`,
        value: count(),
      })
      .from(requests)
      .where(sql`${requests.createdAt} > now() - interval '30 days'`)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        total: count(),
        amount: sql<number>`coalesce(sum(${requests.amount}), 0)::int`,
        done: sql<number>`count(*) filter (where ${requests.status} = 'done')::int`,
        open: sql<number>`count(*) filter (where ${requests.status} in ('new','in_progress'))::int`,
      })
      .from(requests),
  ]);
  return { byStatus, byCategory, byDay, totals };
}
