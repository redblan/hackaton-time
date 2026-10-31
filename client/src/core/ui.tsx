/** Мини UI-кит клиента: кнопка и карточка. Используйте их, а не свои стили. */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ variant = "primary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return <button className={`btn btn-${variant} ${className}`} {...rest} />;
}

export function Card({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`card ${wide ? "card-wide" : ""}`}>{children}</div>;
}
