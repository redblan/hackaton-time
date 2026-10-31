import { describe, expect, it } from "vitest";
import { concat, downsample, encodeWav, level, MAX_SECONDS, MAX_WAV_BYTES, peakOf } from "./wav";
import { voiceTarget } from "./VoiceButton";

const tone = (n: number) => new Float32Array(n).map((_, i) => Math.sin(i / 10) * 0.5);

describe("голос: WAV для сервера (D-69)", () => {
  it("48 кГц → 16 кГц, длина по времени сохраняется", () => {
    expect(downsample(tone(48000), 48000).length).toBe(16000);
    expect(downsample(tone(44100), 44100).length).toBe(16000);
  });
  it("заголовок WAV: PCM, моно, 16 кГц, 16 бит", () => {
    const v = new DataView(encodeWav(tone(16000)));
    const str = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect([str(0), str(8), str(12), str(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect([v.getUint16(20, true), v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true)]).toEqual([1, 1, 16000, 16]);
    expect(v.byteLength).toBe(44 + 16000 * 2);
  });
  it("15 секунд укладываются в лимит сервера", () => {
    expect(encodeWav(new Float32Array(16000 * MAX_SECONDS)).byteLength).toBeLessThanOrEqual(MAX_WAV_BYTES);
  });
  it("тишина распознаётся по пиковой громкости", () => {
    expect(peakOf(new Float32Array(16000))).toBeLessThan(0.01);
    expect(peakOf(tone(16000))).toBeGreaterThan(0.4);
  });
  it("склейка кусков и громкость", () => {
    expect(concat([tone(10), tone(5)]).length).toBe(15);
    expect(level(new Float32Array(100))).toBe(0);
    expect(level(tone(4096))).toBeGreaterThan(0.5);
  });
});

describe("голос: кому говорим", () => {
  const base = { chatTarget: null, stage: null, nearNpc: null, npcLines: [] };
  it("открыт чат — тому, с кем он открыт", () => expect(voiceTarget({ ...base, chatTarget: "valentina", nearNpc: "vanya" })).toBe("valentina"));
  it("открыт чат рации — в рацию", () => expect(voiceTarget({ ...base, chatTarget: "radio", nearNpc: "vanya" })).toBe("radio"));
  it("звонок 112 → рация", () => expect(voiceTarget({ ...base, nearNpc: "vanya", stage: { stage: "call_112", hint: "" } })).toBe("radio"));
  it("NPC рядом", () => expect(voiceTarget({ ...base, nearNpc: "vanya" })).toBe("vanya"));
  it("никого рядом — последний, кто говорил", () =>
    expect(voiceTarget({ ...base, npcLines: [{ key: 1, npcId: "papa", text: "…", done: true }] })).toBe("papa"));
  it("иначе рация", () => expect(voiceTarget(base)).toBe("radio"));
});
