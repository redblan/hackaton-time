/** HUD поверх сцены: этап, чанки, подсказка «E — …», реплики NPC (стрим), рация и ввод для NPC. */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { NpcId } from "@game/shared";
import { chunkAt, MAX_CHUNKS, TOTAL_CHUNKS } from "./chunkMath";
import { DebugOverlay } from "./DebugOverlay";
import { Help } from "./Help";
import { local } from "./local";
import { getSocket, leaveRoom } from "./net";
import { NPC_NAMES, ROLE_NAMES, STAGE_NAMES } from "./names";
import { sample } from "./remote";
import { nextKey, store, useStore } from "./store";
import { Button } from "./ui";
import { NpcAudio } from "../voice/NpcAudio";
import { VoiceButton } from "../voice/VoiceButton";

type Target = "radio" | NpcId;

function ChunkCounter() {
  const ids = useStore((s) => s.chunks);
  const n = Object.keys(ids).length;
  return (
    <div className="hud-chunks" title={Object.keys(ids).join(", ")}>
      загружено {n}/{TOTAL_CHUNKS} ({Math.round((n / TOTAL_CHUNKS) * 100)}%) · лимит {MAX_CHUNKS}
    </div>
  );
}

function NpcLines() {
  const lines = useStore((s) => s.npcLines);
  const me = useStore((s) => s.auth?.name);
  return (
    <div className="hud-npc">
      {lines.slice(-5).map((l) => (
        <div key={l.key} className={`npc-line ${l.fromPlayer ? "npc-line-me" : ""}`}>
          <b>{l.fromPlayer ? `${me} → ${NPC_NAMES[l.npcId]}` : NPC_NAMES[l.npcId]}:</b> {l.text}
          {!l.done && <span className="caret">▍</span>}
          {l.source === "template" && <span className="tag">шаблон</span>}
        </div>
      ))}
    </div>
  );
}

/** Взаимодействия-разговоры: E отправляет их на сервер и сразу открывает ввод к NPC. */
const TALK_INTERACTS = new Set(["elevator_shaft", "neighbor_door"]);

