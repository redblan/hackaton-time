import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { getCurrentUser } from "@/shared/auth";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { NativeSelect } from "@/shared/components/ui/input";
import { formatDate, formatMoney } from "@/shared/lib/utils";
import { getRequest } from "../queries";
import { deleteRequest, updateRequestStatus } from "../actions";
import { CATEGORY_LABEL, PRIORITY_LABEL, STATUSES, STATUS_META } from "../constants";
import { StatusBadge } from "../components/status-badge";

/** Карточка записи. */
export async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row, user] = await Promise.all([getRequest(Number(id)), getCurrentUser()]);
  if (!row) notFound();
  const r = row.request;

  const fields: [string, React.ReactNode][] = [
    ["Статус", <StatusBadge key="s" status={r.status} />],
    ["Категория", CATEGORY_LABEL[r.category]],
    ["Приоритет", PRIORITY_LABEL[r.priority]],
    ["Бюджет", formatMoney(r.amount)],
    ["Адрес", r.address || "—"],
    ["Автор", row.authorName ?? "—"],
    ["Создана", formatDate(r.createdAt)],
    ["Обновлена", formatDate(r.updatedAt)],
  ];

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href="/example">
          <ArrowLeft /> К списку
        </Link>
      </Button>
      <PageHeader title={r.title} description={`Заявка №${r.id}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Описание</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm leading-relaxed">
            {r.description || <span className="text-muted-foreground">Нет описания</span>}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                {fields.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Действия</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <form action={updateRequestStatus} className="flex gap-2">
                <input type="hidden" name="id" value={r.id} />
                <NativeSelect name="status" defaultValue={r.status}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </NativeSelect>
                <Button type="submit">Сохранить</Button>
              </form>
              {user?.role === "admin" && (
                <form action={deleteRequest}>
                  <input type="hidden" name="id" value={r.id} />
                  <Button type="submit" variant="destructive" className="w-full">
                    <Trash2 /> Удалить
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
