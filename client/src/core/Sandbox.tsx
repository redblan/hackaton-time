/**
 * /sandbox — без входа: запуск мини-игр по одной и просмотр чанков мира.
 * Для Юры (мини-игры) и Никиты (чанки).
 */
import { useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { MINIGAMES, type ChunkData, type MinigameId, type MinigameResult } from "@game/shared";
import { minigames } from "../minigames";
import { Atmosphere } from "../world/Atmosphere";
import { ChunkView, getColliders } from "../world/ChunkView";
import { Building } from "../world/decor/Building";
import { Landscape } from "../world/Landscape";
import { MINIGAME_NAMES, MinigameHost } from "./MinigameHost";
import { Button } from "./ui";

function MinigamesTab() {
  const [game, setGame] = useState<MinigameId | null>(null);
  const [run, setRun] = useState(0);
  const [params, setParams] = useState("{}");
  const [result, setResult] = useState<MinigameResult | null>(null);
  const parsed = useMemo(() => {
    try {
      return JSON.parse(params) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [params]);

  return (
    <div className="sandbox-body">
      <div className="sandbox-side">
        {MINIGAMES.map((g) => (
          <Button
            key={g}
            variant={g === game ? "primary" : "ghost"}
            onClick={() => {
              setGame(g);
              setResult(null);
              setRun((n) => n + 1);
            }}
          >
            {MINIGAME_NAMES[g]} {minigames[g] ? "" : "(заглушка)"}
          </Button>
        ))}
        <label className="small">
          params (JSON)
          <textarea value={params} onChange={(e) => setParams(e.target.value)} rows={4} />
        </label>
        {!parsed && <div className="error">Невалидный JSON</div>}
        <h3>Результат</h3>
        <pre className="json">{result ? JSON.stringify(result, null, 2) : "—"}</pre>
      </div>
      <div className="sandbox-stage">
        {game && !result && (
          <MinigameHost key={run} game={game} params={parsed ?? undefined} onDone={setResult} />
        )}
        {result && (
          <Button onClick={() => { setResult(null); setRun((n) => n + 1); }}>Ещё раз</Button>
        )}
      </div>
    </div>
  );
}

/** Ракурсы для проверки картинки: снаружи, из квартиры, из коридора, с лестницы (локально к чанку). */
const VIEWS: Record<string, { eye: [number, number, number]; look: [number, number, number] }> = {
  "снаружи": { eye: [14, 12, 14], look: [6, 1.5, 6] },
  "квартира": { eye: [1.2, 1.5, 5.6], look: [3.5, 1.0, 11] },
  "кухня": { eye: [6.4, 1.5, 9.6], look: [11, 0.9, 11.4] },
  "коридор": { eye: [8.6, 1.6, 3.3], look: [1, 1.2, 4.5] },
  "лестница": { eye: [11.2, 1.7, 2.7], look: [5, 0.0, 0.8] },
  "лифт": { eye: [9.6, 1.5, 1.4], look: [10, 1.1, 4.5] },
  "двор": { eye: [10, 3, -16], look: [6, 4, 0] },
  "дом целиком": { eye: [-18, 16, -34], look: [10, 9, 4] },
};

function CameraRig({ view, origin }: { view: string; origin: [number, number, number] }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  useEffect(() => {
    const v = VIEWS[view];
    if (!v) return;
    camera.position.set(origin[0] + v.eye[0], origin[1] + v.eye[1], origin[2] + v.eye[2]);
    controls?.target.set(origin[0] + v.look[0], origin[1] + v.look[1], origin[2] + v.look[2]);
    controls?.update();
  }, [view, origin, camera, controls]);
  return null;
}

function ChunksTab() {
  const [ids, setIds] = useState<string[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [chunk, setChunk] = useState<ChunkData | null>(null);
  const [flags, setFlags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState("снаружи");
  const [building, setBuilding] = useState(true);
  const loaded = useMemo(() => new Set(chunk ? [chunk.id] : []), [chunk]);
  const origin = useMemo(() => (chunk ? ([...chunk.bounds.min] as [number, number, number]) : ([0, 0, 0] as [number, number, number])), [chunk]);

  useEffect(() => {
    fetch("/api/chunks")
      .then((r) => r.json() as Promise<{ ids: string[] }>)
      .then((d) => {
        setIds(d.ids);
        setId((cur) => cur ?? d.ids[0] ?? null);
      })
      .catch(() => setError("Сервер недоступен"));
  }, []);
  useEffect(() => {
    if (!id) return;
    fetch(`/api/chunks/${id}`)
      .then((r) => r.json() as Promise<ChunkData>)
      .then(setChunk)
      .catch(() => setError("Чанк не загрузился"));
  }, [id]);

  const allFlags = useMemo(() => [...new Set(chunk?.objects.flatMap((o) => (o.when ? [o.when] : [])) ?? [])], [chunk]);
  const center = chunk
    ? ([0, 1, 2].map((i) => (chunk.bounds.min[i]! + chunk.bounds.max[i]!) / 2) as [number, number, number])
    : ([0, 0, 0] as [number, number, number]);
  const counts = chunk?.objects.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.kind]: (acc[o.kind] ?? 0) + 1 }), {});

  return (
    <div className="sandbox-body">
      <div className="sandbox-side">
        {error && <div className="error">{error}</div>}
        <label className="small">
          Чанк ({ids.length} шт.)
          <select value={id ?? ""} onChange={(e) => setId(e.target.value)}>
            {ids.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="small">
          Ракурс
          <select value={view} onChange={(e) => setView(e.target.value)}>
            {Object.keys(VIEWS).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="small check">
          <input type="checkbox" checked={building} onChange={(e) => setBuilding(e.target.checked)} />
          силуэт дома (Building)
        </label>
        {allFlags.length > 0 && <h3>Флаги</h3>}
        {allFlags.map((f) => (
          <label key={f} className="small check">
            <input
              type="checkbox"
              checked={flags.includes(f)}
              onChange={(e) => setFlags((cur) => (e.target.checked ? [...cur, f] : cur.filter((x) => x !== f)))}
            />
            {f}
          </label>
        ))}
        {chunk && (
          <pre className="json">
            {JSON.stringify({ neighbors: chunk.neighbors, objects: counts, colliders: getColliders(chunk, flags).length }, null, 2)}
          </pre>
        )}
      </div>
      <div className="sandbox-stage sandbox-3d">
        <Canvas shadows camera={{ position: [center[0] + 14, center[1] + 12, center[2] + 14], fov: 50, far: 600 }}>
          <Atmosphere />
          <Landscape />
          {building && <Building loaded={loaded} />}
          {chunk && <ChunkView chunk={chunk} flags={flags} />}
          <OrbitControls target={center} makeDefault />
          <CameraRig view={view} origin={origin} />
        </Canvas>
      </div>
    </div>
  );
}

export function Sandbox() {
  const [tab, setTab] = useState<"minigames" | "chunks">("minigames");
  return (
    <div className="sandbox">
      <div className="row sandbox-tabs">
        <b>Песочница</b>
        <Button variant={tab === "minigames" ? "primary" : "ghost"} onClick={() => setTab("minigames")}>
          Мини-игры
        </Button>
        <Button variant={tab === "chunks" ? "primary" : "ghost"} onClick={() => setTab("chunks")}>
          Чанки
        </Button>
        <a href="/" className="muted">
          ← в игру
        </a>
      </div>
      {tab === "minigames" ? <MinigamesTab /> : <ChunksTab />}
    </div>
  );
}
