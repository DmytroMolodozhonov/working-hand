/** Real module-worker/cache proof without rendering a full game scene. */
import {startServer,launch,openPage} from '../tests/e2e/harness.mjs';
const s=await startServer(8931),b=await launch();
try{const {page}=await openPage(b,s.url,{noCamera:true});const result=await page.evaluate(async()=>{
 const {BootCache,CacheStore,cacheKey,sum32}=await import('/src/core/BootCache.js');
 const url=new URL('/src/world/terrain.worker.js',location.href).href;
 const w=new Worker(url,{type:'module'});let seq=1;
 try{
  const opts={seed:20261015,mountains:true,seas:true,test:true,deepCaves:true,lush:true},cache=new BootCache({store:new CacheStore('f3'),build:'probe',kinds:{terrain:'browser-proof'}});
  const init=()=>w.postMessage({type:'init',opts,skipSeaTop:true,cache:{format:3,build:'probe',kinds:{terrain:'browser-proof'}}});
  const build=(cx=0,cz=0)=>new Promise((resolve,reject)=>{const id=seq++,timer=setTimeout(()=>reject(Error('worker build timeout')),10000);w.onmessage=e=>{if(e.data.id===id){clearTimeout(timer);resolve(e.data);}};w.onerror=e=>{clearTimeout(timer);reject(Error(e.message||'worker failed'));};w.postMessage({type:'build',id,key:cx+','+cz,cx,cz,fcx:cx,fcz:cz,R:4});});
  init();const cold=await build();const key=cacheKey('terrain',{opts,skipSeaTop:true,cx:0,cz:0,planets:null,ghost:false});let stored=false;
  for(let i=0;i<100&&!stored;i++){stored=!!await cache.getTree('terrain',key);if(!stored)await new Promise(r=>setTimeout(r,30));}if(!stored)throw Error('cache not written');
  init();const warm=await build();const hash=a=>sum32(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));
  const identical=hash(cold.chunk.blocks)===hash(warm.chunk.blocks)&&hash(cold.arrays.land.positions)===hash(warm.arrays.land.positions);
  const next=await build(1,0);if(!next.chunk.blocks.byteLength)throw Error('cached simulation lost its buffers');
  return {ready:true,coldMs:cold.ms,warmMs:warm.ms,hit:!!warm.template,identical,neighbourBuilt:true};
 }finally{w.terminate();}
});console.log(result);if(!result.ready||!result.hit||!result.identical)process.exitCode=1;}finally{await b.close();s.stop();}
