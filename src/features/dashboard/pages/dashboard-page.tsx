import { CheckCircle2, ClipboardList, Clock, Wallet } from "lucide-react";
import { requireUser } from "@/shared/auth";
import { PageHeader } from "@/shared/components/page-header";
import { KpiCard } from "@/shared/components/kpi-card";
import { AreaChartView, BarChartView, DonutChartView } from "@/shared/components/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { formatMoney, formatNumber } from "@/shared/lib/utils";
import { getRequestStats } from "@/features/example/queries";
import { CATEGORY_LABEL, STATUS_COLOR, STATUS_META } from "@/features/example/constants";

/**
 * Главная/дашборд. Сейчас строится по данным фичи example.
 * В день хакатона: заменить источники на данные своей темы.
 */
export async function DashboardPage() {
  const [user, stats] = await Promise.all([requireUser(), getRequestStats()]);
  const { totals } = stats;

  const byStatus = stats.byStatus.map((s) => ({
    name: STATUS_META[s.key].label,
    value: s.value,
    color: STATUS_COLOR[s.key],
  }));
  const byCategory = stats.byCategory
    .map((c) => ({ name: CATEGORY_LABEL[c.key], value: c.value }))
    .sort((a, b) => b.value - a.value);
  const byDay = stats.byDay.map((d) => ({ name: d.day.slice(8, 10) + "." + d.day.slice(5, 7), value: d.value }));
  const doneShare = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

  return (
    <>
      <PageHeader title={`Добрый день, ${user.name.split(" ")[0]}`} description="Сводка по заявкам" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Всего заявок" value={formatNumber(totals.total)} icon={ClipboardList} />
        <KpiCard label="Открытые" value={formatNumber(totals.open)} hint="новые и в работе" icon={Clock} />
        <KpiCard label="Выполнено" value={`${doneShare}%`} hint={`${totals.done} заявок`} icon={CheckCircle2} />
        <KpiCard label="Общий бюджет" value={formatMoney(totals.amount)} icon={Wallet} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Новые заявки за 30 дней</CardTitle>
          </CardHeader>
          <CardContent>
            <AreaChartView data={byDay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>По статусам</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChartView data={byStatus} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>По категориям</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartView data={byCategory} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
