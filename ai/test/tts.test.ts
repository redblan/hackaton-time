import { describe, expect, it } from "vitest";
import { createTts, loadData, speakable } from "../src/index";

const fakeWav = (tag: string) => Buffer.from(`RIFF${tag}`);

describe("озвучка NPC (Piper)", () => {
  it("текст для озвучки: ремарки молча, 112 словами, без эмодзи", () => {
    expect(speakable("(Не отвечает. Грудная клетка не поднимается.)")).toBe("");
    expect(speakable("Звони 112, адрес — на табличке.")).toBe("Звони сто двенадцать, адрес — на табличке.");
    expect(speakable("🎙 Ладно... «дышу»")).toBe("Ладно... дышу");
  });

  it("голос и темп — из карточки NPC: Ваня тараторит, Валентина медленнее", async () => {
    const calls: string[][] = [];
    const tts = createTts({ voicesDir: "/v", cards: loadData().cards, run: async (_b, args) => (calls.push(args), fakeWav("x")) });
    await tts.speak("vanya", "Помогите!");
    await tts.speak("valentina", "Никуда я не пойду.");
    expect(calls[0]).toEqual(expect.arrayContaining(["-m", expect.stringContaining("ru_RU-denis-medium.onnx")]));
    expect(Number(calls[0]![calls[0]!.indexOf("--length_scale") + 1])).toBeLessThan(1);
    expect(calls[1]).toEqual(expect.arrayContaining([expect.stringContaining("ru_RU-irina-medium.onnx")]));
    expect(Number(calls[1]![calls[1]!.indexOf("--length_scale") + 1])).toBeGreaterThan(1);
  });

  it("повтор фразы — из кеша, Piper не зовём", async () => {
    let n = 0;
    const tts = createTts({ run: async () => (n++, fakeWav("a")) });
    await tts.speak("papa", "Под стол, быстро!");
    await tts.speak("papa", "Под стол, быстро!");
    expect(n).toBe(1);
  });

  it("Piper по одному: фразы не идут параллельно", async () => {
    let active = 0;
    let peak = 0;
    const tts = createTts({
      run: async () => {
        peak = Math.max(peak, ++active);
        await new Promise((r) => setTimeout(r, 20));
        active--;
        return fakeWav("b");
      },
    });
    await Promise.all(["Раз", "Два", "Три"].map((t) => tts.speak("papa", t)));
    expect(peak).toBe(1);
  });

  it("нечего озвучивать, Piper не настроен или упал — null, без исключений", async () => {
    expect(await createTts({ run: async () => fakeWav("c") }).speak("victim_cpr", "(Не отвечает.)")).toBeNull();
    expect(await createTts({ bin: "", voicesDir: "" }).speak("papa", "Привет")).toBeNull();
    const broken = createTts({ run: async () => { throw new Error("сломался"); } });
    expect(await broken.speak("papa", "Привет")).toBeNull();
    // после сбоя очередь не застревает
    expect(await createTts({ run: async () => fakeWav("d") }).speak("papa", "Снова")).not.toBeNull();
  });
});
