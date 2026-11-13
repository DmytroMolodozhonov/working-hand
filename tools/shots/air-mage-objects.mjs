export default async function(h){
 const g=h.g,T=h.THREE;h.bare();g.paused=true;
 const cs=g.castleLife._runtime(g.castleLife.extra.get('creative-air'));if(!cs.awake)g.castleLife._wake(cs);
 const v=g.castleLife.byId.get('creative-air:1');if(!v)throw Error('Creative air mage missing');
 v.x=0;v.z=0;v.y=g.collision.groundAt(0,0,20);v.group.position.set(v.x,v.y+1.95,v.z);v.mana=v.maxMana=250;v.foe=g.localId;
 g.character.group.position.set(v.x,v.y+1.95,v.z+20);
 const sword=g.weapons.spawn('sword',new T.Vector3(v.x+2,v.y+1,v.z)),axe=g.weapons.spawn('axe',new T.Vector3(v.x-2,v.y+1,v.z));
 const render=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{g.scene.updateMatrixWorld(true);g.camera.updateMatrixWorld(true);};
 const frames=n=>{for(let i=0;i<n;i++){g.lastTime=performance.now()-1000/60;g.frame();}};
 frames(100);const objects=g.elementalMages.objects,s=objects.active.get(v.id);
 h.log('real orbit',{active:!!s,mana:v.mana,objects:s?.sim.size,sword:sword.position.toArray(),axe:axe.position.toArray()});
 if(!s||s.sim.size<2||sword.holder?.airMage!==v.id)throw Error('Air mage did not lift the actual dropped weapons');
 g.renderer.render=render;h.cam([v.x+8,v.y+5,v.z+10],[v.x,v.y+2,v.z]);await h.shot('air-weapons-orbit',{settle:0});
 g.renderer.render=()=>{g.scene.updateMatrixWorld(true);g.camera.updateMatrixWorld(true);};
 frames(400);h.log('released after real volley',{swordHolder:sword.holder,axeHolder:axe.holder,mana:v.mana,active:objects.active.size});
 if(sword.holder?.airMage||axe.holder?.airMage)throw Error('Weapons did not return to physical simulation');g.renderer.render=render;
}
