import { describe, expect, it } from "vitest";
import {
  bagMistakes,
  cprMistakes,
  cprRate,
  recoveryMistakes,
  tourniquetMistakes,
  triageMistakes,
} from "../src/minigames/logic";

const presses = (count: number, intervalMs: number, from = 500) =>
  Array.from({ length: count }, (_, i) => from + i * intervalMs);

describe("рюкзак", () => {
  it("нужные вещи: без ошибок", () => {
    expect(bagMistakes(["documents", "phone", "first_aid_kit", "water", "flashlight", "warm_clothes"])).toEqual([]);
  });
  it("бинт вместо нужной вещи не ошибка", () => {
    expect(bagMistakes(["documents", "first_aid_kit", "bandage"])).toEqual([]);
  });
  it("ловушка и забытые документы и аптечка", () => {
    expect(bagMistakes(["laptop", "water"])).toEqual(["bag_trap_item", "bag_no_documents", "bag_no_kit"]);
  });
});

describe("жгут", () => {
  it("всё верно", () => {
    expect(tourniquetMistakes(false, "above_wound", "03:15")).toEqual([]);
  });
  it("все ошибки разом", () => {
    expect(tourniquetMistakes(true, "below_wound", "  ")).toEqual([
      "pressure_released",
      "tourniquet_below_wound",
      "tourniquet_no_time",
    ]);
  });
});

describe("СЛР", () => {
  it("110 в минуту 30 секунд: без ошибок", () => {
    expect(cprMistakes(presses(54, 545), 30_000)).toEqual([]);
  });
  it("медленно", () => {
    expect(cprMistakes(presses(38, 800), 30_000)).toEqual(["cpr_too_slow"]);
  });
  it("быстро", () => {
    expect(cprMistakes(presses(90, 330), 30_000)).toEqual(["cpr_too_fast"]);
  });
  it("пауза в середине", () => {
    const times = [...presses(20, 545), ...presses(26, 545, 15_000)];
    expect(cprMistakes(times, 29_000)).toEqual(["cpr_pause"]);
  });
  it("бросил нажимать раньше времени: пауза", () => {
    expect(cprMistakes(presses(10, 545), 30_000)).toContain("cpr_pause");
  });
  it("показывает текущий темп", () => {
    expect(cprRate(presses(10, 500))).toBe(120);
    expect(cprRate([100])).toBeNull();
  });
});

describe("сортировка (D-22)", () => {
  const groups = [["bleeding"], ["cpr", "unconscious"], ["scared"]] as const;
  const order = groups.map((g) => [...g]);
  it("внутри группы порядок свободный", () => {
    expect(triageMistakes(["bleeding", "unconscious", "cpr", "scared"], order)).toEqual([]);
  });
  it("выбрал из группы хуже лучшей оставшейся", () => {
    expect(triageMistakes(["cpr", "bleeding", "unconscious", "scared"], order)).toEqual(["triage_wrong_order"]);
  });
});

describe("боковое положение", () => {
  it("проверяет порядок", () => {
    expect(recoveryMistakes([0, 1, 2, 3])).toEqual([]);
    expect(recoveryMistakes([1, 0, 2, 3])).toEqual(["recovery_wrong_order"]);
  });
});
