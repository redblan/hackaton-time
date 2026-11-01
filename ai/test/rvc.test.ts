import { describe, expect, it } from "vitest";
import { readFile,writeFile,access } from "node:fs/promises";
import { createRvc } from "../src/rvc";
const wav=Buffer.alloc(50);wav.write("RIFF");wav.write("WAVE",8);
describe("external RVC fallback",()=>{
 it("is disabled by default",async()=>{let calls=0;const rvc=createRvc({enabled:false,bin:"external",run:async()=>{calls++;}});expect(await rvc.convert("papa",wav)).toBe(wav);expect(calls).toBe(0);});
 it("passes paths safely, returns converted WAV, and cleans temporary files",async()=>{let input="",output="";const rvc=createRvc({enabled:true,bin:"external",args:["script with spaces.py"],run:async(_bin,args)=>{input=args[args.indexOf("--input")+1]!;output=args[args.indexOf("--output")+1]!;expect(await readFile(input)).toEqual(wav);expect(args).toContain("papa");const out=Buffer.from(wav);out[44]=7;await writeFile(output,out);}});expect((await rvc.convert("papa",wav))[44]).toBe(7);await expect(access(input)).rejects.toThrow();await expect(access(output)).rejects.toThrow();});
 it("keeps Piper on timeout/process error or invalid output",async()=>{for(const run of [async()=>{throw Error("timeout");},async(_b:string,args:string[])=>{await writeFile(args[args.indexOf("--output")+1]!,"broken");}]){expect(await createRvc({enabled:true,bin:"external",run}).convert("papa",wav)).toBe(wav);}});
});
