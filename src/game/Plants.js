/**
 * Plants.js — the plant creatures of the world (rules and numbers: PlantLife.js; the look: fx/PlantModels.js).
 *
 *   Телевильпин        groups of ~5 big red glowing flowers, 0.6× as often as apple trees. Prick whoever stands at one
 *                      (1 HP, once a second per flower) unless the visitor wears a full steel set. Broken → «Листок телевильпина».
 *   Ярколето           a fire flower that breathes open and shut; angered, it turns on the offender and breathes fire (BrightFlower.js). Sleeps from cold and water.
 *   Плотоядная голова  groups of 2–5, 0.5× as often as apple trees. See a living thing near → the NECK STRETCHES to it, the open jaws hover,
 *                      the tendrils coil round it and draw it in (a few m/s), the jaws SLAM shut where it is, the neck draws back carrying it,
 *                      three chews, a swallow that goes down the neck as a swelling (PlantHunt.js: the whole hunt is one pure little
 *                      simulation, the same on every computer — nothing is ever put into the mouth, the prey moves a step a frame).
 *                      An animal that FITS the jaws is eaten (PlantHunt.maxPrey); a man without armour is held in the throat (−1 HP a
 *                      second, ~10 s) and put down by the lowered neck; a breastplate: it tries ~7 s; a MAGIC robe: put down at once.
 *                      Killed → «Головка плотоядной».
 * The host leads (hits, hunger, animals, the other players' fate); every computer decides about ITS OWN player (pricks, bites,
 * the hold inside) from the state the host tells — 'plant' messages. The places of the groups come from the seed (PlantLife),
 * like apple trees: the same on every computer; only worlds of generation ≥ PLANTS_FROM_GEN have them.
 * Cost: a group of flowers is two shapes + one sprite batch; a head is six shapes (foot, living neck, two jaws, ruff, tendrils);
 * the neck (18 rings) and the tendrils are written by the CPU only near the player (every frame within 40 m, 12 Hz farther, nothing beyond 90 m).
 * Far groups are not drawn / are put away; a plant nobody is near lets its prey go (_abandon).
 */
import * as THREE from 'three';
import { BLOCK, PLANTS_FROM_GEN, BRIGHTFLOWER_FROM_GEN } from '../world/Terrain.js';
import { BIOMES } from '../world/Landscape.js';
import { BrightFlowers } from './BrightFlower.js';
import { newUid } from './ItemTypes.js';
import { crowdNear } from './CrowdSources.js';
import {
    PLANT_KINDS, APPLE, EAT, FREEZE, BURN, plantGroupIn, plantId, plantHeight, plantGear, thornsPrick, swallowVerdict,
    plantDamage, FIRE_KINDS, COLD_KINDS, DROP_STACK, WET_KINDS, BRIGHT,
} from './PlantLife.js';
import {
    PLANT_CLOCK, plantMaterials, telewilpinVariant, TELE_VARIANTS, buildLobe, buildHeadBase, buildHeadCollar, HeadNeck, NECK, VineSet, VINES, HEAD, mergePlaced,
} from '../fx/PlantModels.js';
import { Hunt, HUNT, HUNT_STATES, PREY_SIZE, preyFits, huntVerdict, neckSpine, neckThin } from './PlantHunt.js';

export const PLANT_RANGE = { LOAD: 170, KEEP: 330, DRAW: 150, ANIM: 90, SIM: 85, IDLE_VINES: 45 };
const STATES = HUNT_STATES;
const NO_EFFECT = new Set(['AvadaKedavra', 'Avada', 'Stupefy', 'LevitateDuel', 'Levitation', 'Jolt', 'Expelliarmus', 'Disarmor']);
const TELE_H0 = 5.4, HEAD_H0 = 8.4, BRIGHT_H0 = 2.2;
/** Half-width of a plant's body (m, at size 1): its collision box and the reach of a blow. */
const bodyR = (kind) => (kind === 'carnivore' ? 0.6 : kind === 'brightflower' ? 0.3 : 0.2);
const _up = new THREE.Vector3(0, 1, 0), _w2 = new THREE.Vector3(), _tv = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _o = new THREE.Vector3(1, 1, 1);
const r2 = (x) => Math.round(x * 100) / 100;
const ease = (t) => t * t * (3 - 2 * t);

let _lobeA = null, _lobeB = null; const _headBases = [], _collars = [];
const headBase = (i) => _headBases[i] || (_headBases[i] = buildHeadBase(i + 1));
const headCollar = (i) => _collars[i] || (_collars[i] = buildHeadCollar(i + 1));
const lobes = () => { if (!_lobeA) { _lobeA = buildLobe(1, 0); _lobeB = buildLobe(2, 1); } return [_lobeA, _lobeB]; };

/** Where the Creative test ground's experiment heads may grow: [angle, metres] from the start, east first — the first flat grass wins. */
const EXP_SPOTS = [[0, 65], [0.5, 65], [-0.5, 65], [1, 65], [-1, 65], [0, 72], [0.5, 72], [-0.5, 72], [1.5, 65], [-1.5, 65], [2.2, 65], [-2.2, 65]];

export class Plants {
    constructor(game) {
        this.game = game;
        this.groups = new Map(); // 'kind|gx,gz' → {key, kind, plants[], root, ...} | null
        this.byId = new Map(); // plant id → plant
        this.near = []; // live plants near me (for the crowd and the hits), rebuilt twice a second
        this._proxies = [];
        this._aroundT = 0; this._nearT = 0; this._clock = 0; this._tick = 0;
        this._gone = new Map(); // id → true: plants killed in this world (so they stay dead when their place is loaded again)
        this._sendT = 0; this._out = [];
        this.mine = null; // the plant holding ME (or null)
        this.enabled = true;
        this.bright = new BrightFlowers(this); // the Brightflower's mind and its instanced look (BrightFlower.js)
    }

    get active() { const g = this.game; return (g.gen ?? 1) >= PLANTS_FROM_GEN; }
    get auth() { return this.game.authority !== false; }

