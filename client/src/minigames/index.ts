/**
 * Реестр мини-игр. ВЛАДЕЛЕЦ: Юра. ТЗ: docs/tz/yura-gameplay.md, контракт: shared/src/minigame.ts
 * Хост: client/src/core/MinigameHost.tsx. Новая игра появляется и в игре, и в /sandbox.
 */
import type { ComponentType } from "react";
import type { MinigameId, MinigameProps } from "@game/shared";
import { Cpr } from "./Cpr";
import { GoBag } from "./GoBag";
import { withOutcome } from "./Outcome";
import { RecoveryPosition } from "./RecoveryPosition";
import { Tourniquet } from "./Tourniquet";
import { Triage } from "./Triage";
import "./minigames.css";

export const minigames: Partial<Record<MinigameId, ComponentType<MinigameProps>>> = {
  go_bag: withOutcome(GoBag),
  tourniquet: withOutcome(Tourniquet),
  cpr: withOutcome(Cpr),
  triage: withOutcome(Triage),
  recovery_position: withOutcome(RecoveryPosition),
};
