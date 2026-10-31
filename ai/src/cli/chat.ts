/**
 * Консольный чат с NPC: `npm run chat -- papa`
 * Переменные: OLLAMA_URL, AI_MODEL (по умолчанию qwen2.5:3b-instruct), PLAYER (по умолчанию dev).
 */
import { createInterface } from "node:readline";
import { NPC_EVENTS, NPC_IDS, type NpcEvent, type NpcId, type PlayerMemory, type SkillId } from "@game/shared";
import { createAi, createFileMemory, loadData, unverifiedFacts } from "../index";

const npcId = (process.argv[2] ?? "papa") as NpcId;
if (!NPC_IDS.includes(npcId)) {
  console.error(`Неизвестный NPC «${npcId}». Есть: ${NPC_IDS.join(", ")}`);
  process.exit(1);
}
const playerId = process.env.PLAYER ?? "dev";
const model = process.env.AI_MODEL ?? "qwen2.5:3b-instruct";
const memory = createFileMemory();
const data = loadData();
const ai = createAi({ memory, data, model, ollamaUrl: process.env.OLLAMA_URL });

const unverified = unverifiedFacts(data);
if (unverified.length > 0) {
  console.log(`⚠ Фактов без ссылки на источник: ${unverified.length} (${unverified.map((f) => f.id).join(", ")})`);
}
console.log(`Чат с ${data.cards.get(npcId)?.name ?? npcId}. Модель ${model}, игрок ${playerId}.`);
console.log("Пиши реплику или команду: /event <событие>, /mistake <навык> <код>, /mem, /run (новое прохождение), /quit");

function diff(before: PlayerMemory, after: PlayerMemory): string {
  const told = Object.entries(after.toldFacts)
    .filter(([k, v]) => v !== (before.toldFacts[k] ?? 0))
    .map(([k, v]) => `${k}=${v}`);
  const rel = after.npc[npcId];
  return [told.length ? `рассказано: ${told.join(", ")}` : "", rel ? `${npcId}: met=${rel.met} trust=${rel.trust}` : ""]
    .filter(Boolean)
    .join(" | ");
}

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "\nты> " });
rl.prompt();
for await (const raw of rl) {
  const line = raw.trim();
  if (!line) {
    rl.prompt();
    continue;
  }
  if (line === "/quit") break;
  if (line === "/mem") {
    console.log(JSON.stringify(await memory.get(playerId), null, 2));
    rl.prompt();
    continue;
  }
  if (line === "/run") {
    ai.resetRun?.(playerId);
    console.log("Новое прохождение: NPC снова видят тебя впервые за этот забег, но помнят прошлые.");
    rl.prompt();
    continue;
  }
  let event: NpcEvent = "free_talk";
  let playerMessage: string | undefined = line;
  let mistake: { skill: SkillId; code: string } | undefined;
  if (line.startsWith("/event ")) {
    event = line.slice(7).trim() as NpcEvent;
    playerMessage = undefined;
    if (!NPC_EVENTS.includes(event)) {
      console.log(`Нет такого события. Есть: ${NPC_EVENTS.join(", ")}`);
      rl.prompt();
      continue;
    }
  } else if (line.startsWith("/mistake ")) {
    const [skill, code] = line.slice(9).trim().split(/\s+/);
    event = "mistake";
    playerMessage = undefined;
    mistake = { skill: skill as SkillId, code: code ?? "" };
  }
  const before = await memory.get(playerId);
  process.stdout.write(`${npcId}> `);
  const started = Date.now();
  const res = await ai.sayStream!({ npcId, playerId, event, playerMessage, context: { flags: [], facts: [], mistake } }, (t) =>
    process.stdout.write(t),
  );
  const after = await memory.get(playerId);
  console.log(`\n   [${res.source}, ${Date.now() - started} мс, факты: ${res.factIds.join(", ") || "—"}${res.outcome ? `, outcome: ${res.outcome}` : ""}]`);
  const d = diff(before, after);
  if (d) console.log(`   [память: ${d}]`);
  rl.prompt();
}
rl.close();
