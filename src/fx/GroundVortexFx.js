/**
 * GroundVortexFx.js — the blocks of «Ground Vortex» (flying round, in a train, in the shield, thrown) drawn as the world's own blocks.
 *
 * One InstancedMesh per kind of block (a draw call each, a dozen at most): the cube's patterns are the terrain's (VoxelShading:
 * grass blades, stone grain, sand ripples…) worked out from the place the block WAS (`aCell`), so the pattern stays on the block
 * as it tumbles instead of sliding over it; each block has its own colour for the sides and for the top (a grass block keeps its
 * green cap). One shared material (one shader, made on loading — `sample()`); geometries are made once per kind and kept.
 * Nothing is drawn here for a block that is not added this frame: `begin()` … `add()` … `end()` every frame.
 */

import * as THREE from 'three';
import { BASE_COLORS, patternOf } from '../world/Terrain.js';
import { applyVoxelDetail } from '../world/VoxelShading.js';

const CAP = 512; // blocks of one kind at once (the caster's 160, the thrown, a few friends' vortexes)
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** The block material: the world's voxel shader with the pattern anchored to each block and its own side / top colour. */
export function blockSwarmMaterial() {
    const mat = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111, side: THREE.DoubleSide }));
    const base = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
        base(shader, r);
        shader.vertexShader = shader.vertexShader
            .replace('varying vec3 vVoxPos;', 'varying vec3 vVoxPos;\nattribute vec3 aCell;\nattribute vec3 aSide;\nattribute vec3 aTopC;\nattribute float gTop;')
            .replace('vVoxPos = (modelMatrix * vec4(transformed, 1.0)).xyz;', 'vVoxPos = transformed + aCell;')
            .replace('vVoxNormal = normalize(mat3(modelMatrix) * normal);', 'vVoxNormal = normal;')
            .replace('#include <color_vertex>', '#include <color_vertex>\n\tvColor.xyz = mix(aSide, aTopC, gTop);');
    };
    mat.customProgramCacheKey = () => 'gvortex-voxel';
    return mat;
}

/** A unit cube for a kind of block: the terrain's pattern id, full daylight, the top face marked. */
function blockGeometry(type, lush) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3).fill(1), pat = new Float32Array(n).fill(patternOf(type, lush)), sky = new Float32Array(n).fill(1), top = new Float32Array(n);
    const nor = g.attributes.normal;
    for (let i = 0; i < n; i++) top[i] = nor.getY(i) > 0.5 ? 1 : 0;
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('voxPat', new THREE.BufferAttribute(pat, 1));
    g.setAttribute('voxSky', new THREE.BufferAttribute(sky, 1));
    g.setAttribute('gTop', new THREE.BufferAttribute(top, 1));
    g.userData.shared = true;
    return g;
}

/** The colour a block of this kind has when its own colours are not known (a far friend's vortex): the terrain's base, a little varied by `k`. */
export function swarmColor(type, k, isTop, out = _c) {
    out.setHex(BASE_COLORS[type] ?? 0x888888);
    const r = Math.sin(k * 12.9898 + (isTop ? 4.1 : 0)) * 43758.5453;
    return out.multiplyScalar(0.94 + 0.12 * (r - Math.floor(r)));
}

export class BlockSwarmFx {
    constructor(scene) {
        this.scene = scene;
        this.mat = blockSwarmMaterial();
        this.kinds = new Map(); // block type → {mesh, cell, side, top, n}
        this.lush = false;
        this.touched = [];
    }

    _kind(type) {
        let k = this.kinds.get(type);
        if (k) return k;
        const geo = blockGeometry(type, this.lush);
        const cell = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3).setUsage(THREE.DynamicDrawUsage);
        const side = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3).setUsage(THREE.DynamicDrawUsage);
        const top = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3).setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aCell', cell); geo.setAttribute('aSide', side); geo.setAttribute('aTopC', top);
        const mesh = new THREE.InstancedMesh(geo, this.mat, CAP);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.castShadow = false; mesh.receiveShadow = false;
        mesh.count = 0;
        mesh.visible = false;
        this.scene.add(mesh);
        k = { mesh, cell, side, top, n: 0 };
        this.kinds.set(type, k);
        return k;
    }

    begin(lush = false) {
        this.lush = !!lush;
        for (const k of this.kinds.values()) k.n = 0;
    }

    /**
     * One block this frame. b: {t (type), cx, cy, cz (the cell it was lifted from: the pattern's anchor), side: [r, g, b], top: [r, g, b]}.
     * pos {x, y, z}, quat {x, y, z, w}, scale (1 = a whole block).
     */
    add(b, pos, quat, scale = 1) {
        const k = this._kind(b.t);
        if (k.n >= CAP) return;
        const i = k.n++;
        _m.compose(_p.set(pos.x, pos.y, pos.z), _q.set(quat.x, quat.y, quat.z, quat.w), _s.set(scale, scale, scale));
        k.mesh.setMatrixAt(i, _m);
        k.cell.setXYZ(i, b.cx, b.cy, b.cz);
        k.side.setXYZ(i, b.side[0], b.side[1], b.side[2]);
        k.top.setXYZ(i, b.top[0], b.top[1], b.top[2]);
    }

    end() {
        for (const k of this.kinds.values()) {
            k.mesh.count = k.n;
            k.mesh.visible = k.n > 0;
            if (!k.n) continue;
            k.mesh.instanceMatrix.needsUpdate = true;
            k.cell.needsUpdate = true; k.side.needsUpdate = true; k.top.needsUpdate = true;
        }
    }

    /** One block drawn out of sight so that the shader is compiled on the loading screen (Game.prewarm). */
    sample() {
        const k = this._kind(1);
        const im = new THREE.InstancedMesh(k.mesh.geometry, this.mat, 1); // (a copy for the prewarm zoo: the real one stays in the scene)
        _m.makeTranslation(0, -1000, 0);
        im.setMatrixAt(0, _m);
        im.frustumCulled = false;
        return im;
    }

    dispose() {
        for (const k of this.kinds.values()) {
            this.scene.remove(k.mesh);
            k.mesh.geometry.dispose();
            k.mesh.dispose?.();
        }
        this.kinds.clear();
        this.mat.dispose();
    }
}
