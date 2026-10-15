/**
 * Temple.js — the abandoned Temple of the Gods in the game: its look, its solid stone, the library's
 * pedestals with the four scrolls, its sounds. The plan itself (pure, deterministic, made in a worker)
 * and the API to put it on a planet are in src/world/GodsTemple.js:
 *
 *   game.temple.place({ x, y, z, rot })  — the temple on the ground at (x, z), ground height y
 *   game.temple.remove()                 — gone (e.g. leaving the planet)
 *   game.temple.placeTest()              — Creative on Earth only: by the start, to try it (tests)
 *
 * Every computer makes the same temple from the world's seed. It is a gift of the gods (`godGift`):
 * nothing breaks or moves it — its stone is not terrain blocks (no spell carves it), its pedestals
 * and the golden god are marked. Bodies, hands, things and spells stop at it (a static «mover» of
 * the collision world: floors for everybody, walls, ceilings — like a ship's decks).
 *
 * The scrolls: one on each of the four pedestals of the library. Anybody may take one (it teaches its
 * spell when burnt, like every spell scroll); a new one appears on that pedestal SCROLL_BACK s after
 * it was taken — so every player of the world can get each of them (the gods' library does not run
 * out). Every computer puts them there itself (the same ids), a taking travels like any loose thing.
 */

import * as THREE from 'three';
import { templePlan, templeToWorld, templeToLocal, solidToWorld, templeFootprint, templeSpot, TEMPLE, TEMPLE_MATS } from '../world/GodsTemple.js';
import { sphereBoxDepth } from '../entities/Weapon.js';
import { getEnvMap } from '../entities/WeaponModels.js';

const SCROLL_BACK = 90; // s: a taken scroll is back on its pedestal after this
const CELL = 8;
const _n = new THREE.Vector3();
const _v = new THREE.Vector3();

let MATS = null;
/** The temple's materials (one each, made once; prewarmed — Game.prewarm via sampleModels). */
function materials(renderer) {
    if (MATS) return MATS;
    const env = getEnvMap(renderer);
    MATS = {
        stone: new THREE.MeshLambertMaterial({ vertexColors: true }),
        marble: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0 }),
        gold: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xf5c044, roughness: 0.32, metalness: 0.8, envMap: env, envMapIntensity: 1.1, emissive: 0x1a0e00, emissiveIntensity: 0.2 }),
        wood: new THREE.MeshLambertMaterial({ vertexColors: true }),
        sand: new THREE.MeshLambertMaterial({ vertexColors: true }),
        web: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
        shaft: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    };
    return MATS;
}

/**
 * The temple's stone for the collision world: a static «mover» (CollisionWorld.movers) — its floors
 * hold everybody up (players, villagers, animals, things), its walls push bodies out, its roofs are
 * ceilings, spells and sight stop at it, hands and blades touch it (sphereDepth).
 */
export class TempleCollider {
    constructor(spot, solids) {
        this.enabled = true;
        this.boxes = solids.map((b) => ({ ...solidToWorld(spot, b), statue: !!b.statue, godGift: true }));
        const f = templeFootprint(spot);
        this.aabb = f;
        this.grid = new Map();
        for (const b of this.boxes) {
            for (let cx = Math.floor(b.minX / CELL); cx <= Math.floor(b.maxX / CELL); cx++) {
                for (let cz = Math.floor(b.minZ / CELL); cz <= Math.floor(b.maxZ / CELL); cz++) {
                    const k = cx * 65536 + cz;
                    let a = this.grid.get(k);
                    if (!a) this.grid.set(k, a = []);
                    a.push(b);
                }
            }
        }
        this._EMPTY = [];
    }

    _at(x, z) { return this.grid.get(Math.floor(x / CELL) * 65536 + Math.floor(z / CELL)) || this._EMPTY; }

    hasXZ(x, z, pad = 0) {
        const a = this.aabb;
        return this.enabled && x >= a.minX - pad && x <= a.maxX + pad && z >= a.minZ - pad && z <= a.maxZ + pad;
    }

