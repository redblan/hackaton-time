/**
 * Диспетчер 112 — конечный автомат (DECISIONS D-17, D-23, D-62).
 * Слоты вытаскиваются из текста игрока ключевыми словами, без модели: так ответ мгновенный
 * и одинаковый на демо. На каждую реплику — `slots_complete` или `slot_missing:<первый недостающий>`.
 */
import { teamKey } from "./team";
import { numberWordsToDigits } from "./text";
import { DISPATCHER_SLOTS, type DispatcherSlot, type NpcRequest, type NpcResponse, type PlayerId } from "@game/shared";

export const SLOT_PATTERNS: Record<Exclude<DispatcherSlot, "address">, RegExp> = {
  what: /землетряс|толч|тряс|обруш|рухну|разруш|трещин|сейсм/,
  victims: /(\d+|один|одна|двое|два|две|трое|три|четверо|четыре|пятеро|пять|несколько|много)\s*(\S+\s+)?(пострадав|ранен|человек|люд|раненых|лежат|мужчин|женщин|ребен|ребён|подрост)|(пострадав|раненых)\S*\s*(\d+|один|одна|двое|два|две|трое|три|четверо|четыре|пятеро|пять)/,
  condition: /кровотеч|кров|не дыш|дыш|сознан|перелом|травм|ранен|обморок|без чувств|не отвеча|сердц/,
  trapped: /лифт|застрял|застряв|заблокир|завал|под обломк|не может выйти/,
  fire: /пожар|дым|гори|огонь|задымл|пламя/,
  hazard: /провод|искр|(^|[^а-я])ток([^а-я]|$)|столб|напряжен|газ|козыр|обрыв|оборван/,
};

/** «ул. Садовая, 14» → основа улицы «садов» и номер «14» */
function addressParts(address: string): { street: string; house: string } | null {
  const m = address.toLowerCase().replace(/ё/g, "е").match(/(?:ул\.|улица|пр\.|проспект|пер\.|переулок)?\s*([а-я]+)\D*(\d+)/);
  if (!m?.[1] || !m[2]) return null;
  return { street: m[1].slice(0, Math.max(4, m[1].length - 2)), house: m[2] };
}

export function extractSlots(message: string, address?: string): Set<DispatcherSlot> {
  // Голос (whisper) пишет числа словами: «садовая четырнадцать» — тоже адрес
  const t = numberWordsToDigits(message.toLowerCase().replace(/ё/g, "е"));
  const found = new Set<DispatcherSlot>();
  const parts = address ? addressParts(address) : null;
  if (parts) {
    if (t.includes(parts.street) && new RegExp(`(^|\\D)${parts.house}(\\D|$)`).test(t)) found.add("address");
  } else if (/(улиц|ул\.|проспект|пр\.|переул|дом)\s*\S+.*\d+/.test(t) || /(^|[\s,])[а-я]{4,}(ая|ий|ой|ов|ин|ая улица)?,?\s+(д\.?\s*|дом\s*)?\d{1,3}([^\d]|$)/.test(t) && !/пострадав|человек|раненых|этаж/.test(t)) {
    // Адрес прохождения неизвестен (консольный чат) — засчитываем «Садовая 14»
    found.add("address");
  }
  for (const [slot, re] of Object.entries(SLOT_PATTERNS) as [DispatcherSlot, RegExp][]) {
    if (re.test(t)) found.add(slot);
  }
  return found;
}

/** Обязательные слоты этого прохождения по флагам мира (D-23). */
export function requiredSlots(flags: readonly string[]): DispatcherSlot[] {
  const has = (prefix: string) => flags.some((f) => f === prefix || f.startsWith(`${prefix}_`));
  return DISPATCHER_SLOTS.filter((s) => {
    if (s === "trapped") return has("lift");
    if (s === "fire") return has("fire");
    if (s === "hazard") return has("wire") || has("gas");
    return true;
  });
}

