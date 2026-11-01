import { describe, expect, it, vi } from "vitest";
import type { NpcRequest } from "@game/shared";
import { agentAction, worldReaction } from "../src/agentActions";
import { createAi, createInMemoryStore } from "../src/index";
const req: NpcRequest={npcId:"papa",playerId:"x",event:"free_talk",context:{flags:[],facts:[],stage:"yard_assess"}};
describe("D73 actions",()=>{
 it("refuses lift and unsafe light/window without changing flags",()=>{const hook=vi.fn(()=>true);expect(agentAction("elevator",req,hook)).toContain("не пользуются");expect(agentAction("light",{...req,context:{...req.context,flags:["gas"]}},hook)).toContain("искра");expect(agentAction("window",{...req,context:{...req.context,stage:"cover"}},hook)).toContain("стекло");expect(hook).not.toHaveBeenCalled();});
 it("sets only allowed flags and distinguishes a rejected repeat",()=>{const hook=vi.fn(()=>true);expect(agentAction("exit",req,hook)).toContain("Второй выход");expect(hook).toHaveBeenCalledWith("x","spawn_exit");expect(agentAction("water",req,()=>false)).toContain("не получилось");});
 it("returns intent metadata and never calls the dialogue model for a rule",async()=>{const ai=createAi({memory:createInMemoryStore(),fetchImpl:vi.fn()});ai.setFlagHook!(()=>true);expect(await ai.say({...req,playerMessage:"Принеси аптечку"})).toMatchObject({source:"template",intent:{id:"first_aid",source:"rule"}});});
 it("uses model classification for rare requests",async()=>{const ai=createAi({memory:createInMemoryStore(),fetchImpl:(async()=>new Response(JSON.stringify({message:{content:"blankets"}})+"\n")) as typeof fetch});ai.setFlagHook!(()=>true);expect(await ai.say({...req,playerMessage:"Я весь продрог, укрой меня"})).toMatchObject({intent:{id:"blankets",source:"llm"}});});
 it("reacts to props and admin flags",()=>{expect(worldReaction({type:"prop_picked",playerId:"x",propId:"fire",label:"Огнетушитель",chunkId:"y00",pos:[0,0,0]})?.npcId).toBe("mihalych");expect(worldReaction({type:"prop_thrown",playerId:"x",propId:"kit",label:"Аптечка",chunkId:"y00",pos:[0,0,0]})?.text).toContain("не бросай");expect(worldReaction({type:"flag_set",playerId:"x",flag:"spawn_blankets",by:"admin"})?.text).toContain("Одеяла");});
});

it("keeps emotional outcomes immediate even when action hooks are installed",async()=>{
 let calls=0, atOutcome=-1;
 const ai=createAi({memory:createInMemoryStore(),fetchImpl:(async()=>{calls++;throw Error("offline");}) as typeof fetch});
 ai.setFlagHook!(()=>true);
 await ai.sayStream!({...req,npcId:"vanya",playerMessage:"Спокойно, я рядом, сообщу спасателям"},()=>{},()=>{atOutcome=calls;});
 expect(atOutcome).toBe(0);
});
