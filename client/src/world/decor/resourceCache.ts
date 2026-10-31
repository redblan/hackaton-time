/** LRU of owned resources. Referenced entries are never disposed underneath a scene. */
export class ResourceCache<T> {
  private entries=new Map<string,{value:T;bytes:number;refs:number}>();
  private bytes=0;
  private hits=0;
  private builds=0;
  constructor(private readonly limits:{entries:number;bytes:number},private readonly size:(value:T)=>number,private readonly dispose:(value:T)=>void) {}

  acquire(key:string,make:()=>T) {
    let entry=this.entries.get(key);
    if(entry) {
      this.hits++;
      this.entries.delete(key);
    } else {
      const value=make();
      entry={value,bytes:this.size(value),refs:0};
      this.bytes+=entry.bytes;
      this.builds++;
    }
    entry.refs++;
    this.entries.set(key,entry);
    this.trim();
    let released=false;
    return {value:entry.value,release:()=>{
      if(released) return;
      released=true;
      entry.refs--;
      this.trim();
    }};
  }

  private trim() {
    for(const [key,entry] of this.entries) {
      if(this.entries.size<=this.limits.entries && this.bytes<=this.limits.bytes) break;
      if(entry.refs) continue;
      this.entries.delete(key);
      this.bytes-=entry.bytes;
      this.dispose(entry.value);
    }
  }

  clearIdle() {
    for(const [key,entry] of this.entries) if(!entry.refs) {
      this.entries.delete(key);this.bytes-=entry.bytes;this.dispose(entry.value);
    }
  }
  stats() {return {entries:this.entries.size,bytes:this.bytes,hits:this.hits,builds:this.builds,active:[...this.entries.values()].filter(e=>e.refs>0).length};}
}
