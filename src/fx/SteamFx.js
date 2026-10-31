/**
 * SteamFx.js — the steam of «Visible Godi» as everybody sees it (the rules: game/VisibleGodi.js).
 *
 * The wand breathes out a fat white steam; where the wand moves it leaves puffs — the hero paints a cloud on a wall.
 * Every computer draws every hero's steam (the puffs arrive as 'vgs' messages); anyone whose gaze goes through it (or who stands in it) looks THROUGH it (SeeThroughFx, from their own camera).
 *
 * Cheap and layered (CLAUDE.md «Запрет на примитив» + «Производительность»): one Points object per hero (the local one
 * and a pool of a few remote ones), one shader made on the loading screen (every body's material is a clone of the same
 * program), 8 soft particles per puff — big dim puffs, a bright wisp, a twinkling spark — drifting and swirling on the
 * graphics card from a birth time and a seed; a thread of steam between the wand and where the jet lands. No lights, no
 * collisions, nothing is made per frame; a body is filled puff by puff into a ring of fixed size.
 */
import * as THREE from 'three';
import { SEE } from './../game/VisibleGodi.js';

const K = 8; // particles per puff
const TRAIL = 26; // particles of the jet's thread
const V = SEE.OWNER_MAX * K + TRAIL;
const POOL = 5; // bodies: mine and a few other heroes' (the oldest is reused)

const VERT = /* glsl */ `
attribute vec4 aRand;
attribute vec3 aOff;
attribute float aBirth;
uniform float uNow, uJet, uPx, uLife;
uniform vec3 uTip, uHead;
varying float vA;
varying vec3 vC;
void main() {
    float kind = aRand.w;
    float ph = aRand.x * 6.2831, sp = 0.35 + aRand.z * 0.8;
    vec3 p; float size, a;
    if (kind > 0.5 && kind < 1.5) {
        // the jet's thread: steam streaming from the wand to where the puff will stay
        float t = fract(aRand.x * 5.17 + uNow * 0.9 * sp);
        p = mix(uTip, uHead, t) + vec3(sin(ph + uNow * 5.0), cos(ph * 1.3 + uNow * 4.3), sin(ph * 0.7 + uNow * 5.7)) * 0.16 * sin(t * 3.14159);
        size = (0.3 + 0.9 * t) * aRand.y;
        a = uJet * sin(t * 3.14159) * 0.6;
    } else {
        float age = uNow - aBirth;
        float live = aBirth < -1.0e8 ? 0.0 : smoothstep(0.0, 0.6, age) * (1.0 - smoothstep(uLife - 8.0, uLife, age));
        float grow = 0.35 + 0.65 * smoothstep(0.0, 0.9, age);
        vec3 o = aOff * grow;
        float ang = uNow * 0.25 * sp + ph;
        o.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * o.xz; // (slowly swirling)
        o.y += 0.12 * sin(uNow * 0.6 * sp + ph * 2.0) + 0.015 * age; // (breathing, drifting up)
        p = position + o;
        size = aRand.y * grow;
        a = live * (kind < 0.5 ? 0.42 : kind < 2.5 ? 0.55 : (0.5 + 0.5 * sin(uNow * 6.0 + ph * 4.0)) * 0.9);
    }
    vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
    gl_PointSize = min(512.0, size * uPx / max(0.3, -mv.z));
    gl_Position = projectionMatrix * mv;
    vA = a;
    vC = kind > 2.5 ? vec3(1.0) : mix(vec3(0.78, 0.88, 1.0), vec3(1.0, 0.97, 0.93), fract(aRand.x * 3.1));
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying float vA;
varying vec3 vC;
void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0 || vA < 0.004) discard;
    float f = 1.0 - d;
    float a = vA * f * f * (3.0 - 2.0 * f);
    gl_FragColor = vec4(vC * (0.92 + 0.1 * f), a);
}
`;

/** A small seeded random (mulberry32): the same puff on every computer. */
function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

