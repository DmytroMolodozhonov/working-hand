/**
 * BeslanGrass.js — «Трава Беслана»: the plant that only a hero who sees the invisible sees (the places and the shape: world/InvisibleFlora.js).
 *
 * It grows in drifts on the grass of the meadows (thicker by water), low tufts and tall ones, with a glowing plume at the top of every stem; it shines more
 * at night. Drawn one mesh per 32 m chunk around the hero (85 m), the chunks made a few at a time inside a time budget (≤ 1.5 ms a frame) and put away
 * when the hero goes by; nothing at all is made for a hero who does not see the invisible. No collision: a hand passes through it. A free hand that closes
 * on a tuft plucks it — a sheaf of Beslan's grass ('beslanGrass', itself invisible on the ground) is in the fist; the tuft grows again after 12 minutes
 * of play. It is an ingredient: instead of the feather of Spencer's bird in the circle of seeing (SightRules.INGREDIENTS), and for the potions to come.
 *
 * Worlds of generation INVISIBLE_FLORA_FROM_GEN and later; the land is not changed by it (only drawn).
 * What can go wrong (CLAUDE.md): the hero dies / loses the sight — the meshes go (nothing piles up; the shared material is kept); the ground under a tuft is
 * dug / built over — the chunk is made again from the new data (rev) and a tuft not on grass is gone; a chunk with no land made — it waits (never makes
 * the land in the frame); both hands busy — nothing is plucked; two tufts under the fist — the nearest one.
 */
import * as THREE from 'three';
import { CHUNK, chunkKey, INVISIBLE_FLORA_FROM_GEN } from '../world/Terrain.js';
import { buildBeslan, BESLAN } from '../world/InvisibleFlora.js';
import { seesInvisible, ghostAlpha } from './Invisibles.js';
import { newUid } from './ItemTypes.js';

export const BESLAN_VIEW = { BUDGET_MS: 1.5, PER_FRAME: 2, REGROW_S: 720, REACH: 0.75, CLOSE: 0.65, OPEN: 0.35, DROP_MAX: 400 };
const _h = new THREE.Vector3();

export class BeslanGrass {
    constructor(game) {
        this.game = game;
        this.meshes = new Map(); // chunk key → {mesh, cx, cz, rev, chunk, spots}
        this.gone = new Map(); // 'x,z' → game seconds when it grows again
        this.t = 0;
        this.material = null;
        this._night = { value: 0 };
        this._clock = { value: 0 };
        this._alpha = { value: 0.85 };
        this._grip = { left: false, right: false };
        this._scanT = 0;
        this._pending = []; // chunk keys waiting for their land
    }

    get data() { return this.game.terrain?.data || null; }
    get active() { return (this.game.gen ?? 1) >= INVISIBLE_FLORA_FROM_GEN && !!this.data && seesInvisible(this.game) && !this.game.isDeadLocal; }

