/**
 * Создаёт новую фичу копированием образца src/features/example.
 *   npm run new:feature -- tickets
 * Что делает:
 *  - копирует папку фичи, меняет пути /example -> /<имя> и импорты
 *  - переименовывает таблицу БД в <имя> (чтобы не конфликтовать с образцом)
 *  - создаёт тонкие роуты в src/app/(app)/<имя>/
 * После этого: npm run db:push, затем агент переделывает поля под задачу.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error("Использование: npm run new:feature -- <имя в kebab-case>, например: npm run new:feature -- tickets");
  process.exit(1);
}
const table = name.replace(/-/g, "_");
const root = process.cwd();
const src = join(root, "src/features/example");
const dst = join(root, "src/features", name);
const routes = join(root, "src/app/(app)", name);

if (existsSync(dst) || existsSync(routes)) {
  console.error(`Фича "${name}" уже существует`);
  process.exit(1);
}

cpSync(src, dst, { recursive: true });

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

for (const file of walk(dst)) {
  const s = readFileSync(file, "utf8")
    .replaceAll("@/features/example", `@/features/${name}`)
    .replaceAll('"/example', `"/${name}`)
    .replaceAll("`/example", `\`/${name}`)
    .replaceAll('pgTable("requests"', `pgTable("${table}"`)
    .replaceAll('revalidatePath("/example")', `revalidatePath("/${name}")`)
    .replace('title: "Заявки"', `title: "${name}"`)
    .replace("order: 10", "order: 50");
  writeFileSync(file, s);
}

mkdirSync(join(routes, "[id]"), { recursive: true });
mkdirSync(join(routes, "export"), { recursive: true });
writeFileSync(
  join(routes, "page.tsx"),
  `// Роут — тонкий слой. Вся логика в src/features/${name}\nexport { RequestsListPage as default } from "@/features/${name}/pages/list-page";\n`,
);
writeFileSync(
  join(routes, "[id]/page.tsx"),
  `export { RequestDetailPage as default } from "@/features/${name}/pages/detail-page";\n`,
);
writeFileSync(
  join(routes, "export/route.ts"),
  `import { requireUser } from "@/shared/auth";
import { exportRequestsCsv } from "@/features/${name}/export";

export async function GET(req: Request) {
  await requireUser();
  return exportRequestsCsv(new URL(req.url).searchParams);
}
`,
);

console.log(`✓ Фича "${name}" создана:
  src/features/${name}/        ← код фичи (таблица БД: ${table})
  src/app/(app)/${name}/       ← роуты

Дальше:
  1. npm run db:push            создать таблицу
  2. Попросите агента: "Переделай фичу ${name} под <задачу>: поля, справочники, тексты.
     Правила в src/features/AGENTS.md"
  3. Перезапустите npm run dev — пункт меню появится сам`);