    // ============================================================ placing (like Animals._treesAround: cells of 110 m)
    _around(p) {
        const g = this.game, t = g.terrain?.data;
        if (!t || !this.active) return;
        const C = APPLE.CELL, R = PLANT_RANGE.LOAD, seed = g.seed || 1;
        const gx0 = Math.floor((p.x - R) / C), gx1 = Math.floor((p.x + R) / C), gz0 = Math.floor((p.z - R) / C), gz1 = Math.floor((p.z + R) / C);
        const FAR = Math.ceil(PLANT_RANGE.KEEP / C);
        for (const [key, grp] of this.groups) {
            if (key === 'carnivore|exp' && !grp) continue; // (the experiment heads: a spent group stays spent)
            const [kx, kz] = grp ? [grp.gx, grp.gz] : key.split('|')[1].split(',').map(Number);
            if (kx >= gx0 - FAR && kx <= gx1 + FAR && kz >= gz0 - FAR && kz <= gz1 + FAR) continue;
            if (grp) this._unload(grp);
            this.groups.delete(key);
        }
        this._experimentHeads(p, t);
        let built = 0;
        for (let gz = gz0; gz <= gz1 && built < 2; gz++) for (let gx = gx0; gx <= gx1 && built < 2; gx++) for (const kind of Object.keys(PLANT_KINDS)) {
            if (kind === 'brightflower' && (g.gen ?? 1) < BRIGHTFLOWER_FROM_GEN) continue; // (older worlds have no Brightflowers)
            const key = kind + '|' + gx + ',' + gz;
            if (this.groups.has(key)) continue;
            const def = plantGroupIn(kind, gx, gz, seed);
            if (!def) { this.groups.set(key, null); continue; }
            // the land of every member must be made already (never made in the frame — TerrainData.landMade)
            if (def.members.some((m) => t.landMade && !t.landMade(Math.round(m.x), Math.round(m.z)))) continue;
            const ok = [];
            for (const m of def.members) {
                const x = Math.round(m.x), z = Math.round(m.z);
                if (Math.hypot(x, z) < 40) continue; // (the start place stays clear)
                const top = t.topLayer(x, z);
                if (t.get(x, top, z) !== BLOCK.GRASS || t.get(x, top + 1, z) === BLOCK.WATER) continue;
                if ((t.sites || t.castles)?.landAt?.(x, z) || t.isIsland?.(x, z)) continue; // (not in castles, villages, towers; not on islands)
                if (PLANT_KINDS[kind].biomes && !PLANT_KINDS[kind].biomes.includes(BIOMES[t.biomeAt?.(x, z) ?? 0]?.id)) continue; // (the Brightflower: warm meadows, steppes, emerald hills)
                const id = plantId(kind, gx, gz, m.i);
                if (this._gone.has(id)) continue;
                ok.push({ ...m, x, z, y: top - 0.5, id });
            }
            this.groups.set(key, ok.length ? this._load(kind, gx, gz, ok) : null);
            built++;
        }
    }

