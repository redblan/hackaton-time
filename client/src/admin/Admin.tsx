/**
 * Админка (01.11): /admin. Пароль — ADMIN_PASSWORD сервера (по умолчанию admin).
 * Клиенты с FPS/ping, комнаты, флаги вселенной, толчок, объекты (world:patch), телепорт, кик,
 * карточки агентов (если ИИ Матвея это умеет) и «сказать от имени NPC». Опрос раз в 2 с.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { NPC_IDS, type AiStats, type CharacterCard, type ChunkData, type NpcId, type Vec3, type WorldObject } from "@game/shared";
import { MODE_NAMES, NPC_NAMES, ROLE_NAMES, STAGE_NAMES } from "../core/names";
import { Button } from "../core/ui";

type Metrics = { fps: number; ping: number; chunks: number; dpr: number; gpu: string; at: number } | null;
type AdminPlayer = {
  id: string;
  name: string;
  role: string | null;
  online: boolean;
  pos: Vec3;
  chunk: string | null;
  stage: string | null;
  anim: string;
  chunks: string[];
  metrics: Metrics;
};
type AdminRoom = {
  id: string;
  mode: string;
  started: boolean;
  finished: boolean;
  flags: string[];
  clockMs: number;
  patches: { chunkId: string; add: WorldObject[]; remove: string[] }[];
  props: { id: string; chunkId: string; holder: string | null }[];
  lines: { at: number; npcId: string; to: string; text: string; source: string; ms?: number }[];
  players: AdminPlayer[];
};
type AdminState = {
  rooms: AdminRoom[];
  lobby: { id: string; name: string; metrics: Metrics }[];
  sockets: number;
  server: { uptimeMs: number; rssMb: number; heapMb: number; chunks: number; ai: AiStats | null; node: string };
  characters: CharacterCard[] | null;
  at: number;
};
type PaletteItem = { id: string; label: string; size: Vec3; color: string; parts: { pos: Vec3; size: Vec3; color: string }[] };

const TOKEN_KEY = "toltchok.admin";
const CHUNK_IDS = [
  ...Array.from({ length: 18 }, (_, i) => `e${Math.floor(i / 9) + 1}f${(i % 9) + 1}`),
  ...Array.from({ length: 12 }, (_, i) => `y${Math.floor(i / 4)}${i % 4}`),
];
const QUICK_FLAGS = ["fire_f5", "fire_f3", "collapse_f4", "gas", "wire", "aftershock", "window_broken", "wardrobe_fallen", "balcony_debris", "papa_left", "lift_vanya", "neighbor_valentina"];
const TELEPORTS: { label: string; pos: Vec3 }[] = [
  ...Array.from({ length: 9 }, (_, i) => ({ label: `этаж ${i + 1}`, pos: [3, i * 3, 6] as Vec3 })),
  { label: "двор, у подъезда", pos: [6, 0, -4] },
  { label: "место сбора", pos: [18, 0, -30] },
];

let token = "";
try {
  token = sessionStorage.getItem(TOKEN_KEY) ?? "";
} catch {
  /* приватный режим */
}

async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-admin-token": token },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

const fmtMs = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const quality = (v: number, good: number, bad: number, invert = false) => {
  const ok = invert ? v <= good : v >= good;
  const poor = invert ? v >= bad : v <= bad;
  return ok ? "ok" : poor ? "bad" : "warn";
};

