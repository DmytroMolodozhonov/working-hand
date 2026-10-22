/**
 * CopruStatue.js — the statue of Coprus the Clever in the wizards' settlements: a real model (not blocks) of an
 * old wizard in a long robe — a long beard, a tall bent hat, one hand down, the other raised with the wand up
 * and its tip glowing. Marble with a light patina (moss at the hem, dark in the folds). The whole figure is ONE
 * merged shape of one material (vertex colours) shared by every settlement, plus the wand's glowing tip and its
 * soft halo — three draw calls. The pedestal stays in the world's blocks (its collision); the figure stands on it
 * and has its own box (WizVillages._statue). Prewarm: WizVillages.sampleModels.
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';

export const STATUE_SCALE = 2.1; // the figure's metres → the world's (the hat's tip ≈ 9 m over the pedestal)
export const STATUE_BOX = { half: 1.9, h: 9.5 }; // m: the collision box of the figure on the pedestal (half-width, height)
export const TIP = [1.06, 4.78, 0.2]; // the wand's tip (figure metres)

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// the stone, the white marble, the cloth of the sash, the moss and the wood
const STONE = new THREE.Color(0xb4b2aa), MARBLE = new THREE.Color(0xe6e3da), DARK = new THREE.Color(0x6b717d), MOSS = new THREE.Color(0x6f805f), WOOD = new THREE.Color(0x5b4126);

/** A tapering rod from a to b (radius r0 → r1). */
function rod(a, b, r0, r1, seg = 8) {
    const geo = new THREE.CylinderGeometry(r1, r0, 1, seg, 1);
    _a.set(...a); _b.set(...b);
    const len = _a.distanceTo(_b);
    _q.setFromUnitVectors(_up, _b.clone().sub(_a).normalize());
    _m.compose(_a.clone().add(_b).multiplyScalar(0.5), _q, _s.set(1, len, 1));
    geo.applyMatrix4(_m);
    return geo;
}

/** A part placed by position and scale (a sphere, a cone, a cylinder). */
function put(geo, pos, scale = [1, 1, 1], rot = [0, 0, 0]) {
    _m.compose(_a.set(...pos), _q.setFromEuler(new THREE.Euler(...rot)), _s.set(...scale));
    geo.applyMatrix4(_m);
    return geo;
}

/** Colours a placed part by where its points are: the moss creeps up from the hem, the stone is a little uneven. */
function tint(geo, base, mossy = 0) {
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const n = Math.sin(x * 9.1 + z * 7.3) * Math.sin(y * 6.7 + x * 3.1) * 0.5 + 0.5; // 0…1, fixed by the place
        c.copy(base).multiplyScalar(0.9 + n * 0.14);
        if (mossy) c.lerp(MOSS, Math.max(0, Math.min(1, (0.9 - y) / 0.9)) * mossy * (0.45 + n * 0.55));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
}

