"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input, NativeSelect } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { CATEGORIES, CATEGORY_LABEL, STATUSES, STATUS_META } from "../constants";

/** Фильтры живут в URL: ссылкой можно поделиться, кнопка "назад" работает. */
export function ListFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  function setParam(key: string, value: string) {
    const sp = new URLSearchParams(params);
    if (value) sp.set(key, value);
    else sp.delete(key);
    sp.delete("page");
    startTransition(() => router.replace(`${pathname}?${sp}`));
  }

  // Поиск с задержкой, чтобы не дёргать сервер на каждую букву
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => setParam("q", q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = params.get("q") || params.get("status") || params.get("category");

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-pending={pending || undefined}>
      <div className="relative min-w-60 flex-1">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию или адресу"
          className="pl-9"
        />
      </div>
      <NativeSelect
        className="w-44"
        value={params.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
      >
        <option value="">Все статусы</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        className="w-52"
        value={params.get("category") ?? ""}
        onChange={(e) => setParam("category", e.target.value)}
      >
        <option value="">Все категории</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </NativeSelect>
      {hasFilters && (
        <Button
          variant="ghost"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname));
          }}
        >
          <X /> Сбросить
        </Button>
      )}
    </div>
  );
}
