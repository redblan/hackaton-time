/**
 * Очередь запросов к Ollama (M10). Модель на ноутбуке отвечает по одному, поэтому:
 * - одновременно в работе не больше `concurrency` запросов (по умолчанию 1);
 * - ждать в очереди могут не больше `maxQueue`, остальные сразу получают отказ → шаблон;
 * - у запроса есть срок: не успел начаться до него — отказ, начался — получает остаток времени;
 * - у игрока ждёт не больше одного запроса: новый вытесняет старый (тот отвечает шаблоном).
 * Отказ — честный и быстрый: игрок не ждёт дольше таймаута, NPC говорит заготовкой.
 */

export class QueueSkip extends Error {
  constructor(public readonly reason: "full" | "deadline" | "replaced") {
    super(`очередь к модели: ${reason}`);
  }
}

export interface QueueStats {
  running: number;
  waiting: number;
  done: number;
  skipped: Record<QueueSkip["reason"], number>;
}

interface Job {
  key: string;
  deadline: number;
  start: () => void;
  skip: (reason: QueueSkip["reason"]) => void;
}

export interface LlmQueue {
  /**
   * Выполнить задачу, когда освободится место. `task` получает, сколько мс осталось до срока.
   * Отклоняется с QueueSkip, если места нет, срок прошёл или игрок прислал новый запрос.
   */
  run<T>(key: string, timeoutMs: number, task: (remainingMs: number) => Promise<T>): Promise<T>;
  stats(): QueueStats;
}

export function createLlmQueue(opts: { concurrency?: number; maxQueue?: number; now?: () => number } = {}): LlmQueue {
  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const maxQueue = Math.max(0, opts.maxQueue ?? 3);
  const now = opts.now ?? Date.now;
  const waiting: Job[] = [];
  let running = 0;
  let done = 0;
  const skipped: QueueStats["skipped"] = { full: 0, deadline: 0, replaced: 0 };

  function drop(job: Job, reason: QueueSkip["reason"]) {
    skipped[reason]++;
    job.skip(reason);
  }

  function pump() {
    while (running < concurrency && waiting.length > 0) {
      const job = waiting.shift()!;
      if (job.deadline <= now()) {
        drop(job, "deadline");
        continue;
      }
      running++;
      job.start();
    }
  }

  return {
    run<T>(key: string, timeoutMs: number, task: (remainingMs: number) => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const deadline = now() + timeoutMs;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const job: Job = {
          key,
          deadline,
          start: () => {
            if (timer) clearTimeout(timer);
            task(Math.max(1, deadline - now()))
              .then(resolve, reject)
              .finally(() => {
                running--;
                done++;
                pump();
              });
          },
          skip: (reason) => {
            if (timer) clearTimeout(timer);
            reject(new QueueSkip(reason));
          },
        };

        // Старый ждущий запрос этого же игрока больше не нужен — ответит шаблоном
        const prev = waiting.findIndex((j) => j.key === key);
        if (prev >= 0) drop(waiting.splice(prev, 1)[0]!, "replaced");

        if (running < concurrency) {
          running++;
          job.start();
          return;
        }
        if (waiting.length >= maxQueue) {
          drop(job, "full");
          return;
        }
        waiting.push(job);
        // Не дождался места до срока — сразу шаблон, а не в конце очереди
        timer = setTimeout(() => {
          const i = waiting.indexOf(job);
          if (i >= 0) drop(waiting.splice(i, 1)[0]!, "deadline");
        }, Math.max(0, deadline - now()));
      });
    },
    stats: () => ({ running, waiting: waiting.length, done, skipped: { ...skipped } }),
  };
}
