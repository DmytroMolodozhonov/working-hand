/**
 * WaveAttack.js — «Wave Attack» (and «Wave Attack Максима»): a real wave made of the water.
 *
 * Stand by a river, a lake or the sea, point the raised hand AT the water and say the words:
 *   1. the water there swells and RISES into a wall of water in front of you (the river is
 *      seen being drawn into it: a dark whirl on its surface, water streaming up into the wall);
 *   2. the wave STANDS and waits while the hand holds it up: it turns after the hand — show it
 *      where to go (the hand pointed to the side, at a creature, at a place). It goes when you
 *      PUSH the hand towards it (a shove of the hand), or keep the hand pointing at one place
 *      for a moment. Lower the hand (or hold it too long) — the wave falls back into the water;
 *   3. it ROLLS that way at the speed of a real wave, the crest curling over, spray flying:
 *      over water it keeps its strength, over land it loses it (and breaks at a wall or a hill);
 *      whoever it reaches is swept off the feet and carried (players — the caster too if he
 *      stands in front of it —, zombies, villagers and knights, animals, sailors, living trees;
 *      a book-bird flying low is struck); things lying there are dragged along, campfires and
 *      burning trees go out, a ship is rocked and pushed;
 *   4. it BREAKS into foam and drains away, the ground it ran over stays wet for a moment.
 *
 * «Максима»: a bigger, longer, stronger wave. It never hurts (water): it knocks down.
 *
 * Who and what it touches (CLAUDE.md, «на КОГО и на ЧТО»):
 *   - every CreatureImpact kind (zombies, villagers/knights/king/wizards, animals, living trees,
 *     sailors — on a deck too, if the wave reaches that high): knocked down and carried (host);
 *   - me (every computer for its own player, the caster included): knocked down and carried;
 *   - book-birds flying in the wave: struck (host; the book of protection shrugs it off);
 *   - a phoenix (a CreatureImpact kind too): thrown, its flame put out, no harm (Phoenixes.js);
 *   - the giant spider: NOT moved — far too big and heavy for a wave (it only splashes on it);
 *   - weapons and things on the ground: dragged along (where they are simulated);
 *   - campfires (host) and burning trees / blocks (every computer): put out; ships: rocked and
 *     pushed, their fires near the water go out (host);
 *   - walls, houses and hills: the wave breaks on them; the ground: wet for a while (looks only).
 * Multiplayer: the caster's computer raises and aims it and sends each step ('spell' messages:
 * rise, aim, go, drop); every computer draws the same wave; the host decides who it hits.
 */

import * as THREE from 'three';
import { createWaterMaterial } from '../fx/WaterMaterial.js';
import { WaterFlow } from '../fx/WaterFlow.js';
import { KINDS } from './CreatureImpact.js';
import { SPELL_PHYSICS, spellPush } from './Impact.js';
import { BLOCK } from '../world/Terrain.js';

export const WAVE = {
    RISE: 1.4, // s: the water swells and rises into a wall
    MIN_AIM: 0.6, // s it stands before it can be sent
    HOLD: 1.2, // s the hand points still at one place (not down at the water): it goes
    STILL: 0.6, // rad/s: the hand turning slower than this «holds»
    LEVEL: 0.6, // |dir.y| under this: the hand points out at something (not down at the water)
    MOVED: 0.35, // rad: the hand turned this far from where it pointed at the water: it shows a place
    PUSH_V: 1.4, // m/s: the hand shoved towards the aim this fast sends it…
    PUSH_T: 0.08, // …for this long
    LOWER_T: 0.8, // s with the hand lowered: the wave falls back into the water
    MAX_HOLD: 10, // s: nobody holds it longer (it falls back)
    TURN: 2.6, // rad/s: how fast the standing wave turns after the hand
    BREAK: 1.3, // s: breaking into foam
    FALL: 0.9, // s: falling back into the water (not sent)
    DRAIN: 5, // s: the foam and the wet ground go
    NET_AIM: 0.2, // s between aim updates sent
    LAND_LOSS: 0.35, // strength lost per second rolling over land, by a wave 2.4 m high (over water: WATER_LOSS)
    WATER_LOSS: 0.02,
    NORMAL: { width: 6, height: 2.4, speed: 6.5, dist: 20 },
    MAXIMA: { width: 11, height: 3.8, speed: 8, dist: 32 },
};

