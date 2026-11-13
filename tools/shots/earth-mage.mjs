// Actual creative NPC, deterministic combat steps and elemental UI. No separate demo combat implementation.
export default async function(h){
 const g=h.g,T=h.THREE;
 h.bare();g.paused=true;
 const def=g.castleLife.extra.get('creative-earth');if(!def)throw Error('No Creative earth mage site');
 const cs=g.castleLife._runtime(def);if(!cs.awake)g.castleLife._wake(cs);
 const v=g.castleLife.byId.get('creative-earth:1');if(!v)throw Error('Earth mage did not spawn');
 const em=g.earthMages,gv=g.groundVortex;
 g.character.group.position.set(v.x,v.y+1.95,v.z-18);v.foe=g.localId;
 const step=(n)=>{for(let i=0;i<n;i++){g.castleLife.wizards.think(v,1/60);em.update(1/60);gv.update(1/60);v.group.position.set(v.x,v.y+1.95,v.z);v.group.rotation.y=v.yaw;v.model.update(1/60,{mode:v.mode,speed:v.speed});}};
 h.cam([v.x+10,v.y+7,v.z-13],[v.x,v.y+2,v.z]);
 step(55);await h.shot('earth-lift',{settle:0});
 step(140);let s=em.swarms.get(v.id);if(!s||s.n<12)throw Error('No real lifted earth: '+s?.n);
 await h.shot('earth-orbit',{settle:0});
 // The same living stones and mana are used by the real defence actions.
 em._phase(v,s,'wall');step(65);await h.shot('earth-wall',{settle:0});
 em._phase(v,s,'orbit');step(160);s=em.swarms.get(v.id);
 em._phase(v,s,'cocoon');step(90);await h.shot('earth-cocoon',{settle:0});
 em._phase(v,s,'blade');step(62);if(!s.blade)throw Error('Stones did not sharpen');await h.shot('earth-blades',{settle:0});
 em._phase(v,s,'throw');step(40);await h.shot('earth-throw',{settle:0});
 h.log('earth mage',{name:v.title,rank:v.rank,wand:v.model.toolKind,bare:v.bareMaster,stones:s.n,mana:v.mana,hp:v.hp,flights:gv.flights.length});
}