function ChatBox() {
  const chat = useStore((s) => s.chat);
  const nearNpc = useStore((s) => s.nearNpc);
  const lastNpc = useStore((s) => s.npcLines.findLast((l) => !l.fromPlayer)?.npcId ?? null);
  const typing = useStore((s) => s.typing);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<Target>("radio");
  const input = useRef<HTMLInputElement>(null);
  const npcTarget = nearNpc ?? lastNpc;

  // Цель открытого чата — в стор, чтобы голос (client/src/voice) шёл тому же адресату
  useEffect(() => store.set({ chatTarget: typing ? target : null }), [typing, target]);

  // Enter — открыть ввод (к NPC, если он рядом), Т — рация.
  // E рядом с человеком — тоже открывает разговор с ним, если E не занята действием (мини-игра, предмет);
  // «поговорить»-взаимодействия (лифт, дверь соседки) уходят на сервер из Player и открывают ввод здесь.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (store.get().typing || store.get().minigame) return;
      if (e.code === "KeyE" && !e.repeat) {
        const st = store.get();
        if (!st.nearNpc || (st.prompt && !TALK_INTERACTS.has(st.prompt.target))) return;
        e.preventDefault(); // иначе «e» попадёт в поле ввода
        setTarget(st.nearNpc);
        document.exitPointerLock?.();
        input.current?.focus();
        return;
      }
      if (e.code === "Enter" || e.code === "KeyT") {
        e.preventDefault();
        const n = store.get().nearNpc ?? store.get().npcLines.findLast((l) => !l.fromPlayer)?.npcId ?? null;
        setTarget(e.code === "Enter" && n ? n : "radio");
        document.exitPointerLock?.();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function send() {
    const t = text.trim();
    if (!t) return;
    const s = getSocket();
    if (target === "radio") s?.emit("chat:send", { text: t });
    else {
      s?.emit("npc:talk", { npcId: target, text: t });
      store.set((st) => ({
        npcLines: [...st.npcLines, { key: nextKey(), npcId: target, text: t, done: true, fromPlayer: true }].slice(-30),
      }));
    }
    setText("");
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (e.key === "Enter") {
      send();
      input.current?.blur();
    } else if (e.key === "Escape") input.current?.blur();
    else if (e.key === "Tab") {
      e.preventDefault();
      setTarget((cur) => (cur === "radio" && npcTarget ? npcTarget : "radio"));
    }
  }

  return (
    <div className={`hud-chat ${typing ? "hud-chat-active" : ""}`}>
      <div className="chat-log">
        {chat.slice(-8).map((m) => (
          <div key={m.key}>
            <b>{m.from}:</b> {m.text}
          </div>
        ))}
      </div>
      <div className="chat-input">
        <select value={target} onChange={(e) => setTarget(e.target.value as Target)}>
          <option value="radio">Рация</option>
          {npcTarget && <option value={npcTarget}>{NPC_NAMES[npcTarget]}</option>}
          {target !== "radio" && target !== npcTarget && <option value={target}>{NPC_NAMES[target]}</option>}
        </select>
        <input
          ref={input}
          value={text}
          placeholder={typing ? "Enter — отправить, Tab — кому, Esc — назад" : "E или Enter — сказать NPC рядом, T — рация"}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => store.set({ typing: true })}
          onBlur={() => store.set({ typing: false })}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}

/** D-49: новое прохождение в том же режиме (в коопе — когда нажмут все) */
function playAgain() {
  const mode = store.get().room?.mode ?? "solo";
  store.resetGame();
  getSocket()?.emit("room:join", { mode });
}

function RunEnd() {
  const end = useStore((s) => s.runEnd);
  const me = useStore((s) => s.auth?.playerId);
  if (!end) return null;
  const mine = end.summary.perPlayer.find((p) => p.playerId === me);
  return (
    <div className="overlay">
      <div className="card card-wide">
        <h1>Прохождение завершено</h1>
        <p>
          Очки: <b>{end.summary.score}</b> · время {Math.round(end.summary.durationMs / 1000)} с
        </p>
        {mine && (
          <>
            <p>Сделано верно: {mine.ok.length ? mine.ok.join(", ") : "—"}</p>
            {mine.mistakes.length > 0 && (
              <ul>
                {mine.mistakes.map((m, i) => (
                  <li key={i}>{m.note}</li>
                ))}
              </ul>
            )}
          </>
        )}
        {end.debrief && (
          <p className="debrief">
            <b>Громов:</b> {end.debrief}
          </p>
        )}
        <div className="row">
          <Button onClick={playAgain}>Сыграть ещё</Button>
          <Button variant="ghost" onClick={leaveRoom}>
            В лобби
          </Button>
        </div>
      </div>
    </div>
  );
}

/** F1/H — помощь, F3/` — отладка для жюри */
function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (store.get().minigame) return;
      if (e.code === "F1" || e.code === "KeyH") {
        e.preventDefault();
        document.exitPointerLock?.();
        store.set((s) => ({ help: !s.help }));
      }
      if (e.code === "F3" || e.code === "Backquote") {
        e.preventDefault();
        store.set((s) => ({ debug: !s.debug }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Пока под ногами нет мира — экран загрузки (иначе игрок висит в небе) */
function Loading() {
  const chunks = useStore((s) => s.chunks);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 300);
    return () => clearInterval(t);
  }, []);
  const here = local.ready && Boolean(chunks[chunkAt(local.pos)]);
  if (here) return null;
  return (
    <div className="loading">
      <div className="spinner" />
      Загружаем мир… {Object.keys(chunks).length}/{MAX_CHUNKS}
    </div>
  );
}

/** Кооп: где напарники — расстояние, этаж, направление относительно взгляда */
function Partners() {
  const others = useStore((s) => s.others);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  if (others.length === 0) return null;
  const me = local.pos;
  const floorOf = (y: number, z: number) => (z < 0 ? "во дворе" : `${Math.max(1, Math.min(9, Math.floor((y + 0.5) / 3) + 1))} этаж`);
  return (
    <div className="hud-partners">
      {others.map((p) => {
        const s = sample(p.id);
        if (!s) return null;
        const dx = s.pos[0] - me[0];
        const dz = s.pos[2] - me[2];
        const dist = Math.round(Math.hypot(dx, s.pos[1] - me[1], dz));
        // угол на напарника относительно взгляда (вперёд = -z, поворот rotY)
        const ang = Math.atan2(-dx, -dz) - local.rotY;
        return (
          <div key={p.id} className="partner">
            <span className="partner-arrow" style={{ transform: `rotate(${-ang}rad)` }}>
              ↑
            </span>
            <b>{p.name}</b> · {dist} м · {floorOf(s.pos[1], s.pos[2])}
            {p.role && <span className="muted"> · {ROLE_NAMES[p.role]}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** D-62: на этапе звонка 112 можно положить трубку */
function HangUp() {
  const stage = useStore((s) => s.stage?.stage);
  if (stage !== "call_112") return null;
  return (
    <Button variant="danger" className="hud-hangup" onClick={() => getSocket()?.emit("npc:hangup", { npcId: "dispatcher" })}>
      Завершить звонок
    </Button>
  );
}

export function Hud() {
  useHotkeys();
  const stage = useStore((s) => s.stage);
  const prompt = useStore((s) => s.prompt);
  const nearNpc = useStore((s) => s.nearNpc);
  const locked = useStore((s) => s.locked);
  const typing = useStore((s) => s.typing);
  const connected = useStore((s) => s.connected);
  const inventory = useStore((s) => s.inventory);
  const me = useStore((s) => s.auth?.playerId);
  const npcs = useStore((s) => s.npcs);
  const followers = npcs.filter((n) => n.following !== null && n.following === me);
  const showClick = !locked && !typing;

  return (
    <div className="hud">
      <div className="hud-stage">
        {stage ? (
          <>
            <div className="stage-name">{STAGE_NAMES[stage.stage]}</div>
            <div className="stage-hint">{stage.hint}</div>
          </>
        ) : (
          <div className="stage-hint">Осмотритесь…</div>
        )}
        {inventory.length > 0 && <div className="inventory">В рюкзаке: {inventory.length}</div>}
        {followers.map((n) => (
          <div key={n.npcId} className="inventory">
            {NPC_NAMES[n.npcId]} идёт за вами — не убегайте
          </div>
        ))}
      </div>
      <div className="hud-top-right">
        <ChunkCounter />
        <Button variant="ghost" className="hud-leave" onClick={leaveRoom}>
          В лобби
        </Button>
      </div>
      {!connected && <div className="hud-offline">Нет связи с сервером…</div>}
      <div className="crosshair" />
      {prompt && (
        <div className="hud-prompt">
          <kbd>E</kbd> — {prompt.label}
        </div>
      )}
      {!prompt && nearNpc && (
        <div className="hud-prompt">
          <kbd>E</kbd> — поговорить: {NPC_NAMES[nearNpc]}
        </div>
      )}
      {showClick && (
        <div className="hud-click">Кликните по сцене, чтобы управлять · F1 — как играть · Esc — отпустить мышь</div>
      )}
      <NpcLines />
      <ChatBox />
      <VoiceButton />
      <NpcAudio />
      <HangUp />
      <Partners />
      <Loading />
      <DebugOverlay />
      <Help />
      <RunEnd />
    </div>
  );
}
