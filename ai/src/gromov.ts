/**
 * Капитан Громов: передача пострадавших бригаде (D-24) и разбор по журналу (M5).
 * Передача — конечный автомат, как у диспетчера: пункты из текста игрока ключевыми словами,
 * на реплику — `handover_complete` или `handover_missing:<первый недостающий>`.
 * Разбор — 3–4 пункта из журнала: что получилось, самая опасная ошибка и почему,
 * объяснение берётся вариантом из базы, который игрок ещё не слышал.
 */
import {
  HANDOVER_ITEMS,
  MISTAKE_NOTES,
  SKILLS,
  type HandoverItem,
  type JournalEntry,
  type NpcRequest,
  type NpcResponse,
  type PlayerId,
  type PlayerMemory,
  type SkillId,
} from "@game/shared";
import { factsBySkill, type AiData } from "./data";
import { SLOT_PATTERNS } from "./dispatcher";
import { SKILL_NAMES } from "./prompt";
import { stripLabel } from "./text";

const ITEM_PATTERNS: Record<HandoverItem, RegExp> = {
  victims: new RegExp(`${SLOT_PATTERNS.victims.source}|мужчин|женщин|подрост|ребен|девоч|парен|сосед`),
  condition: SLOT_PATTERNS.condition,
  actions: /жгут|перевяз|повязк|прижал|прижим|давил|реаним|слр|массаж|нажим|на бок|боков|положени|успоко|вывел|увел/,
  tourniquet_time: /\d{1,2}\s*[:.]\s*\d{2}|в\s+\d{1,2}\s*(час|ч\b)|\d+\s*мин|минут\S*\s+назад|время\s+(жгута|наложен)\S*\s*\d/,
  trapped: SLOT_PATTERNS.trapped,
  fire: SLOT_PATTERNS.fire,
  hazard: SLOT_PATTERNS.hazard,
};

export function extractHandover(message: string): Set<HandoverItem> {
  const t = message.toLowerCase().replace(/ё/g, "е");
  return new Set(HANDOVER_ITEMS.filter((i) => ITEM_PATTERNS[i].test(t)));
}

/** Обязательные пункты по флагам прохождения и факту наложения жгута (D-24). */
export function requiredHandover(flags: readonly string[], tourniquet: boolean): HandoverItem[] {
  const has = (prefix: string) => flags.some((f) => f === prefix || f.startsWith(`${prefix}_`));
  return HANDOVER_ITEMS.filter((i) => {
    if (i === "tourniquet_time") return tourniquet;
    if (i === "trapped") return has("lift");
    if (i === "fire") return has("fire");
    if (i === "hazard") return has("wire") || has("gas");
    return true;
  });
}

const ASK: Record<HandoverItem, string[]> = {
  victims: ["Сколько пострадавших и кто они?", "Кто пострадал? Сколько их?"],
  condition: ["В каком они состоянии?", "Что с ними: в сознании, дышат, кровотечение?"],
  actions: ["Что уже успели сделать?", "Какую помощь оказали до нас?"],
  tourniquet_time: ["Во сколько наложили жгут? Мне нужно точное время.", "Время наложения жгута? Без него врачам не обойтись."],
  trapped: ["Кто-то остался в здании?", "В доме кто-то есть — в лифте, на этажах?"],
  fire: ["Где пожар? Какой этаж?", "Пожар есть? Где именно?"],
  hazard: ["Какие опасности во дворе?", "Что во дворе опасного — провода, газ?"],
};

const OPEN = "Капитан Громов, МЧС. Докладывай коротко: кто пострадал, в каком состоянии, что уже сделали.";
const DONE = "Принял, картина ясная. Дальше работаем мы. Доклад полный — отличная работа. Подойди потом, разберём, как всё прошло.";

/** Чем опаснее ошибка, тем раньше Громов о ней скажет. */
const DANGER: SkillId[] = [
  "bleeding", "cpr", "gas", "yard_hazard", "cover", "elevator", "triage", "recovery_position",
  "smoke", "route", "exit_building", "aftershock", "call_112", "handover", "escort", "psych_support", "go_bag",
];

/**
 * Итог прошлого прохождения (M16). Контракт PlayerMemory не меняем: храним индексы навыков (SKILLS)
 * и кодов ошибок мини-игр (MISTAKE_NOTES) в usedExplanations под служебными ключами — F3 их не показывает.
 */
const LAST_SKILLS = "run:last_skills";
const LAST_CODES = "run:last_codes";
const CODES = Object.keys(MISTAKE_NOTES);

