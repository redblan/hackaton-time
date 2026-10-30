"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import { createRequest, type FormState } from "../actions";
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES, PRIORITY_LABEL } from "../constants";

/** Форма создания: useActionState + server action, ошибки валидации приходят с сервера. */
export function CreateRequestDialog() {
  const [open, setOpen] = useState(false);
  // Обёртка над server action: реагируем на результат (тост, закрыть диалог)
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await createRequest(prev, formData);
    if (result.ok) {
      toast.success("Заявка создана");
      setOpen(false);
    } else if (result.error) {
      toast.error(result.error);
    }
    return result;
  }, {});

  const err = (k: keyof NonNullable<FormState["fieldErrors"]>) =>
    state.fieldErrors?.[k]?.[0] && <p className="text-xs text-destructive">{state.fieldErrors[k]![0]}</p>;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Новая заявка
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новая заявка</DialogTitle>
          <DialogDescription>Заполните основные данные</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Название</Label>
            <Input id="title" name="title" required />
            {err("title")}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea id="description" name="description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="category">Категория</Label>
              <NativeSelect id="category" name="category" defaultValue="">
                <option value="" disabled>
                  Выберите
                </option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </NativeSelect>
              {err("category")}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priority">Приоритет</Label>
              <NativeSelect id="priority" name="priority" defaultValue="medium">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="amount">Бюджет, ₽</Label>
              <Input id="amount" name="amount" type="number" min={0} defaultValue={0} />
              {err("amount")}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Адрес</Label>
              <Input id="address" name="address" />
            </div>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Сохраняем…" : "Создать"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
