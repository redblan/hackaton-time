import type { AgentFlag, NpcRequest, WorldEvent, NpcId } from "@game/shared";
import type { Intent } from "./intents";
export function agentAction(intent: Intent, req: NpcRequest, hook?: (id: string, flag: AgentFlag) => boolean): string | null {
  const quake = req.context.stage === "wake" || req.context.stage === "cover";
  const gas = req.context.flags.some(f => f === "gas" || f.startsWith("gas_")) || (req.context.stage === "pack" && !req.context.facts.includes("gas_closed"));
  if (intent === "elevator") return "Лифтом при землетрясении и пожаре не пользуются. Иди по безопасной лестнице.";
  if (intent === "light" && (quake || gas)) return quake ? "Пока трясёт, оставайся в укрытии, выключатель не трогай." : "При запахе газа свет не включаем: искра от выключателя опасна.";
  if (intent === "window") return quake ? "Сейчас окно не трогай: стекло может разбиться. Держись подальше от окон." : gas ? "После толчка при запахе газа можно открыть окно для проветривания. Выключатели не трогай." : "Толчок закончился. Окно можно открыть, если стекло и рама целы.";
  if (intent === "neighbors") return "Позови соседей голосом и предложи идти вместе по безопасному пути.";
  const actions: Partial<Record<Intent, [AgentFlag, string]>> = {
    first_aid: ["spawn_first_aid", "Аптечка в шкафчике у стола в стартовой квартире."],
    ladder: ["spawn_ladder", "Лестница сбоку от входа в подъезд."],
    blankets: ["spawn_blankets", "Одеяла и вода у места сбора на детской площадке."],
    water: ["spawn_blankets", "Вода и одеяла у места сбора на детской площадке."],
    exit: ["spawn_exit", "Второй выход открыт на первом этаже первого подъезда."],
    light: ["power_on", "Фонарь во дворе включён."],
  };
  const action = actions[intent];
  if (!action || !hook) return null;
  try {
    if (!hook(req.playerId, action[0])) return "Повторно включить это действие не получилось: оно уже выполнено или недоступно. Проверь место у предмета.";
    return action[1];
  } catch { return "Сейчас не получилось изменить мир. Сообщи спасателям, что нужно."; }
}
export function worldReaction(e: WorldEvent): { npcId: NpcId; text: string } | null {
  if (e.type === "flag_set") {
    const replies: Record<string, string> = {spawn_first_aid:"Аптечка в шкафчике у стола.",spawn_ladder:"Лестница сбоку от входа в подъезд.",spawn_blankets:"Одеяла и вода у места сбора.",spawn_exit:"На первом этаже первого подъезда открыт второй выход.",power_on:"Фонарь во дворе включён."};
    return replies[e.flag] ? {npcId:"mihalych",text:replies[e.flag]!} : null;
  }
  if (/огнетуш|extinguisher/i.test(e.label + e.propId) && e.type === "prop_picked") return {npcId:"mihalych",text:"Взял огнетушитель. Держи путь отхода свободным, в дым не заходи."};
  if (/аптеч|first.?aid|medkit/i.test(e.label + e.propId)) {
    if (e.type === "prop_thrown") return {npcId:"papa",text:"Аптечку не бросай! Подними и не потеряй."};
    if (e.type === "prop_dropped") return {npcId:"papa",text:"Аптечку положил? Запомни место, она ещё пригодится."};
    return {npcId:"papa",text:"Аптечку взял — хорошо, держи её при себе."};
  }
  return null;
}