class Body {
    constructor(material, scene) {
        const g = new THREE.BufferGeometry();
        this.pos = new Float32Array(V * 3); this.rand = new Float32Array(V * 4); this.off = new Float32Array(V * 3); this.birth = new Float32Array(V).fill(-1e9);
        g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
        g.setAttribute('aRand', new THREE.BufferAttribute(this.rand, 4));
        g.setAttribute('aOff', new THREE.BufferAttribute(this.off, 3));
        g.setAttribute('aBirth', new THREE.BufferAttribute(this.birth, 1));
        // the jet's thread: fixed particles at the end of the arrays
        const r = rng(7);
        for (let i = 0; i < TRAIL; i++) { const v = SEE.OWNER_MAX * K + i; this.rand.set([r(), 0.5 + r() * 0.7, r(), 1], v * 4); }
        this.mat = material.clone();
        this.points = new THREE.Points(g, this.mat);
        this.points.frustumCulled = false;
        this.points.renderOrder = 5;
        this.points.visible = false;
        scene.add(this.points);
        this.next = 0; this.births = new Float64Array(SEE.OWNER_MAX).fill(-1e9); // (per puff: when it was born, s)
        this.ppos = new Float32Array(SEE.OWNER_MAX * 3); this.seeds = new Uint32Array(SEE.OWNER_MAX); // (per puff: where, and its seed — whoever looks through the steam needs them)
        this.jet = 0; this.jetOn = false; this.touched = 0;
    }

    add(x, y, z, seed, now) {
        const slot = this.next; this.next = (this.next + 1) % SEE.OWNER_MAX;
        this.births[slot] = now;
        this.ppos[slot * 3] = x; this.ppos[slot * 3 + 1] = y; this.ppos[slot * 3 + 2] = z; this.seeds[slot] = seed >>> 0;
        const r = rng(seed);
        for (let k = 0; k < K; k++) {
            const v = slot * K + k;
            // a lumpy ball: every puff of a stroke is a little different (size, lobes, the odd wisp and spark)
            const a = r() * 6.2832, b = Math.acos(2 * r() - 1), rad = SEE.PUFF_R * (0.25 + 0.75 * Math.cbrt(r()));
            this.pos.set([x, y, z], v * 3);
            this.off.set([Math.sin(b) * Math.cos(a) * rad * 1.1, Math.cos(b) * rad * 0.8, Math.sin(b) * Math.sin(a) * rad * 1.1], v * 3);
            const kind = k < 6 ? 0 : k === 6 ? 2 : 3;
            this.rand.set([r(), kind === 0 ? 1.7 + r() * 1.1 : kind === 2 ? 0.8 + r() * 0.4 : 0.14 + r() * 0.1, r(), kind], v * 4);
            this.birth[v] = now;
        }
        for (const n of ['position', 'aRand', 'aOff', 'aBirth']) this.points.geometry.attributes[n].needsUpdate = true;
    }

    clear() {
        this.birth.fill(-1e9); this.births.fill(-1e9); this.next = 0;
        this.points.geometry.attributes.aBirth.needsUpdate = true;
    }

    /** Alive puffs now; the body hides itself when it has nothing to show. */
    live(now) {
        let n = 0;
        for (let i = 0; i < SEE.OWNER_MAX; i++) if (now - this.births[i] < SEE.PUFF_LIFE) n++;
        return n;
    }
}

