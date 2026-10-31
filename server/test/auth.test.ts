import { describe, expect, it } from "vitest";
import { login, LoginLimiter, register, resolveToken, revokeToken } from "../src/auth";
import { MemStore } from "../src/db";

describe("вход и регистрация", () => {
  it("регистрация, повтор имени, вход, неверный пароль, выход", async () => {
    const store = new MemStore();
    const limiter = new LoginLimiter();
    const r = await register(store, "Юра", "1234");
    expect(r.ok).toBe(true);
    expect(await register(store, "Юра", "5678")).toMatchObject({ ok: false, status: 409 });
    expect(await login(store, limiter, "Юра", "0000")).toMatchObject({ ok: false, status: 401 });
    expect(await login(store, limiter, "Никто", "1234")).toMatchObject({ ok: false, status: 401 }); // тот же ответ
    const ok = await login(store, limiter, "Юра", "1234");
    if (!ok.ok) throw new Error(ok.error);
    expect(ok.playerId).toBe(r.ok && r.playerId);
    expect(ok.token.split(".")).toHaveLength(3); // JWT: header.payload.signature
    expect((await resolveToken(store, ok.token))?.name).toBe("Юра");
    expect(await resolveToken(store, ok.token + "x")).toBeNull(); // подпись не сошлась
    await revokeToken(store, ok.token);
    expect(await resolveToken(store, ok.token)).toBeNull(); // отозван, хотя не истёк
  });

  it("плохие имя и пароль отклоняются", async () => {
    const store = new MemStore();
    expect(await register(store, "x", "1234")).toMatchObject({ ok: false, status: 400 });
    expect(await register(store, "<script>", "1234")).toMatchObject({ ok: false, status: 400 });
    expect(await register(store, "Нормальное Имя", "12")).toMatchObject({ ok: false, status: 400 });
  });

  it("перебор пароля блокируется", async () => {
    const store = new MemStore();
    const limiter = new LoginLimiter();
    await register(store, "Матвей", "верный");
    for (let i = 0; i < 8; i++) await login(store, limiter, "Матвей", "мимо" + i);
    expect(await login(store, limiter, "Матвей", "верный")).toMatchObject({ ok: false, status: 429 });
  });
});
