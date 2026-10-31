// npm run e2e — бот проходит solo целиком через сеть, как игрок: укрытие → … → звонок 112 → помощь → Громов → разбор.
// Показывает реплики NPC с источником (llm/template) и журнал. Проверка ИИ: итоги диалогов должны срабатывать и на живой модели.
// Сервер должен быть запущен (npm run dev или npm run start). Адрес: E2E_URL (по умолчанию http://localhost:3000).
import { io } from "socket.io-client";

const U = process.env.E2E_URL ?? "http://localhost:3000";
const TALK_TIMEOUT_MS = 30_000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const name = "bot_" + Date.now().toString(36).slice(-4);
const res = await fetch(U + "/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, password: "bot-pass" }) });
const { token } = await res.json();
const s = io(U, { auth: { token }, rejectUnauthorized: false });
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s`, ...a);
let stage = null, minigame = null, end = null;
const stats = { llm: 0, template: 0, slowest: 0 };
s.on("game:effect", (e) => {
  if (e.type === "stage") { stage = e.stage; log("ЭТАП", e.stage, "—", e.hint); }
  if (e.type === "openMinigame") minigame = e;
  if (e.type === "journal") log(`     журнал ${e.entry.outcome === "ok" ? "✓" : "✗"} ${e.entry.skill}: ${e.entry.note}`);
});
s.on("npc:done", (p) => { stats[p.source]++; log(`     ${p.npcId} [${p.source}]: ${p.text.replace(/\n/g, " ").slice(0, 140)}`); });
s.on("run:end", (p) => (end = p));
const ev = (e) => s.emit("game:event", { ...e, at: 0, playerId: "" });
const info = async () => (await (await fetch(U + "/api/me", { headers: { authorization: `Bearer ${token}` } })).json()).run ?? {};
/** Сказать NPC и дождаться ответа (на живой модели — секунды). Не больше 3 реплик одному NPC */
const talked = {};
const talk = (npcId, text) => new Promise((resolve) => {
  talked[npcId] = (talked[npcId] ?? 0) + 1;
  if (talked[npcId] > 3) return resolve(false);
  log(`   > ${npcId}: ${text}`);
  const started = Date.now();
  const finish = (ok) => { s.off("npc:done", done); clearTimeout(timer); resolve(ok); };
  const done = (p) => { if (p.npcId !== npcId) return; stats.slowest = Math.max(stats.slowest, Date.now() - started); finish(true); };
  const timer = setTimeout(() => { log(`     !!! ${npcId} не ответил за ${TALK_TIMEOUT_MS / 1000} с`); finish(false); }, TALK_TIMEOUT_MS);
  s.on("npc:done", done);
  s.emit("npc:talk", { npcId, text });
});
const result = (game, skill, data) => ({ type: "minigameResult", result: { game, skill, ok: true, mistakes: [], timeMs: 5000, ...(data ? { data } : {}) } });

await new Promise((r, j) => { s.on("connect", r); s.on("connect_error", j); });
s.emit("room:join", { mode: "solo" });
const tries = {};
for (let step = 0; step < 400 && !end; step++) {
  await wait(300);
  if (minigame) {
    const g = minigame.game, params = minigame.params ?? {};
    minigame = null;
    await wait(300);
    if (g === "go_bag") ev(result(g, "go_bag", { items: ["documents", "phone", "first_aid_kit", "water", "flashlight", "bandage"] }));
    if (g === "triage") ev(result(g, "triage", { sequence: (params.order ?? []).flat() }));
    if (g === "tourniquet") ev(result(g, "bleeding", { time: "15:40" }));
    if (g === "cpr") ev(result(g, "cpr"));
    if (g === "recovery_position") ev(result(g, "recovery_position"));
    continue;
  }
  const n = (tries[stage] = (tries[stage] ?? 0) + 1);
  if (n > 40) { log("!!! застрял на этапе", stage); break; }
  const { flags = [], address = "" } = await info();
  switch (stage) {
    case "cover": if (n === 1) ev({ type: "interact", target: "cover_table" }); break;
    case "pack": ev({ type: "interact", target: "gas_valve" }); break;
    case "exit_apartment": ev({ type: "interact", target: "apartment_door" }); break;
    case "elevator":
      if (n === 1 && flags.includes("lift_vanya")) {
        ev({ type: "interact", target: "elevator_shaft" }); await wait(500);
        await talk("vanya", "Ваня, я рядом, всё будет хорошо. Дыши спокойно, я сейчас сообщу спасателям, тебя вытащат.");
      }
      ev({ type: "enterZone", zone: "z_stairs" }); break;
    case "smoke": ev({ type: "enterZone", zone: "z_smoke" }); break;
    case "collapse": ev({ type: "enterZone", zone: "z_balcony" }); break;
    case "neighbor":
      if (n === 1) { ev({ type: "interact", target: "neighbor_door" }); await wait(500); }
      // Валентина соглашается, если ей доверяют или предложили взять кота (логика Матвея)
      if (!(await talk("valentina", "Валентина Петровна, не волнуйтесь, я с вами. Кота возьмём в переноске. Пойдёмте вместе на улицу, я помогу спуститься.")))
        ev({ type: "enterZone", zone: "z_exit_door" });
      break;
    case "exit_building": ev({ type: "enterZone", zone: "z_yard" }); break;
    case "yard_assess": ev({ type: "enterZone", zone: "z_safe_area" }); break;
    case "call_112":
      if (talked.dispatcher === undefined || talked.dispatcher < 3) await talk("dispatcher", `Землетрясение, в доме обрушение. Адрес: ${address}. Пострадавших трое: сильное кровотечение из ноги, один без сознания, одна не дышит. В лифте застрял человек. На этаже пожар и дым. Во дворе оборван провод под напряжением, пахнет газом.`);
      else s.emit("npc:hangup", { npcId: "dispatcher" });
      break;
    case "first_aid":
      for (const v of ["victim_bleeding", "victim_cpr", "victim_unconscious"]) {
        ev({ type: "interact", target: v }); await wait(400);
        if (minigame) break;
      }
      if (!minigame && !talked.victim_scared) { ev({ type: "interact", target: "victim_scared" }); await wait(1500); }
      if (!minigame) await talk("victim_scared", "Всё хорошо, я рядом, помощь уже едет. Дыши со мной спокойно.");
      break;
    case "aftershock": ev({ type: "enterZone", zone: "z_safe_area" }); break;
    case "handover":
      await talk("gromov", "Пострадавших трое: у мужчины кровотечение из бедра, наложил жгут в 15:40; женщина не дышала — делали СЛР; подросток без сознания, дышит — уложили на бок. Ребёнок напуган, успокоили. В лифте застрял Ваня. Пожар на этаже. Во дворе оборван провод, запах газа.");
      break;
    case "debrief": ev({ type: "interact", target: "brigade" }); break;
  }
}
console.log("");
if (end) log(`ИТОГ: дошёл до конца. Очки ${end.summary.score}. Реплик NPC: моделью ${stats.llm}, шаблоном ${stats.template}. Самый долгий ответ ${(stats.slowest / 1000).toFixed(1)} с.`);
else log(`ИТОГ: НЕ ДОШЁЛ, застрял на этапе ${stage}. Реплик моделью ${stats.llm}, шаблоном ${stats.template}.`);
process.exit(end ? 0 : 1);
