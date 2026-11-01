import { describe, expect, it } from "vitest";
import { MISTAKE_NOTES, generateRun, initRun, reduce } from "../src";
import type { Effect, GameEvent, MinigameId, PlayerProfile, Role, RunConfig, RunState, SkillId } from "../src";

const CONFIG: RunConfig = {
  seed: 1,
  mode: "coop2",
  startFloor: 7,
  flags: ["lift_vanya", "neighbor_valentina", "valentina_e1", "wire"],
  victims: ["bleeding", "scared"],
  address: "ул. Садовая, 14",
  aftershockAfterMs: null,
};

const INSIDE = "inside";
const OUTSIDE = "outside";

type Step = { type: string; playerId?: string; [key: string]: unknown };

class Run {
  state: RunState;
  effects: Effect[] = [];
  at = 0;
  constructor(config: RunConfig, players: { id: string; role: Role }[]) {
    this.state = initRun(config, players);
    this.send({ type: "start" });
  }
  send(step: Step) {
    this.at += 1000;
    const result = reduce(this.state, { at: this.at, ...step } as GameEvent);
    this.state = result.state;
    this.effects.push(...result.effects);
    return this;
  }
  tick(count = 1) {
    for (let i = 0; i < count; i++) this.send({ type: "tick" });
    return this;
  }
  stage(id: string) {
    return this.state.stage[id];
  }
}

const game = (id: MinigameId, skill: SkillId, mistakes: string[] = []) => ({
  game: id,
  skill,
  ok: mistakes.length === 0,
  mistakes,
  timeMs: 1000,
});

const minigame = (playerId: string, id: MinigameId, skill: SkillId, mistakes: string[] = []) => ({
  type: "minigameResult",
  playerId,
  result: game(id, skill, mistakes),
});

function coop2() {
  return new Run(CONFIG, [
    { id: INSIDE, role: "inside_top" },
    { id: OUTSIDE, role: "outside" },
  ]);
}

function insideToYard(run: Run) {
  run.tick(3);
  run.send({ type: "interact", playerId: INSIDE, target: "cover_table" });
  run.send(minigame(INSIDE, "go_bag", "go_bag"));
  run.send({ type: "interact", playerId: INSIDE, target: "gas_valve" });
  run.send({ type: "interact", playerId: INSIDE, target: "apartment_door" });
  run.send({ type: "enterZone", playerId: INSIDE, zone: "z_stairs" });
  run.send({ type: "dialogOutcome", playerId: INSIDE, npcId: "valentina", outcome: "agreed_to_go" });
  run.send({ type: "enterZone", playerId: INSIDE, zone: "z_yard" });
  run.send({ type: "enterZone", playerId: INSIDE, zone: "z_safe_area" });
}

function outsideDoesAid(run: Run) {
  run.send({ type: "enterZone", playerId: OUTSIDE, zone: "z_safe_area" });
  run.send({ type: "dialogOutcome", playerId: OUTSIDE, npcId: "dispatcher", outcome: "slots_complete" });
  run.send(minigame(OUTSIDE, "triage", "triage"));
  run.send({ type: "interact", playerId: OUTSIDE, target: "victim_bleeding" });
  run.send(minigame(OUTSIDE, "tourniquet", "bleeding"));
  run.send({ type: "interact", playerId: OUTSIDE, target: "victim_scared" });
  run.send({ type: "dialogOutcome", playerId: OUTSIDE, npcId: "victim_scared", outcome: "calmed" });
}

