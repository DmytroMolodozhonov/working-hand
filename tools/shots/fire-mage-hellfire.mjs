export default async function(h){
 const g=h.g;h.bare();g.paused=true;const L=g.castleLife,cs=L._runtime(L.extra.get('creative-fire'));if(!cs.awake)L._wake(cs);const v=L.byId.get('creative-fire:1');
 v.x=0;v.z=0;v.y=g.collision.groundAt(0,0,20);v.group.position.set(v.x,v.y+1.95,v.z);v.foe=g.localId;g.character.group.position.set(v.x,v.y+1.95,v.z+14);
 const render=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{g.scene.updateMatrixWorld(true);g.camera.updateMatrixWorld(true);};
 const step=()=>{g.lastTime=performance.now()-1000/60;g.frame();};
 let frames=0;for(;frames<900;frames++){step();if(g.hellfire.remote.has(v.id))break;}
 if(!g.hellfire.remote.has(v.id))throw Error('Natural strong fire mage combat never cast Hellfire');
 for(let i=0;i<60;i++)step();h.log('actual NPC Hellfire',{frames,mana:v.mana,max:v.maxMana,phase:v.elemental.phase,fire:g.hellfire.remote.get(v.id)?.R});
 g.renderer.render=render;h.cam([v.x+12,v.y+6,v.z+10],[v.x,v.y+2,v.z+7]);await h.shot('fire-mage-hellfire',{settle:0});
 v.stunT=1;g.renderer.render=()=>{g.scene.updateMatrixWorld(true);g.camera.updateMatrixWorld(true);};step();g.renderer.render=render;
 if(g.hellfire.npcs.has(v.id)||g.hellfire.remote.has(v.id))throw Error('Stunned NPC retained Hellfire concentration');h.log('stun releases concentration',{left:g.hellfire.left.length});
}
