import "server-only";
import { toCsvResponse } from "@/shared/lib/csv";
import { formatDate } from "@/shared/lib/utils";
import { listAllRequests } from "./queries";
import { CATEGORY_LABEL, PRIORITY_LABEL, STATUS_META } from "./constants";

/** Выгрузка списка (с текущими фильтрами) в CSV, который открывается в Excel. */
export async function exportRequestsCsv(sp: URLSearchParams) {
  const rows = await listAllRequests({
    q: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    category: sp.get("category") ?? undefined,
  });
  return toCsvResponse(
    "zayavki.csv",
    ["№", "Название", "Категория", "Статус", "Приоритет", "Бюджет", "Адрес", "Автор", "Создана"],
    rows.map((r) => [
      r.id,
      r.title,
      CATEGORY_LABEL[r.category],
      STATUS_META[r.status].label,
      PRIORITY_LABEL[r.priority],
      r.amount,
      r.address,
      r.authorName ?? "",
      formatDate(r.createdAt),
    ]),
  );
}
