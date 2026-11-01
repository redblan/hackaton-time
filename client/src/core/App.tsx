import { lazy, Suspense, useEffect } from "react";
import { connect, savedAuth } from "./net";
import { Login } from "./Login";
import { Lobby } from "./Lobby";
import { useStore } from "./store";

const Game = lazy(() => import("./Game").then((m) => ({ default: m.Game })));
const Sandbox = lazy(() => import("./Sandbox").then((m) => ({ default: m.Sandbox })));
const Admin = lazy(() => import("../admin/Admin").then((m) => ({ default: m.Admin })));

export function App() {
  if (window.location.pathname.startsWith("/admin")) {
    return (
      <Suspense fallback={<div className="screen">Загрузка…</div>}>
        <Admin />
      </Suspense>
    );
  }
  if (window.location.pathname.startsWith("/sandbox")) {
    return (
      <Suspense fallback={<div className="screen">Загрузка…</div>}>
        <Sandbox />
      </Suspense>
    );
  }
  return <MainFlow />;
}

function MainFlow() {
  const auth = useStore((s) => s.auth);
  const started = useStore((s) => Boolean(s.room?.started));

  useEffect(() => {
    const a = savedAuth();
    if (a) connect(a);
  }, []);

  if (!auth) return <Login />;
  if (!started) return <Lobby />;
  return (
    <Suspense fallback={<div className="screen">Загрузка мира…</div>}>
      <Game />
    </Suspense>
  );
}
