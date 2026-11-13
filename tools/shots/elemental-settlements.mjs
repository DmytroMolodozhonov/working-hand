// Actual generation-31 sites and voxel meshes, with normal CastleLife residents and ordinary house furniture.
export default async function(h){
 const g=h.g,T=h.THREE;h.bare();g.paused=true;
 const {TerrainData,mergeBuffers}=await import('/src/world/Terrain.js'),{Terrain}=await import('/src/world/TerrainView.js');
 const {applyVoxelDetail}=await import('/src/world/VoxelShading.js');
 const data=new TerrainData();data.generate({seed:20261015,mountains:true,seas:true,lush:true,wizHuts:true,buildings:true,earthSettlements:true,elementalSettlements:true});
 const coords={water:[-3,-6,0],air:[-4,-5,0],fire:[1,0,0]};
 for(const o of g.scene.children)if(!o.isLight&&!o.isCamera)o.visible=false;
 g.scene.fog=null;g.camera.far=750;g.camera.updateProjectionMatrix();g.terrain.data=data;
 const mat=applyVoxelDetail(new T.MeshPhongMaterial({vertexColors:true,shininess:0})),water=g.terrain.waterMaterial;
 let root=null,previous=null;
 for(const e of ['water','air','fire']){
  if(root){root.traverse(o=>{if(o.isMesh)o.geometry.dispose();});root.parent.remove(root);}
  if(previous){g.castleLife._sleep(previous);for(const [id,r]of [...g.houses.active])if(r.def.id===previous.def.id)g.houses._deactivate(r);}
  root=new T.Group();g.scene.add(root);const c=coords[e],d=data.hamlets.byId(...c);if(d?.element!==e)throw Error('Missing real '+e+' site');
  const cx=Math.floor(d.x/32),cz=Math.floor(d.z/32);
  for(let x=cx-2;x<=cx+2;x++)for(let z=cz-2;z<=cz+2;z++){
   const a=data.buildChunkArrays(x,z);for(const [buf,m]of [[mergeBuffers(a.ground,a.raised),mat],[a.water,water]]){const mesh=new T.Mesh(new T.BufferGeometry(),m);Terrain.prototype._fill.call({},mesh,buf);root.add(mesh);}
  }
  g.character.group.position.set(d.x,d.F+1.45,d.z);
  const cs=g.castleLife._runtime(d);g.castleLife._wake(cs);previous=cs;
  for(let i=0;i<d.houses.length;i++){
   g.houses._activate(d,i);const at=d.houses[i].inside,v=g.castleLife._activate(cs,i+1,{...at,yaw:0},'wander');
   if(v){v.group.visible=true;v.model.update(.1,{mode:'idle'});if(v.element!==e||v.noWand!==true)throw Error('Wrong resident controller');}
  }
  if(e==='fire'){g.pentagranium._worldStep(.1);const m=g.pentagranium.marks.get('w:'+d.id+':infernum');if(!m)throw Error('No world Infernum circle');}
  const a=d.rot*Math.PI/2,local=(u,v,y)=>[d.x+u*Math.cos(a)-v*Math.sin(a),d.F+y,d.z+u*Math.sin(a)+v*Math.cos(a)];
  h.cam(local(65,-75,e==='air'?23:38),local(0,4,5));await h.shot(e+'-settlement',{settle:0,light:.8});
  h.log('real settlement',{element:e,id:d.id,rot:d.rot,pos:[d.x,d.F,d.z],houses:d.houses.length,residents:cs.active.size,parts:d.parts.length,geometries:g.renderer.info.memory.geometries});
 }
}
