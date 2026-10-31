# Для лида: настройка репозитория (один раз, ~10 минут)

## 1. Первый пуш

```bash
cd hackaton-time
git add -A
git commit -m "Hackathon template"
git branch -M main
git remote add origin git@github.com:redblan/hackaton-time.git   # или https://...
git push -u origin main
```

## 2. Доступы

Settings → Collaborators → Add people → ники Никиты, Юры, Матвея (роль Write).
Им придёт приглашение на почту — пусть примут сразу.

## 3. Настройки мержа

Settings → General → Pull Requests:

- ✅ Allow squash merging, остальные способы выключить
- ✅ Automatically delete head branches

## 4. Защита main (ruleset)

Settings → Rules → Rulesets → New branch ruleset:

- Name: `main`, Enforcement: **Active**
- Target branches: Add target → **Include default branch**
- Bypass list: добавь себя (Repository admin), чтобы самому не ждать апрува
- ✅ Restrict deletions
- ✅ Block force pushes
- ✅ Require a pull request before merging
  - Required approvals: **0**
  - ✅ Require review from Code Owners
- ✅ Require status checks to pass → Add checks → `check`
  (появится в списке после первого запуска CI — сделай тестовый PR и вернись сюда)

Итог: свою фичу человек мержит сам при зелёном CI, а PR, задевающий `src/shared`, конфиги или `package.json`, ждёт тебя (см. `.github/CODEOWNERS`).

> Ruleset на приватной репе работает только с GitHub Pro/Team. На бесплатном плане репа должна быть публичной.

## 5. Проверка до сна

- [ ] Каждый склонировал, `npm run demo && npm run dev` работает, скрин в чат
- [ ] Каждый сделал тестовый PR (например, поменял текст в `example/constants.ts`) и смержил
- [ ] PR в `src/shared` от не-лида требует твоего апрува

## План на утро (первые 2 часа)

1. Тема → поменять `src/shared/config.ts` (название), `--primary` в `globals.css` (цвет)
2. Решить, какие фичи нужны. Каждому: `npm run new:feature -- <имя>`
3. Переписать `scripts/seed.ts` под тему (агенту: «перепиши сид под фичи X, Y, правдоподобные данные»)
4. Дашборд (`src/features/dashboard`) и ассистент (`src/features/assistant/server.ts`) переключить на данные темы
5. Ненужное (карта, example) — убрать из меню: удалить `feature.ts` у фичи
