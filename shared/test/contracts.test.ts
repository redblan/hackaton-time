import { describe, expect, it } from "vitest";
import { generateRun, initRun, reduce, INTERACTABLES } from "../src";

describe("контракты", () => {
  it("заглушки сценария работают", () => {
    const cfg = generateRun({ mode: "solo", profiles: [], seed: 1 });
    const st = initRun(cfg, [{ id: "p1", role: "inside_top" }]);
    expect(reduce(st, { type: "start", at: 0 }).state.stage.p1).toBe("wake");
  });
  it("предметы попадают в интерактивные объекты", () => {
    expect(INTERACTABLES).toContain("item_documents");
  });
});
