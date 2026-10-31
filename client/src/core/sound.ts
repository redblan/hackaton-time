/** Звуки без файлов (всё работает офлайн): гул землетрясения — отфильтрованный шум Web Audio. */
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

/** Гул толчка: низкий шум с нарастанием и затуханием */
export function playQuake(strength: number, durationMs: number) {
  const ac = audio();
  if (!ac) return;
  const seconds = Math.max(1, durationMs / 1000);
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    // коричневый шум — глухой, «земляной»
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const lowpass = ac.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 180;
  const gain = ac.createGain();
  const t = ac.currentTime;
  const peak = Math.min(1, 0.4 + 0.6 * strength);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.6);
  gain.gain.setValueAtTime(peak, t + seconds * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  src.connect(lowpass).connect(gain).connect(ac.destination);
  src.start();
}

/** Браузер разрешает звук только после действия игрока — «разбудим» аудио на первом клике */
export function unlockAudio() {
  const once = () => {
    audio();
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
  };
  window.addEventListener("pointerdown", once);
  window.addEventListener("keydown", once);
}
