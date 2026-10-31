import { describe, expect, it } from "vitest";
import { chunkAt, gridNeighbors, wantedChunks } from "../src/core/chunkMath";

describe("сетка чанков", () => {
  it("позиция → чанк", () => {
    expect(chunkAt([2, 18, 2])).toBe("e1f7");
    expect(chunkAt([13, 0, 5])).toBe("e2f1");
    expect(chunkAt([25, 0, -13])).toBe("y21");
    expect(chunkAt([2, 26.9, 2])).toBe("e1f9");
  });
  it("не больше 3 и текущий первым", () => {
    expect(wantedChunks([2, 18, 2], {})).toEqual(["e1f7", "e1f6", "e1f8"]);
    expect(wantedChunks([12, 0, -12], {}).length).toBe(3);
    expect(gridNeighbors("e1f1")[0]).toBe("y00");
  });
});
