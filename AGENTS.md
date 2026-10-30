<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Правила проекта (хакатон)

Команда из 4 человек, 2 дня, код пишется в основном агентами. Главное: **не ломать main и не лезть в чужие зоны.**

## Стек

Next.js 16 (App Router, Server Components, Server Actions) · TypeScript · Tailwind v4 · компоненты в стиле shadcn/ui (Radix) · Postgres + Drizzle ORM · zod · recharts · Leaflet.

`cacheComponents` в next.config **выключен**. Не используй `"use cache"`, `cacheLife`, `cacheTag`. После изменения данных: `revalidatePath(...)`.

## Команды

| Команда                        | Что делает                                                            |
| ------------------------------ | --------------------------------------------------------------------- |
| `npm run dev`                  | запуск на http://localhost:3000                                       |
| `npm run check`                | typecheck + lint. **Обязательно перед коммитом, должно быть зелёным** |
| `npm run build`                | продакшен-сборка (то же гоняет CI)                                    |
| `npm run db:push`              | применить схему БД (после правки любого `schema.ts`)                  |
| `npm run demo`                 | пересоздать схему и залить демо-данные                                |
| `npm run new:feature -- <имя>` | создать новую фичу из образца                                         |

## Структура и зоны

```
src/
  app/                     РОУТЫ — тонкий слой, только re-export страниц из features
    (app)/<фича>/page.tsx  страницы за авторизацией
    api/                   API-роуты
  features/<фича>/         ФИЧА ЦЕЛИКОМ — зона владельца фичи
    feature.ts             пункт меню (подхватывается автоматически)
    schema.ts              таблицы БД этой фичи
    constants.ts           справочники, подписи (без серверного кода)
    queries.ts             чтение из БД (server-only)
    actions.ts             изменение данных (Server Actions)
    components/            UI фичи
    pages/                 страницы (серверные компоненты)
  shared/                  ОБЩЕЕ — зона лида
    components/ui/         UI-кит (Button, Card, Input, Table, Dialog, Badge...)
    components/            PageHeader, KpiCard, charts, map, pagination
    db/                    клиент БД, таблица users
    auth/                  демо-авторизация: requireUser(), requireAdmin()
    ai/llm.ts              ИИ: streamChat(), completeChat()
    config.ts              название продукта
scripts/                   сид, генераторы
```

## Жёсткие правила

1. **Работай только в своей фиче** (`src/features/<твоя>/` и `src/app/(app)/<твоя>/`). Чужие фичи не трогай.
2. **`src/shared/`, конфиги, `package.json`, `scripts/` — зона лида.** Нужно что-то там поменять — остановись и скажи человеку, он попросит лида. Если очень нужно — отдельный маленький PR.
3. **Новые npm-пакеты не ставить.** Сначала проверь, нет ли уже нужного (см. package.json).
4. **Образец для любой новой фичи — `src/features/example`.** Новую фичу создавай через `npm run new:feature -- <имя>`, а не с нуля. Повторяй его паттерны.
5. **UI только из `@/shared/components/ui`.** Не изобретай свои кнопки/карточки/инпуты. Нужен компонент shadcn, которого нет — `npx shadcn@latest add <name>` (это правка shared, предупреди человека).
6. Имена таблиц в БД уникальны на весь проект (имя таблицы = имя фичи).
7. Не удаляй и не переписывай чужой код ради «рефакторинга». На хакатоне это только конфликты.
8. Перед коммитом — `npm run check`. Красное — чини, не коммить.

## Паттерны

- **Страница**: серверный компонент в `features/<ф>/pages/`, данные через функции из `queries.ts`. Роут в `app/(app)/<ф>/page.tsx` — одна строка re-export.
- **Параметры**: `params` и `searchParams` — это `Promise`, их надо `await`.
- **Изменения**: Server Action в `actions.ts`: `requireUser()` → валидация zod → запрос → `revalidatePath()`.
- **Форма**: клиентский компонент + `useActionState(action, {})`, ошибки валидации возвращаются из action (см. `example/components/create-dialog.tsx`).
- **Фильтры/пагинация**: через URL searchParams (см. `example/components/list-filters.tsx`).
- **Текущий пользователь**: `await requireUser()` (сервер). Роли: `user`, `admin`.
- **Графики**: `BarChartView`, `AreaChartView`, `DonutChartView` из `@/shared/components/charts`, данные `[{ name, value, color? }]`.
- **Карта**: `MapViewLazy` из `@/shared/components/map`.
- **ИИ**: `streamChat()` / `completeChat()` из `@/shared/ai/llm`. Без ключа в .env работает демо-режим.
- **Экспорт в Excel**: `toCsvResponse()` из `@/shared/lib/csv`.
- **Тексты интерфейса — на русском.**

## Git

- Ветка на задачу: `feat/<фича>-<что>`, например `feat/tickets-filters`.
- Коммиты маленькие и частые. Сообщения на русском или английском, по смыслу.
- Мерж только через PR, CI должен быть зелёным.