/** The size of a wave of this spell. */
export function waveForm(name) {
    return name === 'WaveAttackMaxima' ? WAVE.MAXIMA : WAVE.NORMAL;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * How the caster's hand holds, turns and sends the standing wave (pure: numbers in, a decision out).
 * Yaw: the wave runs along (sin yaw, cos yaw).
 */
export class WaveAim {
    /** from: where the hand pointed when the words were said (at the water): holding it there sends nothing. */
    constructor(yaw, from = null) {
        this.yaw = yaw;
        this.from = from ? { x: from.x, y: from.y, z: from.z } : null;
        this.moved = !from; // (the hand has turned away from the water to show where)
        this.target = yaw;
        this.t = 0; // s aimed so far
        this.still = 0; // s the hand has been pointing still at something
        this.push = 0; // s the hand has been shoved towards the aim
        this.low = 0; // s the hand has been down
        this.lastDir = null;
        this.lastHand = null;
    }

    /**
     * One frame. o: { raised (the hand is up), dir {x,y,z} (where the hand points), hand {x,y,z} (where it is) }.
     * @returns {'go'|'drop'|null}
     */
    step(dt, o) {
        this.t += dt;
        if (!o.raised) {
            this.low += dt;
            this.still = this.push = 0;
            this.lastDir = this.lastHand = null;
            return this.low >= WAVE.LOWER_T ? 'drop' : null;
        }
        this.low = 0;
        const d = o.dir, hl = Math.hypot(d.x, d.z);
        const level = hl > 0.3 && Math.abs(d.y) < WAVE.LEVEL; // (pointing out at something, not down at the water)
        if (level) this.target = Math.atan2(d.x, d.z);
        const dy = angDiff(this.target, this.yaw);
        this.yaw += clamp(dy, -WAVE.TURN * dt, WAVE.TURN * dt);
        // the hand holds still on one place
        let w = 0;
        if (this.lastDir && dt > 0) {
            const l = this.lastDir, dot = (d.x * l.x + d.y * l.y + d.z * l.z) / ((Math.hypot(d.x, d.y, d.z) * Math.hypot(l.x, l.y, l.z)) || 1);
            w = Math.acos(clamp(dot, -1, 1)) / dt;
        }
        if (!this.moved && this.from) {
            const f = this.from, c = (d.x * f.x + d.y * f.y + d.z * f.z) / ((Math.hypot(d.x, d.y, d.z) * Math.hypot(f.x, f.y, f.z)) || 1);
            if (Math.acos(clamp(c, -1, 1)) > WAVE.MOVED) this.moved = true;
        }
        this.still = level && this.moved && w < WAVE.STILL ? this.still + dt : 0;
        // the hand shoved towards where the wave looks
        if (this.lastHand && dt > 0) {
            const vx = (o.hand.x - this.lastHand.x) / dt, vz = (o.hand.z - this.lastHand.z) / dt;
            const along = vx * Math.sin(this.target) + vz * Math.cos(this.target);
            this.push = along > WAVE.PUSH_V ? this.push + dt : 0;
        }
        this.lastDir = { x: d.x, y: d.y, z: d.z };
        this.lastHand = { x: o.hand.x, y: o.hand.y, z: o.hand.z };
        if (this.t >= WAVE.MAX_HOLD) return 'drop';
        if (this.t < WAVE.MIN_AIM) return null;
        if (this.push >= WAVE.PUSH_T) return 'go';
        if (this.still >= WAVE.HOLD && Math.abs(dy) < 0.15) return 'go';
        return null;
    }
}

/** A new wave (plain data). o: where the water rises; (dx, dz): where it looks. */
export function newWave(name, by, o, dx, dz, phase = 'rise') {
    const F = waveForm(name), l = Math.hypot(dx, dz) || 1;
    return {
        name, by, F, phase, t: 0, age: 0,
        o: { x: o.x, y: o.y, z: o.z }, x: o.x, z: o.z, base: o.y,
        dx: dx / l, dz: dz / l, tdx: dx / l, tdz: dz / l, // (the direction and the one it turns to)
        s: 0, dist: F.dist, h: 0, curl: 0, energy: 1, hit: new Set(), wet: 0,
    };
}

/**
 * One step of a wave (pure: the world is asked through env).
 * env: { surface(x, z) → { y, water } (the ground's or the water's top), solid(x, y, z) → bool }
 * Phases: rise → aim → roll → break → drain → gone (or rise/aim → fall → gone: not sent).
 */
export function stepWave(w, dt, env) {
    const F = w.F;
    w.t += dt;
    w.age += dt;
    // turning (standing: after the hand; it never turns once it rolls)
    if (w.phase === 'rise' || w.phase === 'aim') {
        const a = Math.atan2(w.dx, w.dz), b = Math.atan2(w.tdx, w.tdz);
        const n = a + clamp(angDiff(b, a), -WAVE.TURN * dt, WAVE.TURN * dt);
        w.dx = Math.sin(n); w.dz = Math.cos(n);
    }
    switch (w.phase) {
        case 'rise': {
            const k = clamp(w.t / WAVE.RISE, 0, 1);
            w.h = F.height * (k * k * (3 - 2 * k));
            w.curl = 0;
            if (w.t >= WAVE.RISE) { w.phase = 'aim'; w.t = 0; }
            break;
        }
        case 'aim':
            w.h = F.height * (1 + 0.05 * Math.sin(w.t * 2.3));
            w.curl = 0.12 * Math.PI * (1 + 0.3 * Math.sin(w.t * 1.7));
            break;
        case 'roll': {
            const v = F.speed * (0.75 + 0.25 * w.energy);
            w.s += v * dt;
            w.x = w.o.x + w.dx * w.s;
            w.z = w.o.z + w.dz * w.s;
            const g = env.surface(w.x, w.z);
            w.water = !!g.water;
            w.energy -= dt * (g.water ? WAVE.WATER_LOSS : WAVE.LAND_LOSS * Math.sqrt(2.4 / F.height)); // (a big one runs further)
            // it swells as it sets off, then curls more and more
            const grow = Math.min(1.15, 0.9 + w.s / 8 * 0.25);
            w.h = F.height * grow * clamp(w.energy, 0, 1);
            w.curl = Math.PI * (0.25 + 0.5 * Math.min(1, w.s / w.dist));
            // a wall or a hill in front: it breaks there
            const fx = w.x + w.dx * 0.9, fz = w.z + w.dz * 0.9;
            const ahead = env.surface(fx, fz);
            const wall = env.solid(fx, w.base + 0.6, fz) && env.solid(fx, w.base + Math.max(1, w.h * 0.6), fz);
            const climb = ahead.y - w.base > Math.max(0.8, w.h * 0.6);
            w.base += (g.y - w.base) * Math.min(1, dt * 8);
            if (w.s >= w.dist || w.energy < 0.35 || wall || climb) { w.phase = 'break'; w.t = 0; w.h0 = w.h; }
            break;
        }
        case 'break': {
            const k = clamp(w.t / WAVE.BREAK, 0, 1);
            w.s += F.speed * 0.5 * (1 - k) * dt;
            w.x = w.o.x + w.dx * w.s;
            w.z = w.o.z + w.dz * w.s;
            w.h = (w.h0 ?? F.height) * Math.pow(1 - k, 1.5);
            w.curl = Math.PI * (0.75 + 0.45 * k);
            if (k >= 1) { w.phase = 'drain'; w.t = 0; }
            break;
        }
        case 'fall': {
            const k = clamp(w.t / WAVE.FALL, 0, 1);
            w.h = (w.h0 ?? F.height) * (1 - k) * (1 - k);
            w.curl = 0.3 * Math.PI * k;
            if (k >= 1) { w.phase = 'gone'; w.t = 0; }
            break;
        }
        case 'drain':
            w.h = 0;
            if (w.t >= WAVE.DRAIN) { w.phase = 'gone'; w.t = 0; }
            break;
        default: break;
    }
    return w.phase;
}

/** Can the wave hit anything now? (rolling, or the first half of breaking) */
export function waveHits(w) {
    return w.phase === 'roll' || (w.phase === 'break' && w.t < WAVE.BREAK * 0.5);
}

/**
 * Does the wave reach a point now? Returns how strongly (0…1) or 0.
 * The water: from a little in front of the front back over its body, the full width (less at
 * the ends), from the ground up to over the crest.
 */
export function waveTouch(w, p) {
    if (!waveHits(w) || w.h < 0.3) return 0;
    const rx = p.x - w.x, rz = p.z - w.z;
    const along = rx * w.dx + rz * w.dz, across = Math.abs(-rx * w.dz + rz * w.dx);
    const half = w.F.width / 2;
    if (along > 0.9 || along < -(1.2 + 0.6 * w.h)) return 0;
    if (across > half + 0.4) return 0;
    if (p.y < w.base - 1.2 || p.y > w.base + w.h + 0.9) return 0;
    const a = across / (half + 0.4);
    return 1 - 0.5 * a * a * a * a;
}

/** The push the wave gives a body it reaches with strength k: along it, a little up. */
export function wavePush(w, k, out = new THREE.Vector3()) {
    const P = spellPush(w.name) * k * clamp(0.6 + 0.4 * w.energy, 0.6, 1);
    return out.set(w.dx * P, 2 + (w.name === 'WaveAttackMaxima' ? 1.5 : 0.5), w.dz * P);
}

// ===================================================================== drawing

const NB = 10, NA = 14, NC = 8; // profile samples: the back slope, the crest's curl, the falling lip
const NU = NB + NA + NC;
const NX = 20; // across
const DEEP = new THREE.Color(0x0b4a5c), BODY = new THREE.Color(0x1d8aa3), LIGHT = new THREE.Color(0x86d8e2), FOAM = new THREE.Color(0xf2fbff);
const _c = new THREE.Color();
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _quat = new THREE.Quaternion();
const _from = new THREE.Vector3(), _to = new THREE.Vector3();

/** A profile point u (0…1: the back's foot → the crest → over the curl → the lip's foot): {s along, y up}. */
export function profile(u, H, curl, out = { s: 0, y: 0, part: 0, k: 0 }) {
    const B = 1.9 * H, r = 0.33 * H;
    const i = u * (NU - 1);
    if (i <= NB - 1) { // the long back slope up to the crest
        const a = i / (NB - 1);
        out.s = -B * (1 - a);
        out.y = H * Math.pow(Math.sin(a * Math.PI / 2), 1.4);
        out.part = 0; out.k = a;
    } else if (i <= NB + NA - 1) { // the crest curling over
        const a = (i - (NB - 1)) / NA;
        const th = a * curl;
        out.s = r * Math.sin(th);
        out.y = H - r + r * Math.cos(th);
        out.part = 1; out.k = a;
    } else { // from the lip down to the foot of the front
        const a = (i - (NB + NA - 1)) / NC;
        const th = curl, ls = r * Math.sin(th), ly = H - r + r * Math.cos(th);
        const foot = 0.55 * H * (1 - curl / Math.PI) + 0.15 * H;
        // (the face is hollow: it bows back under the lip)
        out.s = ls + (foot - ls) * a - Math.sin(a * Math.PI) * 0.18 * H * Math.min(1, curl / Math.PI);
        out.y = ly * (1 - a);
        out.part = 2; out.k = a;
    }
    return out;
}

/** The wall of water itself: a moving curved sheet (see profile), the river's water material. */
class WaveLook {
    constructor(scene) {
        this.scene = scene;
        const geo = new THREE.BufferGeometry();
        this.pos = new Float32Array(NU * NX * 3);
        this.col = new Float32Array(NU * NX * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
        const idx = [];
        for (let j = 0; j < NX - 1; j++) for (let i = 0; i < NU - 1; i++) {
            const a = j * NU + i, b = a + 1, c = a + NU, d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
        geo.setIndex(idx);
        this.geo = geo;
        const mat = createWaterMaterial({ blocks: true });
        mat.vertexColors = true;
        mat.color.set(0xffffff);
        mat.emissive.set(0x05313d);
        mat.opacity = 0.86;
        mat.depthWrite = true;
        mat.side = THREE.DoubleSide;
        mat.customProgramCacheKey = () => 'water-wave';
        this.mat = mat;
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 2;
        scene.add(this.mesh);
        // the water drawn into it: a dark whirl on the surface and rings running inwards
        const dipGeo = new THREE.CircleGeometry(1, 40);
        dipGeo.rotateX(-Math.PI / 2);
        this.dipMat = new THREE.MeshBasicMaterial({ color: 0x062c38, transparent: true, opacity: 0, depthWrite: false });
        this.dip = new THREE.Mesh(dipGeo, this.dipMat);
        this.dip.renderOrder = 1;
        scene.add(this.dip);
        const ringGeo = new THREE.RingGeometry(0.93, 1, 48);
        ringGeo.rotateX(-Math.PI / 2);
        this.rings = [0, 1, 2].map(() => {
            const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xbfeef5, transparent: true, opacity: 0, depthWrite: false }));
            m.renderOrder = 1;
            scene.add(m);
            return m;
        });
        this.ringGeo = ringGeo;
        this.dipGeo = dipGeo;
    }

    /** Draw wave w now. bases[j]: the ground / water top under column j. */
    draw(w, bases, time) {
        const F = w.F, half = F.width / 2;
        const sx = -w.dz, sz = w.dx; // (to the side)
        const pr = { s: 0, y: 0, part: 0, k: 0 };
        const breaking = w.phase === 'break' ? clamp(w.t / WAVE.BREAK, 0, 1) : w.phase === 'fall' ? clamp(w.t / WAVE.FALL, 0, 1) : 0;
        const show = w.h > 0.02 && w.phase !== 'drain' && w.phase !== 'gone';
        this.mesh.visible = show;
        if (show) {
            for (let j = 0; j < NX; j++) {
                const a = -1 + 2 * j / (NX - 1);
                const taper = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(a), 5)));
                const wob = 1 + 0.07 * Math.sin(3.1 * a + time * 2.1) + 0.04 * Math.sin(7.3 * a - time * 3.3);
                const H = Math.max(0.02, w.h * (0.18 + 0.82 * taper) * wob);
                const curl = w.curl * (0.35 + 0.65 * taper);
                const lag = -0.22 * half * a * a; // (the ends lag behind the middle)
                const cx = w.x + sx * a * half + w.dx * lag, cz = w.z + sz * a * half + w.dz * lag;
                const by = bases[j] - (w.phase === 'rise' || w.phase === 'aim' ? 0.35 : 0.15); // (it comes out of the water)
                for (let i = 0; i < NU; i++) {
                    profile(i / (NU - 1), H, curl, pr);
                    const n = (j * NU + i) * 3;
                    this.pos[n] = cx + w.dx * pr.s;
                    this.pos[n + 1] = by + pr.y;
                    this.pos[n + 2] = cz + w.dz * pr.s;
                    // the colour: deep and dark low down, clearer up the face, foam on the crest and the lip
                    const v = clamp(pr.y / H, 0, 1);
                    if (v < 0.6) _c.copy(DEEP).lerp(BODY, v / 0.6); else _c.copy(BODY).lerp(LIGHT, (v - 0.6) / 0.4);
                    const noise = 0.5 + 0.5 * Math.sin(a * 23.0 + i * 1.7 + time * 4.0) * Math.sin(a * 11.0 - time * 2.6 + i * 0.6);
                    let foam = 0;
                    if (pr.part === 1) foam = clamp((pr.k - 0.15) * 1.6, 0, 1) * (0.55 + 0.45 * noise) * clamp(curl / (0.3 * Math.PI), 0.25, 1);
                    else if (pr.part === 2) foam = (pr.k < 0.35 ? 0.85 : pr.k > 0.8 ? 0.7 : 0.25) * (0.6 + 0.4 * noise) * clamp(curl / (0.4 * Math.PI), 0, 1);
                    else if (pr.k > 0.85) foam = 0.35 * noise;
                    foam = Math.max(foam, breaking * (0.5 + 0.5 * noise));
                    _c.lerp(FOAM, clamp(foam, 0, 1));
                    this.col[n] = _c.r; this.col[n + 1] = _c.g; this.col[n + 2] = _c.b;
                }
            }
            this.geo.attributes.position.needsUpdate = true;
            this.geo.attributes.color.needsUpdate = true;
            this.geo.computeVertexNormals();
            this.mat.opacity = 0.86 * (w.phase === 'fall' ? 1 - 0.5 * breaking : 1);
            this.mat.userData.uniforms.uTime.value = time;
        }
        // the river drawn into the wave while it rises and stands
        const pull = w.phase === 'rise' ? clamp(w.t / WAVE.RISE, 0, 1) : w.phase === 'aim' ? 1 : w.phase === 'roll' ? Math.max(0, 1 - w.t * 1.5) : w.phase === 'fall' ? 1 - breaking : 0;
        this.dip.visible = pull > 0.01;
        if (this.dip.visible) {
            this.dip.position.set(w.o.x, w.o.y + 0.04, w.o.z);
            this.dip.scale.setScalar(half * 0.9 * (0.6 + 0.4 * pull));
            this.dipMat.opacity = 0.32 * pull;
        }
        this.rings.forEach((m, i) => {
            m.visible = pull > 0.01;
            if (!m.visible) return;
            const ph = (time * 0.7 + i / 3) % 1; // (rings run inwards: the water flows to the wave)
            m.position.set(w.o.x, w.o.y + 0.05, w.o.z);
            m.scale.setScalar(half * 1.4 * (1 - ph) + 0.3);
            m.material.opacity = 0.45 * pull * Math.sin(ph * Math.PI);
        });
    }

    dispose() {
        this.scene.remove(this.mesh, this.dip, ...this.rings);
        this.geo.dispose(); this.mat.dispose();
        this.dipGeo.dispose(); this.dipMat.dispose();
        this.ringGeo.dispose();
        for (const m of this.rings) m.material.dispose();
    }
}

