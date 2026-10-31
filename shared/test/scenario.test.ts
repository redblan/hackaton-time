import { describe, expect, it } from "vitest";
import { generateRun, initRun, reduce, summarize } from "../src";
import type { GameEvent, MinigameResult, PlayerProfile, RunConfig, RunState } from "../src";

const P = "p1";

const FULL: RunConfig = {
  seed: 1,
  mode: "solo",
  startFloor: 7,
  flags: ["fire_f5", "collapse_f4", "lift_vanya", "neighbor_valentina", "wire", "aftershock"],
  victims: ["bleeding", "cpr", "unconscious", "scared"],
  address: "ул. Садовая, 14",
  aftershockAfterMs: 600_000,
};

const bag: MinigameResult = {
  game: "go_bag",
  skill: "go_bag",
  ok: true,
  mistakes: [],
  timeMs: 30_000,
  data: { items: ["documents", "phone", "first_aid_kit", "water", "flashlight", "warm_clothes"] },
};

const game = (
  g: MinigameResult["game"],
  skill: MinigameResult["skill"],
  mistakes: string[] = [],
): MinigameResult => ({ game: g, skill, ok: mistakes.length === 0, mistakes, timeMs: 10_000 });

type Step = { type: string; [key: string]: unknown };

function play(config: RunConfig, steps: Step[]) {
  let state: RunState = initRun(config, [{ id: P, role: "inside_top" }]);
  let at = 0;
  const effects: unknown[] = [];
  for (const step of steps) {
    at += 1000;
    const result = reduce(state, { at, playerId: P, ...step } as GameEvent);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}

const interact = (target: string): Step => ({ type: "interact", target });
const zone = (name: string): Step => ({ type: "enterZone", zone: name });
const talk = (npcId: string, outcome: string): Step => ({ type: "dialogOutcome", npcId, outcome });
const result = (r: MinigameResult): Step => ({ type: "minigameResult", result: r });
const tick: Step = { type: "tick" };

const PERFECT: Step[] = [
  { type: "start" },
  tick,
  tick,
  tick,
  interact("cover_table"),
  result(bag),
  interact("gas_valve"),
  interact("apartment_door"),
  interact("elevator_shaft"),
  talk("vanya", "calmed"),
  zone("z_stairs"),
  zone("z_smoke"),
  interact("balcony_door"),
  interact("neighbor_door"),
  talk("valentina", "agreed_to_go"),
  zone("z_yard"),
  zone("z_safe_area"),
  talk("dispatcher", "slots_complete"),
  result(game("triage", "triage")),
  interact("victim_bleeding"),
  result(game("tourniquet", "bleeding")),
  interact("victim_cpr"),
  result(game("cpr", "cpr")),
  interact("victim_unconscious"),
  result(game("recovery_position", "recovery_position")),
  interact("victim_scared"),
  talk("victim_scared", "calmed"),
  zone("z_safe_area"),
  talk("gromov", "handover_complete"),
  interact("brigade"),
];

const UP_TO_BLEEDING = PERFECT.slice(0, 20);
const tourniquetDone = result(game("tourniquet", "bleeding"));

describe("прохождение", () => {
  it("идеальное solo: без ошибок до этапа done", () => {
    const { state, effects } = play(FULL, PERFECT);
    expect(state.stage[P]).toBe("done");
    expect(state.finished).toBe(true);
    expect(state.journal.filter((e) => e.outcome !== "ok")).toEqual([]);
    expect(effects[effects.length - 1]).toMatchObject({ type: "runEnd" });
  });

  it("прохождение с ошибками: в журнале ровно ожидаемые", () => {
    const steps = PERFECT.map((s) => (s === PERFECT[4] ? interact("cover_window") : s));
    steps.splice(6, 0, interact("light_switch"));
    const call = steps.findIndex((s) => s.outcome === "slots_complete");
    steps.splice(call, 0, talk("dispatcher", "slot_missing:address"));
    const bandage = steps.findIndex((s) => s === tourniquetDone || JSON.stringify(s).includes('"tourniquet"'));
    steps[bandage] = result(game("tourniquet", "bleeding", ["tourniquet_no_time"]));

    const { state } = play(FULL, steps);
    expect(state.stage[P]).toBe("done");
    expect(state.journal.filter((e) => e.outcome !== "ok").map((e) => [e.skill, e.outcome])).toEqual([
      ["cover", "mistake"],
      ["gas", "mistake"],
      ["call_112", "mistake"],
      ["bleeding", "mistake"],
    ]);
  });

  it("повторное slot_missing пишется один раз, slots_complete даёт ok", () => {
    const call = PERFECT.findIndex((s) => s.outcome === "slots_complete");
    const missing = talk("dispatcher", "slot_missing:fire");
    const steps = [...PERFECT.slice(0, call), missing, missing, ...PERFECT.slice(call)];
    const calls = play(FULL, steps).state.journal.filter((e) => e.skill === "call_112");
    expect(calls.map((e) => e.outcome)).toEqual(["mistake", "ok"]);
  });

  it("ошибки сопровождения: left_behind и козырёк по одному разу, без ok", () => {
    const agreed = PERFECT.findIndex((s) => s.outcome === "agreed_to_go");
    const left = talk("valentina", "left_behind");
    const steps = [
      ...PERFECT.slice(0, agreed + 1),
      left,
      left,
      zone("z_canopy_danger"),
      ...PERFECT.slice(agreed + 1),
    ];
    const escort = play(FULL, steps).state.journal.filter((e) => e.skill === "escort");
    expect(escort.map((e) => e.outcome)).toEqual(["mistake", "mistake"]);
  });

  it("сортировка отдаёт группы только из присутствующих пострадавших", () => {
    const config: RunConfig = { ...FULL, victims: ["scared", "cpr", "bleeding"] };
    const dispatched = PERFECT.findIndex((s) => s.outcome === "slots_complete");
    const { effects } = play(config, PERFECT.slice(0, dispatched + 1));
    expect(effects[effects.length - 1]).toMatchObject({
      type: "openMinigame",
      game: "triage",
      params: { order: [["bleeding"], ["cpr"], ["scared"]] },
    });
  });

  it("без укрытия за 10 секунд: пропуск и переход к сборам", () => {
    const ticks = Array.from({ length: 13 }, () => tick);
    const { state } = play(FULL, [{ type: "start" }, ...ticks]);
    expect(state.stage[P]).toBe("pack");
    expect(state.journal[0]).toMatchObject({ skill: "cover", outcome: "missed" });
  });

  it("этапы без элементов пропускаются без штрафа", () => {
    const config: RunConfig = {
      ...FULL,
      flags: ["wire"],
      victims: ["bleeding", "scared"],
      aftershockAfterMs: null,
    };
    const absent = /z_smoke|balcony_door|neighbor_door|valentina|elevator_shaft|vanya|victim_cpr|"cpr"|unconscious|recovery/;
    const { state } = play(config, PERFECT.filter((s) => !absent.test(JSON.stringify(s))));
    expect(state.stage[P]).toBe("done");
    expect(state.journal.filter((e) => e.outcome !== "ok")).toEqual([]);
  });

  it("повторный толчок ждёт конца мини-игры и возвращает к пострадавшим", () => {
    const config = { ...FULL, aftershockAfterMs: 1000 };
    const during = play(config, [...UP_TO_BLEEDING, tick, tick]);
    expect(during.state.stage[P]).toBe("first_aid");
    const after = play(config, [...UP_TO_BLEEDING, tick, tourniquetDone, tick]);
    expect(after.state.stage[P]).toBe("aftershock");
    const back = play(config, [...UP_TO_BLEEDING, tourniquetDone, tick, zone("z_safe_area")]);
    expect(back.state.stage[P]).toBe("first_aid");
    expect(back.state.journal.some((e) => e.skill === "aftershock" && e.outcome === "ok")).toBe(true);
  });
});

describe("устойчивость прохождения", () => {
  /** Универсальное прохождение: шаги, которых нет в этом конфиге, редьюсер просто игнорирует. */
  const walkthrough = (victims: RunConfig["victims"]): Step[] => {
    const aid = victims.flatMap((kind): Step[] => {
      if (kind === "scared") return [interact("victim_scared"), talk("victim_scared", "calmed")];
      if (kind === "bleeding") return [interact("victim_bleeding"), tourniquetDone];
      if (kind === "cpr") return [interact("victim_cpr"), result(game("cpr", "cpr"))];
      return [interact("victim_unconscious"), result(game("recovery_position", "recovery_position"))];
    });
    return [
      ...PERFECT.slice(0, 19),
      ...aid,
      zone("z_safe_area"),
      talk("gromov", "handover_complete"),
      interact("brigade"),
    ];
  };

  it("любой сгенерированный конфиг проходится до done без ошибок", () => {
    for (let seed = 0; seed < 300; seed++) {
      const config = generateRun({ mode: "solo", profiles: [], seed });
      const { state } = play({ ...config, aftershockAfterMs: config.aftershockAfterMs && 3_600_000 }, walkthrough(config.victims));
      expect(state.stage[P], `seed ${seed}`).toBe("done");
      expect(state.journal.filter((e) => e.outcome !== "ok"), `seed ${seed}`).toEqual([]);
    }
  });

  it("соседку бросили и сразу вышли во двор: этап выхода не зависает", () => {
    const leave = PERFECT.findIndex((s) => s.outcome === "agreed_to_go");
    const steps = [...PERFECT.slice(0, leave), zone("z_yard")];
    const { state } = play(FULL, steps);
    expect(state.stage[P]).toBe("yard_assess");
    expect(state.journal).toContainEqual(expect.objectContaining({ skill: "escort", outcome: "missed" }));
  });

  it("из подъезда сразу на площадку: приходим к звонку 112", () => {
    const yard = PERFECT.findIndex((s) => s.zone === "z_yard");
    const { state } = play(FULL, [...PERFECT.slice(0, yard), zone("z_safe_area")]);
    expect(state.stage[P]).toBe("call_112");
  });

  it("ошибка в реплике NPC приходит в формате контракта", () => {
    const { effects } = play(FULL, [{ type: "start" }, tick, tick, tick, interact("cover_run_out")]);
    expect(effects).toContainEqual(
      expect.objectContaining({
        event: "mistake",
        context: { mistake: { skill: "cover", code: "cover_run_out" } },
      }),
    );
  });

  it.each([
    ["cover_window", "papa", "cover"],
    ["cover_wardrobe", "papa", "cover"],
  ])("NPC реагирует на %s", (target, npcId, skill) => {
    const { effects } = play(FULL, [{ type: "start" }, tick, tick, tick, interact(target)]);
    expect(effects).toContainEqual(
      expect.objectContaining({ npcId, event: "mistake", context: { mistake: { skill, code: target } } }),
    );
  });

  it("опасные зоны: реакция NPC только на первый вход", () => {
    const agreed = PERFECT.findIndex((s) => s.outcome === "agreed_to_go");
    const yard = PERFECT.findIndex((s) => s.zone === "z_yard");
    const balcony = PERFECT.findIndex((s) => s.target === "balcony_door");
    const danger = (name: string) => [zone(name), zone(name)];
    const steps = [
      ...PERFECT.slice(0, balcony),
      ...danger("z_collapse"),
      ...PERFECT.slice(balcony, agreed + 1),
      ...danger("z_canopy_danger"),
      PERFECT[yard]!,
      ...danger("z_wire_danger"),
    ];
    const { effects } = play(FULL, steps);
    const codes = effects.flatMap((e) => {
      const context = (e as { event?: string; context?: { mistake?: { code: string } } });
      return context.event === "mistake" ? [context.context?.mistake?.code] : [];
    });
    expect(codes).toEqual(["z_collapse", "z_canopy_danger", "z_wire_danger"]);
  });

  it("простой 40 секунд: подсказка не чаще раза в 40 секунд", () => {
    const hints = (ticks: number) => {
      const stairs = PERFECT.findIndex((s) => s.zone === "z_stairs");
      const steps = [...PERFECT.slice(0, stairs), ...Array.from({ length: ticks }, () => tick)];
      return play(FULL, steps).effects.filter(
        (e) => (e as { event?: string }).event === "route_hint",
      );
    };
    expect(hints(39)).toHaveLength(0);
    expect(hints(40)).toHaveLength(1);
    expect(hints(79)).toHaveLength(1);
    expect(hints(80)).toHaveLength(2);
  });

  it("пока открыта мини-игра, подсказок нет", () => {
    const pack = PERFECT.indexOf(PERFECT[4]!);
    const steps = [...PERFECT.slice(0, pack + 1), ...Array.from({ length: 60 }, () => tick)];
    const { effects } = play(FULL, steps);
    expect(effects.filter((e) => (e as { event?: string }).event === "gas_smell")).toHaveLength(0);
  });

  it("бригада знает, накладывали ли жгут", () => {
    const { effects } = play(FULL, PERFECT);
    expect(effects).toContainEqual(
      expect.objectContaining({
        event: "brigade_arrived",
        context: expect.objectContaining({ tourniquetApplied: true }),
      }),
    );
  });

  it("после конца прохождения события игнорируются", () => {
    const { state } = play(FULL, PERFECT);
    expect(reduce(state, { type: "tick", at: 999_999 }).state).toBe(state);
  });
});

describe("генератор", () => {
  it("одинаковый seed даёт одинаковый конфиг", () => {
    const input = { mode: "solo" as const, profiles: [], seed: 42 };
    expect(generateRun(input)).toEqual(generateRun(input));
  });

  it("значения в допустимых границах", () => {
    for (let seed = 0; seed < 300; seed++) {
      const cfg = generateRun({ mode: "coop3", profiles: [], seed });
      expect(cfg.startFloor).toBeGreaterThanOrEqual(6);
      expect(cfg.startFloor).toBeLessThanOrEqual(9);
      expect(cfg.victims.length).toBeGreaterThanOrEqual(2);
      expect(cfg.victims.length).toBeLessThanOrEqual(4);
      expect(new Set(cfg.victims).size).toBe(cfg.victims.length);
      expect(cfg.victims).not.toContain("light_injury");
      expect(cfg.flags).toContain("neighbor_leg");
      const fire = cfg.flags.find((f) => f.startsWith("fire_f"));
      if (fire) expect(Number(fire.slice(6))).toBeLessThan(cfg.startFloor);
      expect(cfg.flags.includes("aftershock")).toBe(cfg.aftershockAfterMs !== null);
    }
  });

  it("3 ошибки по кровотечению: выпадает в 90%+ из 100 seed", () => {
    const profile: PlayerProfile = { playerId: P, runs: 3, skills: { bleeding: { ok: 0, fail: 3 } } };
    let hits = 0;
    for (let seed = 0; seed < 100; seed++) {
      if (generateRun({ mode: "solo", profiles: [profile], seed }).victims.includes("bleeding")) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(90);
  });
});

describe("редьюсер и оценка", () => {
  it("не мутирует входной state", () => {
    let state = initRun(FULL, [{ id: P, role: "inside_top" }]);
    for (const [i, step] of PERFECT.entries()) {
      const snapshot = JSON.stringify(state);
      const next = reduce(state, { at: (i + 1) * 1000, playerId: P, ...step } as GameEvent).state;
      expect(JSON.stringify(state)).toBe(snapshot);
      state = next;
    }
  });

  it("очки: +10, -5, -10 и бонус за время", () => {
    const state = initRun(FULL, [{ id: P, role: "inside_top" }]);
    const entry = { playerId: P, stage: "cover" as const, skill: "cover" as const, note: "" };
    state.journal = [
      { ...entry, at: 1, outcome: "ok" },
      { ...entry, at: 2, outcome: "mistake" },
      { ...entry, at: 590_000, outcome: "missed" },
    ];
    expect(summarize(state).score).toBe(10 - 5 - 10 + 1);
    state.journal = [{ ...entry, at: 1000, outcome: "ok" }];
    expect(summarize(state).score).toBe(10 + 30);
  });
});
