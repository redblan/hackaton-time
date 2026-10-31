// npm run dev: сервер (tsx watch, :3000) + клиент (Vite, :5173) одной командой, без лишних зависимостей.
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";

const procs = [
  { name: "server", color: 36, args: ["run", "dev", "-w", "server"] },
  { name: "client", color: 35, args: ["run", "dev", "-w", "client"] },
];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = procs.map(({ name, color, args }) => {
  const child = spawn(npm, args, { stdio: ["inherit", "pipe", "pipe"], env: process.env });
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
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  console.log("\n  Игра:  http://localhost:5173" + ips.map((ip) => `\n         http://${ip}:5173   ← с других ноутов`).join("") + "\n  Песочница: /sandbox\n");
}, 2500);
