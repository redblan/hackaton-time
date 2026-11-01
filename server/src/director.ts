/**
 * «Режиссёр» мира (01.11): мир меняется от действий игроков — без LLM, простыми правилами.
 * Раз в секунду смотрит на состояние комнаты и шлёт патчи мира (`world:patch`):
 *
 *   газ    — не перекрыл кран: каждые 10 с облако на кухне растёт, потом выходит в коридор; перекрыл — рассеивается
 *   огонь  — пожар на 5-м этаже расползается по коридору к лестнице, пока не потушили; потушили — остаётся гарь
 *   скорая — приезжает после звонка 112: назвал адрес — к месту сбора и быстро; адрес не назван — позже и
 *            в дальний угол двора (y03), бригаду и Громова ищут там
 *
 * Чистые функции: на вход — комната, на выход — список патчей и реплик. Game применяет их.
 */
import { STAGES, type ChunkData, type ChunkId, type NpcId, type StageId, type WorldObject } from "@game/shared";

export interface DirectorState {
  gas: number;
  gasNext: number;
  fire: number;
  fireNext: number;
  fireDone: boolean;
  ambulance: "hidden" | "coming" | "here" | null;
  ambulanceAt: number;
  ambulanceOk: boolean;
}

export interface DirectorRoom {
  flags: ReadonlySet<string>;
  stages: StageId[];
  facts: readonly string[];
  /** Были ли у звонка 112 ошибки по адресу (журнал) */
  addressMissed: boolean;
  callOk: boolean;
}

export interface DirectorOut {
  patches: { chunkId: ChunkId; add: WorldObject[]; remove: string[] }[];
  say: { npcId: NpcId; text: string }[];
  /** Короткая строка «что сделал режиссёр» — в лог сервера и в админку */
  notes: string[];
}

const GAS_EVERY = 10;
const FIRE_EVERY = 12;
const AMBULANCE_OK_S = 5;
const AMBULANCE_LATE_S = 25;

/** Облако газа: от плиты по кухне к двери квартиры и в коридор (координаты чанка) */
const GAS_STEPS: [number, number, number, number][] = [
  [10, 1.1, 10.6, 1.0],
  [9, 1.2, 9.4, 1.2],
  [8, 1.3, 8, 1.4],
  [6.6, 1.3, 6.6, 1.4],
  [5, 1.4, 5.6, 1.5],
  [5, 1.4, 4.1, 1.6],
  [7.2, 1.4, 4.0, 1.6],
];
/** Огонь 5-го этажа: от двери квартиры (3.5, 4.6 — в данных) по коридору к лестничной площадке */
const FIRE_STEPS: [number, number][] = [
  [2.4, 4.3],
  [5.2, 4.0],
  [6.8, 4.4],
  [8.3, 3.7],
  [9.6, 2.6],
];

const idx = (s: StageId) => STAGES.indexOf(s);
const past = (stages: StageId[], s: StageId) => stages.some((x) => idx(x) > idx(s));

export function initDirector(): DirectorState {
  return { gas: 0, gasNext: 0, fire: 0, fireNext: 0, fireDone: false, ambulance: null, ambulanceAt: 0, ambulanceOk: true };
}

