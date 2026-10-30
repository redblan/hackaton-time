/**
 * Справочники фичи. Без серверного кода: можно импортировать и в клиентских компонентах.
 * Под тему хакатона меняются здесь, всё остальное подтянется.
 */
export const STATUSES = ["new", "in_progress", "done", "rejected"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;
export const CATEGORIES = ["infrastructure", "education", "ecology", "transport", "social"] as const;

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Category = (typeof CATEGORIES)[number];

export const STATUS_META: Record<Status, { label: string; variant: "info" | "warning" | "success" | "danger" }> = {
  new: { label: "Новая", variant: "info" },
  in_progress: { label: "В работе", variant: "warning" },
  done: { label: "Выполнена", variant: "success" },
  rejected: { label: "Отклонена", variant: "danger" },
};

/** Цвета статусов для графиков и карты */
export const STATUS_COLOR: Record<Status, string> = {
  new: "#0ea5e9",
  in_progress: "#f59e0b",
  done: "#10b981",
  rejected: "#ef4444",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  infrastructure: "Инфраструктура",
  education: "Образование",
  ecology: "Экология",
  transport: "Транспорт",
  social: "Социальная сфера",
};

export const PAGE_SIZE = 15;
