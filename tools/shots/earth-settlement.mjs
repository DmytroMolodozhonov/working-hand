// Same worker-safe settlement plan and terrain mesher as gameplay, plus real doors/chests and the actual pause UI.
export default async function(h){
 const g=h.g,T=h.THREE;
 const {TerrainData,mergeBuffers}=await import('/src/world/Terrain.js');
 const {Terrain}=await import('/src/world/TerrainView.js');
 const {buildHamlet}=await import('/src/world/Hamlets.js');
 const {createRng}=await import('/src/core/math.js');
 const {applyVoxelDetail}=await import('/src/world/VoxelShading.js');
 const {Chest}=await import('/src/entities/Chest.js');
 const {renderMagicTab}=await import('/src/ui/Codex.js');
 const {VillagerModel,villagerLook}=await import('/src/entities/VillagerModel.js');
 const {earthLook}=await import('/src/game/EarthMagicRules.js');
 h.bare();g.paused=true;
 const defMage=g.castleLife.extra.get('creative-earth'),cs=g.castleLife._runtime(defMage);if(!cs.awake)g.castleLife._wake(cs);
 const v=g.castleLife.byId.get('creative-earth:1'),em=g.earthMages,gv=g.groundVortex;
 g.character.group.position.set(v.x,v.y+1.95,v.z-22);v.foe=g.localId;
 const step=n=>{for(let i=0;i<n;i++){em.think(v,1/60);em.update(1/60);gv.update(1/60);v.group.position.set(v.x,v.y+1.95,v.z);v.group.rotation.y=v.yaw;v.model.update(1/60,{mode:v.mode,speed:v.speed});}};
 step(80);const swarm=em.swarms.get(v.id);if(!swarm?.n)throw Error('No earth lifted');
 h.cam([v.x+2,v.y+4,v.z-11],[v.x,v.y+2,v.z]);
 for(const [phase,frames]of [['punch',24],['kick',34],['sweep',34],['hammer',52]]){
  em._phase(v,swarm,'orbit');step(55);em._phase(v,swarm,phase);step(frames);await h.shot('earth-'+phase,{settle:0});
 }
 em._stop(v.id);

 for(const o of g.scene.children)if(!o.isLight&&!o.isCamera)o.visible=false;
 let first=true;const rng=createRng(5),def=buildHamlet(8,'earthvillage',0,0,0,48,48,0,()=>first?(first=false,0):rng(),true,true);
 const data=new TerrainData();data.generate({seed:7,mountains:true,lush:true,earthSettlements:true});
 data.hamlets.cellOf=(x,z)=>x===0&&z===0?[def]:[];data.hamlets._lastCell=null;data.sites.partsForChunk=(x,z,C)=>data.hamlets.partsForChunk(x,z,C);
 g.scene.fog=null;g.camera.far=1000;g.camera.updateProjectionMatrix();
 const mat=applyVoxelDetail(new T.MeshPhongMaterial({vertexColors:true,shininess:0}));
 for(let x=0;x<6;x++)for(let z=0;z<6;z++){
  const a=data.buildChunkArrays(x,z),mesh=new T.Mesh(new T.BufferGeometry(),mat);
  Terrain.prototype._fill.call({},mesh,mergeBuffers(a.ground,a.raised));g.scene.add(mesh);
 }
 g.terrain.data=data;
 for(const [i,home] of def.houses.entries()){
  g.doors._place({id:'preview-earth-'+i,...home.doorRec,color:0x846237,a:0,gen:true});
  const c=home.chests[0];new Chest(g.scene,new T.Vector3(c.x,c.y,c.z),'loot',c.yaw,'preview-earth-chest-'+i);
  const model=new VillagerModel(Object.assign(villagerLook(i+13,'mage',false),earthLook()));
  model.group.position.set(home.inside.x,home.inside.y+1.95,home.inside.z);g.scene.add(model.group);model.update(.1,{mode:'idle',speed:0});
 }
 h.cam([74,17,6],[48,7,44]);await h.shot('rock-sanctuary-front',{settle:0});
 h.cam([49,6,35],[48,4.5,55]);await h.shot('rock-sanctuary-hall',{settle:0});
 h.cam([33,4,45],[29,2.5,41]);await h.shot('rock-sanctuary-home',{settle:0});
 for(const el of document.querySelectorAll('[style]'))if(el.style.visibility==='hidden')el.style.visibility='';
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));g.paused=true;document.querySelector('[data-pause-tab="pause-spells"]').click();
 const ids={bar:'pause-magic-sections',spells:'pause-magic-spells',potions:'pause-magic-potions',pents:'pause-magic-pentagrams',cats:'pause-spell-cats',grid:'pause-spells-grid',pgrid:'pause-pentagrams-grid',vgrid:'pause-potions-grid',pcats:'pause-pentagram-cats',vcats:'pause-potion-cats'};
 renderMagicTab(ids,null,null,null,'elements');
 const wait=()=>new Promise(r=>requestAnimationFrame(r));for(let i=0;i<2;i++)await wait();
 const cats=[...document.getElementById(ids.cats).querySelectorAll('button')];if(cats.length!==5)throw Error('Missing elemental categories');
 cats.find(b=>b.textContent.includes('Магия земли')).click();for(let i=0;i<2;i++)await wait();
 const grid=document.getElementById(ids.grid);if(!grid.textContent.includes('Flourish')||!grid.textContent.includes('Drawdown'))throw Error('Missing earth spells');
 await h.page('elemental-earth-menu',0);
 h.log('earth settlement',{houses:def.houses.length,doors:def.houses.filter(h=>h.doorRec).length,chests:def.houses.reduce((n,h)=>n+h.chests.length,0),parts:def.parts.length,categories:cats.map(b=>b.textContent)});
}