export class SteamBodies {
    /** @param {object} game  { renderer, scene, camera } */
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.bodies = new Map(); // hero id → Body
        this.base = new THREE.ShaderMaterial({
            vertexShader: VERT, fragmentShader: FRAG,
            uniforms: { uNow: { value: 0 }, uJet: { value: 0 }, uPx: { value: 700 }, uLife: { value: SEE.PUFF_LIFE }, uTip: { value: new THREE.Vector3() }, uHead: { value: new THREE.Vector3() } },
            transparent: true, depthWrite: false, depthTest: true,
        });
        this.base.userData.keep = true;
        this.stats = { bodies: 0, materials: 1 };
        this._px = 0;
        // (the local body exists from the start: its program is compiled on the loading screen — Game.prewarm)
        this._get('local');
    }

    _get(id) {
        let b = this.bodies.get(id);
        if (b) { b.touched = performance.now(); return b; }
        if (this.bodies.size >= POOL) { // (the longest unused body is taken over)
            let old = null;
            for (const [k, v] of this.bodies) if (k !== 'local' && (!old || v.touched < old[1].touched)) old = [k, v];
            if (old) { this.bodies.delete(old[0]); old[1].clear(); b = old[1]; }
        }
        if (!b) { b = new Body(this.base, this.scene); this.stats.bodies++; }
        b.touched = performance.now();
        this.bodies.set(id, b);
        return b;
    }

    addPuff(id, x, y, z, seed, now = performance.now() / 1000) {
        this._get(id).add(x, y, z, seed, now);
    }

    /** The jet's thread from the wand tip to where the steam lands (or nothing). */
    setJet(id, tip, head, on) {
        const b = id === 'local' ? this.bodies.get('local') : this.bodies.get(id);
        if (!b) return;
        b.jetOn = !!on;
        if (on && tip && head) { b.mat.uniforms.uTip.value.set(tip.x, tip.y, tip.z); b.mat.uniforms.uHead.value.set(head.x, head.y, head.z); }
    }

    clear(id) {
        const b = this.bodies.get(id);
        if (!b) return;
        b.jetOn = false;
        b.clear();
    }

    update(dt, now = performance.now() / 1000) {
        const r = this.game.renderer, cam = this.game.camera;
        if (!this.bodies.size) return;
        if (r && cam) { const h = r.domElement?.height || 720; this._px = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)); }
        for (const [id, b] of this.bodies) {
            const live = b.live(now);
            b.jet += ((b.jetOn ? 1 : 0) - b.jet) * (1 - Math.exp(-dt * 8));
            const show = live > 0 || b.jet > 0.02;
            if (b.points.visible !== show) b.points.visible = show;
            if (!show) continue;
            const u = b.mat.uniforms;
            u.uNow.value = now; u.uJet.value = b.jet; u.uPx.value = this._px || 700;
        }
    }

    /**
     * Every live puff of every hero (mine and the others': whoever's gaze goes through the steam sees through it — the author's rule)
     * as { x, y, z, t0, seed } into `out` (records are reused: no garbage per call). Returns `out`.
     */
    gather(out, now = performance.now() / 1000) {
        let n = 0;
        for (const b of this.bodies.values()) {
            for (let i = 0; i < SEE.OWNER_MAX; i++) {
                const t0 = b.births[i];
                if (now - t0 >= SEE.PUFF_LIFE) continue;
                const q = out[n] || (out[n] = { x: 0, y: 0, z: 0, t0: 0, seed: 0 });
                q.x = b.ppos[i * 3]; q.y = b.ppos[i * 3 + 1]; q.z = b.ppos[i * 3 + 2]; q.t0 = t0; q.seed = b.seeds[i];
                n++;
            }
        }
        out.length = n;
        return out;
    }

    /** Hide every body while another picture of the scene is drawn (the lens must not look through the steam itself); false restores. */
    pause(on) {
        for (const b of this.bodies.values()) {
            if (on) { b._was = b.points.visible; b.points.visible = false; }
            else if (b._was !== undefined) { b.points.visible = b._was; b._was = undefined; }
        }
    }

    /** Every body's puffs alive: for the log and the tests. */
    alive(id, now = performance.now() / 1000) { return this.bodies.get(id)?.live(now) ?? 0; }

    dispose() {
        for (const b of this.bodies.values()) { this.scene.remove(b.points); b.points.geometry.dispose(); b.mat.dispose(); }
        this.bodies.clear();
        this.base.dispose();
    }
}
