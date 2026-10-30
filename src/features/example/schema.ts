import { doublePrecision, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "@/shared/db/users.schema";
import { CATEGORIES, PRIORITIES, STATUSES } from "./constants";

/**
 * Таблицы фичи. Имена таблиц уникальны на весь проект.
 * После изменения схемы: npm run db:push
 */
export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: STATUSES }).notNull().default("new"),
  priority: text("priority", { enum: PRIORITIES }).notNull().default("medium"),
  category: text("category", { enum: CATEGORIES }).notNull(),
  amount: integer("amount").notNull().default(0),
  address: text("address").notNull().default(""),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;
