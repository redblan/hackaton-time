/**
 * Голос (M12): так ИИ получит речь от whisper — числа словами, без знаков, маленькими буквами,
 * со словами-паразитами и «титрами» на тишине. Диспетчер, Громов и тон должны работать так же.
 */
import { describe, expect, it } from "vitest";
import { extractHandover, extractSlots } from "../src/index";
import { detectTone as tone, numberWordsToDigits as n2d } from "../src/text";
import { cleanTranscript } from "../src/stt";

describe("числа словами → цифры", () => {
  it.each([
    ["садовая четырнадцать", "садовая 14"],
    ["улица мира двадцать три", "улица мира 23"],
    ["жгут в пятнадцать сорок", "жгут в 15 40"],
    ["трое пострадавших, одна не дышит", "трое пострадавших, 1 не дышит"],
    ["дом тридцать.", "дом 30."],
    ["на шестом этаже", "на шестом этаже"],
  ])("%s → %s", (from, to) => expect(n2d(from)).toBe(to));
});

describe("диспетчер на «голосовом» тексте", () => {
  const ADDRESS = "ул. Садовая, 14";
  it("адрес числом-словом засчитан", () => {
    expect(extractSlots("ну э садовая четырнадцать", ADDRESS).has("address")).toBe(true);
    expect(extractSlots("садовая сорок один", ADDRESS).has("address")).toBe(false);
  });
  it("весь доклад одной фразой без знаков препинания", () => {
    const s = extractSlots(
      "алло землетрясение садовая четырнадцать трое пострадавших у одного кровотечение парень застрял в лифте на пятом пожар во дворе оборван провод",
      ADDRESS,
    );
    expect([...s].sort()).toEqual(["address", "condition", "fire", "hazard", "trapped", "victims", "what"]);
  });
});

describe("доклад Громову на «голосовом» тексте", () => {
  it("время жгута словами", () => {
    expect(extractHandover("жгут наложили в пятнадцать сорок").has("tourniquet_time")).toBe(true);
    expect(extractHandover("наложил жгут в четырнадцать двадцать пять").has("tourniquet_time")).toBe(true);
  });
});

describe("тон на «голосовом» тексте", () => {
  it("без знаков и с паразитами", () => {
    expect(tone("ну ваня спокойно я рядом сообщу спасателям")).toBe("calm");
    expect(tone("да заткнись ты уже")).toBe("rude");
  });
});

describe("галлюцинации whisper на тишине", () => {
  it.each(["Продолжение следует...", "Субтитры сделал DimaTorzok", "Спасибо за просмотр!", "Спасибо."])("«%s» — выкидываем", (line) =>
    expect(cleanTranscript(line)).toBe(""),
  );
  it("нормальная речь остаётся", () => {
    expect(cleanTranscript(" Спасибо, что пришёл, Ваня держись.")).toBe("Спасибо, что пришёл, Ваня держись.");
  });
});

