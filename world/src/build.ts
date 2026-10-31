import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateWorld } from './generate';
import { validateWorld } from './validate';

const chunks=generateWorld();
validateWorld(chunks);
const out=new URL('../chunks/',import.meta.url);
mkdirSync(fileURLToPath(out),{recursive:true});
for(const chunk of chunks) writeFileSync(new URL(`${chunk.id}.json`,out),JSON.stringify(chunk,null,2)+'\n');
console.log(`[world] чанков: ${chunks.length}`);
