import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = vi.hoisted(() => ({ query: vi.fn(), end: vi.fn(), on: vi.fn() }));
vi.mock('pg', () => ({ default: { Pool: class {
  query = pool.query;
  end = pool.end;
  on = pool.on;
} } }));
import { openStore } from '../src/db';

beforeEach(() => { vi.clearAllMocks(); pool.end.mockResolvedValue(undefined); });

describe('постоянное хранилище при старте', () => {
  it('не принимает аккаунты в память, если PostgreSQL недоступен', async () => {
    pool.query.mockRejectedValueOnce(new Error('connection refused'));
    await expect(openStore('postgres://unavailable/test')).rejects.toThrow('аккаунты и прогресс должны сохраняться в БД');
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it('разрешает память только при явном включении временного демо', async () => {
    pool.query.mockRejectedValueOnce(new Error('connection refused'));
    const store = await openStore('postgres://unavailable/test', { allowMemoryFallback: true });
    expect(store.kind).toBe('memory');
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it('подключает PostgreSQL и освобождает соединения при закрытии', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const store = await openStore('postgres://available/test');
    expect(store.kind).toBe('postgres');
    await store.close?.();
    expect(pool.end).toHaveBeenCalledOnce();
  });
});
