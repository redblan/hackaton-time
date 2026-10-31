import { describe, expect, it } from "vitest";
import { AudioQueue } from "./audioQueue";

describe("очередь озвучки NPC (M20)", () => {
  it("фразы по одной, по порядку", () => {
    const q = new AudioQueue<string>();
    q.push({ npcId: "papa", audio: "1" });
    q.push({ npcId: "mihalych", audio: "2" });
    expect(q.next()?.audio).toBe("1");
    expect(q.next()?.audio).toBe("2");
    expect(q.next()).toBeNull();
  });
  it("новая реплика того же NPC обрывает текущую", () => {
    const q = new AudioQueue<string>();
    q.push({ npcId: "vanya", audio: "старое" });
    q.next();
    expect(q.push({ npcId: "vanya", audio: "новое" })).toBe(true);
    expect(q.next()?.audio).toBe("новое");
  });
  it("реплика другого NPC ждёт, не обрывает", () => {
    const q = new AudioQueue<string>();
    q.push({ npcId: "papa", audio: "1" });
    q.next();
    expect(q.push({ npcId: "mihalych", audio: "2" })).toBe(false);
    expect(q.size).toBe(1);
  });
  it("ждущая реплика того же NPC заменяется новой", () => {
    const q = new AudioQueue<string>();
    q.push({ npcId: "papa", audio: "1" });
    q.next();
    q.push({ npcId: "vanya", audio: "а" });
    q.push({ npcId: "vanya", audio: "б" });
    expect(q.size).toBe(1);
    q.next();
    expect(q.playing?.audio).toBe("б");
  });
  it("выключили звук — очередь пустая", () => {
    const q = new AudioQueue<string>();
    q.push({ npcId: "papa", audio: "1" });
    q.clear();
    expect(q.next()).toBeNull();
  });
});
