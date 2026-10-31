import type { Ctx } from "../context";
import type { GameEvent } from "../types";

export interface StageDef {
  /** Подсказка в HUD */
  hint: string;
  enter?: (ctx: Ctx) => void;
  on?: (ctx: Ctx, event: GameEvent) => void;
}
