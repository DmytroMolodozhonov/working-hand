import test from 'node:test';import assert from 'node:assert/strict';
import {buildHamlet,pickType,HamletIndex,isMageHamlet} from '../../src/world/Hamlets.js';
import {TerrainData,BLOCK as B,CHUNK} from '../../src/world/Terrain.js';
import {createRng} from '../../src/core/math.js';
import {hamletRoster} from '../../src/game/HamletLife.js';
import {rollElementalHouseScroll,rollWizardHouseLoot} from '../../src/game/WizardShop.js';
import {SCROLL_WEIGHTS} from '../../src/game/ItemTypes.js';
import {ELEMENT_SPELLS} from '../../src/ui/SpellElements.js';
import {assess} from '../../src/game/PentagramOfferings.js';

test('new elemental settlement weights equal mage villages; old-generation selection stays unchanged',()=>{
 const counts={};for(let i=0;i<32000;i++){const k=pickType((i+.5)/32000,true,true);counts[k]=(counts[k]||0)+1;}
 for(const k of ['earthvillage','watervillage','airvillage','firevillage'])assert.equal(counts[k],counts.magevillage);
 for(let i=0;i<1000;i++)assert.ok(!/^(water|air|fire)village$/.test(pickType(i/1000,true,false)));
});

test('every elemental settlement has valid block plans, real inhabitable homes and distinct residents',()=>{
 for(const e of ['water','air','fire']){
  const d=buildHamlet(8,e+'village',2,3,1,1000,1400,3,createRng(12),true,true);
  assert.equal(d.element,e);assert.ok(isMageHamlet(d));assert.equal(d.houses.length,4);assert.equal(d.population,5);
  for(const p of d.parts)assert.ok([p.x0,p.x1,p.z0,p.z1,p.L0,p.L1,p.t].every(Number.isFinite),JSON.stringify(p));
  const names=new Set();for(let i=1;i<d.population;i++){const r=hamletRoster(d,i);names.add(r.seed);assert.equal(r.element,e);assert.equal(r.look.tank,false);assert.equal(r.look.tool,'none');}
  assert.equal(names.size,4);for(const h of d.houses){assert.equal(h.doorRec.h,6);assert.equal(h.doorRec.w,3);assert.ok(h.chests.length&&h.bedSpots.length);}
  if(e==='water')assert.ok(d.parts.some(p=>p.t===B.WATER));
  if(e==='air')assert.ok(d.island&&d.island.parts.length);
  if(e==='fire'){assert.ok(d.parts.some(p=>p.t===B.HELL_LAVA));assert.ok(d.houses.every(h=>h.doorRec.metal));assert.equal(d.ritual.pent,'infernum');}
 }
});

test('elemental chest spells retain their rarity and have exactly 1.4 relative discipline weighting',()=>{
 const pool=SCROLL_WEIGHTS.filter(([id])=>!id.startsWith('pent:'));
 for(const e of ['earth','water','air','fire']){
  const r=createRng(8173),n=24000;let associated=0;for(let i=0;i<n;i++)associated+=Number(ELEMENT_SPELLS[e].includes(rollElementalHouseScroll(r,e).spell));
  const total=pool.reduce((n,[id,w])=>n+w*(ELEMENT_SPELLS[e].includes(id)?1.4:1),0),expected=pool.filter(([id])=>ELEMENT_SPELLS[e].includes(id)).reduce((n,[,w])=>n+w*1.4,0)/total;
  assert.ok(Math.abs(associated/n-expected)<.012,e);
 }
 const r=createRng(37418);let heads=0,spells=0,tablets=0;for(let i=0;i<16000;i++){
  const items=rollWizardHouseLoot(r,false,3,false,'fire');assert.ok(items.length<=3);heads+=Number(items.some(it=>it.kind==='gargoyleHead'));
  for(const it of items)if(it.kind==='scroll'){if(it.stat==='spell')spells++;else if(it.stat==='pentagram')tablets++;}
 }assert.ok(heads/16000>.235&&heads/16000<.265);assert.ok(Math.abs(spells/(spells+tablets)-.5)<.025);
});

test('the fire pavilion portal stays dormant without its gargoyle head, never opens from an arbitrary corpse',()=>{
 assert.equal(assess('fireInfernum',{bodies:[],things:[]}).ok,false);
 assert.equal(assess('fireInfernum',{bodies:[{k:'v'}],things:[]}).ok,false);
 const head={kind:'gargoyleHead'};const a=assess('fireInfernum',{bodies:[],things:[{item:head}]});assert.equal(a.ok,true);assert.equal(a.bodies.length,0);
});