    /** The highest stone top under (x, z) a body reaching up to reachY can stand on, or null. */
    floorAt(x, z, reachY) {
        let y = null;
        const list = this._at(x, z);
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ || b.maxY > reachY + 0.05) continue;
            if (y === null || b.maxY > y) y = b.maxY;
        }
        return y;
    }

    /** The underside of the lowest stone over (x, z) at or above y (a roof, a beam), or Infinity. */
    ceilingAt(x, z, y) {
        let c = Infinity;
        const list = this._at(x, z);
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
            if (b.minY >= y && b.minY < c) c = b.minY;
        }
        return c;
    }

    pushCylinder(pos, r, feetY, h, stepHeight = 1.05) {
        if (!this.enabled) return false;
        let moved = false;
        for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
            const list = this._at(pos.x + ox, pos.z + oz);
            for (let i = 0; i < list.length; i++) {
                const b = list[i];
                if (b.maxY <= feetY + stepHeight || b.minY >= feetY + h) continue;
                if (b.minY > feetY + h * 0.6) continue; // (a roof over the head: a ceiling — ceilingAt)
                if (pos.x + r <= b.minX || pos.x - r >= b.maxX || pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue;
                // (low stone the body is already over — the podium, a plinth: a floor to stand on, not a wall
                // to be thrown out of sideways)
                if (b.maxY <= feetY + h * 0.5 && pos.x > b.minX && pos.x < b.maxX && pos.z > b.minZ && pos.z < b.maxZ) continue;
                // out by the shortest way
                const dl = pos.x + r - b.minX, dr = b.maxX - (pos.x - r), dn = pos.z + r - b.minZ, df = b.maxZ - (pos.z - r);
                const m = Math.min(dl, dr, dn, df);
                if (m === dl) pos.x -= dl; else if (m === dr) pos.x += dr; else if (m === dn) pos.z -= dn; else pos.z += df;
                moved = true;
            }
        }
        return moved;
    }

    pointBlocked(x, y, z) {
        if (!this.enabled) return false;
        const list = this._at(x, z);
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && y >= b.minY && y <= b.maxY) return true;
        }
        return false;
    }

    sphereDepth(p, r, n) {
        if (!this.enabled) return 0;
        let best = 0;
        const list = this._at(p.x, p.z);
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (p.x < b.minX - r || p.x > b.maxX + r || p.y < b.minY - r || p.y > b.maxY + r || p.z < b.minZ - r || p.z > b.maxZ + r) continue;
            const d = sphereBoxDepth(p, r, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, _n);
            if (d > best) { best = d; if (n) n.copy(_n); }
        }
        return best;
    }

    forget() {}
}

export class Temple {
    constructor(game) {
        this.game = game;
        this.spot = null; // {x, y, z, rot}
        this.plan = null;
        this.group = null;
        this.collider = null;
        this.pedestals = []; // {spell, at: Vector3, uid, n, goneT}
        this._wait = null;
        this._worker = null;
        this._chimeT = 2;
        this._tick = 0;
    }

    /** Put the temple on the ground (see GodsTemple.js). The look comes from a worker a moment later. */
    place(spot) {
        this.remove();
        this.spot = { x: spot.x, y: spot.y, z: spot.z, rot: ((spot.rot | 0) % 4 + 4) % 4 };
        const seed = (this.game.seed ?? 1) >>> 0;
        const id = 'tmpl' + Math.round(this.spot.x) + ',' + Math.round(this.spot.z) + ':' + seed;
        this._wait = id;
        const done = (plan) => { if (this._wait === id) { this._wait = null; this._build(plan); } };
        try {
            if (typeof Worker === 'undefined') throw new Error('no workers');
            if (!this._worker) {
                this._worker = new Worker(new URL('../world/temple.worker.js', import.meta.url), { type: 'module' });
                this._worker.onmessage = (e) => { const d = e.data; if (d?.plan) this._done?.(d.id, d.plan); };
            }
            this._done = (did, plan) => { if (did === id) done(plan); };
            this._worker.postMessage({ id, seed });
        } catch (e) {
            done(templePlan(seed)); // (Node tests: no workers — made at once)
        }
        return this.spot;
    }

