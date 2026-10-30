# hackaton-time

Заготовка для хакатона: Next.js + Postgres + готовые модули (заявки с фильтрами, дашборд, карта, ИИ-ассистент, экспорт в Excel, демо-логин).

## Запуск с нуля (5 минут)

Нужно: **Node.js 20.9+**, **Git**, **Postgres** (локальный или через Docker).

```bash
git clone https://github.com/tvarina-only/hackaton-time.git
cd hackaton-time
npm install
cp .env.example .env        # Windows (PowerShell): copy .env.example .env
```

Создать базу (один раз):

```bash
createdb -U postgres hackaton
# или, если Postgres нет, а Docker есть:
docker compose up -d
```

Если у тебя другой пароль/пользователь Postgres — поправь `DATABASE_URL` в `.env`.

Залить демо-данные и запустить:

```bash
npm run demo
npm run dev
```

Открыть http://localhost:3000 → войти любым пользователем. Анна — админ.

## Что внутри

| Раздел            | Где код                  | Что показывает                                                                                   |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| Главная (дашборд) | `src/features/dashboard` | KPI-карточки, графики                                                                            |
| Заявки            | `src/features/example`   | **эталон фичи**: таблица, фильтры, поиск, пагинация, форма, карточка, смена статуса, экспорт CSV |
| Карта             | `src/features/map`       | точки на карте OpenStreetMap                                                                     |
| ИИ-ассистент      | `src/features/assistant` | чат со стримингом, видит данные из БД                                                            |

## Команды

|                                |                                  |
| ------------------------------ | -------------------------------- |
| `npm run dev`                  | запуск                           |
| `npm run check`                | проверки (перед каждым коммитом) |
| `npm run new:feature -- <имя>` | новая фича из образца            |
| `npm run db:push`              | применить изменения схемы БД     |
| `npm run demo`                 | пересоздать БД с демо-данными    |
| `npm run db:studio`            | посмотреть БД в браузере         |

## Как работаем

1. **Своя фича — своя папка.** `src/features/<фича>/` + `src/app/(app)/<фича>/`. В чужие не лезем.
2. **Ветка на задачу:**
   ```bash
   git checkout main && git pull
   git checkout -b feat/<фича>-<что>
   # ... работа ...
   npm run check
   git add -A && git commit -m "что сделал"
   git push -u origin HEAD
   ```
   Дальше на GitHub → Compare & pull request.
3. **CI зелёный → мержишь сам** (Squash and merge). Если PR трогает общие файлы (`src/shared`, конфиги), он ждёт апрува лида.
4. **Main всегда должен запускаться.** После мержа у себя: `git checkout main && git pull`.
5. Конфликт или непонятная ошибка — сразу в чат, не воюем с git в одиночку.

## Как ставить задачу агенту (Claude / Codex)

Агент сам читает `AGENTS.md`. Хорошая задача:

> Сделай фичу `tickets` (уже создана через new:feature): заявки на ремонт техники.
> Поля: название, кабинет, тип техники (принтер/ПК/проектор), статус. На карте не нужно.
> Работай только в src/features/tickets и src/app/(app)/tickets. В конце запусти npm run check.

Плохая: «сделай красиво», «добавь всё что нужно».

## ИИ-ассистент

По умолчанию `DEMO_MODE=1`: ответы без сети (заготовки в `src/features/assistant/demo-answers.ts`). Для настоящей модели заполнить в `.env` `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` и поставить `DEMO_MODE=0`. Подходит любой OpenAI-совместимый API.

**Перед питчем:** вписать в `demo-answers.ts` ответы на вопросы из сценария демо и включить `DEMO_MODE=1`. Тогда показ не зависит от Wi-Fi.

## Если не запускается

- `ECONNREFUSED 5432` — Postgres не запущен, или неверный `DATABASE_URL`.
- `database "hackaton" does not exist` — `createdb -U postgres hackaton`.
- `password authentication failed` — поправь логин/пароль в `DATABASE_URL`.
- Пустой список пользователей на /login — `npm run demo`.
- Пункт меню новой фичи не появился — перезапусти `npm run dev`.
