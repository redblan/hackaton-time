/**
 * Реестр мини-игр. ВЛАДЕЛЕЦ: Юра. ТЗ: docs/tz/yura-gameplay.md, контракт: shared/src/minigame.ts
 * Пока пусто — хост (client/src/core/MinigameHost.tsx) показывает заглушку с кнопками «успех/провал».
 * Добавь игру: `go_bag: GoBag,` — и она сразу появится в игре и в /sandbox.
 */
import type { ComponentType } from "react";
import type { MinigameId, MinigameProps } from "@game/shared";

export const minigames: Partial<Record<MinigameId, ComponentType<MinigameProps>>> = {};
