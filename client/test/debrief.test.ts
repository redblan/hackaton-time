import { describe, expect, it } from "vitest";
import type { PlayerProfile, RunSummary } from "@game/shared";
import { skillRows } from "../src/debrief/skills";

const mine: RunSummary["perPlayer"][number] = {
  playerId: "p1",
  score: 40,
  ok: ["cover", "bleeding"],
  mistakes: [{ skill: "gas", note: "Не перекрыл газ на кухне" }],
};

describe("карточка разбора", () => {
  it("ошибки идут первыми, навыки названы по-русски", () => {
    const rows = skillRows(mine, null);
    expect(rows.map((r) => [r.skill, r.status])).toEqual([
      ["gas", "mistake"],
      ["cover", "ok"],
      ["bleeding", "ok"],
    ]);
    expect(rows[0]?.notes).toEqual(["Не перекрыл газ на кухне"]);
    expect(rows.every((r) => r.name !== r.skill)).toBe(true);
  });

  it("навык с ошибкой в прошлом и верный сейчас считается исправленным", () => {
    const profile: PlayerProfile = { playerId: "p1", runs: 2, skills: { cover: { ok: 0, fail: 2 } } };
    expect(skillRows(mine, profile).find((r) => r.skill === "cover")?.status).toBe("fixed");
  });

  it("ошибка важнее верного действия в том же навыке", () => {
    const both = { ...mine, ok: ["gas" as const] };
    expect(skillRows(both, null).map((r) => [r.skill, r.status])).toEqual([["gas", "mistake"]]);
  });

  it("нет данных игрока: пустой список", () => {
    expect(skillRows(undefined, null)).toEqual([]);
  });
});