/**
 * Water droplets (round, the water material, falling), bits of foam (white, floating) and wet
 * patches on the ground (they dry from the edges): shared by all the waves.
 */
class Spray {
    constructor(scene) {
        this.scene = scene;
        const make = (geo, mat, n) => {
            const m = new THREE.InstancedMesh(geo, mat, n);
            m.frustumCulled = false;
            m.count = 0;
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            scene.add(m);
            return m;
        };
        this.dropMat = createWaterMaterial();
        this.dropMat.opacity = 0.75;
        this.drops = make(new THREE.SphereGeometry(1, 8, 6), this.dropMat, 700);
        this.foamMat = new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.8, depthWrite: false }); // (white, never shaded grey like a stone)
        this.foam = make(new THREE.IcosahedronGeometry(1, 1), this.foamMat, 600);
        this.wetMat = new THREE.MeshBasicMaterial({ color: 0x0e1a12, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        const wetGeo = new THREE.CircleGeometry(0.5, 10);
        wetGeo.rotateX(-Math.PI / 2);
        this.wet = make(wetGeo, this.wetMat, 500);
        this.d = []; this.f = []; this.p = [];
        this.flow = new WaterFlow(scene, { maxVerts: 8000, radial: 10 }); // (the streams the wall rises from)
    }

    drop(x, y, z, vx, vy, vz, size, floor) {
        if (this.d.length >= this.drops.instanceMatrix.count) this.d.shift();
        this.d.push({ x, y, z, vx, vy, vz, size, floor, life: 2.5 });
    }

    /** A bit of foam: flat (lying on the water / the ground) or a blob in the air. */
    froth(x, y, z, vx, vy, vz, size, life, flat = false, floor = -1e9) {
        if (this.f.length >= this.foam.instanceMatrix.count) this.f.shift();
        this.f.push({ x, y, z, vx, vy, vz, size, life, max: life, flat, floor });
    }

    wetAt(x, y, z, size, life) {
        if (this.p.length >= this.wet.instanceMatrix.count) this.p.shift();
        this.p.push({ x, y, z, size, life, max: life });
    }

    update(dt) {
        const G = 9.8;
        let n = 0;
        for (let i = this.d.length - 1; i >= 0; i--) {
            const d = this.d[i];
            d.life -= dt;
            d.vy -= G * dt;
            d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
            if (d.life <= 0 || d.y < d.floor) { this.d.splice(i, 1); continue; }
        }
        for (const d of this.d) {
            const st = Math.min(2.2, 1 + Math.hypot(d.vx, d.vy, d.vz) * 0.08); // (stretched along its flight)
            _v.set(d.vx, d.vy, d.vz).normalize();
            _quat.setFromUnitVectors(_w.set(0, 1, 0), _v);
            _m.compose(_p.set(d.x, d.y, d.z), _quat, _s.set(d.size, d.size * st, d.size));
            this.drops.setMatrixAt(n++, _m);
        }
        this.drops.count = n;
        this.drops.instanceMatrix.needsUpdate = true;
        n = 0;
        _quat.identity();
        for (let i = this.f.length - 1; i >= 0; i--) {
            const f = this.f[i];
            f.life -= dt;
            if (f.life <= 0) { this.f.splice(i, 1); continue; }
            if (!f.flat) {
                f.vy -= G * 0.6 * dt;
                f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
                if (f.y < f.floor) { f.y = f.floor; f.flat = true; f.vx *= 0.3; f.vz *= 0.3; }
            } else {
                f.x += f.vx * dt; f.z += f.vz * dt;
                f.vx *= Math.max(0, 1 - dt * 1.5); f.vz *= Math.max(0, 1 - dt * 1.5);
            }
        }
        for (const f of this.f) {
            const k = Math.min(1, f.life / (f.max * 0.4)); // (it bursts, shrinking, at the end)
            _m.compose(_p.set(f.x, f.y, f.z), _quat, f.flat ? _s.set(f.size * k, f.size * 0.12 * k, f.size * k) : _s.setScalar(f.size * k));
            this.foam.setMatrixAt(n++, _m);
        }
        this.foam.count = n;
        this.foam.instanceMatrix.needsUpdate = true;
        n = 0;
        for (let i = this.p.length - 1; i >= 0; i--) {
            const p = this.p[i];
            p.life -= dt;
            if (p.life <= 0) { this.p.splice(i, 1); continue; }
        }
        for (const p of this.p) {
            const k = Math.min(1, p.life / (p.max * 0.7)); // (it dries from the edges)
            _m.compose(_p.set(p.x, p.y, p.z), _quat, _s.set(p.size * k, 1, p.size * k));
            this.wet.setMatrixAt(n++, _m);
        }
        this.wet.count = n;
        this.wet.instanceMatrix.needsUpdate = true;
        this.dropMat.userData.uniforms.uTime.value += dt;
    }

    get busy() { return this.d.length + this.f.length + this.p.length > 0; }

    dispose() {
        for (const m of [this.drops, this.foam, this.wet]) { this.scene.remove(m); m.geometry.dispose(); m.dispose?.(); }
        this.flow.dispose();
        this.dropMat.dispose(); this.foamMat.dispose(); this.wetMat.dispose();
    }
}