    /**
     * The Creative test ground (the standard map, the start place with the pedestals): the author's experiments need carnivorous heads — three of them
     * grow on the grass east of the start, ~65 m from it (not near, not far). The place is the first of a fixed list that is flat grass with its land made;
     * never made in the frame (`landMade`); a cut one stays cut for the session only (`_gone`), they grow again the next time.
     */
    _experimentHeads(p, t) {
        const g = this.game, key = 'carnivore|exp';
        if (this.groups.has(key) || g.config?.mode !== 'creative' || g.config?.map || (g.gen ?? 1) < 3) return; // (the same test as Game's `testGround`)
        if (!this._expSpot) {
            for (const [ang, r] of EXP_SPOTS) {
                const x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
                const cells = [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7]].map(([dx, dz]) => [x + dx, z + dz]);
                if (cells.some(([cx, cz]) => t.landMade && !t.landMade(cx, cz))) return; // (wait for the land: the list is in order, never skipped)
                const tops = cells.map(([cx, cz]) => t.topLayer(cx, cz));
                const flat = Math.max(...tops) - Math.min(...tops) <= 1;
                const grass = cells.every(([cx, cz], i) => t.get(cx, tops[i], cz) === BLOCK.GRASS && t.get(cx, tops[i] + 1, cz) !== BLOCK.WATER);
                const free = cells.every(([cx, cz]) => !((t.sites || t.castles)?.landAt?.(cx, cz) || t.isIsland?.(cx, cz)));
                if (flat && grass && free) { this._expSpot = { x, z }; break; }
            }
            if (!this._expSpot) this._expSpot = false;
        }
        const S = this._expSpot;
        if (!S || Math.hypot(p.x - S.x, p.z - S.z) > PLANT_RANGE.LOAD) return;
        const members = [];
        for (let i = 0; i < 3; i++) {
            const x = S.x + (i - 1) * 7, z = S.z, id = 'cexp.' + i, top = t.topLayer(x, z);
            if (this._gone.has(id)) continue;
            members.push({ i, x, z, y: top - 0.5, id, yaw: Math.atan2(-x, -z) + (i - 1) * 0.4, h: 0.35 + 0.15 * i });
        }
        if (!members.length) { this.groups.set(key, null); return; }
        const grp = this._load('carnivore', 0, 0, members);
        grp.key = key; grp.gx = Math.floor(S.x / APPLE.CELL); grp.gz = Math.floor(S.z / APPLE.CELL); // (its cell: where the unloading looks)
        this.groups.set(key, grp);
    }

    _load(kind, gx, gz, members) {
        const g = this.game, K = PLANT_KINDS[kind];
        const grp = { key: kind + '|' + gx + ',' + gz, kind, gx, gz, plants: [], root: new THREE.Group(), vis: true };
        const bright = kind === 'brightflower';
        grp.root.position.set(members[0].x, members[0].y, members[0].z);
        for (const m of members) {
            const p = {
                id: m.id, kind, x: m.x, y: m.y, z: m.z, yaw: m.yaw, s: plantHeight(kind, m.h) / (kind === 'telewilpin' ? TELE_H0 : bright ? BRIGHT_H0 : HEAD_H0), variant: Math.floor(m.h * 997) % (kind === 'telewilpin' ? TELE_VARIANTS : 3),
                isPlantBody: true, hp: K.hp, maxHp: K.hp, dead: false, grp, st: 0, t: 0, prey: null, pT: 0, burnT: 0, freezeT: 0, cool: 0, phase: m.h * 40, hy: 0, hpit: 0, jaw: 0.12, boxId: null, bites: 0, tire: 0, digest: 0,
            };
            p.H = plantHeight(kind, m.h);
            const hw = bodyR(kind) * p.s;
            p.boxId = g.collision?.addBox({ minX: m.x - hw, maxX: m.x + hw, minY: m.y, maxY: m.y + p.H * 0.7, minZ: m.z - hw, maxZ: m.z + hw, kind: 'tree', noSupport: true });
            if (bright) this.bright.init(p);
            p.proxy = this._makeProxy(p);
            grp.plants.push(p); this.byId.set(p.id, p);
        }
        if (kind === 'telewilpin') this._buildTele(grp); else if (!bright) for (const p of grp.plants) this._buildHead(p, grp); // (the Brightflowers are drawn all together: BrightFlowerFx)
        g.scene.add(grp.root);
        return grp;
    }

    _unload(grp) {
        const g = this.game;
        for (const p of grp.plants) { this._abandon(p); g.collision?.removeBox(p.boxId); this.byId.delete(p.id); }
        g.scene.remove(grp.root);
        grp.root.traverse((o) => { if (o.isMesh || o.isPoints) { if (!o.geometry.userData.keep) o.geometry.dispose(); } });
        for (const p of grp.plants) { p.vines?.dispose(); p.neck?.dispose(); }
    }

    // ---- flowers: a group's members merged into two shapes and a sprite batch (rebuilt when one is broken)
    _buildTele(grp) {
        for (const c of [...grp.root.children]) { grp.root.remove(c); if (c.geometry && !c.geometry.userData.keep) c.geometry.dispose(); }
        const live = grp.plants.filter((p) => !p.dead), o = grp.root.position, M = plantMaterials();
        if (!live.length) return;
        const stems = [], pets = [], glow = [];
        for (const p of live) {
            const v = telewilpinVariant(p.variant);
            _m.compose(_v.set(p.x - o.x, p.y - o.y, p.z - o.z), _q.setFromAxisAngle(_w.set(0, 1, 0), p.yaw), _w.set(p.s, p.s, p.s));
            const mm = _m.clone();
            stems.push({ geo: v.stem, matrix: mm }); pets.push({ geo: v.petals, matrix: mm });
            _v.copy(v.top).applyMatrix4(mm); glow.push(_v.x, _v.y, _v.z);
        }
        const stem = new THREE.Mesh(mergePlaced(stems), M.stem), pet = new THREE.Mesh(mergePlaced(pets), M.petal);
        stem.castShadow = true; stem.frustumCulled = pet.frustumCulled = true;
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(glow, 3));
        const halo = new THREE.Points(pg, M.glow); halo.frustumCulled = false;
        grp.root.add(stem, pet, halo);
        grp.halo = halo;
    }

    // ---- a head: a foot with roots, a living neck (one dynamic shape), the two jaws with a ruff of leaves, six tendrils
    _buildHead(p, grp) {
        const M = plantMaterials(), hb = headBase(p.variant), [la, lb] = lobes();
        const root = new THREE.Group();
        root.position.set(p.x - grp.root.position.x, p.y - grp.root.position.y, p.z - grp.root.position.z);
        root.rotation.y = p.yaw; root.scale.setScalar(p.s);
        const foot = new THREE.Mesh(hb.geo, M.headStem); foot.castShadow = true;
        const pivot = new THREE.Group(); pivot.position.copy(hb.rest); pivot.rotation.order = 'YXZ';
        const top = new THREE.Mesh(la, M.head), low = new THREE.Mesh(lb, M.head);
        top.castShadow = true;
        low.scale.y = -1; // (the lower jaw is the upper one mirrored: it faces the same way, teeth up)
        const collar = new THREE.Mesh(headCollar(p.variant), M.headStem);
        pivot.add(top, low, collar);
        p.neck = new HeadNeck(p.variant + 1);
        const neck = new THREE.Mesh(p.neck.geo, M.vine); neck.frustumCulled = false; neck.castShadow = true;
        p.vines = new VineSet(p.variant + 1);
        const vines = new THREE.Mesh(p.vines.geo, M.vine); vines.frustumCulled = false; vines.castShadow = false;
        root.add(foot, neck, pivot, vines);
        grp.root.add(root);
        // the matrices of a plant never change: local ↔ world is made once (the hunt runs in the plant's own axes)
        p.mw = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(_up, p.yaw), new THREE.Vector3(p.s, p.s, p.s));
        p.mwi = p.mw.clone().invert();
        p.hunt = new Hunt([hb.rest.x, hb.rest.y, hb.rest.z], [hb.base.x, hb.base.y, hb.base.z], 0);
        p.spine = Array.from({ length: NECK.N }, () => [0, 0, 0]);
        Object.assign(p, { root, pivot, top, low, neckMesh: neck, vinesMesh: vines, vineT: 0, drawT: 0, stretch: 1 });
        p.hunt.step(0, {}); this._animate(p, 0, { x: p.x, z: p.z }, true);
        this._poseVines(p, 0, true);
    }

    // ============================================================ hits (a proxy lets the weapons see a plant like any creature)
    _makeProxy(p) {
        const pos = new THREE.Vector3(p.x, p.y, p.z), rot = { y: p.yaw };
        const r = p.kind === 'carnivore' ? 1.0 * p.s : p.kind === 'brightflower' ? 0.65 * p.s : 0.55 * p.s;
        return {
            isPlant: true, plant: p, group: { position: pos, rotation: rot }, damageCooldown: 0,
            get isDead() { return p.dead; },
            bodyCapsule: (c) => { c.a.set(p.x, p.y + 0.2, p.z); this._top(p, c.b); c.r = r; return c; },
        };
    }
    /** World point of a plant's top (the bloom / the hinge of the jaws). */
    _top(p, out) {
        if (p.kind === 'carnivore' && p.hunt) return this._toWorld(p, p.hunt.H, out);
        if (p.kind === 'brightflower') return this.bright.top(p, out);
        return out.set(p.x, p.y + p.H * (p.kind === 'carnivore' ? 0.7 : 0.95), p.z);
    }
    targets() { return this._proxies; }
    byProxy(z) { return z?.plant || null; }
    /** Is a point (x, y, z) within r of this plant's body (the stem line and the head)? */
    _dist(p, pt, out) {
        this._top(p, _v);
        const ax = p.x, ay = p.y + 0.2, az = p.z, bx = _v.x, by = _v.y, bz = _v.z;
        const abx = bx - ax, aby = by - ay, abz = bz - az, l2 = abx * abx + aby * aby + abz * abz || 1;
        let t = ((pt.x - ax) * abx + (pt.y - ay) * aby + (pt.z - az) * abz) / l2; t = Math.max(0, Math.min(1, t));
        const dx = pt.x - (ax + abx * t), dy = pt.y - (ay + aby * t), dz = pt.z - (az + abz * t);
        return Math.sqrt(dx * dx + dy * dy + dz * dz) - (p.kind === 'brightflower' ? 0.6 : bodyR(p.kind)) * p.s;
    }

    /** A blow / a spell / fire on a plant (any computer: a guest asks the host). */
    hit(p, dmg, kind = 'melee', by = null) {
        if (!p || p.dead) return;
        if (!this.auth) { this._send({ op: 'hit', id: p.id, dmg: r2(+dmg || 0), kind, by: this.game.localId }); this._flinch(p); return; }
        if (p.kind === 'brightflower') { // (made of fire: fire does nothing and angers nothing; cold and water put it to sleep; any other blow hurts AND angers it)
            if (FIRE_KINDS.has(kind)) return;
            if (COLD_KINDS.has(kind) || WET_KINDS.has(kind)) { this.bright.sleep(p); return; }
        }
        if (COLD_KINDS.has(kind)) { this._cold(p); return; }
        if (FIRE_KINDS.has(kind)) this.ignite(p);
        const d = plantDamage(kind, dmg);
        if (!(d > 0)) { if (p.kind === 'brightflower' && !NO_EFFECT.has(kind)) this.bright.anger(p, by); return; }
        p.hp -= d;
        if (d >= 2) p.struck = true; // (a hard blow makes the tendrils let go)
        this._flinch(p);
        if (p.hp <= 0) this.die(p, kind, by);
        else if (p.kind === 'brightflower') this.bright.anger(p, by);
    }
    hitAt(pos, radius, dmg, kind, by = null) {
        for (const p of this.near) if (!p.dead && this._dist(p, pos) < radius) this.hit(p, dmg, kind, by);
    }
    hitRay(org, d, len, width, dmg, kind, by = null) {
        for (const p of this.near) {
            if (p.dead) continue;
            this._top(p, _w);
            // the ray's closest approach to the stem's middle and top
            for (const k of [0.35, 1]) {
                _v.set(p.x, p.y + (_w.y - p.y) * k, p.z).sub(org);
                const along = _v.dot(d);
                if (along < 0 || along > len) continue;
                if (_v.addScaledVector(d, -along).length() < width + 0.8 * p.s) { this.hit(p, dmg, kind, by); break; }
            }
        }
    }
    /** (any computer) A duel charge reached a plant: fire burns it, cold kills a flower / freezes a head, the gentle charges do nothing. */
    boltHit(p, spell, by) {
        if (!p || p.dead) return;
        if (!this.auth) { this._send({ op: 'bolt', id: p.id, spell }); return; }
        if (NO_EFFECT.has(spell)) { this._flinch(p); return; } // (a green plant has no heart to stop, no mind to stun, no wand to lose)
        this.hit(p, 8, spell, by);
    }
    ignite(p) { if (!p.dead && p.burnT <= 0) this.game.sound?.playPlant?.(_v.set(p.x, p.y + 2, p.z), 'burn', 0.8); p.burnT = BURN.TIME; }
    _cold(p) {
        if (p.kind === 'telewilpin') { this.die(p, 'cold', null); return; } // (brittle: it shatters)
        this._dropHeld(p); p.freezeT = FREEZE.TIME; p.hunt.freeze(); this._sync(p);
    }
    /** (host) Let go of whatever the plant holds (it died, froze, was left behind). */
    _dropHeld(p) {
        const h = p.hunt; if (!h) return;
        if (this.auth && h.prey) { this._hold(p, h.prey, false); if (h.prey.k === 'v') { const v = this.game.castleLife?.byId?.get(h.prey.id); if (v) v.fleeT = 6; } }
        if (h.prey) h.letGo(HUNT.COOL_LOST, 'lost');
        if (this.mine === p) this._release(p, true);
        this._sync(p);
    }
    /** A plant that nobody is near any more must not keep a creature in its tendrils. */
    _abandon(p) { if (p.hunt && p.kind === 'carnivore') this._dropHeld(p); }
    _flinch(p) { p.flinch = 0.35; this.game.sound?.playPlant?.(_v.set(p.x, p.y + 2, p.z), 'rustle', 0.7); }

    /** (host) A plant is destroyed: it leaves its thing, falls, its prey is let go. */
    die(p, kind = 'melee', by = null) {
        if (p.dead) return;
        p.dead = true; p.deadT = 0; p.hp = 0;
        const g = this.game, K = PLANT_KINDS[p.kind];
        this._gone.set(p.id, true);
        g.collision?.removeBox(p.boxId); p.boxId = null;
        this._dropHeld(p); this._release(p, true);
        this._top(p, _v);
        for (let i = 0; i < 18; i++) g.fx?.spark?.(_v, p.kind === 'telewilpin' ? 0xff3a1c : p.kind === 'brightflower' ? 0xffa21f : 0x6fb83a, 0.12, _w.set((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.8);
        g.sound?.playPlant?.(_v, 'fall', 1);
        if (this.auth) {
            g.items?.spawnLoose?.({ kind: K.drop, uid: newUid(), count: K.dropCount }, _v.clone().setY(p.y + 1.2), { vel: _w.set((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2) });
            this._send({ op: 'die', id: p.id });
        }
        if (p.kind === 'telewilpin') this._buildTele(p.grp);
    }

    // ============================================================ per frame
    update(dt) {
        if (!this.active || !this.enabled) return;
        const g = this.game, me = g.character.group.position;
        this._clock += dt; this._tick++;
        PLANT_CLOCK.t.value = this._clock;
        const night = g.world?._night || 0, M = plantMaterials();
        M.petal.emissiveIntensity = 0.7 + 0.15 * Math.sin(this._clock * 1.9) + 0.35 * night;
        M.glow.opacity = 0.32 + 0.3 * night + 0.06 * Math.sin(this._clock * 2.3);
        this._aroundT -= dt;
        if (this._aroundT <= 0) { this._aroundT = 1; this._around(me); }
        this._nearT -= dt;
        if (this._nearT <= 0) { this._nearT = 0.5; this._rebuildNear(me); }
        // draw only near; the tendrils and jaws only near
        for (const grp of this.groups.values()) {
            if (!grp) continue;
            const d = Math.hypot(grp.root.position.x - me.x, grp.root.position.z - me.z);
            const vis = d < PLANT_RANGE.DRAW + 12;
            if (vis !== grp.vis) { grp.vis = vis; grp.root.visible = vis; }
        }
        const heads = [];
        for (const p of this.near) {
            if (p.kind === 'telewilpin') this._tele(p, dt, me); else if (p.kind === 'carnivore') heads.push(p);
        }
        this.bright.update(dt, me);
        for (const p of heads) this._head(p, dt, me);
        for (const grp of this.groups.values()) if (grp) for (const p of grp.plants) if (p.dead && p.kind === 'carnivore') this._fall(p, dt);
        this._holdMe(dt);
        if (this.auth) this._snapshot(dt);
    }

    _rebuildNear(me) {
        const R = PLANT_RANGE.SIM;
        const was = this.near.slice();
        this.near.length = 0; this._proxies.length = 0;
        const people = [me];
        for (const r of this.game.remotes?.values?.() || []) if (r.position && !r.dead) people.push(r.position);
        for (const grp of this.groups.values()) {
            if (!grp) continue;
            for (const p of grp.plants) {
                if (p.dead) continue;
                let ok = false;
                for (const q of people) if (Math.abs(q.x - p.x) < R && Math.abs(q.z - p.z) < R) { ok = true; break; }
                if (ok) { this.near.push(p); this._proxies.push(p.proxy); }
            }
        }
        for (const p of was) if (!this.near.includes(p)) this._abandon(p);
    }

    // ============================================================ telewilpin: thorns
    _tele(p, dt, me) {
        const g = this.game;
        p.pT -= dt; p.flinch = Math.max(0, (p.flinch || 0) - dt);
        this._burn(p, dt);
        if (p.dead) return;
        const R = PLANT_KINDS.telewilpin.prick.reach * p.s;
        // me: I decide about my own player
        if (!g.isDeadLocal && !g.combat?.dead && p.pT <= 0 && !g.flight?.active) {
            const feet = me.y - 2.0, dx = me.x - p.x, dz = me.z - p.z;
            if (dx * dx + dz * dz < R * R && feet > p.y - 0.8 && feet < p.y + p.H * 0.8) {
                p.pT = PLANT_KINDS.telewilpin.prick.every;
                if (thornsPrick(g.armor?.worn)) this._pricked(p, dx, dz);
                else { this._topPoint(p, _v.set(me.x, me.y - 0.5, me.z)); g.fx?.spark?.(_v, 0xdddddd, 0.07, _w.set(dx, 1, dz).setLength(2), 0.35); g.sound?.playPlant?.(_v, 'prick', 0.35); } // (the thorns slide off the steel)
            }
        }
        // the host: whoever else stands among them (animals, villagers, zombies)
        if (this.auth && (this._tick + p.phase | 0) % 8 === 0) {
            const list = crowdNear(g, p.x, p.y, p.z, R + 1.5, null, 4, this._buf || (this._buf = []));
            for (const b of list) {
                if (b.kind === 'player' || b.kind === 'plant' || p.pT > 0) continue;
                const o = b.ref;
                if (b.kind === 'animal' && !o.dead) { g.animals.hit(o, 1, _v.set(b.x - p.x, 0, b.z - p.z).normalize(), null); p.pT = 1; }
                else if (b.kind === 'man' && !o.dead && !(o.armor > 0)) { g.castleLife?.hit?.(o, 1, _v.set(b.x - p.x, 0, b.z - p.z).normalize(), null, { kind: 'thorn' }); p.pT = 1; }
                else if (b.kind === 'zombie' && !o.isDead) { g.damageZombie?.(o, 1, false, _v.set(b.x - p.x, 0, b.z - p.z).normalize(), null); p.pT = 1; }
            }
        }
    }
    _topPoint(p, out) { return out; }
    _pricked(p, dx, dz) {
        const g = this.game;
        if (g.combat?.enabled) g.combat.damage(1, null, 'thorn'); else g.damageLocalPlayer?.(1, 'thorn');
        const d = Math.hypot(dx, dz) || 1;
        if (g.knockback && !g.flight?.active) { g.knockback.x += dx / d * 2.2; g.knockback.z += dz / d * 2.2; } // (a little start away from the thorns)
        g.sound?.playPlant?.(_v.set(p.x, p.y + 1.5, p.z), 'prick', 0.8);
        this._flinch(p);
    }

    /** Fire eats a plant fast. */
    _burn(p, dt) {
        if (p.burnT <= 0 || p.dead) return;
        p.burnT -= dt;
        if (this.auth) { p.hp -= BURN.DPS * dt; if (p.hp <= 0) { this.die(p, 'Fire', null); return; } }
        if (Math.random() < dt * 14) {
            this._top(p, _v); _v.y -= Math.random() * p.H * 0.5;
            this.game.fx?.spark?.(_v, [0xff6a14, 0xffc24a, 0x2a2622][(Math.random() * 3) | 0], 0.14, _w.set((Math.random() - 0.5), 1.5 + Math.random() * 1.5, (Math.random() - 0.5)), 0.7);
        }
    }

    // ============================================================ the carnivorous head (the hunt itself: PlantHunt.js — one little simulation on every computer)
    /** Old numbers of the states (the network and the tests still speak them). */
    _enter(p, st) { // 0 = rest, 8 = frozen (the others are driven by the hunt itself)
        const name = typeof st === 'number' ? HUNT_STATES[st] : st;
        if (name === 'frozen') p.hunt.freeze(); else if (name === 'idle') p.hunt.letGo(0, 'done'); else p.hunt.enter(name);
        this._sync(p);
    }
    _sync(p) { p.st = HUNT_STATES.indexOf(p.hunt.st); p.t = p.hunt.t; p.prey = p.hunt.prey; }
    get _S() { return HUNT_STATES; }
    // world ↔ the plant's local space (a plant never moves: the matrices are made once)
    _toLocal(p, w, out) { _w2.copy(w).applyMatrix4(p.mwi); out[0] = _w2.x; out[1] = _w2.y; out[2] = _w2.z; return out; }
    _toWorld(p, a, out) { return out.set(a[0], a[1], a[2]).applyMatrix4(p.mw); }

    _head(p, dt, me) {
        const g = this.game, K = PLANT_KINDS.carnivore, h = p.hunt;
        p.flinch = Math.max(0, (p.flinch || 0) - dt);
        this._burn(p, dt);
        if (p.dead) return;
        if (p.freezeT > 0) { p.freezeT -= dt; if (p.freezeT <= 0 && this.auth) { h.letGo(0, 'done'); this._sync(p); } }
        // who it watches (idle) and the prey it holds
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        h.look = !h.prey && d < 30 && h.st === 'idle' ? this._toLocal(p, me, p.lookV || (p.lookV = [0, 0, 0])) : null;
        if (this.auth && h.st === 'idle' && p.freezeT <= 0) this._think(p, dt);
        const prey = h.prey;
        let obs = null, alive = true;
        if (prey) {
            alive = this._preyAlive(prey);
            if (alive && !h.owned) { const w = this._preyBody(prey, _o); if (w) obs = this._toLocal(p, w, p.obsV || (p.obsV = [0, 0, 0])); else alive = false; }
        }
        if (p.freezeT > 0) { this._animate(p, dt, me); return; }
        const ev = h.step(dt, { auth: this.auth, prey: obs, alive, struck: p.struck });
        p.struck = false;
        if (ev.length) this._events(p, ev, prey);
        this._sync(p);
        if (h.owned && h.prey) this._applyPrey(p, dt);
        this._animate(p, dt, me);
    }

    /** The things that happen in a frame of the hunt (sounds, the hold, the bites, the meal, the putting down). */
    _events(p, ev, prey) {
        const g = this.game, h = p.hunt;
        for (const e of ev) {
            switch (e) {
                case 'lash': g.sound?.playPlant?.(this._toWorld(p, h.H, _v), 'creak', 1); g.sound?.playPlant?.(_v, 'lash', 0.9); this._panic(p); break;
                case 'hold': if (this.auth) { this._hold(p, prey, true); if (prey?.k === 'v') g.castleLife?.alarm?.(_v.set(p.x, p.y + 1, p.z), 'monster', null, 40); } break;
                case 'wrap': g.sound?.playPlant?.(this._toWorld(p, h.mouth, _v), 'squeeze', 1); break;
                case 'snap': g.sound?.playPlant?.(this._toWorld(p, h.mouth, _v), 'snap', 1); break;
                case 'bite': this._bite(p, prey); break;
                case 'gulp': g.sound?.playPlant?.(this._toWorld(p, h.H, _v), 'gulp', 1); break;
                case 'eaten': if (this.auth && prey?.k === 'a') { const a = g.animals.byId.get(prey.id); if (a) { a.plantHeld = false; g.animals._remove(a); } } break;
                case 'spit': this._flingPrey(p, prey); break;
                case 'lost': case 'letgo': case 'done': if (this.auth) this._hold(p, prey, false); if (this.mine === p) this._release(p, false, false); break;
                default: break;
            }
        }
    }
    /** The lashing tendrils frighten the herd round the prey. */
    _panic(p) {
        const g = this.game; if (!this.auth || !g.animals) return;
        for (const a of g.animals.list) {
            if (a.dead || a.plantHeld || a.fly) continue;
            const dx = a.group.position.x - p.x, dz = a.group.position.z - p.z;
            if (dx * dx + dz * dz < 14 * 14 * p.s * p.s && !(p.prey?.k === 'a' && p.prey.id === a.id)) g.animals._scare?.(a, { x: p.x, z: p.z });
        }
    }

    /** (host) The hunger of a head: one meal at a time. */
    _think(p, dt) {
        const g = this.game, K = PLANT_KINDS.carnivore, h = p.hunt;
        if (h.cool > 0) return;
        if ((this._tick + (p.phase | 0)) % 6 !== 0) return;
        const R = HUNT.START_R * p.s;
        const list = crowdNear(g, p.x, p.y, p.z, R, null, 8, this._buf || (this._buf = []));
        let best = null, bd = 1e9;
        for (const b of list) {
            if (b.kind !== 'player' && b.kind !== 'animal' && b.kind !== 'man') continue;
            if (b.kind === 'animal' && (b.ref.dead || b.ref.rider || b.ref.fly || b.ref.plantHeld || b.ref.servantOf != null)) continue;
            if (b.kind === 'animal' && !preyFits(PREY_SIZE[b.ref.type] ?? 99, p.s)) continue; // (the jaws are too small for it: a horse is left alone)
            if (b.kind === 'man' && (b.ref.dead || b.ref.plantHeld || b.ref.carriedBy || b.ref.lev || b.ref.arena)) continue;
            if (b.kind === 'player' && !this._playerFair(b)) continue;
            if (this._taken(b)) continue;
            const d = Math.hypot(b.x - p.x, b.z - p.z);
            if (d < bd && Math.abs(b.y - p.y) < p.H) { bd = d; best = b; }
        }
        if (!best) return;
        const prey = this._preyOf(best);
        prey.size = best.kind === 'animal' ? (PREY_SIZE[best.ref.type] ?? 1.5) : 3.5; prey.kind = prey.k; prey.inside = false;
        prey.verdict = huntVerdict(prey.k, prey.size, p.s, this._verdict(prey));
        if (prey.verdict === 'big') return;
        const body = this._preyBody(prey, _o); if (!body) return;
        const top = this._toWorld(p, h.rest, _v);
        if (g.collision && !g.collision.lineOfSight(top.x, top.y, top.z, body.x, body.y, body.z, 1.5)) return; // (no way to it: through a wall)
        p.bites = 0;
        h.begin(prey, this._toLocal(p, body, [0, 0, 0]));
        h.digestFor = g.combat?.enabled ? HUNT.INSIDE_MAX : 4;
        this._events(p, h.events.splice(0), prey);
        this._sync(p);
    }

    _taken(b) { for (const q of this.near) if (q.prey && q.prey.id === (b.kind === 'player' ? String(b.id) : b.ref.id)) return true; return false; }
    _playerFair(b) {
        const g = this.game;
        if (b.id === 'me') return !g.isDeadLocal && !g.combat?.dead && !g.flight?.active && !g.invis?.isInvisible?.(g.localId);
        const r = g.remotes?.get(b.id); return !!r && !r.dead;
    }
    _preyOf(b) { return b.kind === 'player' ? { k: 'p', id: b.id === 'me' ? this.game.localId : String(b.id) } : b.kind === 'animal' ? { k: 'a', id: b.ref.id } : { k: 'v', id: b.ref.id }; }
    _gearOf(prey) {
        const g = this.game;
        if (prey.k === 'a') return null;
        if (prey.k === 'v') { const v = g.castleLife?.byId?.get(prey.id); return { metalSet: false, chest: !!(v && v.armor > 0), magicRobe: !!v?.magicSet }; }
        if (prey.id === g.localId) return plantGear(g.armor?.worn);
        const c = g.armor?.remote?.get(prey.id); // (the others: the code of what they wear)
        return c ? { metalSet: c.h > 0 && c.c > 0 && c.l > 0, chest: c.c > 0, magicRobe: c.r >= 2 } : plantGear({});
    }
    _verdict(prey) { return swallowVerdict(this._gearOf(prey)); }
    _preyAlive(prey) {
        const g = this.game;
        if (!prey) return false;
        if (prey.k === 'a') { const a = g.animals?.byId?.get(prey.id); return !!a && !a.dead; }
        if (prey.k === 'v') { const v = g.castleLife?.byId?.get(prey.id); return !!v && !v.dead; }
        if (prey.id === g.localId) return !g.isDeadLocal && !g.combat?.dead;
        const r = g.remotes?.get(prey.id); return !!r && !r.dead;
    }
    /** World point of the middle of the prey's body (an animal: its middle; a man: his chest). */
    _preyBody(prey, out) {
        const g = this.game;
        if (prey.k === 'a') { const a = g.animals?.byId?.get(prey.id); return a ? out.set(a.group.position.x, a.group.position.y + 0.4, a.group.position.z) : null; }
        if (prey.k === 'v') { const v = g.castleLife?.byId?.get(prey.id); return v ? out.set(v.x, v.y + 1.4, v.z) : null; }
        if (prey.id === g.localId) return out.copy(g.character.group.position);
        const r = g.remotes?.get(prey.id); return r ? out.copy(r.position) : null;
    }
    /** How far below the middle of the body the object's own origin is (to write the position back). */
    _midOff(prey) { return prey.k === 'a' ? 0.4 : prey.k === 'v' ? 1.4 : 0; }

    /** (host) Take hold of the prey (animals and villagers are carried by the host). */
    _hold(p, prey, on) {
        const g = this.game;
        if (!prey) return;
        if (prey.k === 'a') { const a = g.animals?.byId?.get(prey.id); if (a) { a.plantHeld = on; if (on) a._plantScale0 = a.group.scale.x; if (!on) { a.group.rotation.x = 0; if (a._plantScale0) a.group.scale.setScalar(a._plantScale0); } } }
        if (prey.k === 'v') { const v = g.castleLife?.byId?.get(prey.id); if (v) { v.carriedBy = on ? p : null; if (!on) v.vy = v.vy || -0.01; } }
    }
    /** (host) The prey follows the plant: its body is put where the hunt says (a step a frame, never under the ground or into rock). */
    _applyPrey(p, dt) {
        const g = this.game, h = p.hunt, prey = h.prey;
        if (prey.k === 'p' || !this.auth) return; // (a player: _holdMe on his own computer)
        const w = this._toWorld(p, h.preyPos, _w), off = this._midOff(prey) * (prey.k === 'a' ? h.preyScale : 1);
        let oy = w.y - off;
        const gy = g.collision?.groundAt ? g.collision.groundAt(w.x, w.z, w.y + 1) : p.y;
        const minY = gy + (prey.k === 'a' ? 0.35 : 0);
        if (oy < minY) oy = minY;
        if (g.collision?.pointBlocked?.(w.x, oy + off, w.z)) { // (the way is closed: nothing is carried through rock)
            p.blockedT = (p.blockedT || 0) + dt;
            if (p.blockedT > 0.5) { p.blockedT = 0; this._hold(p, prey, false); h.letGo(HUNT.COOL_LOST, 'lost'); this._sync(p); }
            return;
        }
        p.blockedT = 0;
        if (prey.k === 'a') {
            const a = g.animals?.byId?.get(prey.id); if (!a) return;
            a.group.position.set(w.x, oy, w.z); a.net = a.group.position;
            a.group.scale.setScalar((a._plantScale0 || 1) * h.preyScale);
            const k = h.st === 'wrap' ? 0.35 : 0.9, f = Math.min(1, dt * 4);
            a.group.rotation.x += (k - a.group.rotation.x) * f;
            const ty = p.yaw + h.yaw; a.group.rotation.y += Math.atan2(Math.sin(ty - a.group.rotation.y), Math.cos(ty - a.group.rotation.y)) * Math.min(1, dt * 6);
        } else {
            const v = g.castleLife?.byId?.get(prey.id); if (!v) return;
            v.x = w.x; v.y = oy; v.z = w.z;
        }
    }
    /** (host) A bite: an animal loses 3 HP a bite, a villager 3. A player takes his own bites (_holdMe). */
    _bite(p, prey) {
        const g = this.game;
        g.sound?.playPlant?.(this._toWorld(p, p.hunt.mouth, _v), 'snap', 1);
        if (!this.auth || !prey) return;
        if (prey.k === 'a') { const a = g.animals?.byId?.get(prey.id); if (a) { a.hp -= EAT.ANIMAL_BITE * 0.5; if (a.hp <= 0) a.hp = 1; } } // (three bites weaken it; it is swallowed alive-or-nearly: no carcass)
        else if (prey.k === 'v') { const v = g.castleLife?.byId?.get(prey.id); if (v) g.castleLife.hit(v, 3, null, null, { kind: 'bite' }); }
    }
    /** (host) The neck has lowered the prey: it is let out with a push (from where the mouth is, not from a new place). */
    _flingPrey(p, prey) {
        const g = this.game;
        if (!prey) return;
        const mouth = this._toWorld(p, p.hunt.mouth, _v);
        g.sound?.playPlant?.(mouth, 'spit', 1);
        const dir = _w.set(Math.sin(p.yaw + p.hunt.yaw), 0, Math.cos(p.yaw + p.hunt.yaw));
        if (!this.auth) return;
        if (prey.k === 'a') { const a = g.animals?.byId?.get(prey.id); if (a) { a.plantHeld = false; a.group.rotation.x = 0; if (a._plantScale0) a.group.scale.setScalar(a._plantScale0); g.animals.push?.(a, _o.copy(dir).multiplyScalar(EAT.SPIT_V * 0.6).setY(2), 0.6); a.state = 'flee'; a.stateT = 6; } }
        else if (prey.k === 'v') { const v = g.castleLife?.byId?.get(prey.id); if (v) { v.carriedBy = null; v.fleeT = 6; v.vy = 0; } }
    }

    // ---- the victim's side: ME (every computer decides about its own player)
    _holdMe(dt) {
        const g = this.game, c = g.combat, ch = g.character;
        let mine = null;
        for (const p of this.near) if (!p.dead && p.prey && p.prey.k === 'p' && p.prey.id === g.localId && p.hunt.owned && !p.meSpat) { mine = p; break; }
        if (!mine) { if (this.mine) this._release(this.mine, false); return; }
        const p = mine, h = p.hunt, S = h.st;
        if (this.mine !== p) { this.mine = p; p.myBite = 0; p.myT = 0; p.meSpat = false; }
        p.myT += dt;
        if (c) c.eaten = (S === 'snap' && h.prey?.verdict !== 'spit') || S === 'pull' || S === 'bite' || S === 'gulp' || S === 'digest';
        ch.verticalVelocity = 0;
        if (g.knockback) g.knockback.set(0, 0, 0);
        // my body follows the hunt: a step a frame, above the ground, never into rock
        const w = this._toWorld(p, h.preyPos, _v), gy = g.collision?.groundAt ? g.collision.groundAt(w.x, w.z, w.y) : p.y;
        if (w.y < gy + 2.05) w.y = gy + 2.05;
        if (!g.collision?.pointBlocked?.(w.x, w.y, w.z) && !g.collision?.pointBlocked?.(w.x, w.y - 1.5, w.z)) ch.group.position.copy(w);
        if (S === 'digest') {
            p.inT = (p.inT || 0) + dt;
            if (p.inT >= 1) { p.inT -= 1; if (c?.enabled) c.damage(EAT.HURT, null, 'bite'); else g.damageLocalPlayer?.(EAT.HURT, 'bite'); }
            g.hud?.setStatus?.('🌿 Вас съела плотоядная голова! −1 ❤ в секунду. Убейте её — бейте мечом или колдуйте');
        }
        if (S === 'bite' && Math.floor(h.t / HUNT.BITE_EVERY) > p.myBite) {
            p.myBite = Math.floor(h.t / HUNT.BITE_EVERY);
            if (c?.enabled) c.damage(EAT.BITE_DMG, null, 'bite'); else g.damageLocalPlayer?.(EAT.BITE_DMG, 'bite'); // (steel takes its share — Armor.absorb)
            g.hud?.damageFlash?.();
        }
        if (S === 'spit' && h.spat) { p.meSpat = true; this._release(p, false, true); }
    }
    _mouth(p, out) { return p.hunt ? this._toWorld(p, p.hunt.mouth, out) : out.set(p.x, p.y + 6, p.z); }
    /** Let me go (put down with a push, or just freed). */
    _release(p, died, spit = false) {
        const g = this.game, c = g.combat;
        if (this.mine !== p) return;
        if (c) c.eaten = false;
        this.mine = null; p.inT = 0;
        g.hud?.setStatus?.('');
        if (spit || died) {
            const d = _w.set(Math.sin(p.yaw + p.hunt.yaw), 0, Math.cos(p.yaw + p.hunt.yaw));
            g.character.verticalVelocity = 2;
            if (g.knockback) { g.knockback.x = d.x * EAT.SPIT_V * 0.8; g.knockback.z = d.z * EAT.SPIT_V * 0.8; }
            g.sound?.playPlant?.(g.character.group.position, 'spit', 1);
        }
    }

    // ---- looks
    _animate(p, dt, me) {
        if (!p.root) return;
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        if (d > PLANT_RANGE.ANIM) return;
        const h = p.hunt, t = this._clock + p.phase;
        // far plants are written at 12 Hz, near ones every frame
        p.drawT -= dt;
        if (d > 40 && p.drawT > 0) return;
        p.drawT = d > 40 ? 0.08 : 0;
        // the jaws
        const target = h.jawTarget() + (p.flinch > 0 ? 0.3 * p.flinch : 0);
        p.jaw += (target - p.jaw) * Math.min(1, dt * (h.st === 'snap' ? 45 : h.st === 'bite' ? 28 : 9));
        p.pivot.position.set(h.H[0], h.H[1], h.H[2]);
        p.pivot.rotation.set(h.pitch, h.yaw, 0);
        p.top.rotation.x = -p.jaw; p.low.rotation.x = p.jaw;
        // chewing: the lower jaw works sideways
        const chew = h.st === 'bite' ? Math.sin(h.t * 14) * 0.09 : 0;
        p.low.position.x = chew; p.low.rotation.z = chew * 0.6;
        // the neck: it stretches and thins, the swallow goes down it as a swelling
        const L = neckSpine(h.base, h.H, h.yaw, h.pitch, p.spine, p.spine.length);
        p.neck.update(p.spine, neckThin(L), h.bulgeAt(), h.st === 'gulp' ? 0.35 : 0.55, t);
        p.stretch = L / HUNT.REST_NECK;
        // the tendrils
        p.vineT -= dt;
        const hunting = h.tendril > 0 || h.st !== 'idle';
        if (hunting || (d < PLANT_RANGE.IDLE_VINES && p.vineT <= 0)) { p.vineT = hunting ? 0 : 0.05; this._poseVines(p, t); }
    }

    _poseVines(p, t, first = false) {
        const V = p.vines, h = p.hunt;
        const grabbing = h.tendril > 0 && h.prey;
        const reach = grabbing ? ease(h.tendril) : 0;
        const tgt = grabbing ? _tv.set(h.preyPos[0], h.preyPos[1], h.preyPos[2]) : null;
        for (let i = 0; i < V.N; i++) {
            const u = 0.5 + 0.45 * i / (V.N - 1), base = first || !p.neck.ring[0].p ? _w.set(0, u * HEAD.STEM_H, 0) : p.neck.sample(u, _w);
            const yaw = i * 2.4 + 0.5;
            const mine = grabbing && i < 4; // (four of the six tendrils take hold; the rest lash about)
            V.set(i, base, yaw, mine ? tgt : null, t * (grabbing ? 2.2 : 1), mine ? reach : 0, mine && h.tendril >= 1 ? 1 : 0);
        }
        V.commit();
    }

    _fall(p, dt) {
        if (!p.root || p.root.parent == null) return;
        p.deadT += dt;
        const k = Math.min(1, p.deadT / 1.1);
        p.root.rotation.z = -ease(k) * 1.4; p.root.scale.y = p.s * (1 - 0.6 * ease(k));
        if (p.deadT > 3.5 && p.root.visible) p.root.visible = false;
    }

    // ============================================================ the network
    _send(m) { const net = this.game.sync?.net; if (net) net.send({ t: 'plant', ...m }, m.op !== 's'); }
    _snapshot(dt) {
        this._sendT -= dt;
        if (this._sendT > 0 || !this.game.sync?.net) return;
        this._sendT = 0.2;
        const l = [];
        for (const p of this.near) if (p.kind === 'carnivore' && !p.dead && (p.hunt.st !== 'idle' || p.freezeT > 0 || p.burnT > 0)) l.push([p.id, p.st, r2(p.t), p.prey ? p.prey.k + ':' + p.prey.id : 0, Math.round(p.hp), p.freezeT > 0 ? 1 : 0, p.burnT > 0 ? 1 : 0, r2(p.hunt.digest || 0)]);
        this._send({ op: 's', l, idle: this._lastActive && !l.length ? 1 : 0 });
        this._lastActive = l.length > 0;
    }
    onNet(m, isHost) {
        if (!m) return;
        if (m.op === 'b' || m.op === 'anger' || m.op === 'sleep') { this.bright.onNet(m); return; }
        if (m.op === 'bolt' && isHost) { const p = this.byId.get(m.id); if (p) this.boltHit(p, m.spell, null); }
        else if (m.op === 'hit' && isHost) { const p = this.byId.get(m.id); if (p) this.hit(p, +m.dmg || 0, m.kind || 'melee', m.by || null); }
        else if (m.op === 'die' && !isHost) { const p = this.byId.get(m.id); if (p) this.die(p, 'net', null); else this._gone.set(m.id, true); }
        else if (m.op === 's' && !isHost) {
            const seen = new Set();
            for (const e of m.l || []) {
                const p = this.byId.get(e[0]); if (!p || p.dead) continue;
                seen.add(p);
                let prey = null;
                if (e[3]) { const [k, ...rest] = String(e[3]).split(':'); prey = { k, kind: k, id: k === 'p' ? rest.join(':') : +rest.join(':') || rest.join(':'), size: 1.5, verdict: 'eat' }; }
                if (prey && p.hunt.prey && p.hunt.prey.id === prey.id) prey = p.hunt.prey; // (the same one: keep what the hunt knows about it)
                p.hunt.digest = +e[7] || 0;
                p.hunt.setNet(HUNT_STATES[e[1]] || 'idle', e[2], prey);
                if (p.hunt.st === 'digest' && p.hunt.prey?.kind === 'p') p.hunt.prey.inside = true;
                this._sync(p);
                p.hp = e[4]; p.freezeT = e[5] ? 1 : 0; p.burnT = e[6] ? 1 : 0;
            }
            for (const p of this.near) if (p.kind === 'carnivore' && !seen.has(p) && p.hunt.st !== 'idle' && !p.dead) { p.hunt.setNet('idle', 0, null); p.freezeT = 0; this._sync(p); if (this.mine === p) this._release(p, false); }
        }
    }

    // ============================================================ the rest
    /** Samples for the shader warm-up (Game.prewarm). */
    sampleModels() { return this.bright.sampleModel(); }
    dispose() {
        for (const grp of this.groups.values()) if (grp) this._unload(grp);
        this.groups.clear(); this.byId.clear(); this.near.length = 0;
        this.bright.dispose();
    }
}
