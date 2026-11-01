import { describe, expect, it, vi } from "vitest";
import { RadioPlayer } from "./radioPlayer";
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup() {
  const sources: { onended: (() => void) | null; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> }[] = [];
  const decodes: { resolve: (buffer: AudioBuffer) => void; reject: (error: Error) => void }[] = [];
  const context = { state: "running", destination: {}, resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
    decodeAudioData: vi.fn(() => new Promise<AudioBuffer>((resolve, reject) => decodes.push({ resolve, reject }))),
    createBufferSource: () => {
      const source = { buffer: null, onended: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      sources.push(source); return source;
    },
  };
  const speaker = vi.fn();
  const player = new RadioPlayer(() => context as unknown as AudioContext, speaker);
  return { player, sources, decodes, context, speaker };
}
describe("D-71 radio playback", () => {
  it("serializes arrivals during decode and shows each speaker only while playing", async () => {
    const s = setup(); await s.player.wake();
    s.player.push("Матвей", new ArrayBuffer(100)); s.player.push("Егор", new ArrayBuffer(100));
    expect(s.decodes).toHaveLength(1); expect(s.speaker).not.toHaveBeenCalled();
    s.decodes[0]!.resolve({} as AudioBuffer); await tick();
    expect(s.speaker).toHaveBeenLastCalledWith("Матвей");
    s.sources[0]!.onended!(); expect(s.decodes).toHaveLength(2);
    s.decodes[1]!.resolve({} as AudioBuffer); await tick();
    expect(s.speaker).toHaveBeenLastCalledWith("Егор");
    s.sources[1]!.onended!(); expect(s.speaker).toHaveBeenLastCalledWith(null);
  });
  it("holds audio until a user gesture and bounds the waiting queue", async () => {
    const s = setup(); for (let i = 0; i < 10; i++) s.player.push(String(i), new ArrayBuffer(100));
    expect(s.decodes).toHaveLength(0); await s.player.wake();
    s.decodes[0]!.resolve({} as AudioBuffer); await tick();
    expect(s.speaker).toHaveBeenLastCalledWith("4");
  });
  it("skips a corrupt recording and plays the next one", async () => {
    const s = setup(); await s.player.wake();
    s.player.push("битый", new ArrayBuffer(100)); s.player.push("Егор", new ArrayBuffer(100));
    s.decodes[0]!.reject(Error("bad WAV")); await tick();
    expect(s.decodes).toHaveLength(2);
    s.decodes[1]!.resolve({} as AudioBuffer); await tick();
    expect(s.speaker).toHaveBeenLastCalledWith("Егор");
  });
  it("does not start a stale decode after leaving a room or disposing", async () => {
    const s = setup(); await s.player.wake(); s.player.push("старый", new ArrayBuffer(100));
    s.player.clear(); s.decodes[0]!.resolve({} as AudioBuffer); await tick();
    expect(s.sources).toHaveLength(0);
    s.player.push("новый", new ArrayBuffer(100)); s.decodes[1]!.resolve({} as AudioBuffer); await tick();
    s.player.dispose(); expect(s.sources[0]!.stop).toHaveBeenCalled(); expect(s.context.close).toHaveBeenCalled();
    s.player.push("поздний", new ArrayBuffer(100)); expect(s.decodes).toHaveLength(2);
  });
});