// ===================================================================== the game's side

export class WaveAttacks {
    constructor(game) {
        this.game = game;
        this.list = []; // waves going on (mine and others')
        this.mine = null; // the one I raised and still hold
        this.spray = null;
        this.time = 0;
        this.env = {
            surface: (x, z) => this.surface(x, z),
            solid: (x, y, z) => !!this.game.world?.terrain?.data?.isSolidAt?.(x, y, z),
        };
    }

    get busy() { return !!this.mine; }

    /** The top of the ground, or of the water over it. */
    surface(x, z) {
        const T = this.game.world?.terrain?.data;
        if (!T) return { y: this.game.collision ? this.game.collision.surfaceY(x, z) : 0, water: false };
        const ix = Math.round(x), iz = Math.round(z);
        const top = T.topLayer(ix, iz);
        let L = top + 1, wl = null;
        while (L < top + 40 && T.get(ix, L, iz) === BLOCK.WATER) { wl = L; L++; }
        if (wl != null) return { y: wl - 0.62, water: true };
        return { y: top - 0.5, water: false };
    }

    /**
     * (the caster's computer) The words were said with the hand pointing at the water at `src`:
     * the water rises there. `look`: where the wave faces at first (away from me).
     */
    raise(name, side, src, look, handDir = null) {
        const g = this.game;
        const s = this.surface(src.x, src.z);
        const o = { x: src.x, y: s.water ? s.y : src.y, z: src.z };
        const w = newWave(name, g.localId, o, look.x, look.z);
        w.mine = true;
        w.side = side;
        w.aim = new WaveAim(Math.atan2(w.dx, w.dz), handDir);
        w.netT = 0;
        this._add(w);
        this.mine = w;
        g.sound?.playWaterRise?.();
        g.sync?.spell?.(name, new THREE.Vector3(o.x, o.y, o.z), new THREE.Vector3(w.dx, 0, w.dz), { w: 'r' });
        return w;
    }

