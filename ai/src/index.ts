/**
 * ИИ-модуль. ВЛАДЕЛЕЦ: Матвей. ТЗ: docs/tz/matvey-ai.md
 * Сейчас ЗАГЛУШКА с правильной сигнатурой, чтобы сервер уже мог её вызывать.
 */
import type { AiModule, AiOptions, NpcRequest, NpcResponse } from "@game/shared";

export function createAi(_opts: AiOptions): AiModule {
  return {
    async say(req: NpcRequest): Promise<NpcResponse> {
      return { text: `[${req.npcId}] (${req.event}) …`, factIds: [], source: "template" };
    },
  };
}
