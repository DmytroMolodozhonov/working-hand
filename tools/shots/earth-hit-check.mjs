export default async function(h){
 const g=h.g,T=h.THREE;h.bare();g.paused=true;
 const cs=g.castleLife._runtime(g.castleLife.extra.get('creative-earth'));if(!cs.awake)g.castleLife._wake(cs);
 const v=g.castleLife.byId.get('creative-earth:1'),L=g.castleLife,em=g.earthMages;
 g.character.group.position.set(v.x,v.y+1.95,v.z-18);
 h.log('initial',{id:v.id,isVillager:v.isVillager,wizard:v.wizard,hp:v.hp,armor:v.armor,fx:v.fx,worn:v.worn,targets:L.targets(100).some(c=>c===v),bodies:g.duel._bodies(g.localId).filter(b=>b.id===v.id)});
 const cast=spell=>{const o=new T.Vector3(v.x,v.y+2,v.z-15),d=new T.Vector3(0,0,1);return g.duel._addBolt({id:'check:'+spell,by:g.localId,spell,side:'right',tk:'v',tid:v.id,ak:.5,o,d});};
 const bolt=cast('Jolt');
 for(let i=0;i<90;i++){g.duel.update(1/60);em.update(1/60);}
 h.log('jolt',{hp:v.hp,stun:v.stunT,vy:v.vy,state:bolt.state,foe:v.foe});
 v.stunT=0;v.vy=0;v.vx=0;v.vz=0;v.foe=g.localId;
 for(let i=0;i<2400;i++){L._think(v,1/60);em.update(1/60);g.groundVortex.update(1/60);if(i%600===0)h.log('fight',{sec:i/60,hp:v.hp,mana:v.mana,phase:v.earth?.phase,mode:v.mode,foe:v.foe,vy:v.vy,pos:[v.x,v.y,v.z]});}
 em._stop(v.id);v.stunT=0;v.vy=0;v.vx=0;v.vz=0;v.fx=0;
 const swarm=em._start(v),rock=g.groundVortex._newBlock(swarm,0,3,Math.round(v.x),1,Math.round(v.z-4),new T.Vector3(v.x,v.y+2.2,v.z-4));rock.pos.set(v.x,v.y+2.2,v.z-4);rock.placed=true;rock.src=null;
 const o=new T.Vector3(v.x,v.y+3.2,v.z-15),d=new T.Vector3(0,0,1);
 const chestBlocked=!!em.segmentHit(o,new T.Vector3(v.x,v.y+2,v.z)),headBlocked=!!em.segmentHit(o,new T.Vector3(v.x,v.y+3.2,v.z));h.log('chest-only rock',{chestBlocked,headBlocked});if(!chestBlocked||headBlocked)throw Error('Bad chest/head regression setup');
 const kill=g.duel._addBolt({id:'check:head-avada',by:g.localId,spell:'AvadaKedavra',side:'right',tk:'v',tid:v.id,ak:.5,o,d});for(let i=0;i<90;i++)g.duel.update(1/60);
 h.log('avada',{hp:v.hp,dead:v.dead,state:kill.state});if(!v.dead)throw Error('A clear head shot was wrongly stopped by a chest-only rock');
 const horse=g.animals.list.find(a=>a.type==='horse'&&!a.dead&&!a.pegasus);if(!horse)throw Error('No test horse');
 horse.far?.set(false);horse.group.visible=horse.model.visible=true;
 let at=null;for(let x=-30;x<=30&&!at;x+=6)for(let z=-40;z<=30&&!at;z+=6){const y=g.collision.groundY(x,z);if(Number.isFinite(y)&&[-3,0,3].every(d=>Math.abs(g.collision.groundY(x,z+d)-y)<.1))at={x,y,z};}
 if(at)horse.group.position.set(at.x,at.y,at.z);
 const x=horse.group.position.x,z=horse.group.position.z;horse.group.rotation.y=0;horse.pose=1;
 for(let i=0;i<180;i++)g.animals._animate(horse,0,1/60);
 h.cam([x+6,horse.group.position.y+3,z-6],[x,horse.group.position.y+1.5,z-1]);await h.shot('horse-grazing',{settle:0});
 h.log('grazing',{pitch:horse.headP,limit:horse.grazeLimit});

}
