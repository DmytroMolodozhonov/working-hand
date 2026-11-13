export default async function(h){
 const g=h.g,T=h.THREE;h.bare();g.paused=true;
 const people=[];
 for(const element of ['earth','water','air','fire']){
  const cs=g.castleLife._runtime(g.castleLife.extra.get('creative-'+element));if(!cs.awake)g.castleLife._wake(cs);
  const v=g.castleLife.byId.get('creative-'+element+':1');if(!v||v.element!==element||!v.isVillager)throw Error('Missing real NPC '+element);people.push(v);
  if(!g.duel._bodies(g.localId).some(b=>b.id===v.id))throw Error('Not targetable '+element);
  h.log('mage',{element,id:v.id,name:v.name,pos:[v.x,v.y,v.z],mana:v.mana});
 }
 for(const v of people){
  v.foe=g.localId;g.character.group.position.set(v.x,v.y+1.95,v.z-16);
  for(let i=0;i<135;i++){g.castleLife._think(v,1/60);g.earthMages.update(1/60);g.groundVortex.update(1/60);g.vortex.update(1/60);g.spells.update(1/60);v.group.position.set(v.x,v.y+1.95,v.z);v.group.rotation.y=v.yaw;v.model.update(1/60,{mode:v.mode});}
  h.cam([v.x+7,v.y+5,v.z-9],[v.x,v.y+2,v.z]);await h.shot(v.element+'-casting',{settle:0});
  h.log('combat',{element:v.element,mode:v.mode,mana:v.mana,hp:v.hp});
 }
 // Full Game cast pipeline, not a manually created duel projectile.
 const v=people[0];g.earthMages._stop(v.id);v.foe=null;v.fx=0;v.stunT=0;v.vy=0;g.character.group.position.set(v.x,v.y+1.95,v.z-12);
 const aimOrigin=new T.Vector3(v.x,v.y+2,v.z-12),aimDir=new T.Vector3(0,0,1);
 g.duel._myRay=(side,o,d)=>{o.copy(aimOrigin);d.copy(aimDir);};
 g.duel.myStart=(side,o)=>o.copy(aimOrigin);
 const before=g.duel.bolts.size;g._interimCast=null;g._lastDuelCast=0;
 const result=g._castDuel('Jolt','Jolt',true,{side:'right',t:{kind:'v',id:v.id}},'right');
 const bolt=[...g.duel.bolts.values()].find(b=>b.by===g.localId&&b.spell==='Jolt');
 h.log('Jolt actual cast',{result,before,after:g.duel.bolts.size,target:bolt?.tid});
 if(!bolt||bolt.tid!==v.id)throw Error('Jolt did not target earth NPC');
 for(let i=0;i<65;i++)g.duel.update(1/60);
 h.log('Jolt actual hit',{state:bolt.state,stun:v.stunT,vy:v.vy});if(!(v.stunT>0))throw Error('Jolt failed to hit');
 g.airFx.gust(new T.Vector3(v.x,v.y+2,v.z-3),new T.Vector3(0,0,1),1);g.airFx.update(.15);g._updateCamera(0);g.renderer.render(g.scene,g.camera);g.airFx.render(g.renderer,g.camera);await h.page('air-distortion',0);
}
