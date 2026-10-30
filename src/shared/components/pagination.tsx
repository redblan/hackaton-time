import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

/** Пагинация через URL (?page=N), сохраняет остальные параметры фильтра. */
export function Pagination({
  page,
  pageCount,
  total,
  searchParams,
}: {
  page: number;
  pageCount: number;
  total: number;
  searchParams: Record<string, string | undefined>;
}) {
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v && k !== "page") sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `?${s}` : "?";
  };

  return (
    <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
      <span>Всего: {total}</span>
      <div className="flex items-center gap-2">
        <span>
          Стр. {page} из {pageCount}
        </span>
        <Button variant="outline" size="icon" asChild disabled={page <= 1}>
          <Link
            href={href(page - 1)}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-50" : ""}
          >
            <ChevronLeft />
          </Link>
        </Button>
        <Button variant="outline" size="icon" asChild>
          <Link
            href={href(page + 1)}
            aria-disabled={page >= pageCount}
            className={page >= pageCount ? "pointer-events-none opacity-50" : ""}
          >
            <ChevronRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
