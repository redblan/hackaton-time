/**
 * /sandbox — без входа: запуск мини-игр по одной и просмотр чанков мира.
 * Для Юры (мини-игры) и Никиты (чанки).
 */
import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { MINIGAMES, type ChunkData, type MinigameId, type MinigameResult } from "@game/shared";
import { minigames } from "../minigames";
import { Atmosphere } from "../world/Atmosphere";
import { ChunkView, getColliders } from "../world/ChunkView";
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

function ChunksTab() {
  const [ids, setIds] = useState<string[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [chunk, setChunk] = useState<ChunkData | null>(null);
  const [flags, setFlags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

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
          {chunk && <ChunkView chunk={chunk} flags={flags} />}
          <OrbitControls target={center} makeDefault />
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
