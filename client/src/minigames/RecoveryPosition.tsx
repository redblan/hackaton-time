import { useMemo, useState } from "react";
import type { MinigameProps } from "@game/shared";
import { Button } from "../core/ui";
import { Frame, useFinish } from "./kit";
import { RECOVERY_STEPS, recoveryMistakes, shuffled } from "./logic";
import { sfx } from "./sfx";

export function RecoveryPosition({ game, onDone }: MinigameProps) {
  const finish = useFinish(game, onDone);
  const steps = useMemo(() => shuffled(RECOVERY_STEPS.map((_, i) => i)), []);
  const [order, setOrder] = useState<number[]>([]);

  return (
    <Frame title="Устойчивое боковое положение" hint="Человек без сознания, но дышит. Расставь 4 шага по порядку.">
      <div className="mg-columns">
        <div className="mg-list">
          {steps
            .filter((step) => !order.includes(step))
            .map((step) => (
              <button key={step} className="mg-card" onClick={() => { sfx.click(); setOrder((cur) => [...cur, step]); }}>
                {RECOVERY_STEPS[step]}
              </button>
            ))}
        </div>
        <div className="mg-list mg-drop">
          {order.length === 0 && <p className="mg-hint">Порядок действий</p>}
          {order.map((step, i) => (
            <button
              key={step}
              className="mg-card mg-card-on"
              onClick={() => setOrder((cur) => cur.filter((s) => s !== step))}
            >
              <span className="mg-num">{i + 1}</span>
              {RECOVERY_STEPS[step]}
            </button>
          ))}
        </div>
      </div>
      <Button disabled={order.length < RECOVERY_STEPS.length} onClick={() => finish(recoveryMistakes(order), { order })}>
        Готово
      </Button>
    </Frame>
  );
}
