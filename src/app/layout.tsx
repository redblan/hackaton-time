import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { APP } from "@/shared/config";
import "./globals.css";

// Шрифты локальные (пакет geist), сборке не нужен интернет
const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: APP.name,
  description: APP.tagline,
};

// Тема хранится в cookie и ставится на сервере: без мигания и без inline-скриптов
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const dark = (await cookies()).get("theme")?.value === "dark";
  return (
    <html lang="ru" className={dark ? "dark" : undefined} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
