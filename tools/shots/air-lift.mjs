export default async function(h){
 const g=h.g,T=h.THREE;h.bare();g.paused=true;
 const cs=g.castleLife._runtime(g.castleLife.extra.get('creative-air'));if(!cs.awake)g.castleLife._wake(cs);const v=g.castleLife.byId.get('creative-air:1');
 v.foe=g.localId;v.yaw=0;const start=v.y+1.95;g.character.group.position.set(v.x,start,v.z-12);
 h.log('armour before',{guard:g.armor.guard('LevitateDuel',{quiet:true}),fx:g.armor.fx});
 g.combat.shield=null;
 const lift=g.levitation.liftMe.bind(g.levitation),drop=g.levitation.dropMe.bind(g.levitation);
 g.levitation.liftMe=(...args)=>{const r=lift(...args);h.log('lift attempt',{held:!!g.levitation.lifted,wizard:v.wizard});return r;};
 g.levitation.dropMe=(...args)=>{h.log('drop',{args,mode:v.mode,stun:v.stunT,vy:v.vy});return drop(...args);};
 if(!g.elementalMages.airLift(v,{x:v.x,y:v.y+2,z:v.z-12}))throw Error('NPC lift charge not cast');
 const bolt=[...g.duel.bolts.values()].find(b=>b.by===v.id);
 for(let i=0;i<240;i++){g.duel.update(1/60);g.levitation.update(1/60);g.elementalMages.think(v,1/60);v.model.update(1/60,{mode:v.mode});}
 h.log('lift debug',{state:bolt?.state,front:bolt?.front.toArray(),tk:bolt?.tk,tid:bolt?.tid,log:g.duel.log,magic:g.combat.magicArmor,armor:g.combat.armor,hand:g.handPose(v.id,'right')});
 h.log('lift',{by:g.levitation.lifted?.by,rise:g.character.group.position.y-start,mana:v.mana,mode:v.mode});
 if(g.levitation.lifted?.by!==v.id||g.character.group.position.y-start<5)throw Error('Real player not lifted');
 const p=g.character.group.position;h.cam([v.x+12,p.y+7,v.z-6],[p.x,p.y,p.z]);await h.shot('air-npc-lift',{settle:0});
 v.stunT=2;g.levitation.update(1/60);if(g.levitation.lifted)throw Error('Stun did not stop lift');h.log('released',{vy:g.character.verticalVelocity});
}