    /** Creative on Earth only: the temple by the start (to try it; e2e). Never in a normal game. */
    placeTest() {
        const g = this.game;
        if (g.config?.mode !== 'creative') return null;
        const ground = (x, z) => g.collision.groundY(x, z);
        const s = templeSpot(g.seed ?? 1, ground, { cx: -170, cz: 140, R: 60, tries: 16 });
        const center = templeToWorld({ ...s, y: 0 }, -7, 0, -22);
        s.y = Math.round(ground(center.x, center.z));
        this._clearTerrain(s);
        return this.place(s);
    }

    /** (Earth test) the blocks over the floor in the footprint taken away (trees, hills). */
    _clearTerrain(s) {
        const data = this.game.world?.terrain?.data;
        if (!data?.set) return;
        // (inside: down to the floor; round it — a clearing down to the ground at the stairs, rising
        // gently into the land further out, so no hill stands as a wall at its sides)
        const f = templeFootprint(s), floor = s.y + TEMPLE.RISE * TEMPLE.K, M = 40;
        for (let x = Math.floor(f.minX) - M; x <= Math.ceil(f.maxX) + M; x++) {
            for (let z = Math.floor(f.minZ) - M; z <= Math.ceil(f.maxZ) + M; z++) {
                const out = Math.max(f.minX - x, x - f.maxX, f.minZ - z, z - f.maxZ, 0);
                const lim = out > 0 ? s.y + out * 0.5 : floor;
                const top = data.topLayer(x, z);
                for (let L = top; L - 0.5 > lim && L > top - 80; L--) if (data.get(x, L, z)) data.set(x, L, z, 0);
            }
        }
    }

    _build(plan) {
        const g = this.game, s = this.spot;
        this.plan = plan;
        const M = materials(g.renderer);
        const group = new THREE.Group();
        this._pending = [];
        group.name = 'GodsTemple';
        group.userData.godGift = true;
        const o = templeToWorld(s, 0, 0, 0);
        group.position.set(o.x, o.y, o.z);
        group.rotation.y = s.rot * Math.PI / 2;
        group.scale.setScalar(TEMPLE.K);
        for (const m of TEMPLE_MATS) {
            const a = plan.mats[m];
            if (!a || !a.pos.length) continue;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
            geo.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
            geo.computeBoundingSphere();
            const mesh = new THREE.Mesh(geo, M[m]);
            mesh.name = 'temple-' + m;
            mesh.castShadow = m === 'stone' || m === 'marble' || m === 'gold';
            mesh.receiveShadow = m !== 'shaft' && m !== 'web';
            if (m === 'shaft' || m === 'web') mesh.renderOrder = 2;
            mesh.userData.godGift = true;
            this._pending.push(mesh); // (into the scene one a frame: never one long frame of uploads)
        }
        g.scene.add(group);
        this.group = group;
        this.collider = new TempleCollider(s, plan.solids);
        g.collision?.addMover?.(this.collider);
        // the four pedestals (the Creative ones: gifts of the gods) and their scrolls
        for (const p of plan.pedestals) {
            const w = templeToWorld(s, p.x, 0, p.z);
            const top = g.world?.createPedestal ? g.world.createPedestal(w.x, w.z, { y: w.y, godGift: true }) : 1.97;
            this.pedestals.push({ spell: p.spell, at: new THREE.Vector3(w.x, w.y + top + 0.9, w.z), n: 0, uid: null, goneT: 0 });
        }
        for (const p of this.pedestals) this._putScroll(p);
    }

