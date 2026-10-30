import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/shared/db";
import { users, type User } from "@/shared/db/users.schema";

/**
 * ДЕМО-авторизация: в cookie лежит id пользователя, пароля нет.
 * Для хакатона этого достаточно. В питче можно сказать "интеграция с ЕСИА/SSO".
 */
export const SESSION_COOKIE = "demo_user_id";

export async function getCurrentUser(): Promise<User | null> {
  const id = Number((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

/** В серверных компонентах и actions: вернёт пользователя или отправит на /login */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
