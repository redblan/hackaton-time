import { describe, expect, it } from "vitest";
import { checkWav, cleanTranscript, createStt, SttError } from "../src/stt";

/** WAV-заголовок + тишина */
function wav({ rate = 16000, channels = 1, bits = 16, ms = 100, silent = false } = {}): Buffer {
  const data = Buffer.alloc(Math.round((rate * ms) / 1000) * channels * (bits / 8));
  // Не тишина: тихую запись transcribe отсекает сразу, не зовя whisper
  if (!silent && bits === 16) for (let i = 0; i + 1 < data.length; i += 2) data.writeInt16LE(Math.round(Math.sin(i / 20) * 8000), i);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE((rate * channels * bits) / 8, 28);
  h.writeUInt16LE((channels * bits) / 8, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

describe("распознавание речи (M12)", () => {
  it("принимает только WAV 16 кГц моно 16 бит", () => {
    expect(() => checkWav(wav())).not.toThrow();
    expect(() => checkWav(wav({ rate: 44100 }))).toThrow(SttError);
    expect(() => checkWav(wav({ channels: 2 }))).toThrow(SttError);
    expect(() => checkWav(Buffer.from("OggS не wav, а webm/ogg"))).toThrow(SttError);
  });

  it("чистит вывод whisper: метки времени, [BLANK_AUDIO]", () => {
    expect(cleanTranscript("[00:00:00.000 --> 00:00:02.000]  Спокойно, я рядом.\n[BLANK_AUDIO]\n Сообщу спасателям.\n")).toBe(
      "Спокойно, я рядом. Сообщу спасателям.",
    );
  });

  it("зовёт whisper с моделью, файлом и русским языком; временный файл удаляет", async () => {
    let seen: string[] = [];
    const stt = createStt({
      bin: "whisper-cli",
      model: "ggml-base.bin",
      run: async (_bin, args) => {
        seen = args;
        return " Застрял в лифте, между шестым и седьмым.\n";
      },
    });
    expect(await stt.transcribe(wav())).toBe("Застрял в лифте, между шестым и седьмым.");
    expect(seen).toEqual(expect.arrayContaining(["-m", "ggml-base.bin", "-l", "ru", "-nt"]));
    const file = seen[seen.indexOf("-f") + 1]!;
    const { existsSync } = await import("node:fs");
    expect(existsSync(file)).toBe(false);
  });

  it("тишина — whisper не зовём, сразу пусто", async () => {
    let called = false;
    const stt = createStt({ run: async () => ((called = true), "Редактор субтитров А.Синецкая") });
    expect(await stt.transcribe(wav({ silent: true }))).toBe("");
    expect(called).toBe(false);
  });

  it("без путей к whisper — понятная ошибка, а не падение", async () => {
    const stt = createStt({ bin: "", model: "" });
    expect(stt.available()).toBe(false);
    await expect(stt.transcribe(wav())).rejects.toThrow("WHISPER_BIN");
  });
});
