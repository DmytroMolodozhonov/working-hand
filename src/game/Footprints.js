/**
 * Footprints.js — the ground remembers who walked on it (the author 21.11: «даже следы ног или взаимодействия игроков по отношению к
 * земле должны быть, и в зависимости от погоды тоже»). Boot prints of the hero, the other players and the villagers, hooves of horses,
 * cloven prints of cows, sheep and pigs, a swan's webbed feet — left on the ground at every stride, turned the way the walker went,
 * left and right feet in turn.
 *
 * What the ground and the weather make of them (FOOT_GROUND):
 *   snow   — deep, crisp prints with a blue shadow inside; the wind slowly drifts them over (minutes);
 *   sand   — clear dents; rain smooths them away quickly;
 *   soil, a path, a field — prints in the dust; after rain they are MUD: dark, wet, glossy and they last long;
 *   grass  — only a faint pressed patch, and only while the ground is wet (dry grass springs back — TrampleField does that part);
 *   stone, planks, built floors — nothing when dry; WET boots leave dark wet prints that dry in seconds (after rain or out of water).
 * One pool of decals (an InstancedMesh, `FOOT.MAX`): the oldest gives its place to the newest; one painted 256² texture (four kinds).
 * The wetness is the world's (ULTRA.wet: rain soaks the land, it dries slowly). Nothing goes over the net: every computer sees the
 * walkers it sees and prints them itself.
 */
import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';
import { ULTRA } from '../fx/UltraUniforms.js';

export const FOOT = {
    MAX: 360, // prints at most (a ring)
    NEAR: 34, // m: walkers farther from the player leave none (nobody sees them)
};

/** The ground under a print: how deep it shows (0…1), how long it lasts (s), and what rain does (`wet` — the print a wet day makes). */
export const FOOT_GROUND = {
    snow: { k: 1, life: 240, tint: [0.62, 0.7, 0.9] },
    sand: { k: 0.8, life: 140, rainLife: 25, tint: [0.62, 0.52, 0.38] },
    soil: { k: 0.55, life: 90, wetK: 1, wetLife: 300, tint: [0.33, 0.24, 0.16], mud: true },
    grass: { k: 0, life: 25, wetK: 0.45, wetLife: 90, tint: [0.2, 0.24, 0.12], mud: true },
    hard: { k: 0, life: 0, wetK: 0.5, wetLife: 14, tint: [0.12, 0.12, 0.12] },
};
const GROUND_OF = new Map([
    [BLOCK.SNOW, 'snow'], [BLOCK.ICE, 'snow'], [BLOCK.SAND, 'sand'],
    [BLOCK.DIRT, 'soil'], [BLOCK.PATH, 'soil'], [BLOCK.FARMLAND, 'soil'], [BLOCK.GRAVEL, 'soil'], [BLOCK.HELL_ASH, 'soil'], [BLOCK.REGOLITH, 'soil'],
    [BLOCK.GRASS, 'grass'],
]);
export const groundKind = (b) => GROUND_OF.get(b) || (b ? 'hard' : null);

/** Who leaves what: the print's kind (the atlas's quarter), its length (m), the stride (m) and the feet's spread. */
export const FOOT_KINDS = {
    boot: { cell: 0, len: 0.36, stride: 0.95, side: 0.17 },
    hoof: { cell: 1, len: 0.24, stride: 1.25, side: 0.28 },
    cloven: { cell: 2, len: 0.17, stride: 0.75, side: 0.2 },
    web: { cell: 3, len: 0.2, stride: 0.45, side: 0.12 },
};

/** Which print an animal leaves. */
export function animalPrint(kind) {
    if (kind === 'horse' || kind === 'pegasus' || kind === 'unicorn') return 'hoof';
    if (kind === 'swan' || kind === 'duck' || kind === 'goose') return 'web';
    return 'cloven';
}

