import { useMemo, useState, type DragEvent } from "react";
import type { MinigameProps, VictimKind } from "@game/shared";
import { Button } from "../core/ui";
import { Frame, useFinish } from "./kit";
import { shuffled, triageMistakes, type TriageGroups } from "./logic";
import { sfx } from "./sfx";

const DEFAULT_ORDER: TriageGroups = [["bleeding"], ["cpr", "unconscious"], ["scared"]];

const VICTIM_VIEW: Record<VictimKind, { icon: string; text: string }> = {
  bleeding: { icon: "🩸", text: "Мужчина: сильное кровотечение из бедра" },
  cpr: { icon: "💔", text: "Женщина: без сознания, не дышит" },
  unconscious: { icon: "😴", text: "Подросток: без сознания, дышит" },
  scared: { icon: "😨", text: "Ребёнок: напуган, ходит сам" },
  light_injury: { icon: "🩹", text: "Сосед: лёгкая травма" },
};

export function Triage({ game, params, onDone }: MinigameProps) {
  const finish = useFinish(game, onDone);
  const groups = (params?.order as TriageGroups | undefined) ?? DEFAULT_ORDER;
  const victims = useMemo(() => shuffled(groups.flat()), [groups]);
  const [queue, setQueue] = useState<VictimKind[]>([]);

  const add = (kind: VictimKind) => {
    sfx.click();
    setQueue((cur) => (cur.includes(kind) ? cur : [...cur, kind]));
  };
  const remove = (kind: VictimKind) => setQueue((cur) => cur.filter((k) => k !== kind));
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    add(e.dataTransfer.getData("text/plain") as VictimKind);
  };

  return (
    <Frame title="Кому помочь первым?" hint="Перетащи пострадавших в очередь или нажимай на них по порядку.">
      <div className="mg-columns">
        <div className="mg-list">
          {victims
            .filter((kind) => !queue.includes(kind))
            .map((kind) => (
              <button
                key={kind}
                className="mg-card"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", kind)}
                onClick={() => add(kind)}
              >
                <span className="mg-icon">{VICTIM_VIEW[kind].icon}</span>
                {VICTIM_VIEW[kind].text}
              </button>
            ))}
        </div>
        <div className="mg-list mg-drop" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          {queue.length === 0 && <p className="mg-hint">Очередь помощи</p>}
          {queue.map((kind, i) => (
            <button key={kind} className="mg-card mg-card-on" onClick={() => remove(kind)}>
              <span className="mg-num">{i + 1}</span>
              {VICTIM_VIEW[kind].text}
            </button>
          ))}
        </div>
      </div>
      <Button disabled={queue.length < victims.length} onClick={() => finish(triageMistakes(queue, groups), { sequence: queue })}>
        Готово
      </Button>
    </Frame>
  );
}