describe("кооп на двоих", () => {
  it("игрок снаружи начинает во дворе, внутри в квартире", () => {
    const run = coop2();
    expect(run.stage(OUTSIDE)).toBe("yard_assess");
    expect(run.stage(INSIDE)).toBe("wake");
  });

  it("112 и сортировка на игроке снаружи, игрок внутри их пропускает", () => {
    const run = coop2();
    insideToYard(run);
    expect(run.stage(INSIDE)).toBe("first_aid");
    run.send({ type: "enterZone", playerId: OUTSIDE, zone: "z_safe_area" });
    expect(run.stage(OUTSIDE)).toBe("call_112");
  });

  it("снаружи всё сделано, но бригаду ждут напарника", () => {
    const run = coop2();
    outsideDoesAid(run);
    run.tick(5);
    expect(run.stage(OUTSIDE)).toBe("first_aid");
    insideToYard(run);
    run.tick();
    expect(run.stage(OUTSIDE)).toBe("handover");
    expect(run.stage(INSIDE)).toBe("handover");
  });

  it("прохождение кончается, только когда закончили оба", () => {
    const run = coop2();
    outsideDoesAid(run);
    insideToYard(run);
    run.tick();
    for (const playerId of [OUTSIDE, INSIDE]) {
      run.send({ type: "dialogOutcome", playerId, npcId: "gromov", outcome: "handover_complete" });
      run.send({ type: "interact", playerId, target: "brigade" });
      if (playerId === OUTSIDE) expect(run.state.finished).toBe(false);
    }
    expect(run.state.finished).toBe(true);
    expect(run.effects.filter((e) => e.type === "runEnd")).toHaveLength(1);
  });

  it("Михалыч не говорит: его роль играет напарник", () => {
    const run = coop2();
    insideToYard(run);
    const lines = run.effects.flatMap((e) => (e.type === "npcSay" ? [e.npcId] : []));
    expect(lines).not.toContain("mihalych");
    expect(lines).toContain("papa");
  });

  it("мини-игра одного не мешает другому", () => {
    const run = coop2();
    outsideDoesAid(run);
    const fresh = new Run({ ...CONFIG, victims: ["bleeding", "cpr"] }, [
      { id: INSIDE, role: "inside_top" },
      { id: OUTSIDE, role: "outside" },
    ]);
    insideToYard(fresh);
    fresh.send({ type: "enterZone", playerId: OUTSIDE, zone: "z_safe_area" });
    fresh.send({ type: "dialogOutcome", playerId: OUTSIDE, npcId: "dispatcher", outcome: "slots_complete" });
    fresh.send(minigame(OUTSIDE, "triage", "triage"));
    fresh.send({ type: "interact", playerId: OUTSIDE, target: "victim_bleeding" });
    fresh.send({ type: "interact", playerId: INSIDE, target: "victim_cpr" });
    const opened = fresh.effects.flatMap((e) => (e.type === "openMinigame" ? [[e.playerId, e.game]] : []));
    expect(opened).toContainEqual([OUTSIDE, "tourniquet"]);
    expect(opened).toContainEqual([INSIDE, "cpr"]);
  });
});

describe("кооп на троих", () => {
  it("игрок с 3-го этажа ведёт соседку, игрок сверху её пропускает", () => {
    const run = new Run({ ...CONFIG, mode: "coop3" }, [
      { id: INSIDE, role: "inside_top" },
      { id: "mid", role: "inside_mid" },
      { id: OUTSIDE, role: "outside" },
    ]);
    run.tick(3);
    run.send({ type: "interact", playerId: "mid", target: "cover_table" });
    run.send(minigame("mid", "go_bag", "go_bag"));
    run.send({ type: "interact", playerId: "mid", target: "gas_valve" });
    run.send({ type: "interact", playerId: "mid", target: "apartment_door" });
    expect(run.stage("mid")).toBe("neighbor");
    const quakes = run.effects.filter((e) => e.type === "quake");
    expect(quakes).toHaveLength(1);
  });
});

describe("пострадавшие (D-64)", () => {
  it.each([
    ["victim_bleeding", "bleeding"],
    ["victim_cpr", "cpr"],
    ["victim_unconscious", "unconscious"],
  ] as const)("%s говорит при открытии мини-игры", (npcId, kind) => {
    const run = new Run({ ...CONFIG, mode: "solo", victims: [kind, "scared"], flags: [] }, [{ id: INSIDE, role: "inside_top" }]);
    run.tick(3);
    run.send({ type: "interact", playerId: INSIDE, target: "cover_table" });
    run.send(minigame(INSIDE, "go_bag", "go_bag"));
    run.send({ type: "interact", playerId: INSIDE, target: "gas_valve" });
    run.send({ type: "interact", playerId: INSIDE, target: "apartment_door" });
    run.send({ type: "enterZone", playerId: INSIDE, zone: "z_stairs" });
    run.send({ type: "enterZone", playerId: INSIDE, zone: "z_yard" });
    run.send({ type: "enterZone", playerId: INSIDE, zone: "z_safe_area" });
    run.send({ type: "dialogOutcome", playerId: INSIDE, npcId: "dispatcher", outcome: "slots_complete" });
    run.send(minigame(INSIDE, "triage", "triage"));
    run.send({ type: "interact", playerId: INSIDE, target: npcId });
    expect(run.effects).toContainEqual(expect.objectContaining({ type: "npcSay", npcId, event: "victim_help" }));
  });
});

