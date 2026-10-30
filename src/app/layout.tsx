import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
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

// Ставит тёмную тему до отрисовки, чтобы не было мигания
const themeScript = `try{if(localStorage.theme==='dark'||(!localStorage.theme&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
