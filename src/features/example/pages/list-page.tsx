import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/shared/components/page-header";
import { Pagination } from "@/shared/components/pagination";
import { Button } from "@/shared/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { formatDate, formatMoney } from "@/shared/lib/utils";
import { listRequests } from "../queries";
import { CATEGORY_LABEL, PRIORITY_LABEL } from "../constants";
import { StatusBadge } from "../components/status-badge";
import { ListFilters } from "../components/list-filters";
import { CreateRequestDialog } from "../components/create-dialog";

type SP = Record<string, string | undefined>;

/** Страница списка: серверный компонент, фильтры и страница берутся из URL. */
export async function RequestsListPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { rows, total, page, pageCount } = await listRequests({
    q: sp.q,
    status: sp.status,
    category: sp.category,
    page: Number(sp.page) || 1,
  });
  const exportQuery = new URLSearchParams(
    Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][],
  );

  return (
    <>
      <PageHeader
        title="Заявки"
        description="Все обращения с фильтрами и поиском"
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/example/export?${exportQuery}`}>
                <Download /> Excel (CSV)
              </a>
            </Button>
            <CreateRequestDialog />
          </>
        }
      />
      <ListFilters />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>№</TableHead>
            <TableHead>Название</TableHead>
            <TableHead>Категория</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Приоритет</TableHead>
            <TableHead className="text-right">Бюджет</TableHead>
            <TableHead>Автор</TableHead>
            <TableHead>Создана</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                Ничего не найдено
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-muted-foreground">{r.id}</TableCell>
              <TableCell className="max-w-80 truncate font-medium">
                <Link href={`/example/${r.id}`} className="hover:underline">
                  {r.title}
                </Link>
              </TableCell>
              <TableCell>{CATEGORY_LABEL[r.category]}</TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
              </TableCell>
              <TableCell>{PRIORITY_LABEL[r.priority]}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(r.amount)}</TableCell>
              <TableCell>{r.authorName ?? "—"}</TableCell>
              <TableCell>{formatDate(r.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination page={page} pageCount={pageCount} total={total} searchParams={sp} />
    </>
  );
}
