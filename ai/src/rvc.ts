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
  return {
    enabled: enabled && !!bin && valid,
    /** Failure/timeout always preserves Piper; never rejects or waits indefinitely. */
    async convert(npcId: NpcId, wav: Buffer): Promise<Buffer> {
      if (!enabled || !bin || !valid) return wav;
      let dir: string | undefined;
      try {
        dir=await mkdtemp(join(tmpdir(),"game-rvc-"));
        const input=join(dir,"input.wav"), output=join(dir,"output.wav");
        await writeFile(input,wav);
        await run(bin,[...args,"--npc",npcId,"--input",input,"--output",output],timeoutMs);
        const converted=await readFile(output);
        if (converted.length<44 || converted.toString("ascii",0,4)!=="RIFF" || converted.toString("ascii",8,12)!=="WAVE") return wav;
        return converted;
      } catch { return wav; }
      finally { if(dir) await rm(dir,{recursive:true,force:true}).catch(()=>{}); }
    },
  };
}
