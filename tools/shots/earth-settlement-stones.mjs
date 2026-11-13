export default async function(h){
 const g=h.g,T=h.THREE;h.bare();g.paused=true;
 const {TerrainData,mergeBuffers}=await import('/src/world/Terrain.js'),{Terrain}=await import('/src/world/TerrainView.js'),{applyVoxelDetail}=await import('/src/world/VoxelShading.js');
 const data=new TerrainData();data.generate({seed:20261015,mountains:true,seas:true,lush:true,wizHuts:true,buildings:true,earthSettlements:true,elementalSettlements:true});
 let def;for(let x=-5;x<=5&&!def;x++)for(let z=-5;z<=5&&!def;z++)for(let i=0;i<3;i++){const d=data.hamlets.byId(x,z,i);if(d?.element==='earth'){def=d;break;}}
 if(!def)throw Error('No real earth settlement');
 for(const o of g.scene.children)if(!o.isLight&&!o.isCamera)o.visible=false;g.scene.fog=null;g.terrain.data=data;
 const mat=applyVoxelDetail(new T.MeshPhongMaterial({vertexColors:true,shininess:0})),cx=Math.floor(def.x/32),cz=Math.floor(def.z/32);
 for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++){const a=data.buildChunkArrays(x,z),mesh=new T.Mesh(new T.BufferGeometry(),mat);Terrain.prototype._fill.call({},mesh,mergeBuffers(a.ground,a.raised));g.scene.add(mesh);}
 for(let i=0;i<def.houses.length;i++)g.houses._activate(def,i);g.houses.boulders.mesh.visible=true;g.houses.boulders.update(.3,g.houses.active);
 if(g.houses.boulders.active.size<6)throw Error('No rounded stones activated');
 const a=def.rot*Math.PI/2,local=(u,v,y)=>[def.x+u*Math.cos(a)-v*Math.sin(a),def.F+y,def.z+u*Math.sin(a)+v*Math.cos(a)];
 h.cam(local(12,-32,5),local(0,-20,1.7));await h.shot('earth-garden-stones',{settle:0,light:.8});
 h.cam(local(0,-8,3.2),local(8,4,1));await h.shot('earth-cave-garden',{settle:0,light:1});
 h.log('instanced real settlement rocks',{site:def.id,count:g.houses.boulders.mesh.count,boxes:[...g.houses.boulders.active.values()].map(r=>r.box)});
}
