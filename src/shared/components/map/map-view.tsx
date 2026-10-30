"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

export type MapPoint = {
  id: number | string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  href?: string;
  color?: string;
};

/**
 * Карта (Leaflet + OpenStreetMap). Не импортируйте напрямую в серверный код —
 * используйте <MapViewLazy>, он грузит карту только в браузере.
 * Нужен интернет для тайлов.
 */
export default function MapView({
  points,
  center,
  zoom = 11,
  height = 600,
}: {
  points: MapPoint[];
  center?: [number, number];
  zoom?: number;
  height?: number;
}) {
  const c: [number, number] = center ?? (points.length ? [points[0].lat, points[0].lng] : [55.751, 37.618]);
  const bounds = points.length > 1 ? L.latLngBounds(points.map((p) => [p.lat, p.lng])) : undefined;

  return (
    <MapContainer
      center={c}
      zoom={zoom}
      bounds={bounds}
      boundsOptions={{ padding: [30, 30] }}
      style={{ height, width: "100%", borderRadius: 12, zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={8}
          pathOptions={{ color: "white", weight: 2, fillColor: p.color ?? "#4f46e5", fillOpacity: 0.9 }}
        >
          <Popup>
            <div className="space-y-1">
              <div className="font-medium">{p.title}</div>
              {p.subtitle && <div className="text-xs opacity-70">{p.subtitle}</div>}
              {p.href && (
                <a href={p.href} className="text-xs">
                  Открыть →
                </a>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
