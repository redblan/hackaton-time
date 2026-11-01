/** Optional external voice conversion. Dependencies and models stay outside the game. */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NpcId } from "@game/shared";
export interface RvcOptions {
  enabled?: boolean;
  bin?: string;
  args?: string[];
  timeoutMs?: number;
  npcIds?: string[];
  skipOnFailure?: boolean;
  run?: (bin: string, args: string[], timeoutMs: number) => Promise<void>;
}
const defaultRun: NonNullable<RvcOptions["run"]> = (bin,args,timeoutMs) => new Promise((resolve,reject) => {
  execFile(bin,args,{timeout:timeoutMs,windowsHide:true,maxBuffer:65536},error => error ? reject(error) : resolve());
});
export function createRvc(opts: RvcOptions = {}) {
  const enabled = opts.enabled ?? process.env.RVC_ENABLED === "1";
  const bin = opts.bin ?? process.env.RVC_BIN ?? "";
  let args = opts.args ?? [];
  let valid = true;
  if (!opts.args && process.env.RVC_ARGS) {
    try {
      const value: unknown = JSON.parse(process.env.RVC_ARGS);
      if (!Array.isArray(value) || !value.every(a => typeof a === "string")) valid=false;
      else args=value;
    } catch { valid=false; }
  }
  const requested = opts.timeoutMs ?? Number(process.env.RVC_TIMEOUT_MS ?? 3000);
  const timeoutMs = Number.isFinite(requested) ? Math.max(50,Math.min(10000,requested)) : 3000;
  const run = opts.run ?? defaultRun;
  const npcIds = opts.npcIds ?? (process.env.RVC_NPCS ? process.env.RVC_NPCS.split(",").map(s=>s.trim()) : null);
  const skipOnFailure = opts.skipOnFailure ?? process.env.RVC_SKIP_ON_FAILURE === "1";
  return {
    enabled: enabled && !!bin && valid,
    /** Failure returns Piper by default, or silence when a fixed voice is required. */
    async convert(npcId: NpcId, wav: Buffer): Promise<Buffer | null> {
      if (!enabled || !bin || !valid || (npcIds && !npcIds.includes(npcId))) return wav;
      const fallback = () => skipOnFailure ? null : wav;
      let dir: string | undefined;
      try {
        dir=await mkdtemp(join(tmpdir(),"game-rvc-"));
        const input=join(dir,"input.wav"), output=join(dir,"output.wav");
        await writeFile(input,wav);
        await run(bin,[...args,"--npc",npcId,"--input",input,"--output",output],timeoutMs);
        const converted=await readFile(output);
        if (converted.length<44 || converted.toString("ascii",0,4)!=="RIFF" || converted.toString("ascii",8,12)!=="WAVE") return fallback();
        return converted;
      } catch { return fallback(); }
      finally { if(dir) await rm(dir,{recursive:true,force:true}).catch(()=>{}); }
    },
  };
}
