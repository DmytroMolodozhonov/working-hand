// Real casting below a solid roof, and a new player corpse moving from its lethal spell impulse.
export default async function(h) {
    const g=h.g,T=h.THREE;
    const {TerrainData,BLOCK,mergeBuffers}=await import('/src/world/Terrain.js');
    const {Terrain}=await import('/src/world/TerrainView.js');
    const {applyVoxelDetail}=await import('/src/world/VoxelShading.js');
    const {DeathSystem}=await import('/src/game/Death.js');
    const {VoxelCharacter}=await import('/src/entities/Character.js');
    h.bare();g.paused=true;
    for(const o of g.scene.children)if(!o.isLight)o.visible=false;
    const data=new TerrainData();data.generate({seed:7});
    for(let z=1;z<=20;z++)for(let x=1;x<=20;x++)for(let L=-10;L<=-3;L++)data.set(x,L,z,BLOCK.AIR);
    const arrays=data.buildChunkArrays(0,0);
    const mesh=new T.Mesh(new T.BufferGeometry(),applyVoxelDetail(new T.MeshPhongMaterial({vertexColors:true,shininess:0})));
    Terrain.prototype._fill.call({},mesh,mergeBuffers(arrays.ground,arrays.raised));g.scene.add(mesh);
    const lamp=new T.PointLight(0xffe6bb,1.8,40);lamp.position.set(8,-4.5,9);g.scene.add(lamp);
    g.terrain.data=data;
    const p=g.pentagranium;
    const result=p.cast(true,'Pentagranium Vita',{origin:new T.Vector3(8,-7.5,8),dir:new T.Vector3(0,-1,0)});
    if(result!=='Pentagranium')throw new Error('Cave floor cast refused');
    const mark=[...p.marks.values()].find(m=>Math.abs(m.x-8)<.1&&m.mine);
    if(mark?.y!==-11.5)throw new Error('Drawing placed on the roof');
    p._animStep(mark,3);p.fx.set(mark.id,1,0,1);
    h.cam([12,-5.9,18],[9,-10.5,8]);
    await h.shot('pentagram-on-cave-floor',{settle:0});
    const ch=new VoxelCharacter(g.scene,{remote:true});ch.group.position.set(14,-9.55,8);ch.group.updateMatrixWorld(true);
    const world={scene:g.scene,authority:true,character:ch,collision:{groundAt:()=>-11.5},castleLife:{byId:new Map()}};
    const death=new DeathSystem(world);
    const body={id:'spell-death',k:'p',who:'me',x:14,y:-9.55,z:8,yaw:0,age:0,ki:[0,1.75,-5]};
    death.addBody(body,ch.group);ch.group.visible=false;
    await h.shot('lethal-impulse-start',{settle:0});
    for(let i=0;i<24;i++)death.update(1/60);
    await h.shot('lethal-impulse-moving',{settle:0});
    h.log('cave casting',{roof:data.topLayer(8,8)-.5,floor:mark.y,bodyFrom:8,bodyNow:body.z});
}
