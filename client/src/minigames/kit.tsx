/** Общие части мини-игр: рамка, таймер, сборка MinigameResult. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { MinigameId, MinigameResult } from "@game/shared";
import { GAME_SKILLS } from "./logic";

export function useFinish(game: MinigameId, onDone: (r: MinigameResult) => void) {
  const started = useRef(performance.now());
  return useCallback(
    (mistakes: string[], data?: Record<string, unknown>) =>
      onDone({
        game,
        skill: GAME_SKILLS[game],
        ok: mistakes.length === 0,
        mistakes,
        timeMs: Math.round(performance.now() - started.current),
        ...(data ? { data } : {}),
      }),
    [game, onDone],
  );
}

/** Обратный отсчёт: возвращает остаток в мс и вызывает onEnd один раз. */
export function useCountdown(durationMs: number, onEnd: () => void) {
  const [left, setLeft] = useState(durationMs);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    const started = performance.now();
    const timer = setInterval(() => {
      const rest = Math.max(0, durationMs - (performance.now() - started));
      setLeft(rest);
      if (rest === 0) {
        clearInterval(timer);
        end.current();
      }
    }, 100);
    return () => clearInterval(timer);
  }, [durationMs]);
  return left;
}

export function Frame(props: { title: string; hint: string; left?: number; total?: number; children: ReactNode }) {
  const { title, hint, left, total, children } = props;
  return (
    <div className="mg">
      <div className="mg-head">
        <h2>{title}</h2>
        {left !== undefined && <span className="mg-clock">{Math.ceil(left / 1000)} с</span>}
      </div>
      {left !== undefined && total !== undefined && (
        <div className="mg-track mg-track-thin">
          <div className="mg-fill" style={{ width: `${(left / total) * 100}%` }} />
        </div>
      )}
      <p className="mg-hint">{hint}</p>
      {children}
    </div>
  );
}
