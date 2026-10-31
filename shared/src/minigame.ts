/**
 * Контракт мини-игр. ВЛАДЕЛЕЦ реализации: Юра (client/src/minigames/).
 *
 * Мини-игра — React-компонент, который рисуется ПОВЕРХ 3D-сцены (HTML/CSS, не three.js).
 * Пока мини-игра открыта, управление персонажем выключено.
 * Реестр: client/src/minigames/index.ts → `export const minigames: Record<MinigameId, Component>`.
 */
import type { MinigameId } from "./ids";
import type { MinigameResult } from "./scenario/types";

export interface MinigameProps {
  game: MinigameId;
  /** Параметры из эффекта openMinigame: например { victims: ['bleeding','cpr'] } для triage */
  params?: Record<string, unknown>;
  /** Вызвать ровно один раз, когда игра закончена */
  onDone: (result: MinigameResult) => void;
}
