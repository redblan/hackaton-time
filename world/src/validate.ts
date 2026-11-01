import { INTERACTABLES, ZONES, NPC_IDS, ROLES, type ChunkData } from '@game/shared';

export function validateWorld(chunks: ChunkData[]): void {
  const fail=(message:string):never=>{throw new Error(message);};
  const ids=new Set(chunks.map(c=>c.id));
  if(chunks.length!==30 || ids.size!==30) fail('Expected 30 unique chunks');
  for(const c of chunks) {
    const f=/^e([12])f([1-9])$/.exec(c.id), q=/^y([0-2])([0-3])$/.exec(c.id);
    if(!f&&!q) fail(`Invalid chunk ${c.id}`);
    const x=f?(Number(f[1])-1)*12:Number(q![1])*12;
    const y=f?(Number(f[2])-1)*3:0;
    const z=f?0:-(Number(q![2])+1)*12;
    const bounds={min:[x,y,z],max:[x+12,y+(f?3:6),z+12]};
    if(JSON.stringify(c.bounds)!==JSON.stringify(bounds)) fail(`Bounds: ${c.id}`);
    const objectIds=new Set<string>();
    for(const o of c.objects) {
      if(objectIds.has(o.id)) fail(`Duplicate object: ${c.id}/${o.id}`);
      objectIds.add(o.id);
      if(o.kind==='interactable'&&!INTERACTABLES.includes(o.target)) fail('Unknown target');
      if(o.kind==='interactable'&&(typeof o.label!=='string'||!o.label.trim())) fail('Missing interaction label');
      if(o.kind==='zone'&&!ZONES.includes(o.zone)) fail('Unknown zone');
      if(o.kind==='npc'&&!NPC_IDS.includes(o.npcId)) fail('Unknown NPC');
      if(o.kind==='spawn'&&!ROLES.includes(o.role)) fail('Unknown role');
      const vectors='pos' in o?[o.pos]:[o.min,o.max];
      if(vectors.some(v=>v.length!==3||v.some(n=>!Number.isFinite(n)))) fail('Invalid coordinates');
      if(o.kind==='box'&&o.size.some(n=>!Number.isFinite(n)||n<=0)) fail('Invalid size');
      if(o.kind==='zone'&&o.min.some((n,i)=>n>=o.max[i])) fail('Invalid zone bounds');
      if(o.kind==='crowd') {
        if(!['person','cat','dog','pigeon'].includes(o.type)) fail('Unknown crowd type');
        if(!Number.isSafeInteger(o.seed)||o.seed<0) fail('Invalid crowd seed');
        if(o.speed!==undefined&&(!Number.isFinite(o.speed)||o.speed<=0)) fail('Invalid crowd speed');
        for(const point of [o.pos,...(o.route??[])]) {
          if(point.length!==3||point.some(n=>!Number.isFinite(n))) fail('Invalid crowd route');
          if(point.some((n,axis)=>n<c.bounds.min[axis]||n>c.bounds.max[axis])) fail('Crowd route leaves chunk');
        }
      }
    }
    if(c.objects.filter(o=>o.kind==='crowd').length>10) fail(`Too many crowd objects: ${c.id}`);
    for(const n of c.neighbors) if(n===c.id||!ids.has(n)||!chunks.find(v=>v.id===n)!.neighbors.includes(c.id)) fail(`Invalid neighbor: ${c.id}/${n}`);
    if(Buffer.byteLength(JSON.stringify(c))>3*1024*1024) fail(`Oversized chunk: ${c.id}`);
  }
}
