import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { login, LoginLimiter, register, resolveToken, revokeToken } from '../src/auth';
import { openStore, type Store } from '../src/db';

// Настоящая БД; без TEST_DATABASE_URL тест пропускается, unit-тесты не требуют Docker.
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('аккаунт и прогресс в PostgreSQL после перезапуска', () => {
  it('сохраняет пароль, сессию, навыки, память NPC и позицию; позволяет войти снова', async () => {
    const name = `dbtest_${randomUUID().slice(0, 8)}`;
    const password = 'проверка-сохранения';
    let store: Store | undefined;
    let playerId: string | undefined;
    try {
      store = await openStore(databaseUrl!);
      const registered = await register(store, name, password);
      if (!registered.ok) throw new Error(registered.error);
      playerId = registered.playerId;
      expect((await store.findPlayer(name))?.passHash).not.toContain(password);
      const profile = { playerId, runs: 2, skills: { smoke: { ok: 1, fail: 1 } } };
      const memory = await store.getMemory(playerId);
      memory.mistakes.smoke = 1;
      const progress = { roomId: 'persistence-test', stage: 'exit_building' as const, pos: [5, 12, 4] as [number, number, number] };
      await store.saveProfile(profile);
      await store.saveMemory(memory);
      await store.saveProgress(playerId, progress);
      await store.close?.();
      store = await openStore(databaseUrl!);
      expect(await store.getProfile(playerId)).toEqual(profile);
      expect(await store.getMemory(playerId)).toEqual(memory);
      expect(await store.getProgress(playerId)).toEqual(progress);
      expect((await resolveToken(store, registered.token))?.id).toBe(playerId);
      expect(await register(store, name, 'другой-пароль')).toMatchObject({ ok: false, status: 409 });
      const signedIn = await login(store, new LoginLimiter(), name, password);
      expect(signedIn).toMatchObject({ ok: true, playerId });
      expect(await login(store, new LoginLimiter(), name, 'неверный')).toMatchObject({ ok: false, status: 401 });
      await revokeToken(store, registered.token);
      await store.close?.();
      store = await openStore(databaseUrl!);
      expect(await resolveToken(store, registered.token)).toBeNull();
      expect(await login(store, new LoginLimiter(), name, password)).toMatchObject({ ok: true, playerId });
    } finally {
      await store?.close?.();
      if (playerId) {
        const cleanup = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
        try { await cleanup.query('DELETE FROM players WHERE id = $1', [playerId]); }
        finally { await cleanup.end(); }
      }
    }
  }, 20000);
});
