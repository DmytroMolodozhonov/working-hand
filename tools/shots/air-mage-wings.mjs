export default async function(h){
 const g=h.g,T=h.THREE,{elementalTestSite}=await import('/src/game/ElementalTestSites.js');h.bare();g.paused=true;
 const render=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{g.scene.updateMatrixWorld(true);g.camera.updateMatrixWorld(true);};
 const def=elementalTestSite({element:'air',name:'Крылатый маг',x:-12,z:-8,seed:17},g.collision.groundAt(-12,-8,20));def.id='creative-air-wings';def.people[0].look.wings=true;def.people[0].mana=250;
 const L=g.castleLife;L.extra.set(def.id,def);const cs=L._runtime(def);L._wake(cs);const v=L.byId.get(def.id+':1');
 g.character.group.position.set(v.x,v.y+1.95,v.z+12);v.foe=g.localId;let frames=0;
 for(;frames<900;frames++){g.lastTime=performance.now()-1000/60;g.frame();if(v.fly&&v.y-g.collision.groundAt(v.x,v.z,v.y+1)>2.5)break;}
 h.log('physical wing takeoff',{frames,fly:v.fly,pos:[v.x,v.y,v.z],mana:v.mana,knowsFlight:v.knowsFlight,wing:v.elemental.wings,mode:v.mode});
 if(!v.fly||v.knowsFlight||!v.model._airWings)throw Error('Winged NPC did not take off with its physical wings');
 g.renderer.render=render;h.cam([v.x+8,v.y+3,v.z+8],[v.x,v.y+2,v.z]);await h.shot('winged-air-mage',{settle:0});
}