export function Admin() {
  const [authed, setAuthed] = useState(Boolean(token));
  const [password, setPassword] = useState("");
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      setState(await api<AdminState>("/state"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes("пароль")) setAuthed(false);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    void refresh();
    void api<PaletteItem[]>("/palette").then(setPalette).catch(() => {});
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [authed, refresh]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    token = password;
    try {
      await api("/login", {});
      sessionStorage.setItem(TOKEN_KEY, token);
      setAuthed(true);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!authed) {
    return (
      <div className="screen">
        <div className="card">
          <h1>Админка</h1>
          <p className="muted">Пароль — ADMIN_PASSWORD на сервере (по умолчанию admin)</p>
          <form onSubmit={login} className="form">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="пароль" autoFocus />
            {error && <div className="error">{error}</div>}
            <Button type="submit">Войти</Button>
          </form>
        </div>
      </div>
    );
  }

  const players = state?.rooms.flatMap((r) => r.players.map((p) => ({ ...p, room: r }))) ?? [];
  return (
    <div className="admin">
      <header className="admin-head">
        <h1>Админка · Происшествия</h1>
        <span className="muted small">
          {state ? `обновлено ${new Date(state.at).toLocaleTimeString()} · сокетов ${state.sockets}` : "загрузка…"}
          {error && <span className="error"> · {error}</span>}
        </span>
        <a href="/" className="small">← в игру</a>
      </header>

      {state && <ServerPanel s={state.server} rooms={state.rooms.length} />}

      <section className="admin-card">
        <h2>Клиенты — FPS и ping</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Игрок</th><th>Комната</th><th>Роль</th><th>Этап</th><th>Где</th><th>FPS</th><th>ping</th><th>чанки</th><th>dpr</th><th>видеокарта</th><th></th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className={p.online ? "" : "admin-offline"}>
                <td>{p.name}{!p.online && <span className="tag">офлайн</span>}</td>
                <td>{p.room.id} · {MODE_NAMES[p.room.mode as keyof typeof MODE_NAMES] ?? p.room.mode}</td>
                <td>{p.role ? ROLE_NAMES[p.role as keyof typeof ROLE_NAMES] : "—"}</td>
                <td>{p.stage ? STAGE_NAMES[p.stage as keyof typeof STAGE_NAMES] ?? p.stage : "—"}</td>
                <td>{p.chunk ?? "?"} · {p.pos.map((v) => v.toFixed(0)).join(", ")}</td>
                <Metric v={p.metrics?.fps} cls={p.metrics ? quality(p.metrics.fps, 50, 25) : ""} />
                <Metric v={p.metrics?.ping} cls={p.metrics ? quality(p.metrics.ping, 60, 200, true) : ""} suffix=" мс" />
                <td>{p.chunks.length}/30</td>
                <td>{p.metrics ? p.metrics.dpr.toFixed(2) : "—"}</td>
                <td className="small muted">{p.metrics?.gpu?.replace(/ANGLE \(|\)$/g, "").slice(0, 60) || "—"}</td>
                <td><PlayerActions p={p} onDone={refresh} /></td>
              </tr>
            ))}
            {state?.lobby.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td colSpan={4} className="muted">в лобби</td>
                <Metric v={p.metrics?.fps} cls={p.metrics ? quality(p.metrics.fps, 50, 25) : ""} />
                <Metric v={p.metrics?.ping} cls={p.metrics ? quality(p.metrics.ping, 60, 200, true) : ""} suffix=" мс" />
                <td>—</td><td>{p.metrics ? p.metrics.dpr.toFixed(2) : "—"}</td>
                <td className="small muted">{p.metrics?.gpu?.replace(/ANGLE \(|\)$/g, "").slice(0, 60) || "—"}</td><td />
              </tr>
            ))}
            {!players.length && !state?.lobby.length && <tr><td colSpan={11} className="muted">Никто не подключён</td></tr>}
          </tbody>
        </table>
      </section>

      {state?.rooms.map((room) => (
        <RoomPanel key={room.id} room={room} palette={palette} onDone={refresh} />
      ))}

      <AgentsPanel characters={state?.characters ?? null} rooms={state?.rooms ?? []} onDone={refresh} />
    </div>
  );
}

function Metric({ v, cls, suffix = "" }: { v: number | undefined; cls: string; suffix?: string }) {
  return <td className={`admin-metric admin-${cls}`}>{v === undefined ? "—" : `${v}${suffix}`}</td>;
}

