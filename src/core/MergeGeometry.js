/**
 * MergeGeometry.js — several pieces of one material made into ONE geometry (one draw call instead of
 * one per piece): a door's frame, its panels, a chest's gold corners. The pieces are placed as the
 * meshes were (`at`: an Object3D-like {position, rotation, scale} or a Matrix4).
 */
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * @param {{geo: THREE.BufferGeometry, pos?: number[], rot?: number[], scale?: number[]}[]} parts
 * @returns {THREE.BufferGeometry} (position, normal and uv when every piece has them; indexed)
 */
export function mergeParts(parts) {
    const geos = parts.map(({ geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] }) => {
        _m.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(scale[0], scale[1], scale[2]));
        const g = geo.clone();
        g.applyMatrix4(_m);
        return g;
    });
    const names = ['position', 'normal', 'uv'].filter((n) => geos.every((g) => g.attributes[n]));
    let nv = 0, ni = 0;
    for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const out = new THREE.BufferGeometry();
    const arrs = {};
    for (const n of names) arrs[n] = new Float32Array(nv * geos[0].attributes[n].itemSize);
    const index = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    let vo = 0, io = 0;
    for (const g of geos) {
        for (const n of names) arrs[n].set(g.attributes[n].array, vo * g.attributes[n].itemSize);
        const c = g.attributes.position.count;
        if (g.index) for (let i = 0; i < g.index.count; i++) index[io++] = g.index.array[i] + vo;
        else for (let i = 0; i < c; i++) index[io++] = i + vo;
        vo += c;
        g.dispose();
    }
    for (const n of names) out.setAttribute(n, new THREE.BufferAttribute(arrs[n], geos[0].attributes[n].itemSize));
    out.setIndex(new THREE.BufferAttribute(index, 1));
    out.computeBoundingSphere();
    return out;
}
