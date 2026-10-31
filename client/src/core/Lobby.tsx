import { useEffect, useState } from "react";
import { MODES, type Mode, type PlayerProfile, type Role, type SkillId } from "@game/shared";
import { getSocket, logout } from "./net";
import { MODE_NAMES, ROLE_NAMES, SKILL_NAMES } from "./names";
import { useStore } from "./store";
import { Button, Card } from "./ui";
import { LastRoute } from '../debrief/LastRoute';

const ROLES_BY_MODE: Record<Mode, Role[]> = {
  solo: ["inside_top"],
  coop2: ["inside_top", "outside"],
  coop3: ["inside_top", "inside_mid", "outside"],
};

/** Карточка навыков за все прохождения: генератор чаще даёт то, в чём были ошибки */
function ProfileCard({ token }: { token: string }) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  useEffect(() => {
    fetch("/api/me", { headers: { authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? (r.json() as Promise<{ profile: PlayerProfile }>) : null))
      .then((d) => setProfile(d?.profile ?? null))
      .catch(() => {});
  }, [token]);
  if (!profile || (profile.runs === 0 && Object.keys(profile.skills).length === 0)) return <p className="muted">Первое прохождение — удачи!</p>;
  const skills = Object.entries(profile.skills) as [SkillId, { ok: number; fail: number }][];
  const weak = skills.filter(([, v]) => v.fail > 0).sort((a, b) => b[1].fail - a[1].fail);
  const strong = skills.filter(([, v]) => v.fail === 0 && v.ok > 0);
  return (
    <div className="profile">
      <b>Прохождений: {profile.runs}</b>
      {weak.length > 0 && (
        <div>
          Подтянуть: {weak.map(([k, v]) => `${SKILL_NAMES[k]} (ошибок ${v.fail})`).join(", ")}. Следующее прохождение проверит именно это.
        </div>
      )}
      {strong.length > 0 && <div className="muted">Уже уверенно: {strong.map(([k]) => SKILL_NAMES[k]).join(", ")}</div>}
    </div>
  );
}

export function Lobby() {
  const auth = useStore((s) => s.auth)!;
  const room = useStore((s) => s.room);
  const connected = useStore((s) => s.connected);
  const netError = useStore((s) => s.netError);
  const chat = useStore((s) => s.chat);
  const lastSystem = chat.filter((m) => m.from === "Система").at(-1);

  const join = (mode: Mode) => getSocket()?.emit("room:join", { mode });
  const ready = (role: Role) => getSocket()?.emit("room:ready", { role });

  const roles = room ? ROLES_BY_MODE[room.mode] : [];
  const myRole = room?.players.find((p) => p.id === auth.playerId)?.role ?? null;

  return (
    <div className="screen">
      <Card wide>
        <div className="row between">
          <h1>Лобби</h1>
          <span className="muted">
            {auth.name} · {connected ? "на связи" : "нет связи"}{" "}
            <Button variant="ghost" onClick={logout}>
              Выйти
            </Button>
          </span>
        </div>
        {netError && <div className="error">{netError}</div>}
        <ProfileCard token={auth.token} />
        <LastRoute token={auth.token} />

        <h2>Режим</h2>
        <div className="row">
          {MODES.map((m) => (
            <Button key={m} variant={room?.mode === m ? "primary" : "ghost"} onClick={() => join(m)} disabled={!connected}>
              {MODE_NAMES[m]}
            </Button>
          ))}
        </div>

        {room && (
          <>
            <h2>
              Комната {room.roomId} · игроков {room.players.length}/{roles.length}
            </h2>
            <div className="roles">
              {roles.map((r) => {
                const holder = room.players.find((p) => p.role === r);
                const mine = holder?.id === auth.playerId;
                return (
                  <button
                    key={r}
                    className={`role ${mine ? "role-mine" : ""} ${holder && !mine ? "role-taken" : ""}`}
                    disabled={Boolean(holder && !mine)}
                    onClick={() => ready(r)}
                  >
                    <b>{ROLE_NAMES[r]}</b>
                    <span>{holder ? holder.name : "свободно"}</span>
                  </button>
                );
              })}
            </div>
            <p className="muted">
              {room.players.length < roles.length
                ? "Ждём остальных игроков. Пусть выберут тот же режим."
                : myRole
                  ? "Ждём, пока все выберут роль…"
                  : "Выберите роль — игра начнётся, когда все готовы."}
            </p>
            {lastSystem && <div className="error">{lastSystem.text}</div>}
          </>
        )}
      </Card>
    </div>
  );
}
