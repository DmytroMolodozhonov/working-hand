// Compare the old height/daylight seabed heuristic with actual fluid-contact classification.
export default async function(h) {
    const g=h.g,T=h.THREE;
    const {TerrainData,BLOCK,mergeBuffers}=await import('/src/world/Terrain.js');
    const {Terrain}=await import('/src/world/TerrainView.js');
    const {applyVoxelDetail}=await import('/src/world/VoxelShading.js');
    h.bare();g.paused=true;
    const data=new TerrainData();data.generate({seed:1});
    for(let z=2;z<=12;z++)for(let x=2;x<=12;x++)for(let L=-9;L<=-3;L++)data.set(x,L,z,BLOCK.AIR);
    // Sky enters both a cave mouth and a newly mined shaft; none of this hall contains water.
    for(let z=0;z<=5;z++)for(let x=4;x<=7;x++)for(let L=-9;L<=0;L++)data.set(x,L,z,BLOCK.AIR);
    for(const o of g.scene.children) if(!o.isLight)o.visible=false;
    const a=data.buildChunkArrays(0,0), arrays=mergeBuffers(a.ground,a.raised);
    const fixed=applyVoxelDetail(new T.MeshPhongMaterial({vertexColors:true,shininess:0}));
    const before=applyVoxelDetail(new T.MeshPhongMaterial({vertexColors:true,shininess:0}));
    const compile=before.onBeforeCompile;
    before.onBeforeCompile=shader=>{
        compile(shader);
        shader.fragmentShader=shader.fragmentShader.replace('&& vVoxWet > 0.5) detail','&& vVoxSky > 0.02) detail')
            .replace('* vVoxWet : 0.0;','* smoothstep(0.02, 0.12, vVoxSky) : 0.0;');
    };
    before.customProgramCacheKey=()=> 'cave-surface-before';
    const mesh=new T.Mesh(new T.BufferGeometry(),before);Terrain.prototype._fill.call({},mesh,arrays);g.scene.add(mesh);
    const lamp=new T.PointLight(0xffffff,1.6,30);lamp.position.set(7,-5,7);g.scene.add(lamp);
    h.cam([9,-6.2,10],[5,-6.2,3]);
    await h.shot('before-dry-cave',{settle:0});
    mesh.material=fixed;
    await h.shot('after-dry-cave',{settle:0});
    // The seabed appearance still exists where water really touches a block.
    for(let z=2;z<=6;z++)for(let x=2;x<=12;x++)for(let L=-9;L<=-3;L++)data.set(x,L,z,BLOCK.WATER);
    const wet=data.buildChunkArrays(0,0);Terrain.prototype._fill.call({},mesh,mergeBuffers(wet.ground,wet.raised));
    await h.shot('actual-submerged-rock',{settle:0});
    h.log('wet flag: one normalized byte per vertex; same material, no new terrain draw calls');
}