    /**
     * A wave step from the network (or the old one-shot cast: no `ph` — it rolls at once from o
     * along d, as far as d is long).
     */
    onNet(name, o, d, ph, by) {
        const step = ph && typeof ph === 'object' ? ph.w : null;
        let w = this.list.find((x) => x.by === by && !x.mine && (x.phase === 'rise' || x.phase === 'aim'));
        if (step === 'r') {
            if (w) this._remove(w);
            this._add(newWave(name, by, o, d.x, d.z));
            return;
        }
        if (step === 'a') { if (w) { const l = Math.hypot(d.x, d.z) || 1; w.tdx = d.x / l; w.tdz = d.z / l; } return; }
        if (step === 'x') { if (w) this._fall(w); return; }
        // 'g' (or the old one-shot): it rolls now
        if (!w) {
            w = newWave(name, by, o, d.x, d.z, 'aim');
            w.h = w.F.height;
            if (!step) w.dist = Math.max(4, Math.min(40, Math.hypot(d.x, d.z)));
            this._add(w);
        }
        this._go(w, o, d);
    }

    /** «Стоп»: my wave falls back into the water. */
    stop() {
        const w = this.mine;
        if (!w) return false;
        this._fall(w);
        this.game.sync?.spell?.(w.name, new THREE.Vector3(w.o.x, w.o.y, w.o.z), new THREE.Vector3(w.dx, 0, w.dz), { w: 'x' });
        return true;
    }

