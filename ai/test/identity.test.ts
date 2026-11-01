import {describe,expect,it} from "vitest";
import type {NpcRequest} from "@game/shared";
import {createAi,createInMemoryStore} from "../src/index";
import {correctAddressee,identityStream} from "../src/prompt";
const req:NpcRequest={npcId:"neighbor_leg",playerId:"nik",event:"free_talk",playerMessage:"Привет, как ты?",context:{flags:[],facts:[],playerName:"никитос",partners:["Егор"]}};
describe("identity in coop replies",()=>{
 it("repairs the reported greeting without changing third-person references",()=>{
  expect(correctAddressee(req,"Привет, Егор. Я в порядке.")).toBe("Привет, никитос. Я в порядке.");
  expect(correctAddressee(req,"Егор, помоги! Позови Егора. Егор поможет с аптечкой.")).toBe("никитос, помоги! Позови Егора. Егор поможет с аптечкой.");
 });
 it("checks split streamed names before displaying them",()=>{
  const parts:string[]=[];const stream=identityStream(req,t=>parts.push(t));
  for(const token of ["Привет, Е","гор",". Е","гор",", помоги","!"])stream.push(token);
  stream.flush();expect(parts.join("")).toBe("Привет, никитос. никитос, помоги!");
 });
 it("keeps streams immediate when there are no teammates",()=>{
  const parts:string[]=[];const stream=identityStream({...req,context:{flags:[],facts:[],playerName:"Егор"}},t=>parts.push(t));
  stream.push("Привет");expect(parts).toEqual(["Привет"]);
 });
 it("repairs final text, stream and saved memory and distinguishes the current listener",async()=>{
  const memory=createInMemoryStore();let system="";
  const ai=createAi({memory,fetchImpl:(async(_url,init)=>{
   system=JSON.parse(String(init?.body)).messages[0].content;
   return new Response(["Привет, Е","гор. Я в порядке."].map(content=>JSON.stringify({message:{content}})).join("\n")+"\n");
  }) as typeof fetch});
  const tokens:string[]=[];const reply=await ai.sayStream!(req,t=>tokens.push(t));
  expect(reply.source).toBe("llm");expect(reply.text).toBe("Привет, никитос. Я в порядке.");
  expect(tokens.join("")).toBe(reply.text);
  expect((await memory.get("nik")).recent.at(-1)?.text).toBe(reply.text);
  expect(system).toContain("СЕЙЧАС ТЫ ОТВЕЧАЕШЬ ИГРОКУ никитос");
  expect(system).toContain("Это ДРУГИЕ люди, не собеседник");
 });
});
