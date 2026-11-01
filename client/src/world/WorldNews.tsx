/** Агент или админка поставили новый объект в загруженный чанк: сообщаем в чат HUD. */
import { useEffect, useRef } from "react";
import type { WorldObject } from "@game/shared";
import { store, useStore } from "../core/store";

const labelOf = (o: WorldObject) => (o.kind === "prop" || o.kind === "interactable" ? o.label : null);
const VISIBLE = new Set<WorldObject["kind"]>(["box", "model", "prop", "interactable"]);

export function WorldNews() {
  const chunks = useStore((s) => s.chunks);
  const known = useRef(new Map<string, Set<string>>());
  useEffect(() => {
    for (const chunk of Object.values(chunks)) {
      const before = known.current.get(chunk.id);
      known.current.set(chunk.id, new Set(chunk.objects.map((o) => o.id)));
      if (!before) continue;
      const added = chunk.objects.filter((o) => !before.has(o.id) && VISIBLE.has(o.kind));
      if (!added.length) continue;
      const label = added.map(labelOf).find(Boolean);
      const text = label ? `Рядом появилось: ${label}` : "Рядом что-то изменилось, осмотрись";
      store.set((st) => ({
        // дробный ключ не пересекается с целыми ключами из net.ts
        chat: [...st.chat, { key: (st.chat.at(-1)?.key ?? 0) + 0.5, from: "Журнал", text, at: Date.now() }].slice(-50),
      }));
    }
  }, [chunks]);
  return null;
}
