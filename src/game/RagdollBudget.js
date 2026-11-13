/** Fair physics time: an expensive early doll must not freeze all later bodies after a blast. */
export class RagdollBudget {
 constructor(ms=2.5,now=()=>performance.now()){this.ms=ms;this.now=now;this.queue=[];this.cursor=0;this.pending=new WeakMap();}
 begin(active,dead){
  const q=this.queue;q.length=0;
  for(const e of active.values())if(e.s.rag&&!e.s.rag.asleep)q.push(e.s.rag);
  for(const e of dead.values())if(!e.doll.asleep&&q.indexOf(e.doll)<0)q.push(e.doll);
  this.first=q.length?q[this.cursor++%q.length]:null;this.until=this.now()+this.ms;
 }
 step(doll,world,dt){
  const elapsed=Math.min(.1,(this.pending.get(doll)||0)+dt);
  if(doll.asleep||doll===this.first||this.now()<this.until){this.pending.delete(doll);doll.step(world,elapsed);return true;}
  this.pending.set(doll,elapsed);return false;
 }
}
