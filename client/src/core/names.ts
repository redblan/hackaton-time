import type { Mode, NpcId, Role, StageId } from "@game/shared";

export const NPC_NAMES: Record<NpcId, string> = {
  papa: "Папа",
  vanya: "Ваня",
  valentina: "Валентина Петровна",
  mihalych: "Михалыч",
  dispatcher: "Диспетчер 112",
  gromov: "Громов",
  victim_bleeding: "Пострадавший",
  victim_cpr: "Пострадавший",
  victim_unconscious: "Пострадавший",
  victim_scared: "Пострадавшая",
  neighbor_leg: "Сосед",
};

export const MODE_NAMES: Record<Mode, string> = {
  solo: "Одиночная игра",
  coop2: "Кооператив на двоих",
  coop3: "Кооператив на троих",
};

export const ROLE_NAMES: Record<Role, string> = {
  inside_top: "Внутри, верхний этаж",
  inside_mid: "Внутри, 3-й этаж",
  outside: "Снаружи, во дворе",
};

export const STAGE_NAMES: Record<StageId, string> = {
  wake: "Пробуждение",
  cover: "Укрытие",
  pack: "Сборы",
  exit_apartment: "Выход из квартиры",
  elevator: "Лифт",
  smoke: "Задымление",
  collapse: "Обрушение",
  neighbor: "Соседка",
  exit_building: "Выход из подъезда",
  yard_assess: "Осмотр двора",
  call_112: "Звонок 112",
  triage: "Сортировка",
  first_aid: "Первая помощь",
  aftershock: "Повторный толчок",
  handover: "Передача бригаде",
  debrief: "Разбор",
  done: "Готово",
};
