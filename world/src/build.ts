import { mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateWorld } from './generate';
import { validateWorld } from './validate';

const chunks=generateWorld();
validateWorld(chunks);
const out=new URL('../chunks/',import.meta.url);
mkdirSync(fileURLToPath(out),{recursive:true});
for(const chunk of chunks) {
  const json=JSON.stringify(chunk,null,2)+'\n';
  const models=new Set(chunk.objects.filter(o=>o.kind==='model').map(o=>o.src));
  let bytes=Buffer.byteLength(json);
  for(const src of models) {
    const url=new URL(`../assets/${src}`,import.meta.url);
    bytes+=statSync(url).size;
    const data=readFileSync(url);
    if(data.readUInt32LE(0)!==0x46546c67) throw new Error(`Invalid GLB: ${src}`);
    const doc=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
    if([...(doc.images??[]),...(doc.buffers??[])].some((v:{uri?:string})=>v.uri&&!v.uri.startsWith('data:'))) throw new Error(`External dependency: ${src}`);
  }
  if(bytes>3*1024*1024) throw new Error(`Chunk budget exceeded: ${chunk.id}`);
  writeFileSync(new URL(`${chunk.id}.json`,out),json);
  console.log(`${chunk.id}: ${(bytes/1024).toFixed(1)} KiB including unique models`);
}
console.log(`[world] чанков: ${chunks.length}`);