export function direct(
  d: DirectorState,
  room: DirectorRoom,
  t: number,
  chunk: (id: ChunkId) => ChunkData | undefined,
): DirectorOut {
  const out: DirectorOut = { patches: [], say: [], notes: [] };
  const home = [...room.flags].find((f) => /^home_f\d$/.test(f))?.slice(6);
  const homeChunk = home ? `e1f${home}` : null;

  // ---- газ ----
  if (homeChunk) {
    const base = chunk(homeChunk)?.bounds.min;
    const closed = room.flags.has(`gas_off_${homeChunk}`);
    if (base && closed && d.gas > 0) {
      // рассеивается по одному облаку в секунду, с конца (из коридора)
      d.gas--;
      out.patches.push({ chunkId: homeChunk, add: [], remove: [`dir-gas-${d.gas}`] });
      if (d.gas === 0) out.notes.push("газ перекрыт — облако рассеялось");
    } else if (base && !closed && past(room.stages, "cover") && d.gas < GAS_STEPS.length && t >= d.gasNext) {
      if (d.gasNext === 0) d.gasNext = t; // отсчёт — с конца толчка
      if (t >= d.gasNext) {
        const [x, y, z, size] = GAS_STEPS[d.gas]!;
        out.patches.push({
          chunkId: homeChunk,
          add: [{ id: `dir-gas-${d.gas}`, kind: "fx", fx: "smoke", pos: [base[0] + x, base[1] + y, base[2] + z], size }],
          remove: [],
        });
        d.gas++;
        d.gasNext = t + GAS_EVERY;
        out.notes.push(`газ не перекрыт — облако растёт (${d.gas}/${GAS_STEPS.length})`);
        if (d.gas === 4) out.say.push({ npcId: "papa", text: "Газом пахнет всё сильнее! Перекрой кран на кухне — жёлтый, у плиты." });
      }
    }
  }

  // ---- огонь 5-го этажа (в обоих подъездах) ----
  if (room.flags.has("fire_f5")) {
    const out5 = room.flags.has("fire_out");
    if (out5 && !d.fireDone) {
      d.fireDone = true;
      for (const id of ["e1f5", "e2f5"]) {
        const base = chunk(id)?.bounds.min;
        if (!base) continue;
        out.patches.push({
          chunkId: id,
          remove: FIRE_STEPS.map((_, i) => `dir-fire-${i}`),
          add: [[3.5, 4.6] as [number, number], ...FIRE_STEPS.slice(0, d.fire)].map(([x, z], i) => ({
            id: `dir-soot-${i}`,
            kind: "box",
            pos: [base[0] + x, base[1] + 0.012, base[2] + z],
            size: [1.1, 0.01, 0.9],
            rotY: i * 0.7,
            color: "#2b2724",
            collide: false,
          })),
        });
      }
      out.notes.push("пожар потушен — осталась гарь");
    } else if (!out5 && d.fire < FIRE_STEPS.length && past(room.stages, "pack") && t >= d.fireNext) {
      if (d.fireNext === 0) d.fireNext = t + FIRE_EVERY;
      else {
        const [x, z] = FIRE_STEPS[d.fire]!;
        for (const id of ["e1f5", "e2f5"]) {
          const base = chunk(id)?.bounds.min;
          if (!base) continue;
          out.patches.push({
            chunkId: id,
            add: [{ id: `dir-fire-${d.fire}`, kind: "fx", fx: "fire", pos: [base[0] + x, base[1] + 0.1, base[2] + z], size: 0.6 + d.fire * 0.08 }],
            remove: [],
          });
        }
        d.fire++;
        d.fireNext = t + FIRE_EVERY;
        out.notes.push(`пожар на 5-м расползается (${d.fire}/${FIRE_STEPS.length})`);
      }
    }
  }

  // ---- скорая ----
  const y13 = chunk("y13");
  const crew = y13?.objects.filter((o) => ["ambulance", "visual:ambulance", "brigade", "gromov"].includes(o.id)) ?? [];
  if (y13 && crew.length) {
    if (d.ambulance === null) {
      // в начале прохождения скорой нет — её ещё не вызвали
      d.ambulance = "hidden";
      out.patches.push({ chunkId: "y13", add: [], remove: crew.map((o) => o.id) });
    } else if (d.ambulance === "hidden" && past(room.stages, "call_112")) {
      d.ambulance = "coming";
      d.ambulanceOk = room.callOk || !room.addressMissed;
      d.ambulanceAt = t + (d.ambulanceOk ? AMBULANCE_OK_S : AMBULANCE_LATE_S);
      out.notes.push(d.ambulanceOk ? "112: адрес назван — скорая едет к месту сбора" : "112: адрес не назван — скорая ищет дом и приедет в дальний угол двора");
      out.say.push({
        npcId: "dispatcher",
        text: d.ambulanceOk ? "Бригада выехала, будет через пару минут у места сбора." : "Бригада выехала, но точного адреса нет — ищут дом. Встречайте машину!",
      });
    } else if (d.ambulance === "coming" && t >= d.ambulanceAt) {
      d.ambulance = "here";
      if (d.ambulanceOk) {
        out.patches.push({ chunkId: "y13", add: crew, remove: [] });
      } else {
        // адреса нет: машина встаёт в дальнем углу двора (y03, у первого подъезда), бригада с ней
        const far = chunk("y03");
        const dx = 3 - 21;
        const dz = 0;
        if (far) {
          out.patches.push({
            chunkId: "y03",
            add: crew.map((o) => ("pos" in o ? { ...o, pos: [o.pos[0] + dx, o.pos[1], o.pos[2] + dz] } : o) as WorldObject),
            remove: [],
          });
        }
        out.say.push({ npcId: "gromov", text: "Мы в дальнем углу двора, у первого подъезда — адреса не было, искали по дворам. Ведите пострадавших сюда!" });
      }
      out.notes.push(d.ambulanceOk ? "скорая у места сбора" : "скорая в дальнем углу двора (y03)");
    }
  }
  return out;
}