    clear() {
        for (const w of this.list) w.look?.dispose();
        this.list = [];
        this.mine = null;
        this.spray?.dispose();
        this.spray = null;
    }

    _add(w) {
        if (!this.spray) this.spray = new Spray(this.game.scene);
        w.look = new WaveLook(this.game.scene);
        w.bases = new Float32Array(NX).fill(w.o.y);
        this.list.push(w);
    }

    _remove(w) {
        w.look?.dispose();
        w.look = null;
        this.list.splice(this.list.indexOf(w), 1);
        if (this.mine === w) this.mine = null;
    }

    _fall(w) {
        if (w.phase !== 'rise' && w.phase !== 'aim') return;
        w.h0 = w.h;
        w.phase = 'fall';
        w.t = 0;
        if (this.mine === w) this.mine = null;
        this.game.sound?.playSplash?.();
    }

    /** It is sent: from where it stands (o) along d. */
    _go(w, o, d) {
        const g = this.game;
        const l = Math.hypot(d.x, d.z) || 1;
        w.dx = w.tdx = d.x / l; w.dz = w.tdz = d.z / l;
        w.o = { x: o.x, y: o.y, z: o.z };
        w.x = o.x; w.z = o.z; w.base = o.y; w.s = 0;
        w.phase = 'roll';
        w.t = 0;
        if (this.mine === w) this.mine = null;
        g.sound?.playSplash?.();
        g.sound?.playWhoosh?.();
        // (a surfboard can ride it)
        g.boards?.water?.addTransient?.({ x: o.x, z: o.z, dirX: w.dx, dirZ: w.dz, speed: w.F.speed, height: w.F.height, width: w.F.width, dist: w.dist });
    }

    update(dt) {
        if (!this.list.length && !this.spray?.busy) return;
        dt = Math.min(dt, 0.05);
        this.time += dt;
        const g = this.game;
        this.spray?.flow.begin(dt);
        for (const w of [...this.list]) {
            if (w.mine && (w.phase === 'rise' || w.phase === 'aim')) this._aim(w, dt);
            const before = w.phase;
            stepWave(w, dt, this.env);
            if (before === 'roll' && w.phase === 'break') this._breakFx(w);
            if (w.phase === 'gone') { this._remove(w); continue; }
            this._bases(w, dt);
            this._fx(w, dt);
            if (waveHits(w)) this._hits(w);
            w.look?.draw(w, w.bases, this.time);
        }
        this.spray?.flow.end();
        this.spray?.update(dt);
        if (!this.list.length && this.spray && !this.spray.busy) { this.spray.dispose(); this.spray = null; }
        void g;
    }

    /** (mine) The hand holds, turns and sends the standing wave. */
    _aim(w, dt) {
        const g = this.game, ch = g.character;
        if (!ch) return;
        const side = w.side;
        const raised = !!(g.wandSide?.() === side || ch.isArmRaised?.(side));
        const dir = ch.getHandDirection(side);
        const hand = ch.getHandWorldPosition ? ch.getHandWorldPosition(side) : g.castOrigin(side);
        if (w.phase === 'rise') { w.aim.step(0, { raised: true, dir, hand }); w.aim.t = 0; return; } // (it is still rising)
        const r = w.aim.step(dt, { raised, dir, hand });
        w.tdx = Math.sin(w.aim.yaw); w.tdz = Math.cos(w.aim.yaw);
        w.netT -= dt;
        if (w.netT <= 0) {
            w.netT = WAVE.NET_AIM;
            g.sync?.spell?.(w.name, new THREE.Vector3(w.o.x, w.o.y, w.o.z), new THREE.Vector3(w.tdx, 0, w.tdz), { w: 'a' });
        }
        if (r === 'go') {
            const o = new THREE.Vector3(w.x, w.o.y, w.z), d = new THREE.Vector3(w.tdx, 0, w.tdz);
            this._go(w, o, d);
            g.sync?.spell?.(w.name, o, d, { w: 'g' });
            g.hud?.setVoice?.(w.name === 'WaveAttackMaxima' ? '🌊 Огромная волна пошла!' : '🌊 Волна пошла!', true);
        } else if (r === 'drop') {
            this.stop();
            g.hud?.setVoice?.(w.aim.t >= WAVE.MAX_HOLD ? '🌊 Волну не удержать так долго — она упала обратно в воду' : '🌊 Рука опустилась — волна упала обратно в воду', true);
        }
    }

