/**
 * Собирает src/features/<имя>/feature.ts в один реестр для меню.
 * Запускается автоматически перед dev / build / check.
 * Результат в .gitignore — его никто не правит руками и он не конфликтует.
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "src/features");
const names = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name)
  .filter((n) => existsSync(join(dir, n, "feature.ts")))
  .sort();

const ident = (n: string) => "f_" + n.replace(/[^a-zA-Z0-9]/g, "_");

const out = `// АВТОГЕНЕРАЦИЯ (scripts/gen-registry.ts). Не редактировать.
import type { FeatureManifest } from "@/shared/features";
${names.map((n) => `import ${ident(n)} from "@/features/${n}/feature";`).join("\n")}

export const features: FeatureManifest[] = [${names.map(ident).join(", ")}].sort(
  (a, b) => (a.order ?? 100) - (b.order ?? 100),
);
`;

writeFileSync(join(dir, "_registry.generated.ts"), out);
console.log(`[gen-registry] фич: ${names.length} (${names.join(", ")})`);
