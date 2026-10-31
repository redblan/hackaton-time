import { describe, expect, it } from "vitest";
import { canStart, findOpenRoom, newRoom, pickRole } from "../src/rooms";
import { MAX_CHUNKS_PER_CLIENT, planChunks } from "../src/chunks";

const addPlayer = (room: ReturnType<typeof newRoom>, id: string) =>
  room.players.set(id, { id, name: id, role: null, pos: [0, 0, 0], rotY: 0, anim: "idle", online: true });

describe("комнаты", () => {
  it("coop2 стартует, когда двое выбрали разные роли", () => {
    const room = newRoom("r1", "coop2");
    addPlayer(room, "a");
    expect(findOpenRoom([room], "coop2")).toBe(room);
    addPlayer(room, "b");
    expect(findOpenRoom([room], "coop2")).toBeUndefined();
    expect(pickRole(room, "a", "inside_top").ok).toBe(true);
    expect(pickRole(room, "b", "inside_top").ok).toBe(false);
    expect(pickRole(room, "b", "inside_mid").ok).toBe(false); // нет в coop2
    expect(canStart(room)).toBe(false);
    expect(pickRole(room, "b", "outside").ok).toBe(true);
    expect(canStart(room)).toBe(true);
  });
});

describe("чанки", () => {
  it("не больше 3 на клиента, лишнее выгружается", () => {
    const exists = (id: string) => id !== "nope";
    const first = planChunks(new Set(), ["a", "nope", "b", "c", "d"], exists);
    expect([...first.next]).toEqual(["a", "b", "c"]);
    expect(first.next.size).toBeLessThanOrEqual(MAX_CHUNKS_PER_CLIENT);
    const second = planChunks(first.next, ["c", "d"], exists);
    expect(second.send).toEqual(["d"]);
    expect(second.drop.sort()).toEqual(["a", "b"]);
    expect(planChunks(new Set(), "мусор", exists).next.size).toBe(0);
  });
});

describe("игровое время (D-50)", () => {
  it("идёт с нуля и стоит на паузе", async () => {
    const { gameNow, pauseClock, resumeClock } = await import("../src/rooms");
    const room = newRoom("r", "solo");
    resumeClock(room, 1000);
    expect(gameNow(room, 1500)).toBe(500);
    pauseClock(room, 2000);
    expect(gameNow(room, 9000)).toBe(1000);
    resumeClock(room, 10_000);
    expect(gameNow(room, 10_250)).toBe(1250);
  });
});