function ServerPanel({ s, rooms }: { s: AdminState["server"]; rooms: number }) {
  const ai = s.ai;
  return (
    <section className="admin-card admin-stats">
      <div><b>Сервер</b><span>{fmtMs(s.uptimeMs)} работает · {s.node}</span></div>
      <div><b>Память</b><span>{s.rssMb} МБ (heap {s.heapMb})</span></div>
      <div><b>Комнат</b><span>{rooms} · чанков в мире {s.chunks}</span></div>
      <div>
        <b>ИИ</b>
        <span>
          {ai ? `${ai.model} · ${ai.available ? "в сети" : "нет"} · очередь ${ai.queued}+${ai.inFlight} · ${ai.lastMs} мс (ср. ${ai.avgMs}) · llm ${ai.llm} / шаблон ${ai.template}` : "метрики ИИ ещё не отдаёт (M22)"}
        </span>
      </div>
    </section>
  );
}

function PlayerActions({ p, onDone }: { p: AdminPlayer; onDone: () => void }) {
  const [where, setWhere] = useState(0);
  const run = (path: string, body?: unknown) => api(path, body ?? {}).then(onDone).catch((e) => alert((e as Error).message));
  return (
    <span className="row">
      <select value={where} onChange={(e) => setWhere(Number(e.target.value))} className="small">
        {TELEPORTS.map((t, i) => <option key={t.label} value={i}>{t.label}</option>)}
      </select>
      <Button variant="ghost" className="small" onClick={() => run(`/player/${p.id}/teleport`, { pos: TELEPORTS[where]!.pos, rotY: Math.PI })}>телепорт</Button>
      <Button variant="danger" className="small" onClick={() => confirm(`Выкинуть ${p.name}?`) && run(`/player/${p.id}/kick`)}>кик</Button>
    </span>
  );
}