const QUESTIONS: Record<DispatcherSlot, string[]> = {
  address: ["Назовите точный адрес: улица и номер дома.", "Адрес? Улица и дом — посмотрите на табличку на доме."],
  what: ["Что именно произошло?", "Опишите, что случилось."],
  victims: ["Сколько пострадавших?", "Сколько человек нуждается в помощи?"],
  condition: ["В каком они состоянии? Есть кровотечение, кто-то без сознания, не дышит?", "Опишите состояние пострадавших: в сознании, дышат, есть кровотечение?"],
  trapped: ["Остались ли люди в здании — в лифте, под завалом?", "Кто-то заблокирован внутри? Лифт, завалы?"],
  fire: ["Есть пожар или задымление? На каком этаже?", "Видите огонь или дым? Где именно?"],
  hazard: ["Есть ли опасность на месте — оборванные провода, запах газа?", "Что опасного рядом: провода, газ, падающие конструкции?"],
};

const ACK: Partial<Record<DispatcherSlot, string>> = {
  address: "Адрес записала.",
  what: "Поняла, землетрясение.",
  victims: "Количество записала.",
  condition: "Состояние приняла.",
  trapped: "Про людей в здании передам спасателям.",
  fire: "Пожарных направлю.",
  hazard: "Энергетиков и газовую службу предупрежу.",
};

const OPEN = "Служба спасения, 112. Что у вас случилось? Говорите спокойно и по порядку: адрес, что произошло, сколько пострадавших.";
const DONE =
  "Всё записала. Бригада и спасатели уже выезжают. Оставайтесь на безопасном месте, к опасным участкам не подходите и помогайте пострадавшим до приезда бригады.";

interface CallState {
  said: Set<DispatcherSlot>;
  asked: Partial<Record<DispatcherSlot, number>>;
  flags: string[];
  address?: string;
}

export interface Dispatcher {
  respond(req: NpcRequest): NpcResponse;
  reset(playerId: PlayerId): void;
}

export function createDispatcher(): Dispatcher {
  const calls = new Map<PlayerId, CallState>();

  function stateFor(req: NpcRequest): CallState {
    const flags = Array.isArray(req.context.flags) ? req.context.flags : [];
    const address = typeof req.context.address === "string" ? req.context.address : undefined;
    const key = teamKey(req);
    let st = calls.get(key);
    if (!st || req.event === "dispatcher_open") {
      st = { said: new Set(), asked: {}, flags, address };
      calls.set(key, st);
    }
    // Флаги и адрес могут прийти позже (сервер шлёт контекст с каждой репликой)
    if (flags.length > 0) st.flags = [...new Set([...st.flags, ...flags])];
    if (address) st.address = address;
    return st;
  }

  function slotsObject(st: CallState): Record<string, string> {
    return Object.fromEntries([...st.said].map((s) => [s, "да"]));
  }

  return {
    respond(req) {
      const st = stateFor(req);
      if (req.event === "dispatcher_open" || !req.playerMessage) {
        return { text: OPEN, factIds: [], source: "template", slots: slotsObject(st) };
      }
      const fresh = [...extractSlots(req.playerMessage, st.address)].filter((s) => !st.said.has(s));
      for (const s of fresh) st.said.add(s);

      const missing = requiredSlots(st.flags).filter((s) => !st.said.has(s));
      const ack = fresh.map((s) => ACK[s]).filter(Boolean).slice(0, 2).join(" ");
      if (missing.length === 0) {
        return { text: [ack, DONE].filter(Boolean).join(" "), factIds: [], outcome: "slots_complete", source: "template", slots: slotsObject(st) };
      }
      const slot = missing[0]!;
      const n = st.asked[slot] ?? 0;
      st.asked[slot] = n + 1;
      const variants = QUESTIONS[slot];
      const question = variants[n % variants.length]!;
      return {
        text: [ack, question].filter(Boolean).join(" "),
        factIds: [],
        outcome: `slot_missing:${slot}`,
        source: "template",
        slots: slotsObject(st),
      };
    },
    reset(playerId) {
      calls.delete(playerId);
    },
  };
}
