export default async function(h){
 const g=h.g,T=h.THREE;h.bare();g.paused=true;
 const cs=g.castleLife._runtime(g.castleLife.extra.get('creative-water'));if(!cs.awake)g.castleLife._wake(cs);const v=g.castleLife.byId.get('creative-water:1');
 v.foe=g.localId;v.yaw=0;v.elemental.cycle=1;v.gifts.hydro.h=1;
 g.character.group.position.set(v.x,v.y+1.95,v.z-12);
 const old=v.mana;if(!g.elementalMages.waterAttack(v,{x:v.x,y:v.y+2,z:v.z-12}))throw Error('No NPC water attack');
 const id=v.elemental.capture;
 for(let i=0;i<240;i++)g.vortex.update(1/60);
 const b=g.vortex.bubbles.get(id);h.log('capture',{id,phase:b?.phase,mana:v.mana,paid:old-v.mana,position:b?.pos.toArray(),encased:g.combat.encased});
 if(!b||b.phase!=='ice')throw Error('NPC did not capture and freeze actual player');
 h.cam([v.x+9,v.y+13,v.z-3],[b.pos.x,b.pos.y,b.pos.z]);await h.shot('water-npc-freeze',{settle:0});
 v.stunT=2;g.vortex.update(1/60);if(g.vortex.bubbles.has(id)||g.combat.encased)throw Error('Stunned mage did not release victim');h.log('release',{encased:g.combat.encased,bubbles:g.vortex.bubbles.size});
}
