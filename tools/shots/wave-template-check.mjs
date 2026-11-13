export default async function(h){
 const g=h.g,T=h.THREE;h.bare();g.paused=true;
 const {waveSource}=await import('/src/game/WaveSource.js');
 const data=g.world.terrain.data;let source=null;
 for(let x=-40;x<=40&&!source;x+=2)for(let z=-40;z<=0&&!source;z+=2)source=waveSource(data,{x,z});
 if(!source)throw Error('No substantial source in Creative river');h.log('real river',source);
 const cs=g.castleLife._runtime(g.castleLife.extra.get('creative-water'));if(!cs.awake)g.castleLife._wake(cs);
 const v=g.castleLife.byId.get('creative-water:1');v.foe=g.localId;
 const w=g.waves.npcRaise(v,'WaveAttackMaxima',source,{x:source.x+15,y:2,z:source.z});if(!w)throw Error('NPC wave not raised');
 const target=new T.Vector3(source.x+2,source.y+2,source.z);let cam=null;
 for(let i=0;i<16&&!cam;i++){const a=i*Math.PI/8,p=new T.Vector3(source.x+Math.cos(a)*14,source.y+11,source.z+Math.sin(a)*14),d=target.clone().sub(p),len=d.length();if(!data.raycast(p,d.normalize(),len-1))cam=p;}
 if(!cam)cam=new T.Vector3(source.x,source.y+25,source.z+12);
 h.cam(cam.toArray(),target.toArray());
 for(let i=0;i<48;i++)g.waves.update(1/60);await h.shot('wave-rise',{settle:0});
 for(let i=0;i<110;i++)g.waves.update(1/60);await h.shot('wave-curl',{settle:0});h.log('NPC wave',{phase:w.phase,height:w.h});
 const {BootCache,CacheStore,cacheKey,sum32}=await import('/src/core/BootCache.js');
 const opts=g.terrain.opts,cx=7,cz=7,recipe={opts,skipSeaTop:!!data.skipSeaTop,cx,cz,planets:null,ghost:false};
 const worker=new Worker('/src/world/terrain.worker.js',{type:'module'});let seq=1;const pending=new Map();
 worker.onerror=e=>h.log('worker error',e.message);
 worker.onmessage=e=>{const f=pending.get(e.data.id);if(f){pending.delete(e.data.id);f(e.data);}};
 const init=()=>worker.postMessage({type:'init',opts,skipSeaTop:recipe.skipSeaTop,cache:{format:3,build:'template-probe',kinds:{terrain:'template-probe-v1'}}});
 const build=()=>new Promise((resolve,reject)=>{const id=seq++,timer=setTimeout(()=>reject(Error('Worker probe timeout')),15000);pending.set(id,m=>{clearTimeout(timer);resolve(m);});worker.postMessage({type:'build',id,key:'probe',cx,cz,fcx:cx,fcz:cz,R:4});});
 try{
  init();const a=await build();const cache=new BootCache({store:new CacheStore('f3'),build:'template-probe',kinds:{terrain:'template-probe-v1'}}),key=cacheKey('terrain',recipe);
  let stored=null;for(let i=0;i<100&&!stored;i++){stored=await cache.getTree('terrain',key);if(!stored)await new Promise(r=>setTimeout(r,30));}
  if(!stored)throw Error('Template was never written');
  init();const b=await build();if(!b.template)throw Error('Warm build did not use template');
  const hash=c=>sum32(new Uint8Array(c.buffer,c.byteOffset,c.byteLength));
  if(hash(a.chunk.blocks)!==hash(b.chunk.blocks)||hash(a.arrays.land.positions)!==hash(b.arrays.land.positions))throw Error('Cached terrain differs');
  h.log('template timing',{coldMs:a.ms,warmMs:b.ms,cacheHit:b.template,identical:true});
 }finally{worker.terminate();}
}
