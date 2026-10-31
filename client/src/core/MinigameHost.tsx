/**
 * Хост мини-игр: по эффекту openMinigame показывает компонент Юры из реестра client/src/minigames,
 * результат — ровно один раз — уходит на сервер как game:event minigameResult.
 * Нет игры в реестре — заглушка с кнопками «успех / провал», чтобы сценарий можно было пройти.
 */
import { Component, useCallback, useRef, type ReactNode } from "react";
import type { MinigameId, MinigameResult, SkillId } from "@game/shared";
import { minigames } from "../minigames";
import { sendEvent } from "./net";
import { store, useStore } from "./store";
import { Button } from "./ui";

export const MINIGAME_SKILL: Record<MinigameId, SkillId> = {
  go_bag: "go_bag",
  tourniquet: "bleeding",
  cpr: "cpr",
  recovery_position: "recovery_position",
  triage: "triage",
};

export const MINIGAME_NAMES: Record<MinigameId, string> = {
  go_bag: "Тревожный рюкзак",
  tourniquet: "Жгут",
  cpr: "Сердечно-лёгочная реанимация",
  recovery_position: "Восстановительное положение",
  triage: "Сортировка пострадавших",
};

class Boundary extends Component<{ children: ReactNode; onCrash: (e: Error) => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    this.props.onCrash(error);
  }
  render() {
    return this.state.error ? null : this.props.children;
  }
}

function Placeholder({ game, onDone }: { game: MinigameId; onDone: (r: MinigameResult) => void }) {
  const started = useRef(performance.now());
  const finish = (ok: boolean) =>
    onDone({
      game,
      skill: MINIGAME_SKILL[game],
      ok,
      mistakes: ok ? [] : ["placeholder_fail"],
      timeMs: Math.round(performance.now() - started.current),
      data: { placeholder: true },
    });
  return (
    <div className="card">
      <h2>{MINIGAME_NAMES[game]}</h2>
      <p className="muted">Мини-игра ещё не готова (client/src/minigames). Заглушка:</p>
      <div className="row">
        <Button onClick={() => finish(true)}>Засчитать</Button>
        <Button variant="danger" onClick={() => finish(false)}>
          Провалить
        </Button>
      </div>
    </div>
  );
}

/** Показать одну мини-игру. onDone вызывается не больше одного раза. */
export function MinigameHost(props: { game: MinigameId; params?: Record<string, unknown>; onDone: (r: MinigameResult) => void }) {
  const done = useRef(false);
  const { onDone, game } = props;
  const once = useCallback(
    (r: MinigameResult) => {
      if (done.current) return;
      done.current = true;
      onDone(r);
    },
    [onDone],
  );
  const Game = minigames[game];
  const crash = (e: Error) => {
    console.error(`[minigame] ${game} упала:`, e);
    once({ game, skill: MINIGAME_SKILL[game], ok: false, mistakes: ["minigame_crashed"], timeMs: 0 });
  };
  return (
    <div className="minigame">
      {Game ? (
        <Boundary onCrash={crash}>
          <Game game={game} params={props.params} onDone={once} />
        </Boundary>
      ) : (
        <Placeholder game={game} onDone={once} />
      )}
    </div>
  );
}

/** Оверлей в игре: открыт, пока в сторе есть minigame. */
export function MinigameOverlay() {
  const mg = useStore((s) => s.minigame);
  const onDone = useCallback((result: MinigameResult) => {
    sendEvent({ type: "minigameResult", result });
    store.set({ minigame: null });
  }, []);
  if (!mg) return null;
  return (
    <div className="overlay">
      <MinigameHost key={mg.key} game={mg.game} params={mg.params} onDone={onDone} />
    </div>
  );
}