let _tex = null;
/** The four prints, painted once: a boot's sole (heel, tread lines), a hoof's crescent, a cloven pair, a webbed foot. */
function printTexture() {
    if (_tex || typeof document === 'undefined') return _tex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const c = cv.getContext('2d');
    const dent = (draw) => { // a dent: dark inside, a lighter pushed-up rim round it
        c.save(); c.globalAlpha = 0.55; c.lineWidth = 7; c.strokeStyle = 'rgba(255,255,255,0.5)'; draw(); c.stroke(); c.restore();
        c.save(); draw(); const g = c.createLinearGradient(0, 10, 0, 118); g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(1, 'rgba(0,0,0,0.75)'); c.fillStyle = g; c.fill(); c.restore();
    };
    // a boot (quarter 0, 128 × 128): sole and heel, the tread's cross lines cut out
    c.save(); c.translate(0, 0);
    dent(() => { c.beginPath(); c.ellipse(64, 40, 26, 32, 0, 0, Math.PI * 2); c.moveTo(84, 96); c.ellipse(64, 98, 20, 18, 0, 0, Math.PI * 2); });
    c.globalCompositeOperation = 'destination-out'; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 3;
    for (let y = 18; y < 70; y += 9) { c.beginPath(); c.moveTo(42, y); c.lineTo(86, y + 4); c.stroke(); }
    for (let y = 88; y < 112; y += 8) { c.beginPath(); c.moveTo(48, y); c.lineTo(80, y); c.stroke(); }
    c.restore();
    // a hoof (quarter 1): a crescent with the frog's V
    c.save(); c.translate(128, 0);
    dent(() => { c.beginPath(); c.arc(64, 64, 44, Math.PI * 0.85, Math.PI * 2.15); c.arc(64, 74, 26, Math.PI * 2.1, Math.PI * 0.9, true); c.closePath(); });
    c.fillStyle = 'rgba(0,0,0,0.7)'; c.beginPath(); c.moveTo(52, 100); c.lineTo(64, 66); c.lineTo(76, 100); c.closePath(); c.fill();
    c.restore();
    // cloven (quarter 2): two teardrops side by side, dew-claw dots behind
    c.save(); c.translate(0, 128);
    dent(() => { c.beginPath(); c.ellipse(48, 58, 14, 34, -0.12, 0, Math.PI * 2); c.moveTo(94, 58); c.ellipse(80, 58, 14, 34, 0.12, 0, Math.PI * 2); });
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(42, 108, 5, 0, 7); c.arc(86, 108, 5, 0, 7); c.fill();
    c.restore();
    // a webbed foot (quarter 3): three toes and the web between
    c.save(); c.translate(128, 128);
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.moveTo(64, 110); c.lineTo(22, 30); c.quadraticCurveTo(64, 46, 106, 30); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.95)'; c.lineWidth = 7; c.lineCap = 'round';
    for (const x of [22, 64, 106]) { c.beginPath(); c.moveTo(64, 110); c.lineTo(x, x === 64 ? 18 : 30); c.stroke(); }
    c.restore();
    _tex = new THREE.CanvasTexture(cv);
    _tex.anisotropy = 4;
    return _tex;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Footprints {
    constructor(game) {
        this.game = game;
        this.walkers = new Map(); // id → { x, z, d (m since the last print), left }
        this.prints = []; // the ring's records: { born, life, k, ground, i }
        this.next = 0;
        this.mesh = null;
        this._acc = 0;
    }

    _make() {
        const g = this.game;
        if (this.mesh || !g.scene) return this.mesh;
        const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
        const fade = new THREE.InstancedBufferAttribute(new Float32Array(FOOT.MAX), 1); fade.setUsage(THREE.DynamicDrawUsage);
        const cell = new THREE.InstancedBufferAttribute(new Float32Array(FOOT.MAX * 4), 4); // (uv offset x, y; gloss; snow)
        geo.setAttribute('aFade', fade); geo.setAttribute('aCell', cell);
        const mat = new THREE.MeshLambertMaterial({ map: printTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
        mat.onBeforeCompile = (sh) => {
            sh.uniforms.uZen = ULTRA.zenith;
            sh.vertexShader = sh.vertexShader
                .replace('#include <common>', '#include <common>\nattribute float aFade;\nattribute vec4 aCell;\nvarying float vFade;\nvarying vec4 vCell;\nvarying vec3 vFW;')
                .replace('#include <uv_vertex>', '#include <uv_vertex>\nvUv = vUv * 0.5 + aCell.xy;\nvFade = aFade;\nvCell = aCell;')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
            sh.fragmentShader = sh.fragmentShader
                .replace('#include <common>', '#include <common>\nuniform vec3 uZen;\nvarying float vFade;\nvarying vec4 vCell;\nvarying vec3 vFW;')
                .replace('#include <map_fragment>', `vec4 tp = texture2D(map, vUv);
// the print's dark is its depth (alpha); its own colour is the instance's (soil, mud, snow shadow, a wet stone); the pushed-up rim is lighter
float rim = tp.r * tp.a;
diffuseColor.rgb = mix(diffuseColor.rgb * 0.55, diffuseColor.rgb * 1.5, rim);
diffuseColor.a = tp.a * vFade * (1.0 - rim * 0.4);`)
                .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// mud and wet prints shine with the sky
vec3 V = normalize(vFW - cameraPosition);
totalEmissiveRadiance += uZen * vCell.z * pow(1.0 - abs(V.y), 3.0) * 0.5 * diffuseColor.a;`);
        };
        mat.customProgramCacheKey = () => 'footprints';
        const mesh = new THREE.InstancedMesh(geo, mat, FOOT.MAX);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FOOT.MAX * 3), 3);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.name = 'footprints';
        mesh.raycast = () => {};
        for (let i = 0; i < FOOT.MAX; i++) mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        g.scene.add(mesh);
        this.mesh = mesh;
        return mesh;
    }

    /** One sample to compile at loading (Game.prewarm). */
    sampleModel() { const m = this._make(); return m ? [] : []; }

    /**
     * A walker this frame: id, the feet's position, what it leaves (FOOT_KINDS key), its size (×). It prints a foot at every stride
     * when it moves on open ground near the player. Airborne, swimming or riding walkers are not passed in.
     */
    step(id, x, y, z, kind = 'boot', size = 1) {
        const K = FOOT_KINDS[kind] || FOOT_KINDS.boot;
        let w = this.walkers.get(id);
        if (!w) { this.walkers.set(id, w = { x, z, d: 0, left: false, t: performance.now() }); return; }
        const dx = x - w.x, dz = z - w.z, dd = Math.hypot(dx, dz);
        w.t = performance.now();
        if (dd > 4) { w.x = x; w.z = z; w.d = 0; return; } // (a jump, a teleport: no trail of prints between)
        w.d += dd; w.x = x; w.z = z;
        if (dd > 1e-4) { w.dx = dx / dd; w.dz = dz / dd; }
        const stride = K.stride * size;
        if (w.d < stride) return;
        w.d -= stride;
        w.left = !w.left;
        if (id === 'me') this._rustle(x, y, z, dd);
        this._print(x, y, z, w.dx || 0, w.dz || 1, K, size, w.left);
    }

    /** The hero's stride through the meadow: the grass rustles round the legs (only where the grass grows — a lush world's grass block). */
    _rustle(x, y, z, moved) {
        const g = this.game, data = g.world?.terrain?.data;
        if (!data?.lush || !g.world?.terrain?.flora || !g.sound?.playPlant) return;
        const ix = Math.round(x), iz = Math.round(z), L = data.topLayer?.(ix, iz);
        if (L == null || Math.abs(L + 0.5 - y) > 1.2 || data.get(ix, L, iz) !== BLOCK.GRASS || data.get(ix, L + 1, iz) !== BLOCK.AIR) return;
        _p.set(x, y + 0.5, z);
        g.sound.playPlant(_p, 'rustle', Math.min(0.32, 0.12 + moved * 2.5)); // (a run rustles louder than a walk)
    }

    _print(x, y, z, fx, fz, K, size, left) {
        const g = this.game, data = g.world?.terrain?.data;
        if (!data || !this._make()) return;
        const sx = -fz * K.side * size * (left ? 1 : -1), sz = fx * K.side * size * (left ? 1 : -1);
        const px = x + sx, pz = z + sz;
        const ix = Math.round(px), iz = Math.round(pz), L = data.topLayer?.(ix, iz);
        if (L == null || Math.abs((L + 0.5) - y) > 1.2) return; // (on a block, not in the air or over a step)
        const kind = groundKind(data.get(ix, L, iz));
        if (!kind || data.get(ix, L + 1, iz) !== BLOCK.AIR) return;
        const G = FOOT_GROUND[kind], wet = ULTRA.wet.value, wetFeet = this.game.swim?.dripping ? 1 : 0;
        const wk = Math.max(wet, wetFeet);
        let k = G.k, life = G.life, gloss = 0;
        const raining = !!g.storm?.raining;
        if (G.wetK != null && wk > 0.15) { k = Math.max(k, G.wetK * wk); life = Math.max(life, G.wetLife); gloss = G.mud || kind === 'hard' ? 0.6 * wk : 0; }
        if (G.rainLife && raining) life = G.rainLife;
        if (k <= 0.02 || life <= 0) return;
        const i = this.next, M = this.mesh;
        this.next = (this.next + 1) % FOOT.MAX;
        M.count = Math.max(M.count, i + 1);
        const len = K.len * size * 1.9; // (×1.9: the world's people are 3.5 m tall — a boot is ~0.7 m)
        _q.setFromAxisAngle(_up, Math.atan2(fx, fz) + Math.PI);
        _p.set(px, L + 0.5 + 0.012, pz);
        _s.set(left || K.cell !== 0 ? len : -len, 1, len); // (the right boot is the left one mirrored)
        M.setMatrixAt(i, _m.compose(_p, _q, _s));
        const t = G.tint;
        const mud = gloss > 0 && kind !== 'hard' ? 0.65 : 1;
        M.instanceColor.setXYZ(i, t[0] * mud, t[1] * mud, t[2] * mud);
        const cell = M.geometry.getAttribute('aCell');
        cell.setXYZW(i, (K.cell % 2) * 0.5, K.cell < 2 ? 0.5 : 0, gloss, kind === 'snow' ? 1 : 0);
        this.prints[i] = { born: performance.now() / 1000, life, k };
        M.geometry.getAttribute('aFade').setX(i, k);
        M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true; cell.needsUpdate = true; M.geometry.getAttribute('aFade').needsUpdate = true;
    }

    /** Twice a second: the prints fade with their age (rain washes the sand's, the wind drifts the snow's). */
    update(dt) {
        if (!this.mesh) return;
        this._acc += dt;
        if (this._acc < 0.5) return;
        this._acc = 0;
        const now = performance.now() / 1000, fade = this.mesh.geometry.getAttribute('aFade');
        let changed = false;
        for (let i = 0; i < this.prints.length; i++) {
            const p = this.prints[i];
            if (!p) continue;
            const a = (now - p.born) / p.life;
            const f = a >= 1 ? 0 : p.k * (1 - a * a);
            if (f !== fade.getX(i)) { fade.setX(i, f); changed = true; }
            if (a >= 1) { this.prints[i] = null; this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); this.mesh.instanceMatrix.needsUpdate = true; }
        }
        if (changed) fade.needsUpdate = true;
        const old = performance.now() - 20000;
        for (const [id, w] of this.walkers) if (w.t < old) this.walkers.delete(id); // (who has not walked for a while is forgotten)
    }

    dispose() {
        if (!this.mesh) return;
        this.game.scene?.remove(this.mesh);
        this.mesh.geometry.dispose(); this.mesh.material.dispose();
        this.mesh = null; this.prints.length = 0; this.walkers.clear();
    }
}