describe("задание с соседкой", () => {
  it("есть в каждом прохождении, и до неё всегда можно дойти", () => {
    for (let seed = 0; seed < 200; seed++) {
      const { flags } = generateRun({ mode: "solo", profiles: [], seed });
      expect(flags).toContain("neighbor_valentina");
      expect(flags).toContain(flags.includes("collapse_f4") ? "valentina_e2" : "valentina_e1");
    }
  });

  it("подсказка меняется, когда соседка идёт за игроком", () => {
    const run = new Run({ ...CONFIG, mode: "solo" }, [{ id: INSIDE, role: "inside_top" }]);
    insideToYardSolo(run);
    const hints = run.effects.flatMap((e) => (e.type === "stage" ? [[e.stage, e.hint]] : []));
    expect(hints.find(([stage]) => stage === "neighbor")?.[1]).toContain("доведи");
    expect(hints.find(([stage]) => stage === "exit_building")?.[1]).toContain("соседку");
  });

  function insideToYardSolo(run: Run) {
    run.tick(3);
    run.send({ type: "interact", playerId: INSIDE, target: "cover_table" });
    run.send(minigame(INSIDE, "go_bag", "go_bag"));
    run.send({ type: "interact", playerId: INSIDE, target: "gas_valve" });
    run.send({ type: "interact", playerId: INSIDE, target: "apartment_door" });
    run.send({ type: "enterZone", playerId: INSIDE, zone: "z_stairs" });
    run.send({ type: "dialogOutcome", playerId: INSIDE, npcId: "valentina", outcome: "agreed_to_go" });
  }
});

describe("повторный толчок", () => {
  it("обломки балкона падают в начале толчка", () => {
    const run = new Run({ ...CONFIG, mode: "solo", flags: ["aftershock"], victims: ["scared", "bleeding"], aftershockAfterMs: 1000 }, [
      { id: INSIDE, role: "inside_top" },
    ]);
    run.tick(3);
    run.send({ type: "interact", playerId: INSIDE, target: "cover_table" });
    run.send(minigame(INSIDE, "go_bag", "go_bag"));
    run.send({ type: "interact", playerId: INSIDE, target: "gas_valve" });
    run.send({ type: "interact", playerId: INSIDE, target: "apartment_door" });
    run.send({ type: "enterZone", playerId: INSIDE, zone: "z_stairs" });
    run.send({ type: "enterZone", playerId: INSIDE, zone: "z_yard" });
    run.send({ type: "enterZone", playerId: INSIDE, zone: "z_safe_area" });
    run.send({ type: "dialogOutcome", playerId: INSIDE, npcId: "dispatcher", outcome: "slots_complete" });
    run.send(minigame(INSIDE, "triage", "triage"));
    run.send({ type: "enterZone", playerId: INSIDE, zone: "z_yard" });
    run.tick();
    expect(run.stage(INSIDE)).toBe("aftershock");
    expect(run.effects).toContainEqual({ type: "setFlag", flag: "balcony_debris" });
  });
});

