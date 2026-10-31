/**
 * Общие идентификаторы. Это словарь, на котором договариваются все модули:
 * мир (Никита) расставляет объекты с этими id, сценарий (Юра) на них реагирует,
 * ИИ (Матвей) знает, о чём говорить.
 *
 * ВЛАДЕЛЕЦ: лид. Нужен новый id — напиши лиду, не добавляй сам.
 */

export const MODES = ["solo", "coop2", "coop3"] as const;
export type Mode = (typeof MODES)[number];

/** A — внутри (верх), В — внутри (3-й этаж), Б — снаружи. В solo только inside_top. */
export const ROLES = ["inside_top", "inside_mid", "outside"] as const;
export type Role = (typeof ROLES)[number];

export type PlayerId = string;

export const NPC_IDS = [
  "papa", // отец игрока, квартира
  "vanya", // застрял в лифте
  "valentina", // пожилая соседка, 3-й этаж
  "mihalych", // сосед во дворе, партнёр в solo
  "dispatcher", // диспетчер 112
  "gromov", // спасатель-наставник, бригада и разбор
  "victim_bleeding",
  "victim_cpr",
  "victim_unconscious",
  "victim_scared",
  "neighbor_leg", // сосед с травмой ноги (coop3)
] as const;
export type NpcId = (typeof NPC_IDS)[number];

export const SKILLS = [
  "cover", // укрытие во время толчка
  "go_bag", // тревожный набор
  "gas", // запах газа
  "elevator", // не пользоваться лифтом, застрявший человек
  "smoke", // проход через задымление
  "route", // выбор безопасного маршрута
  "escort", // сопровождение, психологическая поддержка по пути
  "exit_building", // выход из подъезда, отойти от здания
  "yard_hazard", // опасности во дворе (провод)
  "call_112",
  "triage", // кому помогать первым
  "bleeding",
  "cpr",
  "recovery_position",
  "psych_support",
  "aftershock",
  "handover", // передача бригаде
] as const;
export type SkillId = (typeof SKILLS)[number];

export const STAGES = [
  "wake",
  "cover",
  "pack",
  "exit_apartment",
  "elevator",
  "smoke",
  "collapse",
  "neighbor",
  "exit_building",
  "yard_assess",
  "call_112",
  "triage",
  "first_aid",
  "aftershock",
  "handover",
  "debrief",
  "done",
] as const;
export type StageId = (typeof STAGES)[number];

export const MINIGAMES = ["go_bag", "tourniquet", "cpr", "recovery_position", "triage"] as const;
export type MinigameId = (typeof MINIGAMES)[number];

/** Предметы в квартире (сборы). Нужные + ловушки. */
export const ITEMS = [
  "documents",
  "phone",
  "first_aid_kit",
  "water",
  "flashlight",
  "warm_clothes",
  "bandage",
  "laptop", // ловушка
  "console", // ловушка
  "mugs", // ловушка
] as const;
export type ItemId = (typeof ITEMS)[number];

/**
 * Интерактивные объекты мира (игрок подходит и жмёт E).
 * Никита ставит их в чанки, Юра обрабатывает событие interact.
 */
export const INTERACTABLES = [
  "cover_table",
  "cover_wall",
  "cover_window",
  "cover_wardrobe",
  "cover_run_out",
  ...ITEMS.map((i) => `item_${i}` as const),
  "gas_valve",
  "light_switch",
  "apartment_door",
  "elevator_call",
  "elevator_shaft", // разговор с застрявшим
  "balcony_door", // переходный балкон
  "neighbor_door", // дверь Валентины Петровны
  "address_plate", // табличка с адресом на доме
  "building_plan", // план эвакуации / схема дома на стене подъезда
  "victim_bleeding",
  "victim_cpr",
  "victim_unconscious",
  "victim_scared",
  "neighbor_leg",
  "brigade", // бригада / Громов
] as const;
export type InteractableId = (typeof INTERACTABLES)[number];

/** Зоны-триггеры: событие enterZone, когда игрок в них вошёл. */
export const ZONES = [
  "z_apartment",
  "z_hall", // лестничная площадка своего этажа
  "z_stairs",
  "z_elevator",
  "z_smoke",
  "z_collapse",
  "z_balcony",
  "z_exit_door",
  "z_canopy_danger", // под треснувшим козырьком
  "z_yard",
  "z_wire_danger", // рядом с оборванным проводом
  "z_safe_area", // детская площадка, место сбора
] as const;
export type ZoneId = (typeof ZONES)[number];

/**
 * События, по которым NPC говорит (Effect npcSay → ИИ-модуль).
 * Юра их порождает, Матвей пишет под них реплики.
 */
export const NPC_EVENTS = [
  "quake_started",
  "quake_over_pack",
  "gas_smell",
  "door_jammed",
  "partner_call", // Михалыч / партнёр звонит игроку
  "elevator_met",
  "smoke_ahead",
  "collapse_found",
  "route_hint",
  "neighbor_met",
  "escort_start",
  "exit_warning",
  "yard_hazard",
  "dispatcher_open",
  "triage_start",
  "victim_help", // реплика пострадавшего во время помощи
  "aftershock",
  "brigade_arrived",
  "debrief",
  "mistake", // реакция на ошибку (context.mistake)
  "free_talk", // игрок сам написал NPC
] as const;
export type NpcEvent = (typeof NPC_EVENTS)[number];

/**
 * Слоты звонка в 112: что диспетчер должен узнать от игрока.
 * Матвей вытаскивает их из текста (ai/src/dispatcher.ts), Юра проверяет полноту.
 */
export const DISPATCHER_SLOTS = [
  "address", // адрес дома
  "what", // что случилось
  "victims", // сколько пострадавших
  "condition", // их состояние
  "trapped", // люди в лифте / под завалом
  "fire", // есть ли пожар, задымление
  "hazard", // опасности: оборванный провод, газ, козырёк
] as const;
export type DispatcherSlot = (typeof DISPATCHER_SLOTS)[number];

/** Что игрок должен сообщить бригаде (Громову) при передаче. */
export const HANDOVER_ITEMS = [
  "victims", // кто пострадал и что с ними сделали
  "tourniquet_time", // время наложения жгута
  "trapped", // кто остался в здании / в лифте
  "fire", // где пожар
  "hazard", // опасности во дворе
] as const;
export type HandoverItem = (typeof HANDOVER_ITEMS)[number];

/**
 * Итоги диалога (NpcResponse.outcome → GameEvent dialogOutcome).
 * ИИ возвращает, сценарий реагирует.
 */
export const DIALOG_OUTCOMES = [
  "calmed", // NPC успокоился (Ваня, Валентина, пострадавший)
  "panicked", // NPC запаниковал от грубости/паники игрока
  "agreed_to_go", // NPC согласился идти с игроком (Валентина)
  "slots_complete", // диспетчер 112 получил всё
  "handover_complete", // бригада получила всё
] as const;
export type DialogOutcome =
  | (typeof DIALOG_OUTCOMES)[number]
  | `slot_missing:${DispatcherSlot}`
  | `handover_missing:${HandoverItem}`;