let _parts = null;
/** The statue's shared shape, material, the wand tip's material and the halo's (made once). */
export function statueParts() {
    if (_parts) return _parts;
    const P = [];
    const add = (geo, base, mossy = 0) => P.push({ geo: tint(geo, base, mossy) });
    // the robe: wide at the hem, with folds running down it, a flared hem and a sash
    add(put(new THREE.CylinderGeometry(0.4, 0.86, 2.3, 24, 1), [0, 1.15, 0]), STONE, 1);
    add(put(new THREE.CylinderGeometry(0.92, 0.95, 0.14, 24, 1), [0, 0.07, 0]), STONE, 1);
    for (let k = 0; k < 9; k++) {
        const f = (k / 9) * Math.PI * 2 + 0.3;
        add(rod([Math.sin(f) * 0.9, 0.08, Math.cos(f) * 0.9], [Math.sin(f) * 0.47, 2.0, Math.cos(f) * 0.47], 0.1, 0.05, 6), DARK.clone().lerp(STONE, 0.55), 1);
    }
    add(put(new THREE.CylinderGeometry(0.5, 0.54, 0.13, 20, 1), [0, 1.5, 0]), DARK);
    add(put(new THREE.SphereGeometry(0.5, 16, 10), [0, 2.25, 0], [1.2, 0.78, 0.82]), STONE); // the shoulders
    // the left arm hangs down in a wide sleeve, the hand open; the right is raised with the wand
    add(rod([-0.58, 2.28, 0.02], [-0.86, 1.62, 0.16], 0.19, 0.24, 8), STONE);
    add(rod([-0.86, 1.62, 0.16], [-0.84, 1.1, 0.3], 0.24, 0.12, 8), STONE);
    add(put(new THREE.SphereGeometry(0.11, 10, 8), [-0.84, 1.02, 0.32], [1, 1.2, 0.8]), MARBLE);
    add(rod([0.58, 2.3, 0.02], [0.98, 2.78, 0.16], 0.19, 0.22, 8), STONE);
    add(rod([0.98, 2.78, 0.16], [1.04, 3.36, 0.2], 0.22, 0.11, 8), STONE);
    add(put(new THREE.SphereGeometry(0.11, 10, 8), [1.05, 3.46, 0.2]), MARBLE);
    // the wand
    add(rod([1.05, 3.4, 0.2], [TIP[0], TIP[1] - 0.06, TIP[2]], 0.045, 0.028, 6), WOOD);
    // the head, the nose, the brows, the beard and the moustache
    add(put(new THREE.SphereGeometry(0.27, 16, 12), [0, 2.88, 0.04], [1, 1.1, 1]), MARBLE);
    add(put(new THREE.ConeGeometry(0.06, 0.2, 8), [0, 2.86, 0.3], [1, 1, 1], [Math.PI / 2, 0, 0]), MARBLE);
    add(put(new THREE.BoxGeometry(0.44, 0.06, 0.14), [0, 2.99, 0.24], [1, 1, 1], [-0.25, 0, 0]), MARBLE);
    add(put(new THREE.ConeGeometry(0.26, 1.15, 14), [0, 2.1, 0.27], [1, 1, 0.7], [Math.PI, 0, 0]), MARBLE);
    add(put(new THREE.SphereGeometry(0.15, 10, 8), [-0.12, 2.72, 0.27], [1.3, 0.55, 0.8], [0, 0, 0.3]), MARBLE);
    add(put(new THREE.SphereGeometry(0.15, 10, 8), [0.12, 2.72, 0.27], [1.3, 0.55, 0.8], [0, 0, -0.3]), MARBLE);
    // the hat: a wide brim, a band, a tall cone, its tip bent back
    add(put(new THREE.CylinderGeometry(0.62, 0.66, 0.08, 24, 1), [0, 3.12, 0.02]), STONE);
    add(put(new THREE.CylinderGeometry(0.34, 0.36, 0.14, 20, 1), [0, 3.22, 0.02]), DARK);
    add(put(new THREE.ConeGeometry(0.33, 1.1, 16), [0, 3.76, 0.02], [1, 1, 1], [-0.12, 0, 0]), STONE);
    add(rod([0, 4.2, -0.1], [0, 4.62, -0.5], 0.13, 0.03, 8), STONE);
    const geo = mergeParts(P.map((p) => ({ geo: p.geo })));
    for (const p of P) p.geo.dispose();
    geo.computeBoundingSphere();
    // the halo of the glowing tip: one soft round texture
    let map = null;
    if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const x = c.getContext('2d');
        const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,236,170,1)'); gr.addColorStop(0.3, 'rgba(255,200,90,0.45)'); gr.addColorStop(1, 'rgba(255,170,60,0)');
        x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
        map = new THREE.CanvasTexture(c);
        map.colorSpace = THREE.SRGBColorSpace;
    }
    _parts = {
        geo,
        mat: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1d1d26 }), // (a faint glow of its own: the marble reads at dusk)
        tipGeo: new THREE.SphereGeometry(0.085, 10, 8),
        tipMat: new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
        haloMat: new THREE.SpriteMaterial({ map, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }),
    };
    return _parts;
}

/** The statue as a group at the pedestal's top middle (x, y, z), turned `ry`. */
export function makeStatue(x, y, z, ry) {
    const P = statueParts();
    const g = new THREE.Group();
    const body = new THREE.Mesh(P.geo, P.mat);
    const tip = new THREE.Mesh(P.tipGeo, P.tipMat);
    tip.position.set(...TIP);
    const halo = new THREE.Sprite(P.haloMat);
    halo.position.set(...TIP);
    halo.scale.setScalar(0.9);
    g.add(body, tip, halo);
    g.position.set(x, y, z);
    g.rotation.y = ry;
    g.scale.setScalar(STATUE_SCALE);
    g.matrixAutoUpdate = false;
    g.updateMatrix();
    return g;
}