    _putScroll(p) {
        const items = this.game.items;
        if (!items) return;
        p.uid = `temple-${p.spell}-${p.n}`;
        items.spawnLoose({ kind: 'scroll', uid: p.uid, stat: 'spell', spell: p.spell, temple: true }, p.at.clone(), { hover: true, broadcast: false });
    }

    remove() {
        const g = this.game;
        this._wait = null;
        if (this.collider) { g.collision?.removeMover?.(this.collider); this.collider = null; }
        if (this.group) {
            for (const c of [...this.group.children, ...(this._pending || [])]) c.geometry?.dispose();
            this._pending = [];
            g.scene?.remove(this.group);
            this.group = null;
        }
        for (const p of this.pedestals) if (p.uid && g.items?.loose?.get(p.uid)?.hover) g.items.removeLoose(p.uid);
        if (this.pedestals.length) g.world?.removePedestals?.(this.pedestals.map((p) => p.at));
        this.pedestals = [];
        this.plan = null;
        g.sound?.templeAmbience?.(0, 0);
    }

    /** Is a world point inside the temple's rooms? (the echo) */
    inside(p) {
        if (!this.plan || !this.spot) return false;
        const l = templeToLocal(this.spot, p.x, p.y, p.z);
        if (l.y < -1 || l.y > TEMPLE.HALL_H) return false;
        return this.plan.rooms.some((r) => l.x > r.x0 && l.x < r.x1 && l.z > r.z0 && l.z < r.z1);
    }

    update(dt) {
        if (!this.group) return;
        if (this._pending?.length) this.group.add(this._pending.shift());
        const g = this.game, me = g.character?.group?.position;
        if (!me) return;
        const c = this.group.position;
        const d = Math.hypot(me.x - c.x, me.z - c.z);
        this.group.visible = d < TEMPLE.FAR;
        // the sounds: wind outside, the quiet echo of the halls inside, the scrolls' chime
        const inside = d < 260 && this.inside(me);
        const near = Math.max(0, 1 - d / 260);
        g.sound?.templeAmbience?.(inside ? near * 0.25 : near * 0.8, inside ? 0.9 : 0);
        this._tick -= dt;
        if (this._tick > 0) return;
        this._tick = 0.5;
        // scrolls: a taken one comes back after a while
        const items = g.items;
        let nearest = null, nd = 1e9;
        for (const p of this.pedestals) {
            if (!p.uid) continue;
            const L = items?.loose?.get(p.uid);
            if (L && L.hover) {
                p.goneT = 0;
                const dd = p.at.distanceTo(me);
                if (dd < nd) { nd = dd; nearest = p; }
                continue;
            }
            p.goneT += 0.5;
            if (p.goneT >= SCROLL_BACK) { p.goneT = 0; p.n++; this._putScroll(p); }
        }
        this._chimeT -= 0.5;
        if (nearest && nd < 22 && this._chimeT <= 0) {
            this._chimeT = 3 + Math.random() * 3;
            g.sound?.playTempleChime?.(_v.copy(nearest.at));
        }
    }

    /** One small mesh of each material: compiled at loading (Game.prewarm), never in a frame. */
    sampleModels() {
        const M = materials(this.game.renderer);
        const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
        const out = [];
        for (const m of TEMPLE_MATS) {
            const mesh = new THREE.Mesh(geo, M[m]);
            mesh.castShadow = m === 'stone' || m === 'marble' || m === 'gold';
            mesh.receiveShadow = m !== 'shaft' && m !== 'web';
            out.push(mesh);
        }
        return out;
    }

    /** Spots for a look (the screenshots): world camera place and the point it looks at. */
    viewOf(name) {
        const v = this.plan?.spots?.[name];
        if (!v) return null;
        const p = templeToWorld(this.spot, v.x, v.y, v.z), q = templeToWorld(this.spot, v.look[0], v.look[1], v.look[2]);
        return { from: p, to: q };
    }

    dispose() {
        this.remove();
        this._worker?.terminate();
        this._worker = null;
    }
}
