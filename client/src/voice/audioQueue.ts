/**
 * Очередь озвучки NPC (M20). Чистая логика без браузерных API — проверяется тестами.
 * Фразы играют по одной; новая реплика того же NPC обрывает его текущую и выкидывает его ждущие —
 * NPC не говорит старое поверх нового. Реплики разных NPC ждут своей очереди.
 */
export interface Clip<T> {
  npcId: string;
  audio: T;
}

export class AudioQueue<T> {
  private queue: Clip<T>[] = [];
  playing: Clip<T> | null = null;

  /** Добавить реплику. Возвращает true, если надо оборвать текущую (её говорит тот же NPC). */
  push(clip: Clip<T>): boolean {
    this.queue = this.queue.filter((c) => c.npcId !== clip.npcId);
    this.queue.push(clip);
    return this.playing?.npcId === clip.npcId;
  }

  /** Что играть следующим (null — нечего); вызывать, когда текущая закончилась или оборвана */
  next(): Clip<T> | null {
    this.playing = this.queue.shift() ?? null;
    return this.playing;
  }

  clear(): void {
    this.queue = [];
    this.playing = null;
  }

  get size(): number {
    return this.queue.length;
  }
}
