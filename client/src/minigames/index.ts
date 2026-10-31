/**
 * Реестр мини-игр. ВЛАДЕЛЕЦ: Юра. ТЗ: docs/tz/yura-gameplay.md, контракт: shared/src/minigame.ts
 * Хост: client/src/core/MinigameHost.tsx. Новая игра появляется и в игре, и в /sandbox.
 */
import type { ComponentType } from "react";
import type { MinigameId, MinigameProps } from "@game/shared";
import { Cpr } from "./Cpr";
import { GoBag } from "./GoBag";
import { RecoveryPosition } from "./RecoveryPosition";
import { Tourniquet } from "./Tourniquet";
import { Triage } from "./Triage";
import "./minigames.css";

export const minigames: Partial<Record<MinigameId, ComponentType<MinigameProps>>> = {
  go_bag: GoBag,
  tourniquet: Tourniquet,
  cpr: Cpr,
  triage: Triage,
  recovery_position: RecoveryPosition,
};
