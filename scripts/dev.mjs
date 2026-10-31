// npm run dev: сервер (tsx watch, :3000) + клиент (Vite, :5173) одной командой, без лишних зависимостей.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

const lanIps = () => Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);

// Шифрование и в dev: самоподписанный сертификат для Vite (тот же, что у npm run start). HTTPS=0 — выключить.
const certsDir = join(import.meta.dirname, "..", "server", ".certs");
let https = process.env.HTTPS !== "0";
if (https && !existsSync(join(certsDir, "cert.pem"))) {
  try {
    mkdirSync(certsDir, { recursive: true });
    const san = ["DNS:localhost", "IP:127.0.0.1", ...lanIps().map((ip) => `IP:${ip}`)].join(",");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "825",
      "-keyout", join(certsDir, "key.pem"), "-out", join(certsDir, "cert.pem"), "-subj", "/CN=toltchok-local", "-addext", `subjectAltName=${san}`], { stdio: "ignore" });
  } catch {
    console.warn("[dev] openssl недоступен — клиент по HTTP");
    https = false;
  }
}

const procs = [
  { name: "server", color: 36, args: ["run", "dev", "-w", "server"] },
  { name: "client", color: 35, args: ["run", "dev", "-w", "client"] },
];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = procs.map(({ name, color, args }) => {
  const child = spawn(npm, args, { stdio: ["inherit", "pipe", "pipe"], env: {
      ...process.env,
      CLIENT_HTTPS: https ? "1" : "0",
      // С HTTPS игроки ходят через Vite (:5173, TLS); сервер (:3000, HTTP) — только для этого ноута, в сеть не торчит
      ...(https && name === "server" && !process.env.HOST ? { HOST: "127.0.0.1" } : {}),
    }, shell: process.platform === "win32" });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) out.write(prefix + l + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`${prefix}завершился (${code})`);
    shutdown(code ?? 0);
  });
  return child;
});

let down = false;
function shutdown(code) {
  if (down) return;
  down = true;
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

setTimeout(() => {
  const proto = https ? "https" : "http";
  console.log(`\n  Игра:  ${proto}://localhost:5173` + lanIps().map((ip) => `\n         ${proto}://${ip}:5173   ← с других ноутов`).join("") + "\n  Песочница: /sandbox" + (https ? "\n  Сертификат самоподписанный: в браузере «Дополнительно → Перейти на сайт»" : "") + "\n");
}, 2500);
