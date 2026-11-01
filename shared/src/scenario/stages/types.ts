import type { Ctx } from "../context";
import type { GameEvent, RunState } from "../types";

export interface StageDef {
  /** Подсказка в HUD */
  hint: string | ((state: RunState) => string);
  enter?: (ctx: Ctx) => void;
  on?: (ctx: Ctx, event: GameEvent) => void;
}
