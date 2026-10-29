/**
 * Canaries.js — the Canaries («Канарики»): small, broad, very strong swamp people who live in camps of 3–8 on the marshy shores of lakes and
 * hurl boulders at whoever walks into their territory. Rules, numbers and the «who / what» table: CanaryRules.js; the look: fx/CanaryModel.js.
 *
 *   Where       camps of worlds of generation ≥ CANARIES_FROM_GEN, found on the land itself (a shore: water round a flat bit of ground, away from the start
 *               and from towns — `_findCamp`, a few candidates a frame, only once the land is made — TerrainData.landMade), loaded 150 m round the players
 *               and put away at 260 m. Each camp: a fire ring, 2–3 hide tents, racks, a bone pile, four bone totems (the edge of the territory, 22 m), reeds,
 *               9–14 boulders lying about. A killed canary stays dead for the session.
 *   Calm        they sit round the fire, mutter, wander a few steps. Whoever is outside the territory they ignore.
 *   Angry       a trespasser (a player, or any creature that is not a canary) within 25 m of the fire: «Грр!», the whole camp joins. Each canary walks to the
 *               nearest boulder (≤ 20 m), bends, lifts it in both hands, walks to a throwing place (6…20 m from the target), winds up (the body bends back, the rock
 *               over the head) and throws (~22 m/s, an arc, aimed where the target is going; a sidestep dodges it). Close up, or with no boulder, a canary punches.
 *   The shot    a real flying boulder, the same on every computer: it hits the player of the computer it reaches (−8 ❤, a hard shove; a raised «Protection»
 *               holds it), the host decides for every other creature; it lands and lies there as a new boulder (to be fetched again); in water it sinks.
 *   Fleeing     the leader (the first of the camp) falls → the others run from the fight for 9 s and then come back to their fire.
 *   Network     the host leads (minds, hits, deaths) and tells each computer the positions ('can' s, 8×/s), a throw ('can' throw — then every computer flies
 *               the same boulder), a landing, a death; a guest's blow goes to the host.
 */
import * as THREE from 'three';
import { CANARIES as C, hash, campLuck, campCandidate, campMembers, campRocks, solveThrow, spreadAt } from './CanaryRules.js';
import { canaryModel, canaryLook, canaryMaterial, poseCanary, rockGeometry, ROCK_VARIANTS, campGeometry, campLayout, reedGeometry, POSE_T } from '../fx/CanaryModel.js';
import { BLOCK, CANARIES_FROM_GEN } from '../world/Terrain.js';
import { FarShape } from '../core/FarShape.js';
import { crowdStep, crowdNear } from './CrowdSources.js';
import { BODY_R } from './Crowd.js';
import { registerKind } from './CreatureImpact.js';
import { newUid } from './ItemTypes.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
const wrap = (a) => { a = (a + Math.PI) % TAU; return a < 0 ? a + Math.PI : a - Math.PI; };
const r2 = (x) => Math.round(x * 100) / 100;
const rnd = (a, b) => a + Math.random() * (b - a);
/** Mode names ↔ numbers for the network. */
const MODES = ['idle', 'walk', 'run', 'sit', 'lift', 'carry', 'windup', 'throw', 'shove', 'flinch', 'dead', 'roar'];
const MODE_NO = Object.fromEntries(MODES.map((m, i) => [m, i]));
const ENEMY_KINDS = new Set(['player', 'man', 'animal', 'zombie', 'snowman', 'iceMonster', 'skeleton', 'servant']);
const FIRE_KINDS = new Set(['Inferno', 'Fire', 'FireMaxima', 'Hellfire', 'fire']);
const COLD_KINDS = new Set(['Ice', 'IceDuel', 'Frozen', 'chill', 'cold', 'IceBall', 'Snowman']);
const KILL_KINDS = new Set(['Avada', 'AvadaKedavra', 'Inspirius', 'TotalDestruction']);
const DMG_K = { melee: 1, fist: 0.4, punch: 0.4, arrow: 1, Bombardo: 1, BombardoMaxima: 2, Lightning: 1, crush: 1 };

export class Canaries {
    constructor(game) {
        this.game = game;
        this.list = []; // live and lying (dead, not yet taken away) canaries
        this.byIdMap = new Map();
        this.camps = new Map(); // 'gx,gz' → the loaded camp
        this.cells = new Map(); // 'gx,gz' → the found camp's place {gx, gz, x, z, top, seed} | null (looked: none) | 'wait' (its land is not made yet)
        this._scan = new Map(); // 'gx,gz' → {k} the candidate being looked at
        this.rocks = new Map(); // id → rock
        this.shots = []; // boulders in the air
        this._gone = new Set(); // killed in this session (stay dead when their camp is loaded again)
        this._aroundT = 0; this._sendT = 0; this._tick = 0; this._thrownN = 0;
        this._buf = []; this._buf2 = [];
        this.enabled = true;
        this._rockMeshes = null;
        this._clock = 0;
    }

    get active() { return (this.game.gen ?? 1) >= CANARIES_FROM_GEN; }
    get auth() { return this.game.authority !== false; }
    byId(id) { return this.byIdMap.get(id) || null; }
    targets() { return this._targets || (this._targets = []); }
    get _terr() { return this.game.terrain?.data || null; }