interface LastRun {
  skills: SkillId[];
  /** skill → заметка журнала о том, что именно было не так (если это ошибка мини-игры) */
  notes: Partial<Record<SkillId, string>>;
}

function readLastRun(memory: PlayerMemory): LastRun | undefined {
  const idx = memory.usedExplanations[LAST_SKILLS];
  if (!idx) return undefined;
  const skills = idx.map((i) => SKILLS[i]).filter((s): s is SkillId => !!s);
  const notes: LastRun["notes"] = {};
  for (const i of memory.usedExplanations[LAST_CODES] ?? []) {
    const code = CODES[i];
    if (!code) continue;
    const skill = CODE_SKILL[code];
    if (skill && !notes[skill]) notes[skill] = MISTAKE_NOTES[code];
  }
  return { skills, notes };
}

function writeLastRun(memory: PlayerMemory, bad: JournalEntry[]): void {
  const skills = [...new Set(bad.map((j) => j.skill))];
  memory.usedExplanations[LAST_SKILLS] = skills.map((s) => SKILLS.indexOf(s)).filter((i) => i >= 0);
  const byNote = new Map(Object.entries(MISTAKE_NOTES).map(([code, note]) => [note, code]));
  memory.usedExplanations[LAST_CODES] = [
    ...new Set(bad.map((j) => byNote.get(j.note)).filter((c): c is string => !!c).map((c) => CODES.indexOf(c))),
  ];
}

/** Код ошибки мини-игры → навык (по префиксу кода) */
const CODE_SKILL: Record<string, SkillId> = Object.fromEntries(
  CODES.map((c) => [
    c,
    c.startsWith("bag_") ? "go_bag" : c.startsWith("tourniquet_") || c.startsWith("pressure_") ? "bleeding"
      : c.startsWith("cpr_") ? "cpr" : c.startsWith("recovery_") ? "recovery_position" : c.startsWith("triage_") ? "triage" : "handover",
  ]),
) as Record<string, SkillId>;

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const whatWasWrong = (last: LastRun, skill: SkillId) => (last.notes[skill] ? lower(last.notes[skill]!) : SKILL_NAMES[skill]);

interface HandoverState {
  said: Set<HandoverItem>;
  asked: Partial<Record<HandoverItem, number>>;
  flags: string[];
  tourniquet: boolean;
  done: boolean;
}

export interface Gromov {
  /** Ведёт ли Громов сейчас приём доклада у этого игрока */
  inHandover(playerId: PlayerId): boolean;
  handover(req: NpcRequest, memory: PlayerMemory): NpcResponse;
  /** Разбор; меняет память игрока (ошибки по навыкам, использованные объяснения) */
  debrief(req: NpcRequest, memory: PlayerMemory): NpcResponse;
  reset(playerId: PlayerId): void;
}