function RoomPanel({ room, palette, onDone }: { room: AdminRoom; palette: PaletteItem[]; onDone: () => void }) {
  const [flag, setFlag] = useState("");
  const [strength, setStrength] = useState(0.8);
  const run = (path: string, body?: unknown) => api(`/room/${room.id}${path}`, body ?? {}).then(onDone).catch((e) => alert((e as Error).message));
  return (
    <section className="admin-card">
      <h2>
        Комната {room.id} · {MODE_NAMES[room.mode as keyof typeof MODE_NAMES] ?? room.mode} · {room.finished ? "завершена" : room.started ? `идёт ${fmtMs(room.clockMs)}` : "в лобби"}
      </h2>
      <div className="row">
        <b>Флаги:</b>
        {room.flags.map((f) => (
          <button key={f} className="admin-chip" title="убрать" onClick={() => run("/flag", { flag: f, on: false })}>{f} ×</button>
        ))}
        {!room.flags.length && <span className="muted">нет</span>}
      </div>
      <div className="row">
        {QUICK_FLAGS.filter((f) => !room.flags.includes(f)).map((f) => (
          <button key={f} className="admin-chip admin-chip-add" onClick={() => run("/flag", { flag: f, on: true })}>+ {f}</button>
        ))}
        <input value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="свой флаг" className="small" />
        <Button variant="ghost" className="small" disabled={!flag} onClick={() => { void run("/flag", { flag, on: true }); setFlag(""); }}>поставить</Button>
      </div>
      <div className="row">
        <b>Толчок:</b>
        <input type="range" min={0.1} max={1} step={0.1} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
        <span className="small">{strength.toFixed(1)}</span>
        <Button className="small" onClick={() => run("/quake", { strength, durationMs: 4000 })}>тряхнуть 4 с</Button>
        <Button variant="ghost" className="small" onClick={() => run("/quake", { strength, durationMs: 1500 })}>короткий</Button>
      </div>
      <PatchEditor room={room} palette={palette} onDone={onDone} />
      {room.lines.length > 0 && (
        <details>
          <summary className="small muted">Последние реплики NPC ({room.lines.length})</summary>
          <ul className="admin-lines">
            {[...room.lines].reverse().map((l, i) => (
              <li key={i}>
                <span className="muted small">{new Date(l.at).toLocaleTimeString()}</span> <b>{NPC_NAMES[l.npcId as NpcId] ?? l.npcId}</b> → {l.to}
                <span className={`tag admin-src-${l.source}`}>{l.source}{l.ms ? ` ${l.ms} мс` : ""}</span>: {l.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Поставить/убрать объект в чанке комнаты — через world:patch */
function PatchEditor({ room, palette, onDone }: { room: AdminRoom; palette: PaletteItem[]; onDone: () => void }) {
  const [chunkId, setChunkId] = useState("e1f1");
  const [item, setItem] = useState(0);
  const [local, setLocal] = useState<Vec3>([6, 0, 6]);
  const [chunk, setChunk] = useState<ChunkData | null>(null);
  const [removeId, setRemoveId] = useState("");
  useEffect(() => {
    void api<ChunkData>(`/chunks/${chunkId}`).then(setChunk).catch(() => setChunk(null));
  }, [chunkId]);
  const run = (body: unknown) => api(`/room/${room.id}/patch`, body).then(onDone).catch((e) => alert((e as Error).message));
  const removable = useMemo(() => (chunk?.objects ?? []).filter((o) => o.kind === "box" || o.kind === "model" || o.kind === "prop" || o.kind === "npc").map((o) => o.id), [chunk]);
  // Поставленные экземпляры: части «admin-<пресет>-<время>-<i>» группируем по префиксу, убираем целиком
  const instances = useMemo(() => {
    const out: { chunkId: string; instanceId: string; ids: string[] }[] = [];
    for (const p of room.patches)
      for (const o of p.add) {
        const inst = o.id.replace(/-\d+$/, "");
        const cur = out.find((i) => i.chunkId === p.chunkId && i.instanceId === inst);
        if (cur) cur.ids.push(o.id);
        else out.push({ chunkId: p.chunkId, instanceId: inst, ids: [o.id] });
      }
    return out;
  }, [room.patches]);

  function add() {
    const p = palette[item];
    if (!p || !chunk) return;
    api(`/room/${room.id}/place`, { chunkId, presetId: p.id, local, rotY: 0 })
      .then(onDone)
      .catch((e) => alert((e as Error).message));
  }

  return (
    <div className="admin-patch">
      <div className="row">
        <b>Объекты:</b>
        <select value={chunkId} onChange={(e) => setChunkId(e.target.value)} className="small">
          {CHUNK_IDS.map((id) => <option key={id}>{id}</option>)}
        </select>
        <select value={item} onChange={(e) => setItem(Number(e.target.value))} className="small">
          {palette.map((p, i) => <option key={p.id} value={i}>{p.label}</option>)}
        </select>
        {(["x", "y", "z"] as const).map((axis, i) => (
          <label key={axis} className="small">
            {axis}
            <input type="number" step={0.5} value={local[i]} className="admin-num" onChange={(e) => setLocal((cur) => cur.map((v, j) => (j === i ? Number(e.target.value) : v)) as Vec3)} />
          </label>
        ))}
        <Button className="small" disabled={!palette.length || !chunk} onClick={add}>поставить</Button>
        <select value={removeId} onChange={(e) => setRemoveId(e.target.value)} className="small">
          <option value="">— убрать из чанка —</option>
          {removable.map((id) => <option key={id}>{id}</option>)}
        </select>
        <Button variant="ghost" className="small" disabled={!removeId} onClick={() => { void run({ chunkId, add: [], remove: [removeId] }); setRemoveId(""); }}>убрать</Button>
      </div>
      {room.patches.length > 0 && (
        <div className="row small">
          <span className="muted">Изменено:</span>
          {instances.map((i) => (
            <button key={i.chunkId + i.instanceId} className="admin-chip" title="убрать" onClick={() => run({ chunkId: i.chunkId, add: [], remove: i.ids })}>
              {i.chunkId}: +{i.instanceId.replace(/^admin-/, "").replace(/-[a-z0-9]+$/, "")} ×
            </button>
          ))}
          {room.patches.flatMap((p) => p.remove.map((id) => <span key={p.chunkId + id} className="admin-chip admin-chip-removed">{p.chunkId}: −{id}</span>))}
          <Button variant="ghost" className="small" onClick={() => api(`/room/${room.id}/reset-world`, {}).then(onDone).catch((e) => alert((e as Error).message))}>вернуть как было</Button>
        </div>
      )}
    </div>
  );
}

function AgentsPanel({ characters, rooms, onDone }: { characters: CharacterCard[] | null; rooms: AdminRoom[]; onDone: () => void }) {
  const [roomId, setRoomId] = useState("");
  const [npcId, setNpcId] = useState<NpcId>("papa");
  const [text, setText] = useState("");
  const [playerId, setPlayerId] = useState("");
  const target = rooms.find((r) => r.id === roomId) ?? rooms[0];
  async function say() {
    if (!target || !text.trim()) return;
    try {
      await api(`/room/${target.id}/say`, { npcId, text, ...(playerId ? { playerId } : {}) });
      setText("");
      onDone();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  return (
    <section className="admin-card">
      <h2>Агенты</h2>
      <div className="row">
        <b>Сказать от имени:</b>
        <select value={npcId} onChange={(e) => setNpcId(e.target.value as NpcId)} className="small">
          {NPC_IDS.map((id) => <option key={id} value={id}>{NPC_NAMES[id]}</option>)}
        </select>
        <select value={target?.id ?? ""} onChange={(e) => setRoomId(e.target.value)} className="small">
          {rooms.map((r) => <option key={r.id} value={r.id}>комната {r.id}</option>)}
        </select>
        <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="small">
          <option value="">всем в комнате</option>
          {target?.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="реплика" className="admin-wide" onKeyDown={(e) => e.key === "Enter" && void say()} />
        <Button className="small" disabled={!target || !text.trim()} onClick={() => void say()}>сказать</Button>
      </div>
      {characters ? (
        <table className="admin-table">
          <thead><tr><th>NPC</th><th>Характер</th><th>Настроение</th><th>t°</th><th>Только шаблоны</th><th>Только факты</th><th></th></tr></thead>
          <tbody>
            {characters.map((c) => <CharacterRow key={c.npcId} card={c} onDone={onDone} />)}
          </tbody>
        </table>
      ) : (
        <p className="muted small">Карточки персонажей появятся, когда модуль ИИ отдаст getCharacters()/setCharacter() (M22). Реплики от имени NPC уже работают.</p>
      )}
    </section>
  );
}

function CharacterRow({ card, onDone }: { card: CharacterCard; onDone: () => void }) {
  const [c, setC] = useState(card);
  useEffect(() => setC(card), [card]);
  const dirty = JSON.stringify(c) !== JSON.stringify(card);
  const save = () =>
    api(`/characters/${c.npcId}`, { traits: c.traits, mood: c.mood, temperature: c.temperature, templatesOnly: c.templatesOnly, factsOnly: c.factsOnly })
      .then(onDone)
      .catch((e) => alert((e as Error).message));
  return (
    <tr>
      <td><b>{c.name}</b></td>
      <td><textarea value={c.traits} rows={2} className="admin-wide" onChange={(e) => setC({ ...c, traits: e.target.value })} /></td>
      <td><input value={c.mood} onChange={(e) => setC({ ...c, mood: e.target.value })} /></td>
      <td><input type="number" step={0.1} min={0} max={1.5} value={c.temperature} className="admin-num" onChange={(e) => setC({ ...c, temperature: Number(e.target.value) })} /></td>
      <td><input type="checkbox" checked={c.templatesOnly} onChange={(e) => setC({ ...c, templatesOnly: e.target.checked })} /></td>
      <td><input type="checkbox" checked={c.factsOnly} onChange={(e) => setC({ ...c, factsOnly: e.target.checked })} /></td>
      <td><Button className="small" disabled={!dirty} onClick={save}>применить</Button></td>
    </tr>
  );
}
