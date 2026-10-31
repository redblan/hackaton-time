import { useState, type FormEvent } from "react";
import { Button, Card } from "./ui";
import { login } from "./net";

export function Login() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(await login(name, password));
    setBusy(false);
  }

  return (
    <div className="screen">
      <Card>
        <h1>Толчок</h1>
        <p className="muted">Эвакуация при землетрясении и первая помощь</p>
        <form onSubmit={submit} className="form">
          <label>
            Имя
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={24} />
          </label>
          <label>
            Пароль
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div className="error">{error}</div>}
          <Button type="submit" disabled={busy || !name || !password}>
            Войти
          </Button>
          <p className="muted small">Новое имя — создаём игрока. Знакомое — проверяем пароль.</p>
        </form>
      </Card>
    </div>
  );
}
