export default async function(h){
 const g=h.g,T=h.THREE;h.bare();g.paused=true;
 const cs=g.castleLife._runtime(g.castleLife.extra.get('creative-earth'));if(!cs.awake)g.castleLife._wake(cs);const v=g.castleLife.byId.get('creative-earth:1');
 g.earthMages._stop(v.id);v.foe=null;v.fx=0;
 const o=new T.Vector3(v.x,v.y+2,v.z-18),dir=new T.Vector3(0,0,1);
 g.character.group.position.set(o.x,o.y-.05,o.z);g.character.group.rotation.y=Math.PI;g.character.group.updateMatrixWorld(true);
 g.castOrigin=(s,out=new T.Vector3())=>out.copy(o);g.character.getPointingDirection=(s,out=new T.Vector3())=>out.copy(dir);g.character.isArmRaised=()=>true;g.wandSide=()=>null;
 h.cam([v.x+9,v.y+7,v.z-12],[v.x,v.y+2,v.z-8]);g._updateCamera(0);
 for(const spell of ['Jolt','Stupefy','AvadaKedavra']){
  g._lastDuelCast=0;g._interimCast=null;const result=g.castLocalSpell(spell,true);const b=[...g.duel.bolts.values()].find(b=>b.by===g.localId&&b.spell===spell);
  h.log('cast',{spell,result,b:b&&{o:b.o.toArray(),dir:b.dir.toArray(),rng:b.rng,tk:b.tk,tid:b.tid}});if(!b)throw Error('No bolt '+spell);
  let max=0;for(let i=0;i<50;i++){g.duel.update(1/60);g.duel.updateVisuals(1/60);const p=g.duel._pool(spell,g.localId);max=Math.max(max,p.core.mesh.count);if(i===35)await h.shot('beam-'+spell,{settle:0});}
  h.log('beam',{spell,count:max,state:b.state,front:b.front.toArray(),free:b.free});if(!max)throw Error('No rendered beam '+spell);
  g.duel.bolts.clear();g.duel._pool(spell,g.localId).core.clear();g.duel._pool(spell,g.localId).glow.clear();
 }
 const air=g.castleLife._runtime(g.castleLife.extra.get('creative-air'));if(!air.awake)g.castleLife._wake(air);const a=g.castleLife.byId.get('creative-air:1');a.foe=g.localId;
 let pushes=0,casts=[];const old=g.spells.cast.bind(g.spells);g.spells.cast=(name,...args)=>{casts.push(name);return old(name,...args);};const blow=g._blowMe.bind(g);g._blowMe=(...args)=>{const p=args[2](g.combat.center(new T.Vector3()));if(p)pushes++;return blow(...args);};
 for(let i=0;i<600;i++){g.character.group.position.set(a.x,a.y+1.95,a.z-17);g.elementalMages.think(a,1/60);g.spells.update(1/60);g.airFx.update(1/60);}
 h.log('air at 17m',{casts,pushes,mana:a.mana,phase:a.elemental.phase});if(!pushes)throw Error('Air mage is casting outside the reach of his wind');
}