export function createGromov(data: AiData): Gromov {
  const reports = new Map<PlayerId, HandoverState>();
  /** Разбор уже записан в память в этом прохождении (сервер зовёт его дважды: на этапе и в конце) */
  const debriefed = new Set<PlayerId>();
  /** Итог прошлого прохождения, прочитанный до того, как разбор перезапишет его текущим */
  const lastRuns = new Map<PlayerId, LastRun | undefined>();
  const lastRunOf = (playerId: PlayerId, memory: PlayerMemory) => {
    if (!lastRuns.has(playerId)) lastRuns.set(playerId, readLastRun(memory));
    return lastRuns.get(playerId);
  };

  function stateFor(req: NpcRequest): HandoverState {
    const flags = Array.isArray(req.context.flags) ? (req.context.flags as string[]) : [];
    const facts = Array.isArray(req.context.facts) ? req.context.facts : [];
    const tourniquet = req.context.tourniquetApplied === true || facts.includes("tourniquet_applied");
    let st = reports.get(req.playerId);
    if (!st || req.event === "brigade_arrived") {
      st = { said: new Set(), asked: {}, flags, tourniquet, done: false };
      reports.set(req.playerId, st);
    }
    if (flags.length > 0) st.flags = [...new Set([...st.flags, ...flags])];
    st.tourniquet ||= tourniquet;
    return st;
  }

  function explain(skill: SkillId, memory: PlayerMemory): { text: string; factId?: string } {
    const fact = factsBySkill(data, [skill])[0];
    if (!fact) return { text: "" };
    const used = memory.usedExplanations[fact.id] ?? [];
    const idx = fact.explanations.findIndex((_, i) => !used.includes(i));
    const i = idx >= 0 ? idx : used.length % Math.max(fact.explanations.length, 1);
    if (!used.includes(i)) memory.usedExplanations[fact.id] = [...used, i];
    return { text: stripLabel(fact.explanations[i] ?? fact.fact), factId: fact.id };
  }

  return {
    inHandover: (playerId) => {
      const st = reports.get(playerId);
      return !!st && !st.done;
    },

    handover(req, memory) {
      const st = stateFor(req);
      if (req.event === "brigade_arrived" || !req.playerMessage) {
        // Встречались в прошлом прохождении — узнаёт и вспоминает, что тогда было не так (M16)
        const last = lastRunOf(req.playerId, memory);
        const worst = last?.skills.slice().sort((a, b) => DANGER.indexOf(a) - DANGER.indexOf(b))[0];
        const greet = !last
          ? ""
          : worst
            ? `А, это ты. Помню: в прошлый раз — ${whatWasWrong(last, worst)}. Посмотрим, как сегодня. `
            : "А, это ты. В прошлый раз отработал чисто — держи планку. ";
        return { text: req.event === "brigade_arrived" ? `${greet}${OPEN}` : OPEN, factIds: [], source: "template" };
      }
      for (const i of extractHandover(req.playerMessage)) st.said.add(i);
      const missing = requiredHandover(st.flags, st.tourniquet).filter((i) => !st.said.has(i));
      if (missing.length === 0) {
        st.done = true;
        return { text: DONE, factIds: [], outcome: "handover_complete", source: "template" };
      }
      const item = missing[0]!;
      const n = st.asked[item] ?? 0;
      st.asked[item] = n + 1;
      const ask = ASK[item];
      return { text: `Понял. ${ask[n % ask.length]}`, factIds: [], outcome: `handover_missing:${item}`, source: "template" };
    },

    debrief(req, memory) {
      const journal = (Array.isArray(req.context.journal) ? req.context.journal : []) as JournalEntry[];
      const mine = journal.filter((j) => !j.playerId || j.playerId === req.playerId);
      const ok = [...new Set(mine.filter((j) => j.outcome === "ok").map((j) => j.skill))];
      const bad = mine.filter((j) => j.outcome !== "ok");
      const badSkills = [...new Set(bad.map((j) => j.skill))].sort((a, b) => DANGER.indexOf(a) - DANGER.indexOf(b));

      const parts: string[] = [];
      const factIds: string[] = [];
      // Сравниваем с прошлым прохождением, а не со всей историей: «Опять» — только если и тогда было (M16)
      const last = lastRunOf(req.playerId, memory);
      if (ok.length > 0) {
        parts.push(`Хорошо: ${ok.slice(0, 3).map((s) => SKILL_NAMES[s]).join(", ")}.`);
      } else {
        parts.push("До конца добрались — это уже немало.");
      }
      const fixed = last?.skills.filter((s) => !badSkills.includes(s)).sort((a, b) => DANGER.indexOf(a) - DANGER.indexOf(b))[0];
      if (last && fixed) parts.push(`В прошлый раз — ${whatWasWrong(last, fixed)}, сегодня — чисто. Вот это прогресс.`);
      const worst = badSkills[0];
      if (worst) {
        const note = bad.find((j) => j.skill === worst)?.note;
        const before = !!last?.skills.includes(worst);
        const e = explain(worst, memory);
        if (e.factId) factIds.push(e.factId);
        parts.push(
          `${before ? "Опять " : "Главное, что запомнить: "}${SKILL_NAMES[worst]}${note ? ` — ${note.charAt(0).toLowerCase()}${note.slice(1)}` : ""}.`,
        );
        if (e.text) parts.push(e.text);
      }
      const second = badSkills[1];
      if (second) parts.push(`И ещё потренируй: ${SKILL_NAMES[second]}.`);
      parts.push(bad.length === 0 ? "Чисто, без ошибок. В следующий раз будет сложнее." : "Пройди ещё раз — ситуация будет другой.");

      if (!debriefed.has(req.playerId)) {
        debriefed.add(req.playerId);
        for (const s of badSkills) memory.mistakes[s] = (memory.mistakes[s] ?? 0) + 1;
        writeLastRun(memory, bad);
      }
      return { text: parts.join(" "), factIds, source: "template" };
    },

    reset(playerId) {
      reports.delete(playerId);
      debriefed.delete(playerId);
      lastRuns.delete(playerId);
    },
  };
}
