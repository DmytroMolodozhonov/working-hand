import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TerrainData, BLOCK, mergeBuffers } from '../../src/world/Terrain.js';
import { Terrain } from '../../src/world/TerrainView.js';
import { applyVoxelDetail } from '../../src/world/VoxelShading.js';
import { belowCaveSurface } from '../../src/game/CavePlace.js';
import { UpSpell, UP } from '../../src/game/UpSpell.js';
import { PLAYER_GROUND_OFFSET } from '../../src/entities/Character.js';

function room() {
    const t = new TerrainData(); t.generate({seed:1});
    for(let z=2;z<=12;z++)for(let x=2;x<=12;x++)for(let L=-9;L<=-3;L++)t.set(x,L,z,BLOCK.AIR);
    return t;
}
const faces = b => Array.from({length:b.positions.length/3},(_,i)=>({x:b.positions[i*3],y:b.positions[i*3+1],z:b.positions[i*3+2],wet:b.wet[i],ny:b.normals[i*3+1],sky:b.skies[i]}));

test('dry cave stays dry before and after a skylight; actual submerged floor carries its own flag through merge and GPU geometry',()=>{
    const t=room();
    let arrays=t.buildChunkArrays(0,0), merged=mergeBuffers(arrays.ground,arrays.raised);
    assert.ok(merged.wet instanceof Uint8Array);
    assert.equal(merged.wet.length,merged.positions.length/3);
    assert.ok(merged.wet.every(x=>x===0),'dry room is not seabed');
    for(let z=4;z<=6;z++)for(let x=4;x<=6;x++)for(let L=-2;L<=0;L++)t.set(x,L,z,BLOCK.AIR);
    arrays=t.buildChunkArrays(0,0);merged=mergeBuffers(arrays.ground,arrays.raised);
    assert.ok(merged.wet.every(x=>x===0));
    assert.ok(faces(merged).some(v=>v.y < -3 && v.sky>.12),'daylight really reaches the dry cavity');
    // Water over part of the very same floor must split an otherwise mergeable dry/wet boundary.
    for(let z=3;z<=5;z++)for(let x=9;x<=11;x++)for(let L=-9;L<=-6;L++)t.set(x,L,z,BLOCK.WATER);
    arrays=t.buildChunkArrays(0,0);merged=mergeBuffers(arrays.ground,arrays.raised);
    const floor=faces(merged).filter(v=>v.ny===1&&v.y===-10.5);
    assert.ok(floor.some(v=>v.wet===255),'submerged floor');assert.ok(floor.some(v=>v.wet===0),'dry floor at same height');
    const mesh=new THREE.Mesh(new THREE.BufferGeometry());Terrain.prototype._fill.call({},mesh,merged);
    assert.equal(mesh.geometry.getAttribute('voxWet').normalized,true);
    assert.deepEqual(mesh.geometry.getAttribute('voxWet').array,merged.wet);
});

test('the actual terrain shader uses fluid contact, not sky brightness, to select seabed detail',()=>{
    const m=applyVoxelDetail(new THREE.MeshPhongMaterial());
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.phong.vertexShader,fragmentShader:THREE.ShaderLib.phong.fragmentShader};
    m.onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes('vVoxWet = voxWet'));
    assert.ok(shader.fragmentShader.includes('* vVoxWet : 0.0'));
    assert.ok(!shader.fragmentShader.includes('smoothstep(0.02, 0.12, vVoxSky)'));
    assert.deepEqual(m.defaultAttributeValues.voxWet,[0],'lifted/preview blocks default dry');
});

test('a roof opened to the sky stays below the original cave surface; the surface and an ordinary field do not',()=>{
    const t=room();
    for(let L=-9;L<=0;L++)t.set(5,L,5,BLOCK.AIR);
    assert.ok(belowCaveSurface(t,5,5,-10.5));
    assert.equal(t.topLayer(5,5),-10,'the current top has moved down: cannot identify a cave by that');
    assert.ok(!belowCaveSurface(t,1,1,-.5));
    assert.ok(!belowCaveSurface(t,5,5,-.5),'once on the surface, exit the cave');
    assert.ok(!belowCaveSurface({},0,0,-10));
});

test('actual Stand Up accepts a sunlit opened cave but still refuses an ordinary field, closed ceiling, stun and insufficient mana',()=>{
    const run=({cave=true,height=0,ceiling=Infinity,tired=null}={})=>{
        let paid=0;const hints=[];
        const g={_inCave:false,_caveSys:cave,config:{mode:'freeworld'},knock:{state:'standing'},
            character:{group:{position:new THREE.Vector3(5,-10.5+PLAYER_GROUND_OFFSET,5)},onGround:true},
            terrain:{data:{heightAt:()=>height,solidIn:()=>false}},collision:{ceilingAt:()=>ceiling},
            combat:{check:()=>tired,pay:()=>paid++},hud:{setVoice:s=>hints.push(s)}};
        const up=new UpSpell(g);up.raisedArm=()=>new THREE.Vector3(0,1,0);
        return {result:up.cast(true),paid,g,hints,up};
    };
    const open=run();assert.equal(open.result,'Up');assert.equal(open.paid,1);assert.equal(open.g.character.verticalVelocity,UP.VY);
    for(const opts of [{cave:false},{height:-10},{ceiling:-7},{tired:'оглушён'},{tired:'мало маны'}]){
        const r=run(opts);assert.equal(r.result,null,JSON.stringify(opts));assert.equal(r.paid,0);
    }
});

test('actual cave-map detection keeps a sunlit shaft inside the cave, then exits on the surface',async()=>{
    const { Game }=await import('../../src/game/Game.js');
    let inCave;
    const data={cavesNear:()=>[],solidIn:()=>false,skyAt:()=>1,heightAt:()=>0};
    const g={terrain:{data},config:{mode:'freeworld'},character:{group:{position:new THREE.Vector3(5,-10.5+PLAYER_GROUND_OFFSET,5)}},
        _caveT:1,_caveSys:true,_ruinLog(){},_updateCaveMap:(dt,p,cave)=>inCave=cave,world:{}};
    Game.prototype._updateCaves.call(g,.02);assert.equal(inCave,true);
    assert.equal(g._caveK,0,'light stays bright: location does not fake darkness');
    g.character.group.position.y=-.5+PLAYER_GROUND_OFFSET;
    Game.prototype._updateCaves.call(g,.02);assert.equal(inCave,false);
});
