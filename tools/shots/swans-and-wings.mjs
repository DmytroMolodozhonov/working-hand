export default async function(h){
 const g=h.g,T=h.THREE,{swanSiteAt}=await import('/src/game/SwanLife.js'),{hash01}=await import('/src/world/Castles.js');
 const render=g.renderer.render.bind(g.renderer);
 const photo=async(name,cam,at)=>{
  h.cam(cam,at);await h.shot(name,{settle:0});
 };
 // Stream and simulate normally; render the distant forest only for the final
 // images, rather than hundreds of SwiftShader frames during the journey.
 g.renderer.render=()=>{g.scene.updateMatrixWorld(true);g.camera.updateMatrixWorld(true);};
 const t=g.terrain.data;let lake=null;
 // Locate a deterministic natural flock site in this actual world's recipe.
 outer:for(let gx=-24;gx<=24;gx++)for(let gz=-24;gz<=24;gz++){
  const s=swanSiteAt(gx,gz,g.seed);if(!s)continue;
  for(let k=0;k<14;k++){
   const x=gx*80+8+hash01(gx*31+k,gz,g.seed+9310)*64,z=gz*80+8+hash01(gx,gz*31+k,g.seed+9311)*64;
   let wet=true;for(const [dx,dz] of [[0,0],[4,0],[-4,0],[0,4],[0,-4],[3,3],[-3,3],[3,-3],[-3,-3]]){t.rawHeight(Math.round(x+dx),Math.round(z+dz));if(t.rawHeight.water<2||t.rawHeight.sea){wet=false;break;}}
   if(wet&&!t.sites?.landAt?.(Math.round(x),Math.round(z))){lake={...s,x,z};break outer;}
  }
 }
 if(!lake)throw Error('No natural freshwater flock site found');
 h.log('natural lake',{seed:g.seed,lake});await h.go(lake.x,12,lake.z-70);await h.frames(120);
 g.paused=true;g.character.group.rotation.y=0;g.camera.lookAt(g.camera.position.clone().add(new T.Vector3(0,0,-1)));
 for(let i=0;i<50&&!g.animals.list.some(a=>a.site?.key===lake.key);i++)g.animals._scanSites(.5);
 const flock=g.animals.list.filter(a=>a.type==='swan'&&a.site?.key===lake.key);
 if(flock.length<2)throw Error('Natural flock not activated: '+JSON.stringify(g.animals.sites.get(lake.key)));
 if(flock.some(a=>a.color!==1||a.model.userData.magicSwan))throw Error('A magical swan remains');
 h.log('natural flock',flock.map(a=>({id:a.id,colour:a.color,pos:a.group.position.toArray()})));
 g.renderer.render=render;h.bare();const p=flock[0].group.position;
 await photo('natural-ordinary-swans',[p.x+8,p.y+4,p.z+8],[p.x,p.y+.8,p.z]);
 await photo('swan-close',[p.x+3,p.y+1.7,p.z-3],[p.x,p.y+.8,p.z]);
 const victim=flock[0];g.animals.hit(victim,999,null,g.localId);
 if(flock.slice(1).some(a=>!a.fly&&a.state!=='flee'&&a.state!=='attack'))throw Error('Flock ignored its mate\'s death');
 const pig=g.animals._spawn('pig',p.clone().add(new T.Vector3(12,4,0)));g.animals.hit(pig,999,null,g.localId);
 const {makeItemModel}=await import('/src/game/ItemTypes.js');
 for(const [i,kind] of ['swanWings','pigWings'].entries()){
  const m=makeItemModel({kind});m.scale.setScalar(9);m.position.set(p.x+i*4,p.y+1,p.z);g.scene.add(m);
 }
 await photo('interchangeable-wing-pairs',[p.x+2,p.y+10,p.z+8],[p.x+2,p.y+1,p.z]);
 h.log('herd and drops',{survivors:flock.slice(1).map(a=>({state:a.state,fly:!!a.fly})),pigDead:pig.dead});
}
