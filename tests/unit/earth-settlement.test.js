import test from 'node:test';import assert from 'node:assert/strict';
import {buildHamlet,pickType} from '../../src/world/Hamlets.js';
import {TerrainData,BLOCK} from '../../src/world/Terrain.js';
import {createRng} from '../../src/core/math.js';
import {hamletRoster} from '../../src/game/HamletLife.js';
import {rollEarthHouseScroll} from '../../src/game/WizardShop.js';
import {SCROLL_WEIGHTS} from '../../src/game/ItemTypes.js';
import {isEarthSpell,spellElements} from '../../src/ui/SpellElements.js';
import {SPELLS,cardSpell} from '../../src/ui/Codex.js';

test('earth settlements have the same selection frequency as ordinary wizard settlements, old recipe unchanged',()=>{
 const counts={},old={};for(let i=0;i<23000;i++){const x=(i+.5)/23000,k=pickType(x,true);counts[k]=(counts[k]||0)+1;const prev=pickType(x);old[prev]=(old[prev]||0)+1;}
 assert.equal(counts.earthvillage,counts.magevillage);assert.equal(counts.earthvillage,3000);assert.equal(old.earthvillage,undefined);assert.equal(old.magevillage,3450);
});

test('rock sanctuary has doors, four inhabited cave homes, connected routes, flowers and chests',()=>{
 const d=buildHamlet(8,'earthvillage',0,0,0,0,0,0,createRng(5),true,true);
 assert.equal(d.element,'earth');assert.equal(d.mage,true);assert.equal(d.houses.length,4);assert.equal(d.population,5);
 assert.ok(d.parts.some(p=>p.t===BLOCK.AIR&&p.L1-p.L0>=8),'vaulted communal hall');
 assert.ok(d.parts.some(p=>p.t===BLOCK.FLOWERS));
 for(const h of d.houses){assert.equal(h.doorRec.h,6);assert.equal(h.doorRec.w,3);assert.ok(h.chests.length);assert.ok(h.homeNode!=null&&h.doorNode!=null);}
 for(let i=1;i<d.population;i++){const r=hamletRoster(d,i);assert.equal(r.element,'earth');assert.equal(r.rank,undefined);assert.equal(r.look.tool,'none');}
});

test('every earth chest spell keeps its rarity with exactly 1.4x relative earth weight',()=>{
 const r=createRng(897),n=40000,counts={};for(let i=0;i<n;i++){const it=rollEarthHouseScroll(r);assert.equal(it.stat,'spell');counts[it.spell]=(counts[it.spell]||0)+1;}
 const pool=SCROLL_WEIGHTS.filter(([s])=>!s.startsWith('pent:')),sum=pool.reduce((n,[s,w])=>n+w*(isEarthSpell(s)?1.4:1),0);
 for(const id of ['Flourish','Drawdown','GroundVortex','Breakthrough']){const row=pool.find(([s])=>s===id);assert.ok(row, id+' has a real source');const expected=row[1]*1.4/sum;assert.ok(Math.abs((counts[id]||0)/n-expected)<.009,id);}
 assert.ok(Object.keys(counts).some(s=>!isEarthSpell(s)),'other spells still possible');
});

test('elemental lenses preserve the original spell cards and include plant and earth manipulation',()=>{
 const original=SPELLS.map(s=>s.cat);assert.ok(spellElements('Flourish').includes('earth'));assert.ok(spellElements('Drawdown').includes('earth'));assert.ok(spellElements('Stitching').includes('earth'));
 for(const e of ['earth','water','fire','air'])assert.ok(SPELLS.some(s=>spellElements(cardSpell(s)).includes(e)));
 assert.deepEqual(SPELLS.map(s=>s.cat),original);
});

test('generation 30 deterministically creates earth hamlets while the old recipe keeps its old sites',()=>{
 const opts={seed:20261015,mountains:true,seas:true,lush:true,wizHuts:true,buildings:true};
 const make=flag=>{const d=new TerrainData();d.generate({...opts,earthSettlements:flag});return d;},old=make(false),a=make(true),b=make(true);
 const sites=d=>{const out=[];for(let x=-3;x<3;x++)for(let z=-3;z<3;z++)out.push(...d.hamlets.cellOf(x,z));return out;};
 const previous=sites(old),now=sites(a),again=sites(b);
 assert.ok(!previous.some(s=>s.element==='earth'));assert.ok(now.some(s=>s.element==='earth'));
 assert.deepEqual(now.map(s=>[s.id,s.type,s.x,s.z,s.F]),again.map(s=>[s.id,s.type,s.x,s.z,s.F]));
 const earth=now.find(s=>s.element==='earth'),cx=Math.floor(earth.x/32),cz=Math.floor(earth.z/32);
 assert.deepEqual(a.chunk(cx,cz).blocks,b.chunk(cx,cz).blocks,'worker recipe generates identical real chunks');
 const home=earth.houses[0].inside,x=Math.round(home.x),z=Math.round(home.z);a.chunk(Math.floor(x/32),Math.floor(z/32));
 assert.equal(a.get(x,earth.F+3,z),BLOCK.AIR,'inhabited rooms are genuinely carved in the generated rock');
 assert.notEqual(a.get(x,earth.F,z),BLOCK.AIR,'the room has a real supported floor');
});
