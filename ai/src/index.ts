/**
 * ИИ-модуль. ВЛАДЕЛЕЦ: Матвей. ТЗ: docs/tz/matvey-ai.md
 *
 * На каждый запрос: выбираем факты из базы (с учётом памяти игрока) → собираем промпт →
 * локальная Ollama стримом → если модель молчит дольше таймаута, шаблон из карточки,
 * который этот игрок ещё не слышал → обновляем память.
 */
import type { AiModule, AiOptions, NpcRequest, NpcResponse, PlayerId, PlayerMemory, StageId } from "@game/shared";
import { factsBySkill, loadData, type AiData } from "./data";
import { createDispatcher } from "./dispatcher";
import { createGromov } from "./gromov";
import { RECENT_LIMIT } from "./memory";
import { ollamaChat } from "./ollama";
import { createLlmQueue, type QueueStats } from "./queue";
import { buildMessages, CALLS_BY_NAME, cleanReply, EMOTIONAL, playerName, RADIO_HINTS, SKILL_NAMES, type Plan, type PlannedFact } from "./prompt";
import { partnerNames } from "./team";
import { detectInjection, detectTone, looksBroken, searchFacts, stripLabel } from "./text";
import type { KnowledgeFact, NpcCard } from "./types";

export { createFileMemory, createInMemoryStore, emptyMemory } from "./memory";
export { createDispatcher, extractSlots, requiredSlots } from "./dispatcher";
export { createGromov, extractHandover, requiredHandover } from "./gromov";
export { createLlmQueue, QueueSkip, type QueueStats } from "./queue";
export { createStt, SttError, type Stt } from "./stt";
export { createTts, DEFAULT_VOICES, speakable, type Tts } from "./tts";
export { loadData, unverifiedFacts } from "./data";
export type { KnowledgeFact, NpcCard, NpcVoice } from "./types";

export interface CreateAiOptions extends AiOptions {
  /** Свои данные вместо ai/knowledge и ai/npcs — для тестов */
  data?: AiData;
  /** Подмена fetch — для тестов */
  fetchImpl?: typeof fetch;
  /** Сколько запросов к модели одновременно. По умолчанию 1 или AI_LLM_CONCURRENCY (M10) */
  llmConcurrency?: number;
  /** Сколько запросов может ждать очереди. По умолчанию 3 или AI_LLM_QUEUE */
  llmMaxQueue?: number;
}

/** AiModule + состояние очереди к модели (для F3-оверлея и логов сервера) */
export type Ai = AiModule & { llmStats(): QueueStats };

const envInt = (name: string): number | undefined => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : undefined;
};


/** Ключ шаблона в memory.toldFacts: так помним, какие шаблоны игрок уже слышал. */
const tplKey = (npcId: string, event: string, i: number) => `tpl:${npcId}.${event}.${i}`;

const FALLBACK_CARD = (id: NpcCard["id"]): NpcCard => ({
  id,
  name: id,
  role: "житель дома",
  personality: "взволнован, но держится",
  speech: "Короткие фразы.",
  events: {},
});

