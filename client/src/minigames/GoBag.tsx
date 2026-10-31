import { useEffect, useRef, useState } from "react";
import { ITEMS, type ItemId, type MinigameProps } from "@game/shared";
import { Button } from "../core/ui";
import { Frame, useCountdown, useFinish } from "./kit";
import { BAG_SLOTS, bagMistakes } from "./logic";

const DURATION_MS = 40_000;

const ITEM_VIEW: Record<ItemId, { icon: string; name: string }> = {
  documents: { icon: "🪪", name: "Документы" },
  phone: { icon: "📱", name: "Телефон" },
  first_aid_kit: { icon: "🧰", name: "Аптечка" },
  water: { icon: "💧", name: "Вода" },
  flashlight: { icon: "🔦", name: "Фонарик" },
  warm_clothes: { icon: "🧥", name: "Тёплая одежда" },
  bandage: { icon: "🩹", name: "Бинт" },
  laptop: { icon: "💻", name: "Ноутбук" },
  console: { icon: "🎮", name: "Приставка" },
  mugs: { icon: "☕", name: "Коллекция кружек" },
};

export function GoBag({ game, onDone }: MinigameProps) {
  const finish = useFinish(game, onDone);
  const [bag, setBag] = useState<ItemId[]>([]);
  const bagRef = useRef(bag);
  bagRef.current = bag;
  const submit = () => finish(bagMistakes(bagRef.current), { items: bagRef.current });
  const left = useCountdown(DURATION_MS, submit);

  const toggle = (item: ItemId) =>
    setBag((cur) => {
      if (cur.includes(item)) return cur.filter((i) => i !== item);
      return cur.length < BAG_SLOTS ? [...cur, item] : cur;
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
        return;
      }
      const index = e.key === "0" ? 9 : Number(e.key) - 1;
      const item = ITEMS[index];
      if (item) toggle(item);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Frame title="Тревожный рюкзак" hint="Выбери самое нужное: места всего на 6 вещей." left={left} total={DURATION_MS}>
      <div className="mg-slots">
        {Array.from({ length: BAG_SLOTS }, (_, i) => (
          <div key={i} className={`mg-slot ${bag[i] ? "mg-slot-full" : ""}`}>
            {bag[i] ? ITEM_VIEW[bag[i]!].icon : ""}
          </div>
        ))}
      </div>
      <div className="mg-grid">
        {ITEMS.map((item, i) => (
          <button
            key={item}
            className={`mg-tile ${bag.includes(item) ? "mg-tile-on" : ""}`}
            onClick={() => toggle(item)}
          >
            <span className="mg-key">{(i + 1) % 10}</span>
            <span className="mg-icon">{ITEM_VIEW[item].icon}</span>
            {ITEM_VIEW[item].name}
          </button>
        ))}
      </div>
      <Button onClick={submit}>Рюкзак собран (Enter)</Button>
    </Frame>
  );
}