    /** The material: vertex colours, sway in the wind, glow at night, the world's "another world" see-through (compiled once). */
    _material() {
        if (this.material) return this.material;
        const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false, toneMapped: false });
        const night = this._night, clock = this._clock, alpha = this._alpha;
        m.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = clock; shader.uniforms.uNight = night; shader.uniforms.uAlpha = alpha;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nattribute float sway;\nattribute float glow;\nvarying float vGlow;\nuniform float uTime;')
                .replace('#include <begin_vertex>', `#include <begin_vertex>
vGlow = glow;
{
    vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
    float s = sway * sway * 0.09;
    transformed.x += s * (sin(uTime * 1.6 + wp.x * 0.45 + wp.z * 0.3) + 0.4 * sin(uTime * 3.3 + wp.z * 1.2));
    transformed.z += s * 0.6 * sin(uTime * 1.3 + wp.x * 0.3 - wp.z * 0.5);
}`);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform float uNight;\nuniform float uAlpha;')
                .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.8 + 0.2 * uNight + vGlow * (0.22 + 0.4 * uNight);\ndiffuseColor.a *= uAlpha;');
        };
        m.customProgramCacheKey = () => 'beslan';
        m.userData.shared = true;
        this.material = m;
        return m;
    }

    /** One tuft, to compile the shader on the loading screen (Game.prewarm). */
    sampleModels() {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1000, 0, 0.1, -1000, 0, 0, -999.7, 0], 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute([0.3, 0.8, 0.8, 0.3, 0.8, 0.8, 0.5, 1, 1], 3));
        geo.setAttribute('sway', new THREE.Float32BufferAttribute([0, 0, 0.3], 1));
        geo.setAttribute('glow', new THREE.Float32BufferAttribute([0, 0, 1], 1));
        const m = new THREE.Mesh(geo, this._material());
        m.frustumCulled = false;
        return [m];
    }

    _make(cx, cz, c) {
        const key = chunkKey(cx, cz);
        const old = this.meshes.get(key);
        if (old) this._drop(key, old);
        const out = buildBeslan(this.data.seed, c, this.gone.size ? new Set(this.gone.keys()) : null);
        if (!out.count) { this.meshes.set(key, { mesh: null, cx, cz, rev: c.rev, chunk: c, spots: [] }); return; }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(out.pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(out.col, 3));
        geo.setAttribute('sway', new THREE.BufferAttribute(out.sway, 1));
        geo.setAttribute('glow', new THREE.BufferAttribute(out.glow, 1));
        const b = out.box;
        geo.boundingBox = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
        geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
        const mesh = new THREE.Mesh(geo, this._material());
        mesh.frustumCulled = true; mesh.matrixAutoUpdate = false; mesh.renderOrder = 3;
        mesh.raycast = () => {}; // (grass: a ray, a spell, a hand passes through)
        mesh.userData.isBeslan = true;
        this.game.scene.add(mesh);
        this.meshes.set(key, { mesh, cx, cz, rev: c.rev, chunk: c, spots: out.spots });
    }

    _drop(key, e) {
        this.meshes.delete(key);
        if (e.mesh) { this.game.scene.remove(e.mesh); e.mesh.geometry.dispose(); }
    }

    _clear() { for (const [k, e] of [...this.meshes]) this._drop(k, e); this._pending.length = 0; }

    update(dt) {
        const g = this.game;
        if (!this.active) { if (this.meshes.size) this._clear(); return; }
        this.t += dt;
        this._clock.value = (this._clock.value + dt) % 1000;
        this._night.value = g.world?.nightAmount ?? 0;
        this._alpha.value = ghostAlpha(this.t, 1.3);
        const me = g.character.group.position, data = this.data;
        // grown again
        if (this.gone.size) for (const [k, t] of this.gone) if (t <= this.t) { this.gone.delete(k); this._remake(k); }
        // forget the chunks left behind
        for (const [key, e] of this.meshes) {
            const dx = Math.max(e.cx * CHUNK - me.x, 0, me.x - (e.cx + 1) * CHUNK), dz = Math.max(e.cz * CHUNK - me.z, 0, me.z - (e.cz + 1) * CHUNK);
            if (Math.hypot(dx, dz) > BESLAN.FAR + CHUNK) this._drop(key, e);
        }
        // make the missing / changed ones, nearest first, inside the budget (never the land in the frame: only chunks that are made)
        const want = [], rc = Math.ceil(BESLAN.FAR / CHUNK) + 1, ccx = Math.floor(me.x / CHUNK), ccz = Math.floor(me.z / CHUNK);
        for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
            const cx = ccx + dx, cz = ccz + dz;
            const ex = Math.max(cx * CHUNK - me.x, 0, me.x - (cx + 1) * CHUNK), ez = Math.max(cz * CHUNK - me.z, 0, me.z - (cz + 1) * CHUNK), d = Math.hypot(ex, ez);
            if (d > BESLAN.FAR || !data.hasChunk(cx, cz)) continue;
            const e = this.meshes.get(chunkKey(cx, cz)), c = data.chunk(cx, cz);
            if (e && e.rev === c.rev && e.chunk === c) continue;
            want.push({ cx, cz, d, c });
        }
        if (want.length) {
            want.sort((a, b) => a.d - b.d);
            const t0 = performance.now();
            for (let i = 0, n = 0; i < want.length && n < BESLAN_VIEW.PER_FRAME; i++, n++) { this._make(want[i].cx, want[i].cz, want[i].c); if (performance.now() - t0 > BESLAN_VIEW.BUDGET_MS) break; }
        }
        this._pluck(dt);
    }

    _remake(k) {
        const [x, z] = k.split(',').map(Number), cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), e = this.meshes.get(chunkKey(cx, cz));
        if (e && this.data.hasChunk(cx, cz)) this._make(cx, cz, this.data.chunk(cx, cz));
    }

    // ------------------------------------------------------------ plucking by hand
    /** A free hand that closes on a tuft plucks it: a sheaf of Beslan's grass is in the fist. */
    _pluck(dt) {
        const g = this.game, ch = g.character, items = g.items;
        if (!items || !ch?.getGripCurl || g.isDeadLocal) return;
        for (const side of ['left', 'right']) {
            const curl = ch.getGripCurl(side) ?? 0;
            const was = this._grip[side];
            if (curl < BESLAN_VIEW.OPEN) this._grip[side] = false;
            else if (curl > BESLAN_VIEW.CLOSE && !was) {
                this._grip[side] = true;
                if (items.held[side] || g.weapons?.hands?.[side]?.held) continue; // (the fist is busy)
                ch.getHandWorldPosition(side, _h);
                const spot = this._nearest(_h);
                if (!spot) continue;
                this.gone.set(spot.key, this.t + BESLAN_VIEW.REGROW_S);
                if (this.gone.size > BESLAN_VIEW.DROP_MAX) this.gone.delete(this.gone.keys().next().value);
                this._remake(spot.key);
                items.takeIntoHand({ kind: 'beslanGrass', uid: newUid(), count: 1 }, side, { closed: true });
                for (let i = 0; i < 14; i++) g.fx?.spark?.(_h, [0x7ff2e0, 0xe8fffb, 0xb48cff][i % 3], 0.07, new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5), 0.9);
                g.sound?.playSpencer?.(_h, 'wings');
            }
        }
    }

    /** The tuft under a hand at `p` (its root within REACH across, the hand between its root and its top). */
    _nearest(p) {
        let best = null, bd = BESLAN_VIEW.REACH;
        const cx = Math.floor(p.x / CHUNK), cz = Math.floor(p.z / CHUNK);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const e = this.meshes.get(chunkKey(cx + dx, cz + dz));
            if (!e) continue;
            for (const s of e.spots) {
                const d = Math.hypot(s.x - p.x, s.z - p.z);
                if (d < bd && p.y > s.y - 0.4 && p.y < s.y + s.h + 0.3) { bd = d; best = s; }
            }
        }
        return best;
    }

    dispose() { this._clear(); this.material?.dispose?.(); this.material = null; }
}