    // ============================================================ where they live
    _water(t, x, z) { const top = t.topLayer(x, z); return t.get(x, top + 1, z) === BLOCK.WATER; }
    /**
     * Is (x, z) a good place for a camp's fire? → {x, z, top} | null (no) | 'wait' (the land is not made yet). A flat bit of grass / dirt / sand with lake water round it
     * (at 7…11 m: ≥ SHORE_MIN of 24 places wet, ≥ LAND_MIN dry), not in a town, on an island or near the start.
     */
    _shoreSpot(t, x, z) {
        const X = Math.round(x), Z = Math.round(z);
        if (Math.hypot(X, Z) < C.START_FREE) return null;
        const pts = [[X, Z]];
        const rings = [], K = 12;
        for (const R of C.SHORE_R) for (let k = 0; k < K; k++) { const a = (k / K) * TAU + (R > 8 ? 0.26 : 0); rings.push([X + Math.round(Math.cos(a) * R), Z + Math.round(Math.sin(a) * R)]); }
        for (const q of [...pts, ...rings]) if (t.landMade && !t.landMade(q[0], q[1])) return 'wait';
        const top = t.topLayer(X, Z), b = t.get(X, top, Z);
        if (b !== BLOCK.GRASS && b !== BLOCK.DIRT && b !== BLOCK.SAND) return null;
        if (t.get(X, top + 1, Z) !== BLOCK.AIR) return null;
        if ((t.sites || t.castles)?.landAt?.(X, Z) || t.isIsland?.(X, Z)) return null;
        let wet = 0, dry = 0, lowest = top;
        for (const [sx, sz] of rings) {
            if (this._water(t, sx, sz)) wet++; else if (Math.abs(t.topLayer(sx, sz) - top) <= 4) dry++;
            lowest = Math.min(lowest, t.topLayer(sx, sz));
        }
        if (wet < C.SHORE_MIN || dry < C.LAND_MIN) return null;
        for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5], [4, 4], [-4, 4], [4, -4], [-4, -4]]) {
            const tt = t.topLayer(X + dx, Z + dz);
            if (Math.abs(tt - top) > C.FLAT || t.get(X + dx, tt + 1, Z + dz) === BLOCK.WATER) return null; // (flat, and dry round the fire)
        }
        return { x: X + 0.5, z: Z + 0.5, top };
    }
    /** Look for the camp of a cell (a few candidates a call). → camp def | null (none) | 'wait'. */
    _findCamp(gx, gz, seed, budget = 3) {
        const t = this._terr, key = gx + ',' + gz;
        if (!campLuck(gx, gz, seed)) return null;
        const S = this._scan.get(key) || { k: 0 };
        this._scan.set(key, S);
        while (S.k < 24 && budget-- > 0) {
            const [x, z] = campCandidate(gx, gz, seed, S.k);
            const r = this._shoreSpot(t, x, z);
            if (r === 'wait') return 'wait';
            S.k++;
            if (r) { this._scan.delete(key); return { gx, gz, x: r.x, z: r.z, top: r.top, seed: Math.floor(hash(gx, gz, seed, 900) * 8) }; }
        }
        if (S.k >= 24) { this._scan.delete(key); return null; }
        return 'wait';
    }

    /** The cells round the players: found, loaded, put away. */
    _around(me) {
        const g = this.game, t = this._terr;
        if (!t || !this.active) return;
        const seed = g.seed || 1, CELL = C.CELL, R = C.LOAD + CELL * 0.5;
        const people = [me];
        for (const r of g.remotes?.values?.() || []) if (r.position && !r.dead) people.push(r.position);
        // put away the far ones (no player within KEEP of the fire)
        for (const [key, camp] of this.camps) {
            if (!people.some((q) => Math.hypot(q.x - camp.x, q.z - camp.z) < C.KEEP)) { this._unloadCamp(camp); this.camps.delete(key); }
        }
        // look at one new cell a call (a few candidates): 'wait' while its land is being made
        let looked = 0;
        for (const q of people) {
            const gx0 = Math.floor((q.x - R) / CELL), gx1 = Math.floor((q.x + R) / CELL), gz0 = Math.floor((q.z - R) / CELL), gz1 = Math.floor((q.z + R) / CELL);
            for (let gz = gz0; gz <= gz1 && looked < 1; gz++) for (let gx = gx0; gx <= gx1 && looked < 1; gx++) {
                const key = gx + ',' + gz, have = this.cells.get(key);
                if (have !== undefined && have !== 'wait') continue; // (looked at already: a camp, or none)
                looked++;
                this.cells.set(key, this._findCamp(gx, gz, seed));
            }
        }
        // load the found ones that a player is near
        for (const [key, def] of this.cells) {
            if (!def || def === 'wait' || this.camps.has(key)) continue;
            if (!people.some((q) => Math.hypot(q.x - def.x, q.z - def.z) < C.LOAD)) continue;
            if (t.landMade && !t.landMade(Math.round(def.x), Math.round(def.z))) continue;
            this.camps.set(key, this._loadCamp(def));
        }
    }

    // ============================================================ camps
    _ground(x, z) { return this.game.collision?.groundY?.(x, z) ?? 0; }
    /** Make a camp: its props, its people, its boulders. */
    _loadCamp(def) {
        const g = this.game, seed = g.seed || 1;
        const camp = { key: def.gx + ',' + def.gz, def, x: def.x, z: def.z, y: this._ground(def.x, def.z), members: [], rocks: [], boxes: [], root: new THREE.Group(), alert: 0, fleeT: 0, calmT: 0, grudge: null, rockT: 0, leaderDown: false };
        camp.root.position.set(def.x, camp.y - 0.05, def.z);
        const props = new THREE.Mesh(campGeometry(def.seed), propsMaterial());
        props.castShadow = true; props.frustumCulled = false;
        camp.root.add(props);
        // reeds and cattails on the water side
        const reeds = new THREE.InstancedMesh(reedGeometry(), reedMaterial(), 16);
        let n = 0;
        for (let k = 0; k < 40 && n < 16; k++) {
            const a = hash(def.gx, def.gz, seed, 500 + k) * TAU, d = 8 + hash(def.gz, def.gx, seed, 520 + k) * 12, x = def.x + Math.sin(a) * d, z = def.z + Math.cos(a) * d;
            const t = this._terr;
            if (!t || (t.landMade && !t.landMade(Math.round(x), Math.round(z)))) continue;
            const top = t.topLayer(Math.round(x), Math.round(z));
            if (t.get(Math.round(x), top + 1, Math.round(z)) === BLOCK.WATER) continue; // (not in the lake: at its edge)
            let wetNear = false;
            for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (this._water(t, Math.round(x) + dx, Math.round(z) + dz)) { wetNear = true; break; }
            if (!wetNear) continue;
            _m.compose(_p.set(x - def.x, this._ground(x, z) - camp.y + 0.05, z - def.z), _q.setFromAxisAngle(_v.set(0, 1, 0), a * 7), _s.setScalar(0.8 + 0.5 * hash(k, def.gx, seed, 540)));
            reeds.setMatrixAt(n++, _m);
        }
        reeds.count = n; reeds.frustumCulled = false;
        camp.root.add(reeds); camp.reeds = reeds;
        g.scene.add(camp.root);
        // the tents and totems stop walkers (their numbers: campLayout — the same that draw them)
        const lay = campLayout(def.seed, 22);
        const box = (x, z, hw, h) => { const id = g.collision?.addBox?.({ minX: x - hw, maxX: x + hw, minY: camp.y, maxY: camp.y + h, minZ: z - hw, maxZ: z + hw, kind: 'tree', noSupport: true }); if (id != null) camp.boxes.push(id); };
        for (const tn of lay.tents) box(def.x + tn.x, def.z + tn.z, tn.r * 0.8, tn.h);
        for (const to of lay.totems) box(def.x + to.x, def.z + to.z, 0.3, 3.4);
        // the people
        for (const m of campMembers(def, seed)) {
            if (this._gone.has(m.id)) continue;
            const c = this._makeCanary(camp, m);
            camp.members.push(c);
        }
        for (const rk of campRocks(def, seed)) this._addRock(camp, rk.id, rk.x, rk.z, rk.r, rk.v, rk.yaw);
        return camp;
    }
    _unloadCamp(camp) {
        const g = this.game;
        for (const c of [...camp.members]) this._removeCanary(c);
        for (const rk of [...camp.rocks]) this._removeRock(rk);
        for (const id of camp.boxes) g.collision?.removeBox?.(id);
        g.scene.remove(camp.root);
        camp.root.traverse((o) => { if (o.isInstancedMesh) o.dispose?.(); });
        this.shots = this.shots.filter((s) => s.camp !== camp);
    }

    _makeCanary(camp, m) {
        const g = this.game, look = canaryLook(m.look), model = canaryModel(look);
        const y = this._ground(m.x, m.z);
        model.position.set(m.x, y, m.z);
        const yaw = Math.atan2(-(camp.x - m.x), -(camp.z - m.z)); // (facing the fire)
        model.rotation.y = yaw;
        g.scene.add(model);
        const c = {
            id: m.id, ck: 'N', camp, i: m.i, leader: m.leader, isCanary: true, model, group: model, look, hp: C.HP, maxHp: C.HP, dead: false, deadT: 0,
            mode: 'idle', st: 'idle', t: 0, stT: 0, walk: Math.random() * TAU, speed: 0, breath: Math.random() * 10, headYaw: 0, headT: 0,
            target: null, rock: null, cool: rnd(0.5, 2.5), damageCooldown: 0, stun: 0, burnT: 0, frozenT: 0, flee: null, wander: null, wanderT: rnd(1, 6), talkT: rnd(...C.TALK_EVERY),
            vy: 0, pitch: 0.9 + 0.2 * hash(m.look, 3, 5, 6), net: null, lastHit: null, farT: 0, units: 1,
        };
        c.bodyCapsule = (cap) => { cap.a.set(model.position.x, model.position.y + 0.3, model.position.z); cap.b.set(model.position.x, model.position.y + 1.9 * look.size, model.position.z); cap.r = 0.55 * look.size; return cap; };
        Object.defineProperty(c, 'isDead', { get() { return this.dead; } });
        model.userData.canary = c;
        this.list.push(c); this.byIdMap.set(c.id, c);
        return c;
    }
    _removeCanary(c) {
        const g = this.game;
        this._dropRock(c, false);
        c.far?.dispose?.();
        g.scene.remove(c.model);
        this.list.splice(this.list.indexOf(c), 1); this.byIdMap.delete(c.id);
        const k = c.camp?.members.indexOf(c);
        if (k >= 0) c.camp.members.splice(k, 1);
        if (g.imperius?.release) g.imperius.release('ca', c);
    }

    // ============================================================ boulders
    _addRock(camp, id, x, z, r, v, yaw) {
        const rock = { id, camp, x, y: this._ground(x, z) + r * 0.7, z, r, v: v % ROCK_VARIANTS, yaw, state: 'rest', holder: null, box: null, claim: null, rx: 0, rz: 0, thrown: false, at: 0 };
        this.rocks.set(id, rock); camp?.rocks.push(rock);
        this._box(rock);
        return rock;
    }
    _box(rock) {
        if (rock.box != null) return;
        const g = this.game, h = rock.r * 0.8;
        rock.box = g.collision?.addBox?.({ minX: rock.x - h, maxX: rock.x + h, minY: rock.y - rock.r * 0.7, maxY: rock.y + rock.r * 0.55, minZ: rock.z - h, maxZ: rock.z + h, kind: 'tree', noSupport: true }) ?? null;
    }
    _unbox(rock) { if (rock.box != null) { this.game.collision?.removeBox?.(rock.box); rock.box = null; } }
    _removeRock(rock) {
        this._unbox(rock);
        this.rocks.delete(rock.id);
        const k = rock.camp?.rocks.indexOf(rock);
        if (k >= 0) rock.camp.rocks.splice(k, 1);
        this.shots = this.shots.filter((s) => s.rock !== rock);
        for (const c of this.list) { if (c.rock === rock) c.rock = null; }
    }
    /** The nearest boulder lying free within `reach` of (x, z), inside the leash of the camp. */
    _nearestRock(c, reach = C.ROCK_FETCH) {
        const p = c.model.position;
        let best = null, bd = reach * reach;
        for (const rk of c.camp.rocks) {
            if (rk.state !== 'rest' || (rk.claim && rk.claim !== c.id && this.byIdMap.get(rk.claim) && !this.byIdMap.get(rk.claim).dead)) continue;
            if (Math.hypot(rk.x - c.camp.x, rk.z - c.camp.z) > C.LEASH) continue;
            const d = (rk.x - p.x) ** 2 + (rk.z - p.z) ** 2;
            if (d < bd) { bd = d; best = rk; }
        }
        return best;
    }
    _dropRock(c, send = true) {
        const rk = c.rock;
        if (!rk) return;
        c.rock = null; rk.holder = null; rk.claim = null;
        if (rk.state === 'held') {
            rk.state = 'rest';
            rk.x = c.model.position.x - Math.sin(c.model.rotation.y) * 0.9; rk.z = c.model.position.z - Math.cos(c.model.rotation.y) * 0.9;
            rk.y = this._ground(rk.x, rk.z) + rk.r * 0.7;
            this._box(rk);
        }
        void send;
    }

    // ============================================================ the people the camp can see
    _people(out) {
        const g = this.game;
        out.length = 0;
        const seen = (id, p) => (g.invis ? g.invis.aiPos(id, p) : p);
        if (!g.isDeadLocal && !g.combat?.dead) { const p = seen(g.localId, g.character.group.position); if (p) out.push({ kind: 'player', id: g.localId, x: p.x, y: p.y - 1.2, z: p.z, vx: g.character.velocity?.x || 0, vz: g.character.velocity?.z || 0 }); }
        for (const [id, r] of g.remotes || []) { if (r.dead || !r.position) continue; const p = seen(id, r.position); if (p) out.push({ kind: 'player', id, x: p.x, y: p.y - 1.2, z: p.z, vx: 0, vz: 0 }); }
        return out;
    }
    /** (host) The trespassers of a camp: players and creatures within the territory (and whoever struck it, within sight), nearest to the fire first. */
    _trespassers(camp, people, out) {
        const g = this.game;
        out.length = 0;
        for (const q of people) if (Math.hypot(q.x - camp.x, q.z - camp.z) <= C.TERR_R || (camp.grudge?.id === q.id && camp.grudge.t > 0 && Math.hypot(q.x - camp.x, q.z - camp.z) <= C.SIGHT_R)) out.push(q);
        const list = crowdNear(g, camp.x, camp.y, camp.z, C.TERR_R, null, 5, this._buf2);
        for (const b of list) {
            if (!ENEMY_KINDS.has(b.kind) || b.kind === 'player') continue;
            const o = b.ref;
            if (!o || o.dead || o.isDead || o.rider || o.fly || o.isCanary || o.lev) continue;
            out.push({ kind: b.kind, id: o.id, x: b.x, y: b.y + (b.kind === 'man' ? 1.4 : 0.8), z: b.z, vx: b.vx || 0, vz: b.vz || 0, ref: o });
        }
        out.sort((a, b) => (a.x - camp.x) ** 2 + (a.z - camp.z) ** 2 - ((b.x - camp.x) ** 2 + (b.z - camp.z) ** 2));
        return out;
    }

    // ============================================================ frame
    update(dt) {
        if (!this.enabled || !this.active) return;
        const g = this.game, me = g.character.group.position;
        this._clock += dt; this._tick++;
        this._aroundT -= dt;
        if (this._aroundT <= 0) { this._aroundT = 0.4; this._around(me); }
        const targets = this._targets || (this._targets = []);
        targets.length = 0;
        let people = null;
        const trespass = this._tres || (this._tres = []);
        for (const camp of this.camps.values()) {
            if (!camp.members) continue;
            const d = Math.hypot(camp.x - me.x, camp.z - me.z);
            camp.root.visible = d < C.DRAW + 30;
            camp.reeds.visible = camp.root.visible;
            if (this.auth) {
                // (the host's camp mind: who trespasses, and the camp's moods)
                people = people || this._people(this._buf);
                const all = this._trespassers(camp, people, trespass);
                this._campMind(camp, all, dt);
                this._respawnRocks(camp, dt);
            } else { camp.alert = Math.max(0, camp.alert - dt); }
        }
        for (const c of [...this.list]) {
            const p = c.model.position, d = Math.hypot(p.x - me.x, p.z - me.z);
            c.far = c.far || (d < C.DRAW ? this._farOf(c) : null);
            c.model.visible = d < C.DRAW;
            c.damageCooldown = Math.max(0, c.damageCooldown - dt);
            if (c.dead) { this._deadStep(c, dt, d); continue; }
            targets.push(c);
            if (c.imp && g.imperius?.step('ca', c, dt)) { this._animate(c, dt, d); continue; }
            if (this.auth) this._think(c, dt, d); else this._follow(c, dt);
            if (d < C.DRAW) this._animate(c, dt, d);
        }
        this._shotsStep(dt);
        this._drawRocks(me);
        if (this.auth) this._snapshot(dt);
    }

    _farOf(c) {
        const f = new FarShape(c.model);
        c.model.userData.farRadius = 2.6;
        f.set(true);
        return f;
    }

    // ------------------------------------------------------------ the camp's mood (host)
    _campMind(camp, enemies, dt) {
        camp.calmT = Math.max(0, camp.calmT - dt);
        if (camp.grudge) { camp.grudge.t -= dt; if (camp.grudge.t <= 0) camp.grudge = null; }
        const alive = camp.members.filter((m) => !m.dead);
        if (camp.fleeT > 0) { camp.fleeT -= dt; camp.alert = 0; camp.enemies = null; return; }
        if (enemies.length && alive.length) {
            if (camp.alert <= 0 && camp.calmT <= 0) { camp.roar = 0.01; } // (a new alarm: the first to see roars)
            camp.alert = C.FORGET_T;
            camp.enemies = enemies;
        } else {
            camp.alert = Math.max(0, camp.alert - dt);
            if (camp.alert <= 0) camp.enemies = null;
        }
    }
    _respawnRocks(camp, dt) {
        camp.rockT += dt;
        if (camp.rockT < C.ROCK_RESPAWN || camp.alert > 0) return;
        camp.rockT = 0;
        const free = camp.rocks.filter((r) => r.state === 'rest').length;
        if (free >= 4) return;
        const id = 'cr' + camp.def.gx + ',' + camp.def.gz + '.n' + (this._thrownN++);
        const a = Math.random() * TAU, d = 5 + Math.random() * 8;
        this._addRock(camp, id, camp.x + Math.sin(a) * d, camp.z + Math.cos(a) * d, rnd(...C.ROCK_R), Math.floor(Math.random() * 3), a);
        this._send({ op: 'rock', id, x: r2(camp.x + Math.sin(a) * d), z: r2(camp.z + Math.cos(a) * d), cx: camp.def.gx, cz: camp.def.gz });
    }

    // ------------------------------------------------------------ one canary's mind (host)
    _set(c, st, t = 0) { c.st = st; c.stT = t; }
    _face(c, x, z, dt, rate = 7) {
        const want = Math.atan2(-(x - c.model.position.x), -(z - c.model.position.z));
        c.model.rotation.y += wrap(want - c.model.rotation.y) * Math.min(1, dt * rate);
        return Math.abs(wrap(want - c.model.rotation.y));
    }
    /** One walking step towards (gx, gz) (round the others; stopped by walls and the lake). → metres left. */
    _go(c, gx, gz, speed, dt, stopAt = 0.35) {
        const g = this.game, p = c.model.position, t = this._terr;
        const dx = gx - p.x, dz = gz - p.z, d = Math.hypot(dx, dz);
        if (d <= stopAt) { c.speed = 0; return d; }
        const ux = dx / d, uz = dz / d;
        const a = crowdStep(g, c, p, ux, uz, Math.max(0.1, d - stopAt), { r: C.R, speed, dt, look: 3, dy: 2.2, room: (x, z) => !t || !(t.landMade && !t.landMade(Math.round(x), Math.round(z))) && !this._water(t, Math.round(x), Math.round(z)) });
        if (!a) { c.speed = 0; return d; }
        const x0 = p.x, z0 = p.z;
        p.x += a.x * speed * dt; p.z += a.z * speed * dt;
        g.collision?.resolveCylinder?.(p, C.R, p.y, C.H, 1.05);
        if (t && this._water(t, Math.round(p.x), Math.round(p.z))) { p.x = x0; p.z = z0; c.speed = 0; return d; } // (never into the lake)
        const gy = this._ground(p.x, p.z);
        if (gy - p.y > 1.3) { p.x = x0; p.z = z0; c.speed = 0; return d; } // (a ledge too high for its legs)
        p.y += (gy - p.y) * Math.min(1, dt * 10);
        c.speed = Math.hypot(p.x - x0, p.z - z0) / Math.max(dt, 1e-3) / C.RUN;
        c.walk += (Math.hypot(p.x - x0, p.z - z0)) * 4.2; // (a short stride: quick feet)
        c.model.rotation.y += wrap(Math.atan2(-a.x, -a.z) - c.model.rotation.y) * Math.min(1, dt * 7);
        return Math.hypot(gx - p.x, gz - p.z);
    }

    _think(c, dt, d) {
        const g = this.game, camp = c.camp, p = c.model.position;
        c.t += dt; c.stT += dt; c.breath += dt;
        if (c.stun > 0) { c.stun -= dt; c.mode = 'flinch'; c.speed = 0; if (c.stun <= 0) this._set(c, 'idle'); return; }
        if (c.lev || c.imp) return;
        // gravity (thrown up by a blast / a wand)
        const gy = this._ground(p.x, p.z);
        if (c.vy || p.y > gy + 0.05) { c.vy = (c.vy || 0) - C.G * dt; p.y += c.vy * dt; if (p.y <= gy) { p.y = gy; c.vy = 0; } }
        if (c.frozenT > 0) { c.frozenT -= dt; c.mode = 'idle'; c.speed = 0; return; }
        if (c.burnT > 0) { c.burnT -= dt; c.hp -= 2 * dt; if (c.hp <= 0) { this.die(c, 'fire', null); return; } this._flame(c, dt); if (c.st !== 'flee') this._flee(c, 3); }
        c.cool -= dt;
        // the fleeing camp
        if (camp.fleeT > 0 && c.st !== 'flee') this._flee(c, camp.fleeT);
        if (c.st === 'flee') { this._fleeStep(c, dt); return; }
        const enemies = camp.enemies;
        const alert = enemies && camp.alert > 0;
        // the target: the nearest trespasser; every canary its own nearest
        if (alert && ((this._tick + c.i) % 5 === 0 || !c.target)) c.target = this._pick(c, enemies);
        if (!alert) c.target = null;
        switch (c.st) {
            case 'idle': case 'sit': return this._idle(c, dt, alert);
            case 'alert': {
                c.mode = 'roar'; c.speed = 0;
                if (c.target) this._face(c, c.target.x, c.target.z, dt, 9);
                if (c.stT >= POSE_T.ROAR) this._set(c, 'fetch');
                return;
            }
            case 'fetch': return this._fetch(c, dt);
            case 'lift': return this._lift(c, dt);
            case 'carry': return this._carry(c, dt);
            case 'windup': return this._windup(c, dt);
            case 'throw': return this._throwStep(c, dt);
            case 'shove': return this._shove(c, dt);
            case 'recover': {
                c.mode = 'idle'; c.speed = 0;
                if (c.target) this._face(c, c.target.x, c.target.z, dt, 5);
                if (c.stT >= c.coolFor) this._set(c, c.target ? 'fetch' : 'idle');
                return;
            }
            default: this._set(c, 'idle');
        }
    }
    _pick(c, enemies) {
        const p = c.model.position;
        let best = null, bd = 1e9;
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (Math.hypot(e.x - c.camp.x, e.z - c.camp.z) > C.SIGHT_R) continue;
            const dd = Math.hypot(e.x - p.x, e.z - p.z) - (e.kind === 'player' ? 6 : 0); // (a player first)
            if (dd < bd) { bd = dd; best = e; }
        }
        return best;
    }

    _idle(c, dt, alert) {
        const p = c.model.position, camp = c.camp;
        if (alert && c.target) {
            this._set(c, 'alert'); c.mode = 'roar';
            if (camp.roar !== undefined || Math.random() < 0.5) { camp.roar = undefined; this._voice(c, 'grr', 1); }
            return;
        }
        // calm: sit, mutter, wander a few steps round the fire
        c.talkT -= dt;
        if (c.talkT <= 0) { c.talkT = rnd(...C.TALK_EVERY); if (!c.target) this._voice(c, 'mutter', 0.55); }
        if (c.wander) {
            const left = this._go(c, c.wander.x, c.wander.z, C.WALK, dt, 0.5);
            c.mode = c.speed > 0.05 ? 'walk' : 'idle';
            if (left < 0.6 || c.stT > 9) { c.wander = null; this._set(c, 'idle'); c.wanderT = rnd(3, 9); }
            return;
        }
        c.speed = 0;
        c.wanderT -= dt;
        c.mode = c.sitting ? 'sit' : 'idle';
        // look about now and then (the head turns, the body does not)
        c.headT -= dt; if (c.headT <= 0) { c.headT = rnd(1.5, 4); c.headYaw = rnd(-0.9, 0.9); }
        if (c.wanderT <= 0) {
            c.sitting = !c.sitting && Math.random() < 0.35;
            c.wanderT = rnd(4, 10);
            if (!c.sitting && Math.random() < 0.7) {
                const a = Math.random() * TAU, dd = 3 + Math.random() * 6;
                c.wander = { x: camp.x + Math.sin(a) * dd, z: camp.z + Math.cos(a) * dd };
                if (!this._free(c.wander.x, c.wander.z)) c.wander = null; else this._set(c, 'idle', 0);
            }
        }
        if (!c.wander && !c.sitting) this._face(c, camp.x, camp.z, dt, 2); // (the fire)
    }
    /** Is (x, z) dry ground we may stand on? */
    _free(x, z) { const t = this._terr; return !t || ((!t.landMade || t.landMade(Math.round(x), Math.round(z))) && !this._water(t, Math.round(x), Math.round(z))); }

    _fetch(c, dt) {
        const p = c.model.position, tg = c.target;
        if (!tg) { this._dropRock(c); return this._set(c, 'idle'); }
        const dT = Math.hypot(tg.x - p.x, tg.z - p.z);
        // close up: a punch
        if (dT <= C.SHOVE.REACH * 0.85 && c.cool <= 0 && !c.rock) { this._set(c, 'shove'); c.shoved = false; return; }
        if (c.rock) return this._set(c, 'carry');
        if (!c.wantRock || c.wantRock.state !== 'rest' || (c.wantRock.claim && c.wantRock.claim !== c.id)) {
            c.wantRock = this._nearestRock(c);
            if (c.wantRock) c.wantRock.claim = c.id;
        }
        const rk = c.wantRock;
        if (!rk) { // no boulder: charge the trespasser and punch (never leaving the leash)
            if (Math.hypot(tg.x - c.camp.x, tg.z - c.camp.z) > C.TERR_R) { c.mode = 'idle'; c.speed = 0; this._face(c, tg.x, tg.z, dt); return; }
            this._go(c, tg.x, tg.z, C.RUN * 0.8, dt, C.SHOVE.REACH * 0.7);
            c.mode = c.speed > 0.05 ? 'run' : 'idle';
            return;
        }
        const left = this._go(c, rk.x, rk.z, C.RUN * 0.75, dt, rk.r + 0.7);
        c.mode = c.speed > 0.05 ? 'run' : 'idle';
        if (left <= rk.r + 0.95 || c.stT > 12) {
            if (c.stT > 12) { rk.claim = null; c.wantRock = null; this._set(c, 'idle'); return; }
            c.mode = 'lift'; this._set(c, 'lift'); c.speed = 0; this._voice(c, 'lift', 0.7);
        }
    }
    _lift(c, dt) {
        const rk = c.wantRock;
        c.mode = 'lift'; c.speed = 0;
        if (!rk || rk.state !== 'rest' && rk.holder !== c) { this._set(c, 'idle'); return; }
        this._face(c, rk.x, rk.z, dt, 10);
        if (c.stT >= C.LIFT_T * 0.45 && rk.holder !== c) { rk.holder = c; rk.state = 'held'; c.rock = rk; this._unbox(rk); }
        if (c.stT >= C.LIFT_T) { c.wantRock = null; this._set(c, 'carry'); }
    }
    _carry(c, dt) {
        const p = c.model.position, tg = c.target, camp = c.camp;
        if (!c.rock) return this._set(c, 'fetch');
        if (!tg) { this._dropRock(c); this._set(c, 'idle'); return; }
        const dT = Math.hypot(tg.x - p.x, tg.z - p.z);
        const from = this._holdPoint(c, _w);
        const lo = C.THROW_RANGE[0], hi = C.THROW_RANGE[1] - 4; // (it throws from 5…16 m: a flatter arc, well inside its reach)
        if (dT < lo) { // too close for a throw: a punch (the rock is dropped at the feet)
            this._dropRock(c); this._set(c, 'shove'); c.shoved = false; return;
        }
        // keep within the camp's leash: a target outside the territory is only thrown at from inside it
        const away = Math.hypot(p.x - camp.x, p.z - camp.z) > C.LEASH;
        c.mode = 'carry';
        if (dT > hi || away || !this._clear(from, tg)) {
            const gx = away ? camp.x : tg.x, gz = away ? camp.z : tg.z;
            this._go(c, gx, gz, C.CARRY, dt, away ? 3 : hi * 0.8);
            c.mode = 'carry';
            if (c.stT > 14) { this._dropRock(c); this._set(c, 'idle'); }
            return;
        }
        c.speed = 0;
        const off = this._face(c, tg.x, tg.z, dt, 9);
        if (off < 0.28 && c.cool <= 0) { this._set(c, 'windup'); }
    }
    /** The line from the boulder in hand to the target is not blocked by the ground or walls (sampled). */
    _clear(from, tg) {
        const t = this._terr;
        if (!t) return true;
        const n = 8;
        for (let k = 1; k < n; k++) {
            const f = k / n, x = from.x + (tg.x - from.x) * f, z = from.z + (tg.z - from.z) * f, y = from.y + (tg.y - from.y) * f + 1.2 * Math.sin(Math.PI * f) * Math.min(4, Math.hypot(tg.x - from.x, tg.z - from.z) / 5);
            if (t.landMade && !t.landMade(Math.round(x), Math.round(z))) return true;
            const b = t.get(Math.round(x), Math.round(y), Math.round(z));
            if (b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.LEAVES && b !== undefined) return false;
        }
        return true;
    }
    _windup(c, dt) {
        const tg = c.target;
        c.mode = 'windup'; c.speed = 0;
        if (!c.rock) return this._set(c, 'fetch');
        if (!tg) { this._dropRock(c); this._set(c, 'idle'); return; }
        this._face(c, tg.x, tg.z, dt, 10);
        if (c.stT >= C.WIND_T) { this._set(c, 'throw'); c.released = false; }
    }
    _throwStep(c, dt) {
        const tg = c.target;
        c.mode = 'throw'; c.speed = 0;
        if (tg) this._face(c, tg.x, tg.z, dt, 12);
        if (!c.released && c.stT >= C.THROW_T * C.RELEASE_AT && c.rock) {
            c.released = true;
            this._release(c, tg);
        }
        if (c.stT >= C.THROW_T) { c.coolFor = rnd(...C.COOL); c.cool = c.coolFor; this._set(c, 'recover'); }
    }
    _shove(c, dt) {
        const tg = c.target, S = C.SHOVE;
        c.mode = 'shove'; c.speed = 0;
        if (tg) this._face(c, tg.x, tg.z, dt, 12);
        if (!c.shoved && c.stT >= S.T * S.HIT_AT) {
            c.shoved = true;
            if (tg) this._punch(c, tg);
        }
        if (c.stT >= S.T) { c.cool = S.COOL; c.coolFor = S.COOL; this._set(c, 'recover'); }
    }

    // ------------------------------------------------------------ the throw
    /** World point of the boulder held (the hold object under the torso). */
    _holdPoint(c, out) {
        const h = c.model.userData.hold;
        c.model.updateWorldMatrix(true, true);
        return h.getWorldPosition(out);
    }
    _release(c, tg) {
        const g = this.game, rk = c.rock;
        if (!rk) return;
        this._holdPoint(c, _p);
        const from = { x: _p.x, y: _p.y, z: _p.z };
        const to = tg ? { x: tg.x, y: tg.y + 0.4, z: tg.z } : { x: from.x - Math.sin(c.model.rotation.y) * 14, y: from.y - 1.5, z: from.z - Math.cos(c.model.rotation.y) * 14 };
        const dist = Math.hypot(to.x - from.x, to.z - from.z);
        // a little error that grows with the distance (a sidestep still dodges the shot)
        const sp = spreadAt(dist), ang = Math.random() * TAU, er = Math.random() * sp;
        to.x += Math.cos(ang) * er; to.z += Math.sin(ang) * er;
        const sol = solveThrow(from, to, C.THROW_SPEED, C.G, tg ? { x: tg.vx || 0, z: tg.vz || 0 } : null, 0.85);
        c.rock = null; rk.holder = null; rk.claim = null;
        this._launch(rk, from, { x: sol.vx, y: sol.vy, z: sol.vz }, c.id);
        this._voice(c, 'ha', 1);
        this._send({ op: 'throw', by: c.id, rock: rk.id, p: [r2(from.x), r2(from.y), r2(from.z)], v: [r2(sol.vx), r2(sol.vy), r2(sol.vz)], cx: rk.camp?.def.gx, cz: rk.camp?.def.gz, r: rk.r, rv: rk.v });
    }
    _launch(rk, p, v, by) {
        rk.state = 'fly'; rk.holder = null; this._unbox(rk);
        rk.x = p.x; rk.y = p.y; rk.z = p.z;
        this.shots.push({ rock: rk, camp: rk.camp, x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, by, age: 0, hitMe: false, spin: Math.random() * 6 - 3, from: new THREE.Vector3(p.x, p.y, p.z) });
        this.game.sound?.playCanary?.(_p.set(p.x, p.y, p.z), 'whoosh', 0.7);
    }

    /** Fly the boulders (every computer: the same shot; the player of this computer takes the hits meant for him, the host decides for the rest). */
    _shotsStep(dt) {
        const g = this.game, t = this._terr;
        for (let i = this.shots.length - 1; i >= 0; i--) {
            const s = this.shots[i], rk = s.rock;
            if (!this.rocks.has(rk.id)) { this.shots.splice(i, 1); continue; }
            const n = Math.max(1, Math.ceil(Math.hypot(s.vx, s.vy, s.vz) * dt / 0.4));
            let landed = false;
            for (let k = 0; k < n && !landed; k++) {
                const h = dt / n;
                s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h; s.vy -= C.G * h;
                rk.x = s.x; rk.y = s.y; rk.z = s.z; rk.rx += s.spin * h; rk.rz += s.spin * 0.6 * h;
                s.age += h;
                if (this._shotHitMe(s)) { landed = 'me'; break; }
                if (this.auth && this._shotHitCreature(s)) { landed = 'body'; break; }
                if (t && (!t.landMade || t.landMade(Math.round(s.x), Math.round(s.z)))) {
                    const gy = this._ground(s.x, s.z);
                    const blk = t.get(Math.round(s.x), Math.round(s.y), Math.round(s.z));
                    if (blk === BLOCK.WATER || (this._water(t, Math.round(s.x), Math.round(s.z)) && s.y - rk.r < t.topLayer(Math.round(s.x), Math.round(s.z)) + 1.4)) { landed = 'water'; break; }
                    if (s.y - rk.r * 0.7 <= gy || (blk !== BLOCK.AIR && blk !== BLOCK.LEAVES && blk !== undefined)) { landed = 'ground'; break; }
                }
                if (s.age > 7) { landed = 'ground'; break; }
            }
            if (landed) { this.shots.splice(i, 1); this._land(s, landed); }
        }
    }
    /** (every computer) Did the shot reach my player? */
    _shotHitMe(s) {
        const g = this.game, c = g.combat;
        if (s.hitMe || g.isDeadLocal || c?.dead || !g.character) return false;
        const me = g.character.group.position, rk = s.rock;
        // the body: a vertical capsule from the feet (2.0 under the eyes) to just over the head
        const yb = me.y - 2.0, yt = me.y + 0.5, cy = Math.max(yb, Math.min(yt, s.y));
        const d = Math.hypot(me.x - s.x, cy - s.y, me.z - s.z);
        if (d > rk.r + 0.55) return false;
        if (g.invis?.isInvisible?.(g.localId) && false) return false;
        s.hitMe = true;
        const from = _v.set(s.from.x, s.from.y, s.from.z);
        // a «Protection» facing it holds it: a physical shot, no mana, no special effect
        if (c?.shieldFactor?.(from) >= 1) { c._blocked?.(from, 'rock'); this.game.sound?.playCanary?.(_p.set(s.x, s.y, s.z), 'thud', 0.9); s.vx *= -0.2; s.vz *= -0.2; return 'blocked'; }
        if (c?.enabled) c.damage(C.DMG, null, 'rock'); else g.damageLocalPlayer?.(C.DMG);
        const dir = _w.set(s.vx, 0, s.vz).normalize();
        const push = dir.clone().multiplyScalar(C.PUSH).setY(3.5);
        if (g.impact) g.impact.apply({ v: push, from: from.clone(), by: null, kind: 'rock', noShield: true });
        else g.knockback?.add?.(push);
        g.hud?.setVoice?.(`🪨 Канарик попал в вас валуном: −${C.DMG}`, true);
        g.sound?.playCanary?.(_p.set(s.x, s.y, s.z), 'hit', 1);
        s.vx *= 0.1; s.vz *= 0.1;
        return 'me';
    }
    /** (host) Did the shot reach a creature (not a canary, not a player: players decide for themselves)? */
    _shotHitCreature(s) {
        const g = this.game, rk = s.rock;
        const list = crowdNear(g, s.x, s.y, s.z, rk.r + 1.6, null, 3.5, this._buf2);
        for (const b of list) {
            if (b.kind === 'player' || b.kind === 'plant' || b.kind === 'ward' || b.kind === 'canary' || b.kind === 'carriage') continue;
            const o = b.ref;
            if (!o || o.dead || o.isDead || o.isCanary) continue;
            const ty = b.y;
            const top = ty + (b.kind === 'man' ? 3.2 : b.kind === 'animal' ? 1.8 * (o.group?.scale?.y || 1) : 2.6);
            if (s.y < ty - rk.r * 0.5 || s.y > top + rk.r) continue;
            if (Math.hypot(b.x - s.x, b.z - s.z) > rk.r + (b.r || 0.6)) continue;
            this._hitCreature(b, o, s);
            return true;
        }
        return false;
    }
    _hitCreature(b, o, s) {
        const g = this.game;
        _w.set(s.vx, 0, s.vz).normalize();
        const push = _w.clone().multiplyScalar(C.PUSH).setY(3);
        if (b.kind === 'animal') g.animals?.hit?.(o, C.DMG, _w, null);
        else if (b.kind === 'zombie') g.damageZombie?.(o, C.DMG, false, _w, null);
        else if (b.kind === 'man') g.castleLife?.hit?.(o, C.DMG, _w, null, { kind: 'rock' });
        else if (b.kind === 'snowman' || b.kind === 'iceMonster') g.iceCastle?.hit?.(o, C.DMG, 'crush', null);
        else if (o.hp !== undefined) o.hp -= C.DMG;
        g.creatureImpact?.apply?.(o, { v: push, by: null, kind: 'rock', from: _v.set(s.from.x, s.from.y, s.from.z).clone() });
        g.sound?.playCanary?.(_p.set(s.x, s.y, s.z), 'hit', 1);
    }
    _land(s, how) {
        const g = this.game, rk = s.rock;
        if (how === 'water') {
            g.sound?.playCanary?.(_p.set(s.x, s.y, s.z), 'thud', 0.6);
            for (let i = 0; i < 10; i++) g.fx?.spark?.(_p.set(s.x, s.y + 0.3, s.z), 0xcfe8f4, 0.14, _w.set((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4), 0.9);
            this._removeRock(rk); // (it sinks into the mud: gone)
            return;
        }
        rk.state = 'rest'; rk.claim = null; rk.thrown = true; rk.at = this._clock;
        // lies where it stopped: on the ground (a hit body: where it fell)
        rk.x = s.x; rk.z = s.z; rk.y = this._ground(s.x, s.z) + rk.r * 0.7;
        this._box(rk);
        g.sound?.playCanary?.(_p.set(rk.x, rk.y, rk.z), 'thud', 1);
        for (let i = 0; i < 8; i++) g.fx?.spark?.(_p.set(rk.x, rk.y, rk.z), 0x8a7a5a, 0.16, _w.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), 0.7);
        this._send({ op: 'land', id: rk.id, x: r2(rk.x), y: r2(rk.y), z: r2(rk.z) });
        this._trimThrown();
    }
    _trimThrown() {
        const thrown = [...this.rocks.values()].filter((r) => r.thrown && r.state === 'rest');
        if (thrown.length <= C.ROCK_MAX_TOTAL) return;
        thrown.sort((a, b) => a.at - b.at);
        for (const r of thrown.slice(0, thrown.length - C.ROCK_MAX_TOTAL)) this._removeRock(r);
    }

    /** A punch: a player is hurt on his own computer (the host tells it), a creature here. */
    _punch(c, tg) {
        const g = this.game, S = C.SHOVE;
        const p = c.model.position;
        const d = Math.hypot(tg.x - p.x, tg.z - p.z);
        if (d > S.REACH + 0.6) return;
        this._voice(c, 'ha', 0.9);
        _w.set(tg.x - p.x, 0, tg.z - p.z).normalize();
        if (tg.kind === 'player') this._hurtPlayer(tg.id, S.DMG, [_w.x * S.PUSH, 3.5, _w.z * S.PUSH], [p.x, p.y + 1, p.z]);
        else if (tg.ref) this._hitCreature({ kind: tg.kind }, tg.ref, { vx: _w.x, vz: _w.z, from: p, x: tg.x, y: tg.y, z: tg.z });
    }
    _hurtPlayer(id, dmg, v, from) {
        const g = this.game;
        if (id === g.localId) { this._hurtMe(dmg, v, from); return; }
        this._send({ op: 'hurt', to: id, dmg, v, f: from.map(r2) });
    }
    _hurtMe(dmg, v, from) {
        const g = this.game, c = g.combat;
        if (!c || c.dead || g.isDeadLocal) return;
        const f = _v.set(from[0], from[1], from[2]);
        if (c.shieldFactor?.(f) >= 1) { c._blocked?.(f, 'rock'); return; }
        if (c.enabled) c.damage(dmg, null, 'canary'); else g.damageLocalPlayer?.(dmg);
        const push = new THREE.Vector3(v[0], v[1], v[2]);
        if (g.impact) g.impact.apply({ v: push, from: f.clone(), by: null, kind: 'canaryPunch', noShield: true }); else g.knockback?.add?.(push);
        g.hud?.setVoice?.(`👊 Канарик ударил кулаком: −${dmg}`, true);
        g.sound?.playCanary?.(f, 'hit', 1);
    }

    // ------------------------------------------------------------ fleeing
    _flee(c, t) {
        this._dropRock(c);
        c.wantRock = null; c.target = null;
        this._set(c, 'flee'); c.fleeT = t;
        // away from the camp's trouble: the way the enemy is NOT (or simply away from the fire at the leash's edge, towards the reeds)
        const camp = c.camp, e = camp.enemies?.[0] || camp.lastEnemy;
        const a = e ? Math.atan2(camp.x - e.x, camp.z - e.z) + (Math.random() - 0.5) * 1.2 : Math.random() * TAU;
        c.flee = { x: camp.x + Math.sin(a) * (C.LEASH * 0.7), z: camp.z + Math.cos(a) * (C.LEASH * 0.7) };
        if (!this._free(c.flee.x, c.flee.z)) c.flee = { x: camp.x - Math.sin(a) * 15, z: camp.z - Math.cos(a) * 15 };
        if (!c._shouted) { c._shouted = true; this._voice(c, 'hurt', 0.6); }
    }
    _fleeStep(c, dt) {
        const camp = c.camp;
        c.fleeT -= dt; c.stT += dt;
        const left = c.flee ? this._go(c, c.flee.x, c.flee.z, C.RUN, dt, 1) : 0;
        c.mode = c.speed > 0.05 ? 'run' : 'idle';
        if (left < 1.5 && c.fleeT > 0 && c.stT > 1) c.flee = { x: camp.x + (Math.random() - 0.5) * 40, z: camp.z + (Math.random() - 0.5) * 40 };
        if (c.fleeT <= 0 && c.burnT <= 0) { c._shouted = false; c.flee = null; this._set(c, 'idle'); c.wander = { x: camp.x + (Math.random() - 0.5) * 6, z: camp.z + (Math.random() - 0.5) * 6 }; camp.calmT = C.CALM_COOL; }
    }
    _flame(c, dt) {
        if (Math.random() > dt * 20) return;
        const p = c.model.position;
        this.game.fx?.spark?.(_p.set(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.5 + Math.random() * 1.5, p.z + (Math.random() - 0.5) * 0.6), [0xff6a14, 0xffc24a, 0xff3a0a][(Math.random() * 3) | 0], 0.16, _w.set((Math.random() - 0.5), 1.5, (Math.random() - 0.5)), 0.6);
    }

    // ------------------------------------------------------------ voices
    _voice(c, kind, vol = 1) {
        this.game.sound?.playCanary?.(_p.copy(c.model.position).setY(c.model.position.y + 1.6), kind, vol, c.pitch);
        if (this.auth && (kind === 'grr' || kind === 'ha')) this._send({ op: 'say', id: c.id, k: kind });
    }

    // ============================================================ looks
    _animate(c, dt, d) {
        c.farT += dt;
        if (c.far && c.farT > 0.5) { c.farT = 0; c.far.check?.(); }
        const step = d > 45 ? 3 : 1;
        if (step > 1 && (this._tick + c.i) % step !== 0) return;
        const m = c.mode;
        const t = m === 'lift' || m === 'windup' || m === 'throw' || m === 'shove' || m === 'roar' || m === 'flinch' || m === 'dead' ? c.stT : 0;
        poseCanary(c.model, { mode: m, t: m === 'dead' ? c.deadT : t, walk: c.walk, speed: Math.min(1.4, c.speed * 1.25 + (m === 'carry' ? 0.25 : 0)), breath: c.breath, look: c.headYaw });
        // the boulder in the hands follows them
        if (c.rock && c.rock.holder === c) {
            const rk = c.rock;
            this._holdPoint(c, _p);
            rk.x = _p.x; rk.y = _p.y; rk.z = _p.z;
        }
    }
    /** A guest's view of a canary: the host's position, mode and numbers (interpolated). */
    _follow(c, dt) {
        const n = c.net;
        c.t += dt; c.stT += dt; c.breath += dt;
        if (!n) return;
        const p = c.model.position, k = Math.min(1, dt * 8);
        const dx = n.x - p.x, dz = n.z - p.z;
        if (dx * dx + dz * dz > 400) { p.x = n.x; p.z = n.z; } else { p.x += dx * k; p.z += dz * k; }
        p.y += (n.y - p.y) * k;
        c.model.rotation.y += wrap(n.yaw - c.model.rotation.y) * k;
        if (c.mode !== n.mode) { c.mode = n.mode; c.stT = n.t; } else if (Math.abs(c.stT - n.t) > 0.35) c.stT = n.t;
        c.speed = n.speed;
        c.walk += Math.hypot(dx, dz) * 0.3 + n.speed * C.RUN * dt * 4.2 * 0.5;
        c.hp = n.hp;
        // the boulder in his hands
        if (n.rock && n.rock !== (c.rock?.id || 0)) { const rk = this.rocks.get(n.rock); if (rk) { c.rock = rk; rk.holder = c; rk.state = 'held'; this._unbox(rk); } }
        if (!n.rock && c.rock && c.rock.state === 'held') { c.rock.holder = null; c.rock = null; }
    }

    _deadStep(c, dt, d) {
        c.deadT += dt; c.stT = c.deadT;
        c.mode = 'dead';
        if (d < C.ANIM) poseCanary(c.model, { mode: 'dead', t: c.deadT, walk: 0, speed: 0, breath: 0, look: 0 });
        if (c.deadT > C.DEATH_T) {
            // (the body is taken: the swamp has it)
            c.model.position.y -= dt * 0.4;
            if (c.deadT > C.DEATH_T + 4) this._removeCanary(c);
        }
    }

    // ============================================================ rocks drawn (3 instanced shapes)
    _drawRocks(me) {
        if (!this._rockMeshes) {
            const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
            this._rockMeshes = [];
            for (let v = 0; v < ROCK_VARIANTS; v++) {
                const m = new THREE.InstancedMesh(rockGeometry(v), mat, 96);
                m.frustumCulled = false; m.castShadow = true; m.count = 0; m.name = 'canaryRocks';
                this.game.scene.add(m); this._rockMeshes.push(m);
            }
        }
        const counts = [0, 0, 0];
        for (const rk of this.rocks.values()) {
            if (Math.hypot(rk.x - me.x, rk.z - me.z) > C.DRAW + 20) continue;
            const m = this._rockMeshes[rk.v];
            if (counts[rk.v] >= 96) continue;
            _e.set(rk.rx || 0, rk.yaw || 0, rk.rz || 0);
            _q.setFromEuler(_e);
            const sc = rk.r / 0.5 * 0.5 * 2; // (the shape is ~1 m across: scaled to the rock's own radius)
            _m.compose(_p.set(rk.x, rk.y, rk.z), _q, _s.setScalar(rk.r * 2));
            m.setMatrixAt(counts[rk.v]++, _m);
            void sc;
        }
        for (let v = 0; v < ROCK_VARIANTS; v++) { this._rockMeshes[v].count = counts[v]; this._rockMeshes[v].instanceMatrix.needsUpdate = true; }
    }

    // ============================================================ hits
    /**
     * A blow / a spell / fire on a canary (any computer: a guest asks the host). `by`: a player's id (the camp turns on them, wherever they are within sight).
     * kind: 'melee' | 'fist' | 'arrow' | a spell's name (Bombardo, Inferno, Avada…) | 'crush' | 'rock'.
     */
    hit(c, dmg, kind = 'melee', by = null) {
        if (!c || c.dead) return;
        if (!this.auth) { this._send({ op: 'hit', id: c.id, dmg: r2(+dmg || 0), kind, by: by || this.game.localId }); this._flinch(c); return; }
        let d = dmg * (DMG_K[kind] ?? 1);
        if (KILL_KINDS.has(kind)) d = c.hp + 1;
        if (COLD_KINDS.has(kind)) { c.frozenT = 4; c.speed = 0; this._flinch(c); this._provoke(c, by); return; }
        if (FIRE_KINDS.has(kind)) { c.burnT = 6; d = Math.max(d, 1); }
        if (!(d > 0)) { this._provoke(c, by); return; }
        c.hp -= d;
        c.lastHit = { by, t: this._clock, kind };
        this._provoke(c, by);
        if (c.hp <= 0) { this.die(c, kind, by); return; }
        this._flinch(c);
    }
    hitAt(pos, radius, dmg, kind, by = null) {
        for (const c of this.list) if (!c.dead && c.model.position.distanceTo(pos) < radius + 1.2) this.hit(c, dmg, kind, by);
    }
    hitRay(org, d, len, width, dmg, kind, by = null) {
        for (const c of this.list) {
            if (c.dead) continue;
            _v.set(c.model.position.x, c.model.position.y + 1.0, c.model.position.z).sub(org);
            const along = _v.dot(d);
            if (along < 0 || along > len) continue;
            if (_v.addScaledVector(d, -along).length() < width + 0.9) this.hit(c, dmg, kind, by);
        }
    }
    /** (any computer) A duel charge reached a canary. */
    boltHit(c, spell, by) {
        if (!c || c.dead) return;
        if (spell === 'AvadaKedavra' || spell === 'Avada') { this.hit(c, 999, 'Avada', by); return; }
        if (spell === 'Stupefy' || spell === 'Expelliarmus' || spell === 'Disarmor') { if (this.auth) { c.stun = Math.max(c.stun, 2.2); this._dropRock(c); this._set(c, 'idle'); this._provoke(c, by); } else this._send({ op: 'bolt', id: c.id, spell, by: by || this.game.localId }); return; }
        this.hit(c, 8, spell, by);
    }
    _flinch(c) { if (c.dead) return; c.stun = Math.max(c.stun, C.HIT_STUN); c.stT = 0; c.mode = 'flinch'; this._dropRock(c); this._voice(c, 'hurt', 0.9); }
    /** (host) The camp learns who struck: it turns on them if they are within sight. */
    _provoke(c, by) {
        const camp = c.camp;
        if (!camp || !this.auth) return;
        const who = by === 'local' ? this.game.localId : by;
        if (who != null) camp.grudge = { id: who, t: 25 };
        camp.alert = C.FORGET_T; camp.fleeT = 0;
        const people = this._people(this._buf);
        camp.enemies = this._trespassers(camp, people, []);
        if (!camp.enemies.length) { const q = people.find((p) => p.id === who && Math.hypot(p.x - camp.x, p.z - camp.z) <= C.SIGHT_R); if (q) camp.enemies = [q]; }
    }
    /** (host) A canary dies: it lies down; hide and bones; the leader's death sends the rest running. */
    die(c, kind = 'melee', by = null) {
        if (c.dead) return;
        const g = this.game, camp = c.camp;
        c.dead = true; c.deadT = 0; c.hp = 0; c.mode = 'dead'; c.speed = 0;
        this._dropRock(c);
        this._gone.add(c.id);
        this._voice(c, 'die', 1);
        c.far?.check?.(true);
        if (this.auth) {
            const at = _v.set(c.model.position.x, c.model.position.y + 1.2, c.model.position.z);
            g.items?.spawnLoose?.({ kind: 'canaryHide', uid: newUid(), count: 1 + (Math.random() < 0.4 ? 1 : 0) }, at.clone(), { vel: _w.set((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2) });
            g.items?.spawnLoose?.({ kind: 'bone', uid: newUid(), count: 1 + Math.floor(Math.random() * 3) }, at.clone(), { vel: _w.set((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2) });
            this._send({ op: 'die', id: c.id });
            if (c.leader && camp) { camp.leaderDown = true; camp.fleeT = C.FLEE_T; for (const m of camp.members) if (!m.dead) this._flee(m, C.FLEE_T); }
            else if (camp && camp.members.filter((m) => !m.dead).length <= 1) { camp.fleeT = C.FLEE_T; for (const m of camp.members) if (!m.dead) this._flee(m, C.FLEE_T); }
            g.mana?.canaryKill?.(by, kind);
        }
        void kind;
    }

    // ============================================================ the network
    _send(m) { const net = this.game.sync?.net; if (net) net.send({ t: 'canary', ...m }, m.op !== 's'); }
    _snapshot(dt) {
        this._sendT -= dt;
        if (this._sendT > 0 || !this.game.sync?.net) return;
        this._sendT = 0.125;
        const g = this.game, me = g.character.group.position, l = [];
        for (const c of this.list) {
            if (c.dead) continue;
            const p = c.model.position;
            if (Math.hypot(p.x - me.x, p.z - me.z) > 160 && ![...(g.remotes?.values?.() || [])].some((r) => r.position && Math.hypot(p.x - r.position.x, p.z - r.position.z) < 160)) continue;
            l.push([c.id, r2(p.x), r2(p.y), r2(p.z), r2(c.model.rotation.y), MODE_NO[c.mode] ?? 0, r2(c.stT), r2(c.speed), Math.round(c.hp), c.rock?.holder === c ? c.rock.id : 0]);
        }
        if (l.length) this._send({ op: 's', l });
    }
    onNet(m, isHost) {
        if (!m) return;
        const g = this.game;
        if (m.op === 's' && !isHost) {
            for (const e of m.l || []) {
                const c = this.byIdMap.get(e[0]); if (!c || c.dead) continue;
                c.net = { x: e[1], y: e[2], z: e[3], yaw: e[4], mode: MODES[e[5]] || 'idle', t: e[6], speed: e[7], hp: e[8], rock: e[9] || 0 };
            }
        } else if (m.op === 'throw' && !isHost) {
            const camp = this.camps.get(m.cx + ',' + m.cz), rk = this.rocks.get(m.rock) || (camp ? this._addRock(camp, m.rock, m.p[0], m.p[2], m.r || 0.5, m.rv || 0, 0) : null);
            if (rk) { const c = this.byIdMap.get(m.by); if (c && c.rock === rk) c.rock = null; rk.holder = null; this._launch(rk, { x: m.p[0], y: m.p[1], z: m.p[2] }, { x: m.v[0], y: m.v[1], z: m.v[2] }, m.by); }
        } else if (m.op === 'land' && !isHost) {
            const rk = this.rocks.get(m.id);
            if (rk) { this.shots = this.shots.filter((s) => s.rock !== rk); rk.state = 'rest'; rk.thrown = true; rk.x = m.x; rk.y = m.y; rk.z = m.z; this._unbox(rk); this._box(rk); }
        } else if (m.op === 'rock' && !isHost) {
            const camp = this.camps.get(m.cx + ',' + m.cz);
            if (camp && !this.rocks.has(m.id)) this._addRock(camp, m.id, m.x, m.z, 0.5, 0, 0);
        } else if (m.op === 'die' && !isHost) {
            const c = this.byIdMap.get(m.id);
            if (c) this.die(c, 'net', null); else this._gone.add(m.id);
        } else if (m.op === 'say' && !isHost) {
            const c = this.byIdMap.get(m.id); if (c) this._voice(c, m.k, 1);
        } else if (m.op === 'hit' && isHost) {
            const c = this.byIdMap.get(m.id); if (c) this.hit(c, +m.dmg || 0, m.kind || 'melee', m.by || null);
        } else if (m.op === 'bolt' && isHost) {
            const c = this.byIdMap.get(m.id); if (c) this.boltHit(c, m.spell, m.by || null);
        } else if (m.op === 'hurt' && m.to === g.localId) {
            this._hurtMe(+m.dmg || 0, m.v || [0, 0, 0], m.f || [0, 0, 0]);
        }
    }

    // ============================================================ the rest
    /** Samples for the shader warm-up (Game.prewarm): a canary, its boulder, the camp's props. */
    sampleModels() {
        const out = [], m = canaryModel(canaryLook(1)); poseCanary(m, { mode: 'carry', walk: 1, speed: 0.5 });
        const far = canaryModel(canaryLook(2)); poseCanary(far, { mode: 'idle' });
        new FarShape(far).set(true); // (as the video card draws a canary in the game: the skinned shader, once, now)
        out.push(m, far);
        const rock = new THREE.Mesh(rockGeometry(0), new THREE.MeshLambertMaterial({ vertexColors: true }));
        const im = new THREE.InstancedMesh(rockGeometry(1), new THREE.MeshLambertMaterial({ vertexColors: true }), 1); im.setMatrixAt(0, _m.identity());
        out.push(rock, im, new THREE.Mesh(campGeometry(0), propsMaterial()));
        const rd = new THREE.InstancedMesh(reedGeometry(), reedMaterial(), 1); rd.setMatrixAt(0, _m.identity()); out.push(rd);
        return out;
    }
    dispose() {
        for (const camp of this.camps.values()) this._unloadCamp(camp);
        this.camps.clear(); this.cells.clear(); this.list.length = 0; this.byIdMap.clear(); this.rocks.clear(); this.shots.length = 0;
        if (this._rockMeshes) for (const m of this._rockMeshes) { this.game.scene.remove(m); m.dispose?.(); }
        this._rockMeshes = null;
    }
}

let _props = null, _reed = null;
function propsMaterial() { return _props || (_props = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); }
function reedMaterial() { return _reed || (_reed = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); }

// pushes, gusts, knockdowns (CreatureImpact): a canary is a heavy creature — it staggers from a strong blow, a big blast throws it; its boulder is dropped
registerKind('N', {
    name: 'canary', faces: -1,
    list: (g) => g.canaries?.list || [],
    get: (g, id) => g.canaries?.byId(id),
    alive: (c) => !c.dead,
    body: () => 'knight',
    centre: (c, out) => out.set(c.model.position.x, c.model.position.y + 1.2, c.model.position.z),
    pivot: (c) => ({ obj: c.model.userData.root, base: 0, lie: 0.4 }),
    head: (c) => c.model.userData.head, arms: (c) => [c.model.userData.armL, c.model.userData.armR], legs: (c) => [c.model.userData.legL, c.model.userData.legR],
    move(g, c, dx, dz) { const p = c.model.position; p.x += dx; p.z += dz; g.collision?.resolveCylinder?.(p, C.R, p.y, C.H, 1.05); },
    toss(g, c, vy) { c.vy = Math.max(c.vy || 0, vy); },
    hold(g, c, t) { c.stun = Math.max(c.stun || 0, t); g.canaries?._dropRock?.(c); c.mode = 'idle'; c.speed = 0; },
    frozen: (c) => c.frozenT > 0,
    struck(g, c, o) { if (o.by) g.canaries?._provoke?.(c, o.by === 'local' ? g.localId : o.by); },
});
BODY_R.canary = C.R;
export { MODES as CANARY_MODES };
