/**
 * Демо-данные. Запуск: npm run db:seed (или npm run demo — пересоздать схему + сид).
 * Полностью очищает таблицы и заполняет заново. Детерминированный: одинаковые данные у всех.
 *
 * В день хакатона: агент переписывает блок "ДАННЫЕ ФИЧ" под тему.
 * Каждая фича может добавить свою функцию seedXxx() и вызвать её в main().
 */
import "dotenv/config";
import { fakerRU as faker } from "@faker-js/faker";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { users } from "../src/shared/db/users.schema";
import { requests, type NewRequest } from "../src/features/example/schema";
import { CATEGORIES, PRIORITIES, STATUSES } from "../src/features/example/constants";

faker.seed(42);
const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const db = drizzle(client);

async function seedUsers() {
  return db
    .insert(users)
    .values([
      { name: "Анна Смирнова", email: "admin@demo.ru", role: "admin" },
      { name: "Иван Петров", email: "ivan@demo.ru", role: "user" },
      { name: "Мария Кузнецова", email: "maria@demo.ru", role: "user" },
      { name: "Дмитрий Соколов", email: "dmitry@demo.ru", role: "user" },
    ])
    .returning();
}

// ---------- ДАННЫЕ ФИЧ ----------

const TITLES: Record<(typeof CATEGORIES)[number], string[]> = {
  infrastructure: [
    "Ремонт освещения во дворе",
    "Яма на проезжей части",
    "Протечка крыши в подъезде",
    "Замена лифта",
    "Ремонт детской площадки",
  ],
  education: [
    "Открыть кружок робототехники",
    "Ремонт спортзала в школе",
    "Не хватает мест в детском саду",
    "Обновить библиотечный фонд",
  ],
  ecology: [
    "Несанкционированная свалка",
    "Высадка деревьев в сквере",
    "Установить контейнеры для раздельного сбора",
    "Запах от очистных сооружений",
  ],
  transport: [
    "Добавить остановку автобуса",
    "Светофор на перекрёстке",
    "Увеличить частоту маршрута",
    "Велодорожка вдоль набережной",
  ],
  social: ["Пандус у поликлиники", "Скамейки в парке", "Центр досуга для пенсионеров", "Бесплатный Wi-Fi в библиотеке"],
};

function weighted<T>(items: readonly T[], weights: number[]): T {
  const r = faker.number.float({ min: 0, max: weights.reduce((a, b) => a + b, 0) });
  let acc = 0;
  for (let i = 0; i < items.length; i++) if ((acc += weights[i]) >= r) return items[i];
  return items[items.length - 1];
}

async function seedRequests(authorIds: number[]) {
  const rows: NewRequest[] = Array.from({ length: 140 }, () => {
    const category = faker.helpers.arrayElement(CATEGORIES);
    const createdAt = faker.date.recent({ days: 45 });
    return {
      title: faker.helpers.arrayElement(TITLES[category]),
      description: faker.lorem.paragraphs({ min: 1, max: 3 }),
      category,
      status: weighted(STATUSES, [3, 4, 5, 1]),
      priority: weighted(PRIORITIES, [2, 5, 3]),
      amount: faker.number.int({ min: 5, max: 500 }) * 10_000,
      // Москва и окрестности
      lat: faker.number.float({ min: 55.6, max: 55.9, fractionDigits: 5 }),
      lng: faker.number.float({ min: 37.4, max: 37.85, fractionDigits: 5 }),
      address: `${faker.location.street()}, ${faker.location.buildingNumber()}`,
      authorId: faker.helpers.arrayElement(authorIds),
      createdAt,
      updatedAt: createdAt,
    };
  });
  await db.insert(requests).values(rows);
  return rows.length;
}

// --------------------------------

async function main() {
  // Очищаем все таблицы приложения (кроме служебных drizzle)
  await db.execute(sql`
    do $$ declare r record; begin
      for r in select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%' loop
        execute 'truncate table ' || quote_ident(r.tablename) || ' restart identity cascade';
      end loop;
    end $$;
  `);

  const u = await seedUsers();
  const n = await seedRequests(u.map((x) => x.id));
  console.log(`[seed] пользователей: ${u.length}, заявок: ${n}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.end());
