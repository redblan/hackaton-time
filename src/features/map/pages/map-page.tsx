import { PageHeader } from "@/shared/components/page-header";
import { MapViewLazy, type MapPoint } from "@/shared/components/map";
import { listRequestPoints } from "@/features/example/queries";
import { STATUS_COLOR, STATUS_META } from "@/features/example/constants";

export async function MapPage() {
  const rows = await listRequestPoints();
  const points: MapPoint[] = rows.map((r) => ({
    id: r.id,
    lat: r.lat!,
    lng: r.lng!,
    title: r.title,
    subtitle: `${STATUS_META[r.status].label} · ${r.address}`,
    href: `/example/${r.id}`,
    color: STATUS_COLOR[r.status],
  }));

  return (
    <>
      <PageHeader title="Карта" description={`Заявок на карте: ${points.length}`} />
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {Object.entries(STATUS_COLOR).map(([k, color]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: color }} />
            {STATUS_META[k as keyof typeof STATUS_META].label}
          </span>
        ))}
      </div>
      <MapViewLazy points={points} />
    </>
  );
}