    /** The ground / the water under each column of the wave. */
    _bases(w, dt) {
        const half = w.F.width / 2, sx = -w.dz, sz = w.dx;
        const k = w.phase === 'rise' || w.phase === 'aim' || w.phase === 'fall' ? 1 : Math.min(1, dt * 10);
        for (let j = 0; j < NX; j++) {
            const a = -1 + 2 * j / (NX - 1);
            const lag = -0.22 * half * a * a;
            const y = w.phase === 'rise' || w.phase === 'aim' || w.phase === 'fall'
                ? w.o.y
                : this.surface(w.x + sx * a * half + w.dx * lag, w.z + sz * a * half + w.dz * lag).y;
            w.bases[j] += (y - w.bases[j]) * k;
        }
    }

    /** Spray, droplets, foam, the wet ground. */
    _fx(w, dt) {
        const S = this.spray;
        if (!S) return;
        const F = w.F, half = F.width / 2, sx = -w.dz, sz = w.dx;
        const rnd = Math.random;
        const at = (a) => { const j = Math.round((a + 1) / 2 * (NX - 1)); return w.bases[j]; };
        if (w.phase === 'rise') {
            // water streams up out of the river into the wall: twisting jets pulled in from all round it
            const k = Math.min(1, w.h / F.height + 0.15);
            for (let i = 0; i < 6; i++) {
                const a = i * 1.047 + Math.sin(this.time * 0.6 + i) * 0.3, r = half * 1.15;
                _from.set(w.o.x + Math.cos(a) * r, w.o.y, w.o.z + Math.sin(a) * r);
                _to.set(w.o.x + Math.cos(a + 0.6) * half * 0.3, w.o.y + w.h * 0.55, w.o.z + Math.sin(a + 0.6) * half * 0.3);
                S.flow.stream(_from, _to, (0.1 + 0.05 * half) * (1.2 - k * 0.6), { lift: 0.4 + w.h * 0.2, strands: 1, speed: 7, foam: 0.35, phase: i });
            }
            const n = Math.round(30 * dt * (half / 3));
            for (let i = 0; i < n; i++) {
                const a = rnd() * Math.PI * 2, r = half * (0.6 + 0.6 * rnd());
                const x = w.o.x + Math.cos(a) * r, z = w.o.z + Math.sin(a) * r;
                S.drop(x, w.o.y, z, (w.o.x - x) * 0.9, 3 + rnd() * 3 * (w.h / F.height + 0.3), (w.o.z - z) * 0.9, 0.05 + rnd() * 0.07, w.o.y - 0.1);
            }
        } else if (w.phase === 'aim') {
            // it drips and foams at its crest while it stands
            if (rnd() < dt * 14) {
                const a = rnd() * 2 - 1;
                S.drop(w.x + sx * a * half, w.o.y + w.h * 0.9, w.z + sz * a * half, w.dx * 0.6, -0.5, w.dz * 0.6, 0.04 + rnd() * 0.05, w.o.y - 0.1);
            }
            if (rnd() < dt * 8) S.froth(w.o.x + (rnd() - 0.5) * half * 2, w.o.y + 0.02, w.o.z + (rnd() - 0.5) * half * 2, 0, 0, 0, 0.15 + rnd() * 0.2, 2.5, true);
        } else if (w.phase === 'roll') {
            // spray off the crest, foam at its foot, the ground left wet behind it
            const n = Math.round(90 * dt * (half / 3));
            for (let i = 0; i < n; i++) {
                const a = rnd() * 2 - 1, y0 = at(a);
                const x = w.x + sx * a * half, z = w.z + sz * a * half;
                if (rnd() < 0.6) S.drop(x + w.dx * 0.3 * w.h, y0 + w.h * (0.75 + 0.3 * rnd()), z + w.dz * 0.3 * w.h,
                    w.dx * F.speed * (0.8 + 0.5 * rnd()) + (rnd() - 0.5) * 1.5, 1 + rnd() * 3, w.dz * F.speed * (0.8 + 0.5 * rnd()) + (rnd() - 0.5) * 1.5, 0.04 + rnd() * 0.07, y0 - 0.2);
                else S.froth(x + w.dx * 0.6, y0 + 0.05, z + w.dz * 0.6, w.dx * F.speed * 0.6, 0, w.dz * F.speed * 0.6, 0.18 + rnd() * 0.25, 1.6 + rnd(), true);
            }
            w.wet += F.speed * dt;
            while (w.wet > 0.8) {
                w.wet -= 0.8;
                for (let j = 0; j < NX; j += 2) {
                    const a = -1 + 2 * j / (NX - 1);
                    const x = w.x - w.dx * 1.2 + sx * a * half, z = w.z - w.dz * 1.2 + sz * a * half;
                    const s = this.surface(x, z);
                    if (!s.water) S.wetAt(x, s.y + 0.02, z, 1.3 + rnd() * 0.5, 6 + rnd() * 3);
                }
            }
        } else if (w.phase === 'break' || w.phase === 'fall') {
            const n = Math.round(70 * dt * (half / 3) * (w.h / F.height + 0.2));
            for (let i = 0; i < n; i++) {
                const a = rnd() * 2 - 1, y0 = at(a);
                const wet = !!w.water; // (foam lasts on the water; on the ground it soaks in quickly)
                S.froth(w.x + sx * a * half + (rnd() - 0.5), y0 + 0.05, w.z + sz * a * half + (rnd() - 0.5), w.dx * 2 * rnd() + (rnd() - 0.5), 0, w.dz * 2 * rnd() + (rnd() - 0.5), (0.25 + rnd() * 0.35) * (wet ? 1 : 0.6), wet ? 2.5 + rnd() * 2 : 0.8 + rnd() * 0.6, true);
            }
        }
    }

    /** It crashes down: a burst of spray and a sheet of foam. */
    _breakFx(w) {
        const S = this.spray, F = w.F, half = F.width / 2, sx = -w.dz, sz = w.dx;
        if (!S) return;
        const rnd = Math.random;
        for (let i = 0; i < 80 * (half / 3); i++) {
            const a = rnd() * 2 - 1, j = Math.round((a + 1) / 2 * (NX - 1)), y0 = w.bases[j];
            S.drop(w.x + sx * a * half, y0 + w.h * rnd(), w.z + sz * a * half, w.dx * (2 + rnd() * 4) + (rnd() - 0.5) * 3, 2 + rnd() * 4, w.dz * (2 + rnd() * 4) + (rnd() - 0.5) * 3, 0.05 + rnd() * 0.08, y0 - 0.2);
        }
        this.game.sound?.playSplash?.();
    }

