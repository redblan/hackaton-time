import { useState, type FormEvent } from "react";
import { Button, Card } from "./ui";
import { login } from "./net";

type Mode = "login" | "register";

export function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const secure = window.location.protocol === "https:";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "register" && password !== repeat) {
      setError("Пароли не совпадают");
      return;
    }
    setBusy(true);
    setError(await login(name, password, mode));
    setBusy(false);
  }

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setRepeat("");
  };

  return (
    <div className="screen">
      <Card>
        <h1>Происшествия</h1>
        <p className="muted">Эвакуация при землетрясении и первая помощь</p>
        <div className="tabs">
          <button className={`tab ${mode === "login" ? "tab-on" : ""}`} onClick={() => switchTo("login")}>
            Вход
          </button>
          <button className={`tab ${mode === "register" ? "tab-on" : ""}`} onClick={() => switchTo("register")}>
            Новый игрок
          </button>
        </div>
        <form onSubmit={submit} className="form">
          <label>
            Имя
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={24} autoComplete="username" />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {mode === "register" && (
            <label>
              Пароль ещё раз
              <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
            </label>
          )}
          {error && <div className="error">{error}</div>}
          <Button type="submit" disabled={busy || !name || !password || (mode === "register" && !repeat)}>
            {mode === "login" ? "Войти" : "Создать и войти"}
          </Button>
          <p className="muted small">
            {mode === "login" ? "Первый раз? Вкладка «Новый игрок»." : "Имя — 2–24 символа, пароль — от 4. Прогресс и навыки сохраняются за этим именем."}
          </p>
          <p className={`small ${secure ? "secure" : "muted"}`}>
            {secure ? "🔒 Соединение зашифровано (HTTPS)" : "Соединение без шифрования — для демо запускайте npm run dev или npm run start с HTTPS"}
          </p>
        </form>
      </Card>
    </div>
  );
}
