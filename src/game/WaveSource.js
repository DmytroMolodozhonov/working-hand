/** A wave needs a connected body of real water. Humidity gifts and carried water are never sources. */
import {BLOCK} from '../world/Terrain.js';
export const WAVE_SOURCE={AREA:24,VOLUME:48,RADIUS:16,MAX:512};
export function waveColumn(data,x,z){
 x=Math.round(x);z=Math.round(z);
 if(!data||data.landMade&&!data.landMade(x,z))return null;
 const top=data.topLayer(x,z);let L=top+1,depth=0;
 while(depth<64&&data.get(x,L,z)===BLOCK.WATER){depth++;L++;}
 return depth?{x,z,y:L-1.62,L:L-1,depth}:null;
}
/** Bounded flood fill follows the actual shore, including a narrow river, but rejects a puddle or disconnected drops. */
export function waveSource(data,point){
 const start=waveColumn(data,point.x,point.z);if(!start)return null;
 const queue=[start],seen=new Set([start.x+','+start.z]);let volume=0,area=0;
 for(let i=0;i<queue.length&&i<WAVE_SOURCE.MAX;i++){
  const c=queue[i];volume+=c.depth;area++;
  if(area>=WAVE_SOURCE.AREA&&volume>=WAVE_SOURCE.VOLUME)return {...start,area,volume};
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const x=c.x+dx,z=c.z+dz,key=x+','+z;
   if(seen.has(key)||Math.abs(x-start.x)>WAVE_SOURCE.RADIUS||Math.abs(z-start.z)>WAVE_SOURCE.RADIUS)continue;
   seen.add(key);const next=waveColumn(data,x,z);if(next&&Math.abs(next.L-c.L)<=1)queue.push(next);
  }
 }return null;
}
