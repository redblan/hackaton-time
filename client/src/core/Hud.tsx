/** HUD поверх сцены: этап, чанки, подсказка «E — …», реплики NPC (стрим), рация и ввод для NPC. */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { NpcId } from "@game/shared";
import { MAX_CHUNKS, TOTAL_CHUNKS } from "./chunkMath";
import { getSocket } from "./net";
import { NPC_NAMES, STAGE_NAMES } from "./names";
import { nextKey, store, useStore } from "./store";
import { Button } from "./ui";

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

function ChatBox() {
  const chat = useStore((s) => s.chat);
  const nearNpc = useStore((s) => s.nearNpc);
  const lastNpc = useStore((s) => s.npcLines.findLast((l) => !l.fromPlayer)?.npcId ?? null);
  const typing = useStore((s) => s.typing);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<Target>("radio");
  const input = useRef<HTMLInputElement>(null);
  const npcTarget = nearNpc ?? lastNpc;

  // Enter — открыть ввод (к NPC, если он рядом), Т — рация
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (store.get().typing || store.get().minigame) return;
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
          placeholder={typing ? "Enter — отправить, Tab — кому, Esc — назад" : "Enter — сказать NPC, T — рация"}
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
          <Button variant="ghost" onClick={() => store.resetGame()}>
            В лобби
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Hud() {
  const stage = useStore((s) => s.stage);
  const prompt = useStore((s) => s.prompt);
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
      <ChunkCounter />
      {!connected && <div className="hud-offline">Нет связи с сервером…</div>}
      <div className="crosshair" />
      {prompt && (
        <div className="hud-prompt">
          <kbd>E</kbd> — {prompt.label}
        </div>
      )}
      {showClick && <div className="hud-click">Кликните по сцене, чтобы управлять · WASD, мышь, Shift — бег</div>}
      <NpcLines />
      <ChatBox />
      <RunEnd />
    </div>
  );
}
