import { useEffect, useRef, useState } from "react";
import type { MinigameProps } from "@game/shared";
import { Frame, useCountdown, useFinish } from "./kit";
import { CPR_MAX_MS, CPR_MIN_MS, cprMistakes, cprRate } from "./logic";
import { sfx } from "./sfx";

const DURATION_MS = 30_000;
const METRONOME_MS = 545;
const SLOWEST = 60_000 / CPR_MAX_MS;
const FASTEST = 60_000 / CPR_MIN_MS;

function tempoLabel(rate: number | null) {
  if (rate === null) return { text: "Начинай нажимать", className: "" };
  if (rate < SLOWEST) return { text: "Быстрее", className: "mg-tempo-bad" };
  if (rate > FASTEST) return { text: "Медленнее", className: "mg-tempo-bad" };
  return { text: "Отличный темп", className: "mg-tempo-good" };
}

export function Cpr({ game, params, onDone }: MinigameProps) {
  const finish = useFinish(game, onDone);
  const duration = typeof params?.durationMs === "number" ? params.durationMs : DURATION_MS;
  const started = useRef(performance.now());
  const presses = useRef<number[]>([]);
  const [count, setCount] = useState(0);
  const [beat, setBeat] = useState(false);

  const left = useCountdown(duration, () =>
    finish(cprMistakes(presses.current, duration), { presses: presses.current.length }),
  );

  const press = () => {
    presses.current.push(Math.round(performance.now() - started.current));
    setCount(presses.current.length);
    setBeat((b) => !b);
    sfx.press();
  };

  useEffect(() => {
    const timer = setInterval(sfx.metronome, METRONOME_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (!e.repeat) press();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rate = cprRate(presses.current);
  const tempo = tempoLabel(rate);

  return (
    <Frame title="Сердечно-лёгочная реанимация" hint="Нажимай пробел ровно, 100–120 раз в минуту. Без пауз!" left={left} total={duration}>
      <button className={`mg-heart ${beat ? "mg-heart-beat" : ""}`} onPointerDown={press}>
        ❤️
      </button>
      <div className={`mg-tempo ${tempo.className}`}>
        {rate ?? "—"} в минуту · {tempo.text}
      </div>
      <p className="mg-hint">Нажатий: {count}</p>
    </Frame>
  );
}
