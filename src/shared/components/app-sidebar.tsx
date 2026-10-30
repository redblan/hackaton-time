"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogOut, Moon, Sun } from "lucide-react";
import { features } from "@/features/_registry.generated";
import { logout } from "@/shared/auth/actions";
import { APP } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";

type Props = { user: { name: string; role: "user" | "admin" } };

export function AppSidebar({ user }: Props) {
  const pathname = usePathname();
  const items = [
    { title: "Главная", href: "/", icon: LayoutDashboard, order: 0 },
    ...features.filter((f) => !f.adminOnly || user.role === "admin"),
  ];

  function toggleTheme() {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.theme = dark ? "dark" : "light";
    } catch {}
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          {APP.name.charAt(0)}
        </div>
        <span className="truncate font-semibold">{APP.name}</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t p-3">
        <div className="px-1">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="text-xs text-muted-foreground">
            {user.role === "admin" ? "Администратор" : "Пользователь"}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={toggleTheme} title="Сменить тему">
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
          </Button>
          <form action={logout} className="flex-1">
            <Button variant="outline" className="w-full">
              <LogOut /> Выйти
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}
