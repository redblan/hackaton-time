/** Звуки мини-игр через Web Audio, без файлов. Если браузер не дал звук, игра идёт молча. */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(frequency: number, seconds: number, volume: number, delay = 0, wave: OscillatorType = "sine") {
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + delay;
  const oscillator = ac.createOscillator();
  const gain = ac.createGain();
  oscillator.type = wave;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  oscillator.connect(gain).connect(ac.destination);
  oscillator.start(start);
  oscillator.stop(start + seconds);
}

export const sfx = {
  click: () => tone(620, 0.05, 0.08, 0, "triangle"),
  metronome: () => tone(1100, 0.05, 0.12, 0, "square"),
  press: () => tone(180, 0.09, 0.2),
  success() {
    tone(523, 0.14, 0.14);
    tone(659, 0.14, 0.14, 0.12);
    tone(784, 0.22, 0.14, 0.24);
  },
  failure() {
    tone(247, 0.2, 0.14, 0, "triangle");
    tone(196, 0.3, 0.14, 0.18, "triangle");
  },
};