describe("передача бригаде", () => {
  it("через 2 минуты этап заканчивается сам, игрок не застревает", () => {
    const run = new Run({ ...CONFIG, mode: "solo", flags: [], victims: ["scared", "bleeding"] }, [{ id: INSIDE, role: "inside_top" }]);
    run.tick(3);
    run.send({ type: "interact", playerId: INSIDE, target: "cover_table" });
    run.send(minigame(INSIDE, "go_bag", "go_bag"));
    run.send({ type: "interact", playerId: INSIDE, target: "gas_valve" });
    run.send({ type: "interact", playerId: INSIDE, target: "apartment_door" });
    run.send({ type: "enterZone", playerId: INSIDE, zone: "z_stairs" });
    run.send({ type: "enterZone", playerId: INSIDE, zone: "z_yard" });
    run.send({ type: "enterZone", playerId: INSIDE, zone: "z_safe_area" });
    run.send({ type: "dialogOutcome", playerId: INSIDE, npcId: "dispatcher", outcome: "slots_complete" });
    run.send(minigame(INSIDE, "triage", "triage"));
    run.send({ type: "interact", playerId: INSIDE, target: "victim_bleeding" });
    run.send(minigame(INSIDE, "tourniquet", "bleeding"));
    run.send({ type: "interact", playerId: INSIDE, target: "victim_scared" });
    run.send({ type: "dialogOutcome", playerId: INSIDE, npcId: "victim_scared", outcome: "calmed" });
    expect(run.stage(INSIDE)).toBe("handover");
    run.tick(120);
    expect(run.stage(INSIDE)).toBe("debrief");
    expect(run.state.journal).toContainEqual(expect.objectContaining({ skill: "handover", outcome: "missed" }));
  });
});

describe("ошибки мини-игр и адаптация (Y9)", () => {
  const GAMES: [MinigameId, SkillId, string][] = [
    ["go_bag", "go_bag", "bag_trap_item"],
    ["go_bag", "go_bag", "bag_no_documents"],
    ["go_bag", "go_bag", "bag_no_kit"],
    ["tourniquet", "bleeding", "tourniquet_below_wound"],
    ["tourniquet", "bleeding", "tourniquet_no_time"],
    ["tourniquet", "bleeding", "pressure_released"],
    ["cpr", "cpr", "cpr_too_slow"],
    ["cpr", "cpr", "cpr_too_fast"],
    ["cpr", "cpr", "cpr_pause"],
    ["recovery_position", "recovery_position", "recovery_wrong_order"],
    ["triage", "triage", "triage_wrong_order"],
  ];

  it("все коды мини-игр имеют заметку", () => {
    expect(GAMES.map(([, , code]) => code).sort()).toEqual(Object.keys(MISTAKE_NOTES).sort());
  });

  it.each(GAMES)("%s: ошибка %s попадает в журнал", (id, skill, code) => {
    const run = new Run({ ...CONFIG, mode: "solo" }, [{ id: INSIDE, role: "inside_top" }]);
    run.send(minigame(INSIDE, id, skill, [code]));
    expect(run.state.journal).toEqual([
      expect.objectContaining({ skill, outcome: "mistake", note: MISTAKE_NOTES[code] }),
    ]);
  });

  const hits = (config: (seed: number) => RunConfig, has: (c: RunConfig) => boolean) =>
    Array.from({ length: 200 }, (_, seed) => config(seed)).filter(has).length;

  it.each([
    ["cpr", "cpr", (c: RunConfig) => c.victims.includes("cpr")],
    ["recovery_position", "unconscious", (c: RunConfig) => c.victims.includes("unconscious")],
    ["smoke", "пожар", (c: RunConfig) => c.flags.some((f) => f.startsWith("fire_"))],
    ["route", "обвал", (c: RunConfig) => c.flags.includes("collapse_f4")],
    ["elevator", "лифт", (c: RunConfig) => c.flags.includes("lift_vanya")],
    ["aftershock", "толчок", (c: RunConfig) => c.flags.includes("aftershock")],
  ] as const)("слабый навык %s выпадает чаще: %s", (skill, _, has) => {
    const weak: PlayerProfile = { playerId: "p", runs: 3, skills: { [skill]: { ok: 0, fail: 3 } } };
    const fresh = hits((seed) => generateRun({ mode: "solo", profiles: [], seed }), has);
    const trained = hits((seed) => generateRun({ mode: "solo", profiles: [weak], seed }), has);
    expect(trained).toBeGreaterThan(fresh);
  });
});