    /** A splash where the wave hits a body. */
    _splash(p, w) {
        const S = this.spray;
        if (!S) return;
        for (let i = 0; i < 18; i++) S.drop(p.x + (Math.random() - 0.5) * 0.6, p.y + Math.random() * 0.8, p.z + (Math.random() - 0.5) * 0.6, w.dx * 3 + (Math.random() - 0.5) * 3, 2 + Math.random() * 3, w.dz * 3 + (Math.random() - 0.5) * 3, 0.05 + Math.random() * 0.06, w.base - 0.3);
    }

    /** Who and what the rolling wave reaches now (see the table at the top). */
    _hits(w) {
        const g = this.game, auth = !!g.authority;
        const front = _q.set(w.x, w.base, w.z);
        const P = SPELL_PHYSICS[w.name] || {};
        const mine = w.by === g.localId || w.by === 'local';
        let any = false;
        // creatures: the host moves them; everyone sees the splash
        for (const ck of Object.keys(KINDS)) {
            const K = KINDS[ck];
            for (const c of K.list(g)) {
                if (!c.group || !K.alive(c) || w.hit.has(c)) continue;
                const p = K.centre(c, _p);
                const k = waveTouch(w, p);
                if (!k) continue;
                w.hit.add(c);
                this._splash(p, w);
                if (!auth || !g.creatureImpact) continue;
                const res = g.creatureImpact.apply(c, { v: wavePush(w, k, new THREE.Vector3()), by: w.by, spell: w.name, jolt: P.jolt || 0, from: front.clone(), always: P.always ? { down: P.down } : null, down: P.down, toss: P.toss || 0 });
                if (res !== 'none') any = true;
                if (c.isPhoenix) g.phoenixes?.watered?.(c, null, w.by); // (a phoenix: drenched — its flame goes out; no harm)
            }
        }
        // me (every computer: its own player — the caster too, if he stands in front of it)
        if (!w.hit.has('me') && g.combat && !g.combat.dead && !g.isDeadLocal) {
            const c = g.combat.center(_p);
            const k = waveTouch(w, c);
            if (k) {
                w.hit.add('me');
                this._splash(c, w);
                const v = wavePush(w, k, new THREE.Vector3());
                if (!g.wards?.shields(front, c) && !(g.boards?.mounted && !g.boards.onPush(v))) {
                    g.impact?.apply({ v, from: front.clone(), by: w.by, spell: w.name, jolt: P.jolt || 0, toss: P.toss || 0, down: P.down });
                }
            }
        }
        // book-birds flying in it (host): struck (the book of protection shrugs it off)
        if (auth && g.books?.birds) {
            for (const b of g.books.birds.values()) {
                if (w.hit.has(b) || b.state === 'fall' || !b.model) continue;
                if (!waveTouch(w, b.model.position)) continue;
                w.hit.add(b);
                this._splash(b.model.position, w);
                g.books.hitBird(b, 2);
                any = true;
            }
        }
        // (the giant spider: far too big and heavy for a wave — it only splashes on its legs)
        for (const s of g.spiders?.list || []) {
            if (s.dead || w.hit.has(s) || !s.group) continue;
            if (waveTouch(w, s.group.position)) { w.hit.add(s); this._splash(s.group.position, w); }
        }
        // (a dragon: far too heavy for a wave — it only splashes on it: DragonKinds.ON_DRAGON.WaveAttack)
        for (const dr of g.dragons?.list || []) {
            if (dr.dead || w.hit.has(dr) || !dr.group) continue;
            if (waveTouch(w, dr.group.position)) { w.hit.add(dr); this._splash(dr.group.position, w); }
        }
        // weapons and things lying there: dragged along (where they are simulated)
        for (const it of g.weapons?.weapons || []) {
            if (it.holder || it.remoteTarget || w.hit.has(it)) continue;
            const k = waveTouch(w, it.position);
            if (!k) continue;
            w.hit.add(it);
            it.hover = null;
            it.wake?.();
            it.velocity?.add(_v.set(w.dx * w.F.speed * 0.8 * k, 1.5, w.dz * w.F.speed * 0.8 * k));
        }
        // fire: campfires (host) and burning trees and blocks (every computer) go out
        if (auth) {
            for (const f of g.campfires?.list?.values?.() || []) {
                if (!waveTouch(w, _v.set(f.x, f.y + 0.3, f.z))) continue;
                g.campfires._out(f);
                for (let i = 0; i < 6; i++) g.fx?.smoke?.spawn(f.x, f.y + 0.4, f.z, (Math.random() - 0.5), 1 + Math.random(), (Math.random() - 0.5), 0xdde4e8, 0.5 + Math.random() * 0.5, 1.5, { shrink: -0.3, spin: 1 });
                any = true;
            }
        }
        w.douseT = (w.douseT || 0) - 1;
        if (w.douseT <= 0) {
            w.douseT = 6; // (every few frames)
            const r = w.F.width / 2;
            if (g.fire?.douse?.(_v.set(w.x - w.dx, w.base + 0.5, w.z - w.dz), r)) any = true;
            // ships: rocked and pushed, their fires near the water out (host)
            if (auth && g.ships?.waveHit?.(w.x, w.z, w.dx, w.dz, w.F.width, w.h, w.name === 'WaveAttackMaxima' ? 1.6 : 1, w.hit)) any = true;
            if (auth) g.ships?.douse?.(_v.set(w.x, w.base + 1, w.z), r);
        }
        if (any && mine && !w.success) { w.success = true; g.mana?.success?.(w.name); }
    }
}
