/** Serial playback: decoding counts as busy, so concurrent arrivals cannot overlap. */
export class RadioPlayer {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private queue: { name: string; wav: ArrayBuffer }[] = [];
  private busy = false;
  private generation = 0;
  private disposed = false;
  constructor(private createContext: () => AudioContext, private speaker: (name: string | null) => void) {}

  push(name: string, wav: ArrayBuffer) {
    if (this.disposed || !(wav instanceof ArrayBuffer) || wav.byteLength < 44 || wav.byteLength > 520_000) return;
    // Bound delay and memory: keep at most six waiting recordings.
    if (this.queue.length >= 6) this.queue.shift();
    this.queue.push({ name, wav });
    void this.pump();
  }
  async wake() {
    if (this.disposed) return;
    try {
      this.ctx ??= this.createContext();
      await this.ctx.resume();
      void this.pump();
    } catch { /* A subsequent user gesture can retry audio activation. */ }
  }
  private async pump() {
    if (this.disposed || this.busy || !this.ctx || this.ctx.state !== "running") return;
    const clip = this.queue.shift();
    if (!clip) return;
    this.busy = true;
    const generation = this.generation;
    try {
      const audio = await this.ctx.decodeAudioData(clip.wav.slice(0));
      if (generation !== this.generation || this.disposed) return;
      const source = this.ctx.createBufferSource();
      this.source = source;
      source.buffer = audio;
      source.connect(this.ctx.destination);
      source.onended = () => {
        if (this.source !== source) return;
        source.disconnect(); this.source = null; this.busy = false;
        this.speaker(null); void this.pump();
      };
      source.start();
      this.speaker(clip.name);
    } catch {
      if (generation !== this.generation) return;
      this.source?.disconnect(); this.source = null; this.busy = false;
      this.speaker(null); void this.pump();
    }
  }
  clear() {
    this.generation++; this.queue = []; this.busy = false;
    if (this.source) {
      this.source.onended = null;
      try { this.source.stop(); } catch { /* Already stopped. */ }
      this.source.disconnect(); this.source = null;
    }
    this.speaker(null);
  }
  dispose() {
    this.disposed = true; this.clear();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
