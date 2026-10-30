"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/shared/db";
import { requireAdmin, requireUser } from "@/shared/auth";
import { requests } from "./schema";
import { CATEGORIES, PRIORITIES, STATUSES } from "./constants";

/**
 * Изменение данных (Server Actions).
 * Паттерн: проверка доступа -> валидация zod -> запись -> revalidatePath.
 */

const createSchema = z.object({
  title: z.string().trim().min(3, "Минимум 3 символа").max(200),
  description: z.string().trim().max(5000).default(""),
  category: z.enum(CATEGORIES, { message: "Выберите категорию" }),
  priority: z.enum(PRIORITIES),
  amount: z.coerce.number().int().min(0, "Не меньше 0"),
  address: z.string().trim().max(300).default(""),
});

export type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof createSchema>, string[]>>;
};

export async function createRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Проверьте поля формы", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  await db.insert(requests).values({ ...parsed.data, authorId: user.id });
  revalidatePath("/example");
  return { ok: true };
}

export async function updateRequestStatus(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  const status = z.enum(STATUSES).parse(formData.get("status"));
  await db.update(requests).set({ status, updatedAt: new Date() }).where(eq(requests.id, id));
  revalidatePath("/example");
  revalidatePath(`/example/${id}`);
}

export async function deleteRequest(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await db.delete(requests).where(eq(requests.id, id));
  revalidatePath("/example");
  redirect("/example");
}
