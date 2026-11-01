import { useEffect, useRef, useState } from "react";
import type { MinigameProps } from "@game/shared";
import { Button } from "../core/ui";
import { Frame, useFinish } from "./kit";
import { tourniquetMistakes, type LegSpot } from "./logic";
import { sfx } from "./sfx";

const HOLD_MS = 4_000;

export function Tourniquet({ game, onDone }: MinigameProps) {
  const finish = useFinish(game, onDone);
  const [phase, setPhase] = useState<"press" | "place" | "note">("press");
  const [held, setHeld] = useState(0);
  const [pressing, setPressing] = useState(false);
  const [spot, setSpot] = useState<LegSpot>("above_wound");
  const [time, setTime] = useState("");
  const released = useRef(false);

  useEffect(() => {
    if (phase !== "press") return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      setPressing(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      setPressing(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "press" || !pressing) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      setHeld((h) => h + delta);
      last = now;
    }, 50);
    return () => clearInterval(timer);
  }, [phase, pressing]);

  useEffect(() => {
    if (!pressing && held > 0 && held < HOLD_MS) released.current = true;
  }, [pressing, held]);

  useEffect(() => {
    if (phase === "press" && held >= HOLD_MS) setPhase("place");
  }, [phase, held]);

  const place = (chosen: LegSpot) => {
    sfx.click();
    setSpot(chosen);
    setPhase("note");
  };
  const submit = () => finish(tourniquetMistakes(released.current, spot, time), { time: time.trim() });

  if (phase === "press") {
    return (
      <Frame title="Сильное кровотечение" hint="Прижми рану и держи, пока шкала не заполнится. Отпускать нельзя!">
        <button
          className={`mg-press ${pressing ? "mg-press-on" : ""}`}
          onPointerDown={() => setPressing(true)}
          onPointerUp={() => setPressing(false)}
          onPointerLeave={() => setPressing(false)}
        >
          {pressing ? "Держишь!" : "Зажми пробел или кнопку"}
        </button>
        <div className="mg-track">
          <div className="mg-fill mg-fill-good" style={{ width: `${Math.min(100, (held / HOLD_MS) * 100)}%` }} />
        </div>
      </Frame>
    );
  }

  if (phase === "place") {
    return (
      <Frame title="Наложи жгут" hint="Выбери, куда наложить жгут.">
        <div className="mg-leg">
          <button className="mg-leg-zone" onClick={() => place("above_wound")}>
            Выше раны
          </button>
          <div className="mg-leg-wound">Рана</div>
          <button className="mg-leg-zone" onClick={() => place("below_wound")}>
            Ниже раны
          </button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame title="Записка для бригады" hint="Жгут наложен. Что написать в записке?">
      <input
        className="mg-input"
        autoFocus
        placeholder="Время наложения, например 03:15"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <Button onClick={submit}>Готово</Button>
    </Frame>
  );
}
