/** F1 / H — управление, цель этапа, настройки. */
import { NPC_NAMES, STAGE_NAMES } from "./names";
import { setSensitivity, store, useStore } from "./store";
import { Button } from "./ui";

const KEYS: [string, string][] = [
  ["W A S D", "ходить"],
  ["Shift", "бежать"],
  ["Пробел", "прыжок"],
  ["Мышь", "смотреть (сначала кликните по сцене)"],
  ["E", "действие рядом: укрыться, открыть, помочь"],
  ["Enter", "сказать NPC, который рядом"],
  ["T", "рация: написать напарникам"],
  ["Tab", "в поле ввода — кому пишем"],
  ["Esc", "отпустить мышь"],
  ["F1 / H", "эта подсказка"],
  ["F3 / `", "что под капотом (для жюри)"],
];

export function Help() {
  const open = useStore((s) => s.help);
  const stage = useStore((s) => s.stage);
  const nearNpc = useStore((s) => s.nearNpc);
  const sensitivity = useStore((s) => s.sensitivity);
  if (!open) return null;
  return (
    <div className="overlay" onClick={() => store.set({ help: false })}>
      <div className="card card-wide" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h1>Как играть</h1>
          <Button variant="ghost" onClick={() => store.set({ help: false })}>
            Закрыть
          </Button>
        </div>
        {stage && (
          <p className="help-goal">
            <b>Сейчас: {STAGE_NAMES[stage.stage]}.</b> {stage.hint}
            {nearNpc && <> · Рядом: {NPC_NAMES[nearNpc]} — нажмите Enter, чтобы поговорить.</>}
          </p>
        )}
        <div className="help-keys">
          {KEYS.map(([k, v]) => (
            <div key={k} className="help-key">
              <kbd>{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <label className="small">
          Чувствительность мыши: {sensitivity.toFixed(1)}
          <input type="range" min={0.3} max={3} step={0.1} value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} />
        </label>
        <p className="muted small">
          Игра учит действовать при землетрясении. Ошибки не наказывают — после прохождения спасатель Громов разберёт их с вами.
        </p>
      </div>
    </div>
  );
}
