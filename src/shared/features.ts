import type { LucideIcon } from "lucide-react";

/**
 * Манифест фичи: src/features/<имя>/feature.ts
 * Пункт меню появится автоматически (скрипт scripts/gen-registry.ts).
 * Файл должен быть "лёгким": без импортов БД и серверного кода.
 */
export type FeatureManifest = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Порядок в меню, меньше = выше */
  order?: number;
  /** Показывать только админам */
  adminOnly?: boolean;
};

export function defineFeature(m: FeatureManifest): FeatureManifest {
  return m;
}
