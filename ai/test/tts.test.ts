import { afterEach, describe, expect, it, vi } from "vitest";
import { createTts, loadData, speakable } from "../src/index";

const fakeWav = (tag: string) => Buffer.from(`RIFF${tag}`);

afterEach(()=>vi.useRealTimers());

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

describe('Piper limits',()=>{
  it('bounds the waiting queue and expires stale lines before synthesis',async()=>{
    vi.useFakeTimers();
    let release!:(wav:Buffer)=>void;
    const run=vi.fn(()=>new Promise<Buffer>(resolve=>{release=resolve;}));
    const tts=createTts({run,maxQueue:1,maxQueueWaitMs:50});
    const active=tts.speak('papa','Первая');
    await vi.advanceTimersByTimeAsync(0);
    const stale=tts.speak('papa','Устаревшая');
    expect(await tts.speak('papa','Переполнение')).toBeNull();
    expect(tts.stats()).toMatchObject({running:1,waiting:1,dropped:1});
    await vi.advanceTimersByTimeAsync(51);
    expect(await stale).toBeNull();expect(tts.stats().waiting).toBe(0);
    release(fakeWav('a'));await active;
    expect(run).toHaveBeenCalledTimes(1);expect(tts.stats().dropped).toBe(2);
  });

  it('shares identical pending syntheses and recovers the same queue after a failure',async()=>{
    let release!:(wav:Buffer)=>void;
    const run=vi.fn().mockImplementationOnce(()=>new Promise<Buffer>(resolve=>{release=resolve;}))
      .mockRejectedValueOnce(new Error('test failure')).mockResolvedValue(fakeWav('ok'));
    const tts=createTts({run});
    const first=tts.speak('papa','Одинаково'),same=tts.speak('papa','Одинаково');
    await Promise.resolve();release(fakeWav('a'));
    expect(await first).toBe(await same);expect(run).toHaveBeenCalledTimes(1);
    expect(await tts.speak('papa','Ошибка')).toBeNull();
    expect(await tts.speak('papa','После ошибки')).not.toBeNull();
    expect(tts.stats()).toMatchObject({running:0,waiting:0});
  });

  it('uses byte-bounded LRU, skips oversized files and supports disabling the cache',async()=>{
    const calls:string[]=[];
    const tts=createTts({maxCacheBytes:10,run:async(_b,_a,text)=>{calls.push(text);return Buffer.alloc(text==='Большой'?11:5);}});
    await tts.speak('papa','А');await tts.speak('papa','Б');
    await tts.speak('papa','А'); // touch A: B is now the eviction candidate
    await tts.speak('papa','В');
    expect(tts.stats()).toMatchObject({cacheBytes:10,cacheEntries:2});
    await tts.speak('papa','А');expect(calls.filter(t=>t==='А')).toHaveLength(1);
    await tts.speak('papa','Б');expect(calls.filter(t=>t==='Б')).toHaveLength(2);
    await tts.speak('papa','Большой');await tts.speak('papa','Большой');
    expect(calls.filter(t=>t==='Большой')).toHaveLength(2);expect(tts.stats().cacheBytes).toBeLessThanOrEqual(10);
    const noCache=createTts({maxCacheBytes:0,run:async()=>fakeWav('a')});
    await noCache.speak('papa','А');await noCache.speak('papa','А');
    expect(noCache.stats()).toMatchObject({cacheBytes:0,synthesized:2});
  });

  it('allows one active job with a zero-length waiting queue and rejects huge input',async()=>{
    let release!:(wav:Buffer)=>void;
    const tts=createTts({maxQueue:0,run:()=>new Promise<Buffer>(resolve=>{release=resolve;})});
    const first=tts.speak('papa','Первый');await Promise.resolve();
    expect(await tts.speak('papa','Второй')).toBeNull();
    expect(await tts.speak('papa','я'.repeat(2001))).toBeNull();
    release(fakeWav('a'));await first;expect(tts.stats().waiting).toBe(0);
  });
});
