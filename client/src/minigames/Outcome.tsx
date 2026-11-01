/** Экран итога мини-игры: 3 секунды показывает, что верно, что нет и как правильно. */
import { useCallback, useEffect, useState, type ComponentType } from "react";
import type { MinigameProps, MinigameResult } from "@game/shared";
import { Button } from "../core/ui";
import { outcomeLines } from "./logic";
import { sfx } from "./sfx";

const SHOW_MS = 3_000;

function Outcome({ result, onNext }: { result: MinigameResult; onNext: () => void }) {
  useEffect(() => {
    (result.ok ? sfx.success : sfx.failure)();
  }, [result.ok]);

  useEffect(() => {
    const timer = setTimeout(onNext, SHOW_MS);
    return () => clearTimeout(timer);
  }, [onNext]);
  const lines = outcomeLines(result);
  return (
    <div className={`mg mg-outcome ${result.ok ? "mg-outcome-ok" : "mg-outcome-bad"}`}>
      <h2>{result.ok ? "Всё верно!" : "Есть ошибки"}</h2>
      {lines.map((line) => (
        <div key={line.title} className="mg-note">
          <strong>{line.title}</strong>
          {line.advice && <span>{line.advice}</span>}
        </div>
      ))}
      <Button onClick={onNext}>Дальше</Button>
    </div>
  );
}

export function withOutcome(Game: ComponentType<MinigameProps>): ComponentType<MinigameProps> {
  return function GameWithOutcome(props: MinigameProps) {
    const { onDone } = props;
    const [result, setResult] = useState<MinigameResult | null>(null);
    const next = useCallback(() => {
      if (result) onDone(result);
    }, [onDone, result]);
    if (result) return <Outcome result={result} onNext={next} />;
    return <Game {...props} onDone={setResult} />;
  };
}