export function createAi(opts: CreateAiOptions): Ai {
  const data = opts.data ?? loadData();
  const url = opts.ollamaUrl ?? "http://127.0.0.1:11434";
  const model = opts.model ?? "qwen2.5:7b-instruct";
  // Таймаут первого слова: опция → AI_TIMEOUT_MS из .env → 6 с (M19: рекомендация в DECISIONS)
  const timeoutMs = opts.timeoutMs ?? envInt("AI_TIMEOUT_MS") ?? 6000;
  /** Кого игрок уже встретил в текущем прохождении: `${playerId}:${npcId}` */
  const metThisRun = new Set<string>();
  const queue = createLlmQueue({
    concurrency: opts.llmConcurrency ?? envInt("AI_LLM_CONCURRENCY") ?? 1,
    maxQueue: opts.llmMaxQueue ?? envInt("AI_LLM_QUEUE") ?? 3,
  });
  const dispatcher = createDispatcher();
  const gromov = createGromov(data);

  function pickExplanation(memory: PlayerMemory, fact: KnowledgeFact): number {
    const used = memory.usedExplanations[fact.id] ?? [];
    const n = Math.max(fact.explanations.length, 1);
    for (let i = 0; i < n; i++) if (!used.includes(i)) return i;
    // Все варианты уже были — по кругу, начиная с самого давнего
    return used[used.length % n] ?? 0;
  }

  function plan(req: NpcRequest, memory: PlayerMemory): Plan {
    const card = data.cards.get(req.npcId) ?? FALLBACK_CARD(req.npcId);
    const eventCard = card.events[req.event];
    const ids = new Set(eventCard?.facts ?? []);
    let mistakeNote: string | undefined;

    const mistake = req.context.mistake;
    // TODO(Q-05): коды ошибок от сценария; пока ждём id интерактива/зоны, см. mistakes в ai/knowledge
    if (req.event === "mistake" && mistake) {
      const related = factsBySkill(data, [mistake.skill]);
      const withNote = related.find((f) => f.mistakes?.[mistake.code]) ?? related[0];
      if (withNote) {
        ids.add(withNote.id);
        mistakeNote = withNote.mistakes?.[mistake.code];
      }
    }
    const injection = detectInjection(req.playerMessage);
    if (req.playerMessage && !injection) {
      const pool = card.skills ? factsBySkill(data, card.skills) : [...data.facts.values()];
      for (const f of searchFacts(req.playerMessage, pool)) ids.add(f.id);
    }

    const facts: PlannedFact[] = [...ids]
      .map((id) => data.facts.get(id))
      .filter((f): f is KnowledgeFact => f !== undefined)
      .map((fact) => ({ fact, told: memory.toldFacts[fact.id] ?? 0, explanation: pickExplanation(memory, fact) }));

    const weakSkills = [...new Set(facts.map((p) => p.fact.skill))].filter(
      (s) => (memory.mistakes[s] ?? 0) > 0 && !(req.event === "mistake" && s === mistake?.skill),
    );
    const firstThisRun = !metThisRun.has(`${req.playerId}:${req.npcId}`);
    const recognized = firstThisRun && (memory.npc[req.npcId]?.met ?? 0) > 0;
    return {
      card,
      eventCard,
      facts,
      weakSkills,
      recognized,
      firstThisRun,
      injection,
      mistakeNote,
      tone: injection ? "neutral" : detectTone(req.playerMessage),
    };
  }

  function outcomeOf(req: NpcRequest, p: Plan, memory: PlayerMemory): string | undefined {
    if (!EMOTIONAL.has(req.npcId) || !req.playerMessage) return undefined;
    if (p.tone === "rude" || p.tone === "panic") return "panicked";
    if (p.tone !== "calm") return undefined;
    if (req.npcId === "valentina") {
      // Соглашается уйти, если ей доверяют (помогли в прошлый раз или успокаивали уже не раз) или предложили взять кота
      const trust = memory.npc.valentina?.trust ?? 0;
      if (trust >= 2 || /кот|переноск/i.test(req.playerMessage)) return "agreed_to_go";
    }
    return "calmed";
  }

  /** Шаблон, который игрок ещё не слышал. Если слышал все — самый редкий, коротко. */
  function templateReply(req: NpcRequest, p: Plan, memory: PlayerMemory, outcome?: string): { text: string; key?: string } {
    const parts: string[] = [];
    if (p.recognized && p.card.recognize?.length) parts.push(pickLeastUsed(memory, req.npcId, "recognize", p.card.recognize).text);

    // Напоминание о прошлой ошибке в этой теме — один раз за прохождение у этого NPC
    const weak = p.weakSkills[0];
    if (weak && p.firstThisRun && !EMOTIONAL.has(req.npcId) && req.event !== "mistake") {
      parts.push(`В прошлый раз тут было непросто — ${SKILL_NAMES[weak]}. Будь внимательнее.`);
    }

    const reaction = outcome === "panicked" ? p.card.reactions?.panicked : outcome ? p.card.reactions?.calmed : undefined;
    if (reaction?.length) parts.push(pickLeastUsed(memory, req.npcId, `reaction_${outcome}`, reaction).text);

    let key: string | undefined;
    const templates = p.eventCard?.templates ?? [];
    if (templates.length > 0 && req.event !== "free_talk") {
      const t = pickLeastUsed(memory, req.npcId, req.event, templates);
      parts.push(t.text);
      key = t.key;
    }
    if (p.mistakeNote) parts.push(p.mistakeNote);
    // Свободный разговор и факты, которых нет в шаблоне, — из базы знаний с неиспользованным объяснением
    if (req.event === "free_talk" || templates.length === 0) {
      // Ваня, Валентина, пострадавшие сами не учат: их факты — подсказка игроку, как с ними говорить
      const f = EMOTIONAL.has(req.npcId) ? undefined : p.facts[0];
      if (reaction?.length && !f) {
        // реакция на тон уже прозвучала
      } else if (f) parts.push(`${f.told > 0 ? "Я уже говорил, коротко: " : ""}${stripLabel(f.fact.explanations[f.explanation] ?? f.fact.fact)}`);
      else if (req.context.channel === "radio" && RADIO_HINTS[req.context.stage as StageId]) {
        parts.push(`${RADIO_HINTS[req.context.stage as StageId]} Приём.`);
      } else if (templates.length > 0) {
        const t = pickLeastUsed(memory, req.npcId, req.event, templates);
        parts.push(t.text);
        key = t.key;
      } else parts.push("Не знаю точно. Спросим у спасателей, когда приедут.");
    }
    // Кооп: папа и Михалыч один раз за прохождение напоминают держаться вместе с напарниками (M17)
    const team = partnerNames(req);
    if (team.length > 0 && p.firstThisRun && (req.npcId === "papa" || req.npcId === "mihalych") && req.event !== "mistake") {
      parts.push(`${team.join(", ")} — на связи. Держитесь вместе и говорите друг другу, что видите.`);
    }
    // Иногда — по имени: каждая третья реплика этого NPC игроку (M14)
    const name = playerName(req);
    const said = memory.recent.filter((r) => r.npcId === req.npcId && r.from === "npc").length;
    if (name && CALLS_BY_NAME(req.npcId) && said % 3 === 0 && parts.length > 0 && !parts[0]!.startsWith("(")) {
      parts[0] = `${name}, ${parts[0]!.charAt(0).toLowerCase()}${parts[0]!.slice(1)}`;
    }
    return { text: parts.join(" "), key };
  }

  function pickLeastUsed(memory: PlayerMemory, npcId: string, slot: string, list: string[]): { text: string; key: string } {
    let best = 0;
    for (let i = 1; i < list.length; i++) {
      if ((memory.toldFacts[tplKey(npcId, slot, i)] ?? 0) < (memory.toldFacts[tplKey(npcId, slot, best)] ?? 0)) best = i;
    }
    const key = tplKey(npcId, slot, best);
    memory.toldFacts[key] = (memory.toldFacts[key] ?? 0) + 1;
    return { text: list[best] ?? "", key };
  }

  /** Факты, которые NPC действительно произнёс (у эмоциональных NPC факты — только подсказка для модели) */
  const spoken = (req: NpcRequest, p: Plan): PlannedFact[] => (EMOTIONAL.has(req.npcId) ? [] : p.facts);

  function remember(req: NpcRequest, p: Plan, memory: PlayerMemory, text: string, outcome?: string): void {
    for (const f of spoken(req, p)) {
      memory.toldFacts[f.fact.id] = (memory.toldFacts[f.fact.id] ?? 0) + 1;
      const used = memory.usedExplanations[f.fact.id] ?? [];
      if (!used.includes(f.explanation)) used.push(f.explanation);
      memory.usedExplanations[f.fact.id] = used;
    }
    if (req.event === "mistake" && req.context.mistake) {
      const s = req.context.mistake.skill;
      memory.mistakes[s] = (memory.mistakes[s] ?? 0) + 1;
    }
    const runKey = `${req.playerId}:${req.npcId}`;
    const rel = memory.npc[req.npcId] ?? { met: 0, trust: 0 };
    if (!metThisRun.has(runKey)) {
      metThisRun.add(runKey);
      rel.met += 1;
    }
    if (outcome === "calmed" || outcome === "agreed_to_go") rel.trust += 1;
    if (outcome === "panicked") rel.trust -= 1;
    memory.npc[req.npcId] = rel;

    const now = Date.now();
    if (req.playerMessage) memory.recent.push({ npcId: req.npcId, from: "player", text: req.playerMessage, at: now });
    memory.recent.push({ npcId: req.npcId, from: "npc", text, at: now });
    memory.recent = memory.recent.slice(-RECENT_LIMIT);
  }

  async function respond(req: NpcRequest, onToken?: (t: string) => void, onOutcome?: (outcome: string) => void): Promise<NpcResponse> {
    // Диспетчер 112 и доклад/разбор Громова — конечные автоматы без модели: отвечают сразу и одинаково
    const fsm =
      req.npcId === "dispatcher"
        ? (_m: PlayerMemory) => dispatcher.respond(req)
        : req.npcId === "gromov" && req.event === "debrief"
          ? (m: PlayerMemory) => gromov.debrief(req, m)
          : req.npcId === "gromov" && (req.event === "brigade_arrived" || (req.event === "free_talk" && gromov.inHandover(req)))
            ? (m: PlayerMemory) => gromov.handover(req, m)
            : undefined;
    if (fsm) {
      const memory = await opts.memory.get(req.playerId);
      const res = fsm(memory);
      // D-68: итог — в сценарий сразу, ещё до текста реплики
      if (res.outcome) onOutcome?.(res.outcome);
      onToken?.(res.text);
      const now = Date.now();
      if (req.playerMessage) memory.recent.push({ npcId: req.npcId, from: "player", text: req.playerMessage, at: now });
      memory.recent.push({ npcId: req.npcId, from: "npc", text: res.text, at: now });
      memory.recent = memory.recent.slice(-RECENT_LIMIT);
      await opts.memory.save(memory);
      return res;
    }
    const memory = await opts.memory.get(req.playerId);
    const p = plan(req, memory);
    const outcome = outcomeOf(req, p, memory);
    // D-68: итог известен до модели (тон игрока) — отдаём сразу, один раз; в ответе он тот же
    if (outcome) onOutcome?.(outcome);

    let text: string;
    let source: NpcResponse["source"];
    try {
      if (p.injection) throw new Error("попытка вывести NPC из роли — отвечаем шаблоном");
      // Через очередь: срок — timeoutMs с момента запроса, а не с момента, когда дошла очередь
      const raw = await queue.run(req.playerId, timeoutMs, (remaining) =>
        ollamaChat({
          url,
          model,
          timeoutMs: remaining,
          totalMs: timeoutMs * 3,
          messages: buildMessages(req, p, memory),
          onToken,
          fetchImpl: opts.fetchImpl,
        }),
      );
      text = cleanReply(raw);
      if (!text) throw new Error("ollama: пустой ответ");
      if (looksBroken(text)) throw new Error("ollama: ответ вышел из роли");
      // Повтор: модель 3B не всегда говорит «я уже говорил» — добавляем сами (прогон M4)
      // Только если звучало всё, о чём ответ: иначе «Я уже говорил» перед новым (bench M19: рация про балкон)
      const repeat = !EMOTIONAL.has(req.npcId) && p.facts.length > 0 && p.facts.every((f) => f.told > 0);
      if (repeat && !/уже\s+(говорил|объяснял|рассказывал)/i.test(text)) {
        const rest = text.replace(/^(позволю себе\s+)?(перефразирую|перефразировать|повторю)[^:.!]*[:.!]\s*/i, "");
        text = `Я уже говорил. ${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
      }
      source = "llm";
    } catch {
      text = templateReply(req, p, memory, outcome).text;
      source = "template";
      onToken?.(text);
    }

    remember(req, p, memory, text, outcome);
    await opts.memory.save(memory);
    return { text, factIds: spoken(req, p).map((f) => f.fact.id), outcome, source };
  }

  return {
    llmStats: () => queue.stats(),
    say: (req) => respond(req),
    sayStream: (req, onToken, onOutcome) => respond(req, onToken, onOutcome),
    resetRun(playerId: PlayerId) {
      dispatcher.reset(playerId);
      gromov.reset(playerId);
      for (const key of [...metThisRun]) if (key.startsWith(`${playerId}:`)) metThisRun.delete(key);
    },
  };
}
