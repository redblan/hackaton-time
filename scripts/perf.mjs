// npm run perf — замер графики в настоящем браузере на этой видеокарте, без интернета.
// Сервер должен быть запущен (npm run start). Адрес: PERF_URL, браузер: CHROME, скриншоты: PERF_SHOTS=папка,
// PERF_PROFILE=1 — самые дорогие функции по каждой сцене (собери клиент без минификации).
// Показывает по точкам мира FPS без ограничения 60 кадров, время кадра, draw calls и треугольники.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_BASE = process.env.PERF_URL ?? "https://localhost:3000";
const SHOTS = process.env.PERF_SHOTS;
const PORT = 9333;
const SECONDS = Number(process.env.PERF_SECONDS ?? 4);
const PROFILE = Boolean(process.env.PERF_PROFILE);
const BROWSERS = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

/** Точки мира: ноги игрока и поворот (0 — на -z, π — на +z). */
const SCENES = [
  { name: "квартира, 7 этаж", pos: [3, 18, 6], rotY: Math.PI },
  { name: "коридор и лестница", pos: [7, 18, 4], rotY: -Math.PI / 2 },
  { name: "двор, смотрим на дом", pos: [14, 0, -30], rotY: Math.PI },
  { name: "двор, смотрим в каньон", pos: [18, 0, -30], rotY: 0 },
  { name: "у подъезда", pos: [6, 0, -6], rotY: Math.PI },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = BROWSERS.find((b) => existsSync(b));
if (!exe) throw new Error("Не нашёл Chrome или Edge, укажи путь в переменной CHROME");

const profile = mkdtempSync(join(tmpdir(), "perf-"));
const browser = spawn(
  exe,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--ignore-certificate-errors",
    "--window-size=1536,864",
    "--force-device-scale-factor=1.25",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
    "--use-angle=d3d11",
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function devtools() {
  for (let i = 0; i < 50; i++) {
    try {
      return await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" })).json();
    } catch {
      await wait(200);
    }
  }
  throw new Error("Браузер не отвечает");
}

function session(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const data = JSON.parse(m.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
  };
  const opened = new Promise((r) => (ws.onopen = r));
  const call = async (method, params = {}) => {
    await opened;
    const n = ++id;
    return new Promise((resolve, reject) => {
      pending.set(n, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  };
  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { call, evaluate, close: () => ws.close() };
}

const until = async (page, expr, ms = 30_000) => {
  const t0 = Date.now();
  while (!(await page.evaluate(expr))) {
    if (Date.now() - t0 > ms) throw new Error(`Не дождались: ${expr}`);
    await wait(200);
  }
};

/** Кадры подряд: время кадра и, если браузер даёт таймер видеокарты, её работа на кадр. */
const METRICS = (seconds) => `new Promise((resolve) => {
  const gl = document.querySelector("canvas").getContext("webgl2");
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const gpu = [];
  const queries = [];
  let active = null;
  const times = [];
  let last = performance.now();
  const start = last;
  const frame = (now) => {
    times.push(now - last);
    last = now;
    if (timer) {
      if (active) { gl.endQuery(timer.TIME_ELAPSED_EXT); queries.push(active); active = null; }
      while (queries.length && gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q = queries.shift();
        if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q);
      }
      active = gl.createQuery();
      gl.beginQuery(timer.TIME_ELAPSED_EXT, active);
    }
    if (now - start < ${seconds * 1000}) requestAnimationFrame(frame);
    else {
      if (active) gl.endQuery(timer.TIME_ELAPSED_EXT);
      const worst = Math.max(...times);
      times.sort((a, b) => a - b);
      gpu.sort((a, b) => a - b);
      const at = (p) => times[Math.floor(times.length * p)] ?? 0;
      resolve({ frames: times.length, fps: times.length / ((now - start) / 1000), p50: at(0.5), p95: at(0.95), p99: at(0.99), worst, gpu: gpu[Math.floor(gpu.length / 2)] ?? null, ...window.__perf.renderStats });
    }
  };
  requestAnimationFrame(frame);
})`;

/** Самые дорогие функции профиля: собственное время без вложенных вызовов. */
function topFunctions(profile, limit = 14) {
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  profile.samples.forEach((id, i) => {
    const f = byId.get(id).callFrame;
    const file = f.url.split("/").pop();
    const key = `${f.functionName || "(анонимная)"} ${file}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, ms]) => `${((ms / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
}

async function main() {
  const target = await devtools();
  const page = session(target.webSocketDebuggerUrl);
  await page.call("Runtime.enable");
  await page.call("Page.enable");
  await page.call("Performance.enable");
  await page.call("Page.navigate", { url: `${URL_BASE}/?perf` });
  await until(page, `document.readyState === "complete"`);

  const name = `perf_${Date.now().toString(36).slice(-6)}`;
  await page.evaluate(`(async () => {
    const res = await fetch("/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "${name}", password: "perf-local-1" }) });
    const body = await res.json();
    localStorage.setItem("toltchok.auth", JSON.stringify({ token: body.token, playerId: body.playerId, name: body.name }));
    location.href = "/?perf";
  })()`).catch(() => {});
  await wait(1500);
  await until(page, `[...document.querySelectorAll("button")].some((b) => b.textContent.includes("Одиночная"))`);
  await page.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("Одиночная")).click()`);
  await until(page, `Boolean(window.__perf?.store.get().room?.started && window.__perf.local.ready)`);
  await wait(3000);

  const gpu = await page.evaluate(`(() => {
    const gl = document.querySelector("canvas").getContext("webgl2");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
  })()`);
  const size = await page.evaluate(`(() => { const c = document.querySelector("canvas"); return c.width + "×" + c.height; })()`);
  console.log(`Видеокарта: ${gpu}`);
  console.log(`Разрешение: ${size}\n`);

  // Прогрев: шейдеры, модели и текстуры компилируются один раз и не должны попасть в замер
  for (const scene of SCENES) {
    await page.evaluate(`window.__perf.teleport(${JSON.stringify(scene.pos)}, ${scene.rotY})`);
    await wait(2500);
  }

  const rows = [];
  for (const scene of SCENES) {
    await page.evaluate(`(() => { const p = window.__perf; p.teleport(${JSON.stringify(scene.pos)}, ${scene.rotY}); })()`);
    await wait(2500);
    if (PROFILE) {
      await page.call("Profiler.enable");
      await page.call("Profiler.setSamplingInterval", { interval: 500 });
      await page.call("Profiler.start");
    }
    const before = await page.call("Performance.getMetrics");
    const m = await page.evaluate(METRICS(SECONDS));
    const after = await page.call("Performance.getMetrics");
    if (PROFILE) {
      const { profile } = await page.call("Profiler.stop");
      console.log(`\n--- ${scene.name}\n${topFunctions(profile).join("\n")}`);
    }
    const metric = (list, key) => list.metrics.find((x) => x.name === key)?.value ?? 0;
    const script = ((metric(after, "ScriptDuration") - metric(before, "ScriptDuration")) * 1000) / m.frames;
    const row = {
      сцена: scene.name,
      FPS: Math.round(m.fps),
      "кадр мс": m.p50.toFixed(1),
      "95%": m.p95.toFixed(1),
      "99%": m.p99.toFixed(1),
      "GPU мс": m.gpu === null ? "—" : m.gpu.toFixed(1),
      "JS мс": script.toFixed(2),
      "draw calls": m.calls,
      "тыс. треуг.": Math.round(m.triangles / 1000),
      шейдеры: m.programs,
    };
    rows.push(row);
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      const shot = await page.call("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(SHOTS, `${rows.length}.png`), Buffer.from(shot.data, "base64"));
    }
  }
  console.table(rows);

  // Спуск по этажам: рывки при подгрузке чанков, плюс обратно наверх
  if (PROFILE) await page.call("Profiler.start");
  const walk = await page.evaluate(`new Promise((resolve) => {
    const floors = [9, 8, 7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const times = [];
    const hitches = []; const seen = new Set(window.__perf.sceneRef.gl.info.programs.map((p) => p.id));
    let last = performance.now();
    let i = 0;
    const hop = setInterval(() => {
      if (i < floors.length) window.__perf.teleport([10, (floors[i++] - 1) * 3, 4], 0);
      else { clearInterval(hop); done = true; }
    }, 700);
    let done = false;
    const frame = (now) => {
      times.push(now - last);
      if (now - last > 50) { const list = window.__perf.sceneRef.gl.info.programs; const fresh = list.filter((p) => !seen.has(p.id)); fresh.forEach((p) => seen.add(p.id)); hitches.push("этаж " + floors[i - 1] + ": " + Math.round(now - last) + " мс, всего шейдеров " + list.length + ", новые: " + fresh.map((p) => p.name + "/" + p.cacheKey.length + "/" + p.cacheKey.split(",").slice(0, 3).join(" ").slice(0, 40)).join(" | ")); }
      last = now;
      if (!done) requestAnimationFrame(frame);
      else {
        times.sort((a, b) => b - a);
        resolve({ frames: times.length, worst: times.slice(0, 5), over33: times.filter((t) => t > 33).length, over50: times.filter((t) => t > 50).length, hitches });
      }
    };
    requestAnimationFrame(frame);
  })`);
  if (PROFILE) {
    const { profile } = await page.call("Profiler.stop");
    console.log(`\n--- смена этажей\n${topFunctions(profile, 24).join("\n")}`);
  }
  console.log(`Смена этажей: кадров ${walk.frames}, дольше 33 мс: ${walk.over33}, дольше 50 мс: ${walk.over50}, худшие: ${walk.worst.map((t) => t.toFixed(0)).join(", ")} мс`);
  for (const line of walk.hitches) console.log(line);
  const memory = await page.evaluate(`Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576)`);
  console.log(`Память JS: ${memory} МБ`);
  page.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    browser.kill();
    setTimeout(() => {
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* браузер ещё держит файлы — останется во временной папке */
      }
    }, 800);
  });