test('water and air sites do not flatten the ocean or raise a square of surface ground to the sky',()=>{
 const raw=()=>0;const idx=new HamletIndex(1,raw,()=>false,true,true,true,true);
 const water=buildHamlet(1,'watervillage',0,0,0,200,200,3,createRng(1)),air=buildHamlet(1,'airvillage',0,0,1,350,350,70,createRng(2));
 idx.cells.set(idx._key(0,0),[water,air]);assert.equal(idx.landAt(200,200),null);assert.equal(idx.landAt(350,350),null);
});

test('generation 31 creates all three types deterministically with solid floors, real lava and supported floating islands',()=>{
 const opts={seed:20261015,mountains:true,seas:true,lush:true,wizHuts:true,buildings:true,earthSettlements:true,elementalSettlements:true};
 const a=new TerrainData();a.generate(opts);const b=new TerrainData();b.generate(opts);const found={};
 for(let x=-6;x<=6;x++)for(let z=-6;z<=6;z++)for(const d of a.hamlets.cellOf(x,z))if(d.element&&!found[d.element])found[d.element]=d;
 for(const e of ['water','air','fire']){
  const d=found[e];assert.ok(d,'missing '+e);const again=b.hamlets.byId(d.gx,d.gz,d.slot);assert.deepEqual([d.x,d.z,d.F,d.type],[again.x,again.z,again.F,again.type]);
  const h=d.houses[0],x=Math.round(h.inside.x),z=Math.round(h.inside.z);a.chunk(Math.floor(x/CHUNK),Math.floor(z/CHUNK));
  assert.notEqual(a.get(x,d.F,z),B.AIR,e+' supported room floor');assert.equal(a.get(x,d.F+4,z),B.AIR,e+' clear room');
  if(e==='air'){assert.ok(a.islandsNear(d.x,d.z,0).some(s=>s.id===d.island.id));assert.ok(a._isleColumn(d.island.parts[0],d.x,d.z)[1]<d.F-12);assert.ok(d.F>50);}
  if(e==='water'){a.rawHeight(d.x+48,d.z);assert.ok(a.rawHeight.sea);}
 }
});

test('all settlement walking graph edges have dry support and clear headroom, including bridges and volcano approaches',()=>{
 for(const e of ['water','air','fire'])for(let rot=0;rot<4;rot++){
  let first=true;const r=createRng(7),d=buildHamlet(4,e+'village',0,0,0,0,0,0,()=>first?(first=false,(rot+.1)/4):r());
  const at=(x,L,z)=>{let t=L<=0?B.STONE:B.AIR;for(const p of d.parts){if(x<p.x0||x>p.x1||z<p.z0||z>p.z1||L<p.L0||L>p.L1)continue;if(p.k===1||p.k===2){const q=(x-p.cx)**2+(z-p.cz)**2;if(q>p.r*p.r+p.r*.6||p.hr>=0&&q<=p.hr*p.hr+p.hr*.6)continue;if(p.k===2){const a=(Math.atan2(z-p.cz,x-p.cx)-p.a0w+Math.PI*4)%(Math.PI*2);if(a>p.span+1e-8)continue;}}t=p.t;}return t;};
  for(const [a,b] of d.edges){const A=d.nodes[a],C=d.nodes[b],n=Math.ceil(Math.hypot(A.x-C.x,A.z-C.z)*2);for(let i=0;i<=n;i++){
   const x=Math.round(A.x+(C.x-A.x)*i/Math.max(1,n)),z=Math.round(A.z+(C.z-A.z)*i/Math.max(1,n));
   for(const [dx,dz] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
    assert.ok(at(x+dx,0,z+dz)!==B.AIR&&at(x+dx,0,z+dz)!==B.WATER,`${e} ${rot} support ${x+dx},${z+dz}`);
    for(let L=1;L<=5;L++)assert.equal(at(x+dx,L,z+dz),B.AIR,`${e} ${rot} blocked route ${x+dx},${L},${z+dz}`);
   }
  }}
 }
});

test('water residents can actually draw from their canals without traveller tanks or a humidity gift',async()=>{
 const {ElementalMages}=await import('../../src/game/ElementalMages.js');
 const d=new TerrainData();d.generate({seed:20261015,mountains:true,seas:true,lush:true,earthSettlements:true,elementalSettlements:true});const site=d.hamlets.byId(-3,-6,0);
 for(const h of site.houses){const p=h.inside;for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)d.chunk(Math.floor((p.x+x*16)/32),Math.floor((p.z+z*16)/32));
  const em=new ElementalMages({terrain:{data:d},space:{}}),v={...p,entry:{look:{tank:false}},gifts:{hydro:{h:0}},elemental:{scan:0,water:0}};
  assert.equal(em.waterSource(v,0),true,'a resident must have usable real water by his home');assert.ok(v.elemental.sourcePoint);assert.equal(v.elemental.water,0);
 }
});
