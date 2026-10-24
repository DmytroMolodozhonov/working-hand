/**
 * Plants.js — the plant creatures of the world (rules and numbers: PlantLife.js; the look: fx/PlantModels.js).
 *
 *   Телевильпин        groups of ~5 big red glowing flowers, 0.6× as often as apple trees. Prick whoever stands at one
 *                      (1 HP, once a second per flower) unless the visitor wears a full steel set. Broken → «Листок телевильпина».
 *   Плотоядная голова  groups of 2–5, 0.5× as often as apple trees. See a living thing near → tendrils grab a leg, pull it
 *                      to the jaws, three bites, a swallow. An animal is eaten; a man without armour too (−1 HP a second inside,
 *                      spat out after ~10 s); a breastplate: it tries ~7 s and spits him out; a MAGIC robe: spat out at once.
 *                      Killed → «Головка плотоядной».
 * The host leads (hits, hunger, animals, the other players' fate); every computer decides about ITS OWN player (pricks, bites,
 * the hold inside) from the state the host tells — 'plant' messages. The places of the groups come from the seed (PlantLife),
 * like apple trees: the same on every computer; only worlds of generation ≥ PLANTS_FROM_GEN have them.
 * Cost: a group of flowers is two shapes + one sprite batch; a head is five shapes (stem, two jaws, tendrils, swelling);
 * the tendrils are written by the CPU only near the player (20 Hz while idle). Far groups are not drawn / are put away.
 */
import * as THREE from 'three';
import { BLOCK, PLANTS_FROM_GEN } from '../world/Terrain.js';
import { newUid } from './ItemTypes.js';
import { crowdNear } from './CrowdSources.js';
import {
    PLANT_KINDS, APPLE, EAT, FREEZE, BURN, plantGroupIn, plantId, plantHeight, plantGear, thornsPrick, swallowVerdict,
    plantDamage, FIRE_KINDS, COLD_KINDS, DROP_STACK,
} from './PlantLife.js';
import {
    PLANT_CLOCK, plantMaterials, telewilpinVariant, TELE_VARIANTS, buildLobe, buildHeadStem, bulgeGeometry, VineSet, VINES, HEAD, mergePlaced,
} from '../fx/PlantModels.js';

export const PLANT_RANGE = { LOAD: 170, KEEP: 330, DRAW: 150, ANIM: 90, SIM: 85, IDLE_VINES: 45 };
const STATES = ['idle', 'grab', 'pull', 'bite', 'gulp', 'digest', 'spit', 'cool', 'frozen'];
const NO_EFFECT = new Set(['AvadaKedavra', 'Avada', 'Stupefy', 'LevitateDuel', 'Levitation', 'Jolt', 'Expelliarmus', 'Disarmor']);
const TELE_H0 = 5.4, HEAD_H0 = 8.4;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _o = new THREE.Vector3(1, 1, 1);
const r2 = (x) => Math.round(x * 100) / 100;
const ease = (t) => t * t * (3 - 2 * t);

let _lobeA = null, _lobeB = null; const _headStems = [];
const headStem = (i) => _headStems[i] || (_headStems[i] = buildHeadStem(i + 1));
const lobes = () => { if (!_lobeA) { _lobeA = buildLobe(1, 0); _lobeB = buildLobe(2, 1); } return [_lobeA, _lobeB]; };

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
            const [kx, kz] = grp ? [grp.gx, grp.gz] : key.split('|')[1].split(',').map(Number);
            if (kx >= gx0 - FAR && kx <= gx1 + FAR && kz >= gz0 - FAR && kz <= gz1 + FAR) continue;
            if (grp) this._unload(grp);
            this.groups.delete(key);
        }
        let built = 0;
        for (let gz = gz0; gz <= gz1 && built < 2; gz++) for (let gx = gx0; gx <= gx1 && built < 2; gx++) for (const kind of Object.keys(PLANT_KINDS)) {
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
                const id = plantId(kind, gx, gz, m.i);
                if (this._gone.has(id)) continue;
                ok.push({ ...m, x, z, y: top - 0.5, id });
            }
            this.groups.set(key, ok.length ? this._load(kind, gx, gz, ok) : null);
            built++;
        }
    }

    _load(kind, gx, gz, members) {
        const g = this.game, K = PLANT_KINDS[kind];
        const grp = { key: kind + '|' + gx + ',' + gz, kind, gx, gz, plants: [], root: new THREE.Group(), vis: true };
        grp.root.position.set(members[0].x, members[0].y, members[0].z);
        for (const m of members) {
            const p = {
                id: m.id, kind, x: m.x, y: m.y, z: m.z, yaw: m.yaw, s: plantHeight(kind, m.h) / (kind === 'telewilpin' ? TELE_H0 : HEAD_H0), variant: Math.floor(m.h * 997) % (kind === 'telewilpin' ? TELE_VARIANTS : 3),
                isPlantBody: true, hp: K.hp, maxHp: K.hp, dead: false, grp, st: 0, t: 0, prey: null, pT: 0, burnT: 0, freezeT: 0, cool: 0, phase: m.h * 40, hy: 0, hpit: 0, jaw: 0.12, boxId: null, bites: 0, tire: 0, digest: 0,
            };
            p.H = plantHeight(kind, m.h);
            p.boxId = g.collision?.addBox({ minX: m.x - (kind === 'carnivore' ? 0.6 : 0.2) * p.s, maxX: m.x + (kind === 'carnivore' ? 0.6 : 0.2) * p.s, minY: m.y, maxY: m.y + p.H * 0.7, minZ: m.z - (kind === 'carnivore' ? 0.6 : 0.2) * p.s, maxZ: m.z + (kind === 'carnivore' ? 0.6 : 0.2) * p.s, kind: 'tree', noSupport: true });
            p.proxy = this._makeProxy(p);
            grp.plants.push(p); this.byId.set(p.id, p);
        }
        if (kind === 'telewilpin') this._buildTele(grp); else for (const p of grp.plants) this._buildHead(p, grp);
        g.scene.add(grp.root);
        return grp;
    }

    _unload(grp) {
        const g = this.game;
        for (const p of grp.plants) { g.collision?.removeBox(p.boxId); this.byId.delete(p.id); if (this.mine === p) this._release(p, true); }
        g.scene.remove(grp.root);
        grp.root.traverse((o) => { if (o.isMesh || o.isPoints) { if (!o.geometry.userData.keep) o.geometry.dispose(); } });
        for (const p of grp.plants) p.vines?.dispose();
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

    // ---- a head
    _buildHead(p, grp) {
        const M = plantMaterials(), hs = headStem(p.variant), [la, lb] = lobes();
        const root = new THREE.Group();
        root.position.set(p.x - grp.root.position.x, p.y - grp.root.position.y, p.z - grp.root.position.z);
        root.rotation.y = p.yaw; root.scale.setScalar(p.s);
        const stem = new THREE.Mesh(hs.geo, M.headStem); stem.castShadow = true;
        const pivot = new THREE.Group(); pivot.position.copy(hs.top);
        const top = new THREE.Mesh(la, M.head), low = new THREE.Mesh(lb, M.head);
        top.castShadow = true;
        low.rotation.x = Math.PI;
        pivot.add(top, low);
        const bulge = new THREE.Mesh(bulgeGeometry(), M.vine); bulge.visible = false;
        p.vines = new VineSet(p.variant + 1);
        const vines = new THREE.Mesh(p.vines.geo, M.vine); vines.frustumCulled = false; vines.castShadow = false;
        root.add(stem, pivot, bulge, vines);
        grp.root.add(root);
        Object.assign(p, { root, pivot, top, low, bulge, vinesMesh: vines, topLocal: hs.top.clone(), curve: hs.curve, vineT: 0 });
        this._poseVines(p, 0, true);
    }

    // ============================================================ hits (a proxy lets the weapons see a plant like any creature)
    _makeProxy(p) {
        const pos = new THREE.Vector3(p.x, p.y, p.z), rot = { y: p.yaw };
        const r = p.kind === 'carnivore' ? 1.0 * p.s : 0.55 * p.s;
        return {
            isPlant: true, plant: p, group: { position: pos, rotation: rot }, damageCooldown: 0,
            get isDead() { return p.dead; },
            bodyCapsule: (c) => { c.a.set(p.x, p.y + 0.2, p.z); this._top(p, c.b); c.r = r; return c; },
        };
    }
    /** World point of a plant's top (the bloom / the hinge of the jaws). */
    _top(p, out) {
        if (p.kind === 'carnivore' && p.pivot) return p.pivot.getWorldPosition(out);
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
        return Math.sqrt(dx * dx + dy * dy + dz * dz) - (p.kind === 'carnivore' ? 0.6 : 0.2) * p.s;
    }

    /** A blow / a spell / fire on a plant (any computer: a guest asks the host). */
    hit(p, dmg, kind = 'melee', by = null) {
        if (!p || p.dead) return;
        if (!this.auth) { this._send({ op: 'hit', id: p.id, dmg: r2(+dmg || 0), kind }); this._flinch(p); return; }
        if (COLD_KINDS.has(kind)) { this._cold(p); return; }
        if (FIRE_KINDS.has(kind)) this.ignite(p);
        const d = plantDamage(kind, dmg);
        if (!(d > 0)) return;
        p.hp -= d;
        this._flinch(p);
        if (p.hp <= 0) this.die(p, kind, by);
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
        p.freezeT = FREEZE.TIME; this._enter(p, STATES.indexOf('frozen')); this._release(p, false);
    }
    _flinch(p) { p.flinch = 0.35; this.game.sound?.playPlant?.(_v.set(p.x, p.y + 2, p.z), 'rustle', 0.7); }

    /** (host) A plant is destroyed: it leaves its thing, falls, its prey is let go. */
    die(p, kind = 'melee', by = null) {
        if (p.dead) return;
        p.dead = true; p.deadT = 0; p.hp = 0;
        const g = this.game, K = PLANT_KINDS[p.kind];
        this._gone.set(p.id, true);
        g.collision?.removeBox(p.boxId); p.boxId = null;
        this._release(p, true);
        this._top(p, _v);
        for (let i = 0; i < 18; i++) g.fx?.spark?.(_v, p.kind === 'telewilpin' ? 0xff3a1c : 0x6fb83a, 0.12, _w.set((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.8);
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
            if (p.kind === 'telewilpin') this._tele(p, dt, me); else heads.push(p);
        }
        for (const p of heads) this._head(p, dt, me);
        for (const grp of this.groups.values()) if (grp) for (const p of grp.plants) if (p.dead && p.kind === 'carnivore') this._fall(p, dt);
        this._holdMe(dt);
        if (this.auth) this._snapshot(dt);
    }

    _rebuildNear(me) {
        const R = PLANT_RANGE.SIM;
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

    // ============================================================ the carnivorous head
    _enter(p, st) { p.st = st; p.t = 0; p.spat = false; if (st !== 6) p.meSpat = false; }
    get _S() { return STATES; }

    _head(p, dt, me) {
        const g = this.game, K = PLANT_KINDS.carnivore, S = STATES[p.st];
        p.t += dt; p.flinch = Math.max(0, (p.flinch || 0) - dt);
        this._burn(p, dt);
        if (p.dead) return;
        if (p.freezeT > 0) { p.freezeT -= dt; if (p.freezeT <= 0 && this.auth) this._enter(p, 0); }
        if (this.auth) this._think(p, dt);
        this._animate(p, dt, me, S);
    }

    /** (host) The hunger of a head: one meal at a time. */
    _think(p, dt) {
        const g = this.game, K = PLANT_KINDS.carnivore, S = STATES[p.st];
        if (p.freezeT > 0) return;
        const prey = p.prey, pos = prey ? this._preyPos(prey, _v) : null;
        if (prey && prey.k !== 'p' && p.st >= 2 && p.st <= 4) this._carry(p, prey);
        switch (S) {
            case 'idle': {
                if (p.cool > 0) { p.cool -= dt; return; }
                if ((this._tick + (p.phase | 0)) % 6 !== 0) return;
                const list = crowdNear(g, p.x, p.y, p.z, K.notice * p.s, null, 8, this._buf || (this._buf = []));
                let best = null, bd = 1e9;
                for (const b of list) {
                    if (b.kind !== 'player' && b.kind !== 'animal' && b.kind !== 'man') continue;
                    if (b.kind === 'animal' && (b.ref.dead || b.ref.rider || b.ref.fly || b.ref.plantHeld)) continue;
                    if (b.kind === 'man' && (b.ref.dead || b.ref.plantHeld)) continue;
                    if (b.kind === 'player' && !this._playerFair(b)) continue;
                    if (this._taken(b)) continue;
                    const d = Math.hypot(b.x - p.x, b.z - p.z);
                    if (d < bd) { bd = d; best = b; }
                }
                if (best) { p.prey = this._preyOf(best); p.bites = 0; p.tire = 0; p.verdict = this._verdict(p.prey); this._enter(p, 1); g.sound?.playPlant?.(_v.set(p.x, p.y + 4, p.z), 'lash', 0.9); }
                return;
            }
            case 'grab':
                if (!pos || !this._preyAlive(prey) || Math.hypot(pos.x - p.x, pos.z - p.z) > K.reach * p.s + 3) { this._letGo(p, 2); return; }
                if (p.t >= EAT.GRAB) {
                    if (p.verdict === 'spit') { this._enter(p, STATES.indexOf('spit')); return; } // (a magic robe: spat out at once)
                    this._hold(p, true);
                    this._enter(p, 2);
                }
                return;
            case 'pull':
                if (!this._preyAlive(prey)) { this._letGo(p, 2); return; }
                if (p.t >= EAT.PULL) { p.bites = 0; this._enter(p, 3); }
                return;
            case 'bite': {
                if (!this._preyAlive(prey)) { this._letGo(p, 2); return; }
                p.tire += dt;
                const n = Math.floor(p.t / EAT.BITE_EVERY);
                if (n > p.bites) { p.bites = n; this._bite(p); }
                if (p.verdict === 'tire') { if (p.tire >= EAT.SPIT_ARMOUR) this._enter(p, STATES.indexOf('spit')); return; } // (armour: it cannot eat it)
                if (p.bites >= EAT.BITES && p.t >= EAT.BITES * EAT.BITE_EVERY) this._enter(p, prey.k === 'v' ? STATES.indexOf('spit') : 4); // (a villager cannot be taken out of the world: bitten and spat out)
                return;
            }
            case 'gulp':
                if (p.t >= EAT.GULP) {
                    g.sound?.playPlant?.(_v.set(p.x, p.y + 3, p.z), 'gulp', 1);
                    if (prey.k === 'a') { const a = g.animals.byId.get(prey.id); if (a) g.animals._remove(a); p.prey = null; p.digest = EAT.DIGEST; this._enter(p, 5); } // (swallowed whole: no meat, no bones)
                    else if (prey.k === 'v') { p.prey = null; this._enter(p, 5); p.digest = EAT.DIGEST; }
                    else { p.digest = (g.combat?.enabled ? EAT.INSIDE_MAX : 4); this._enter(p, 5); } // (a man: kept inside)
                }
                return;
            case 'digest':
                if (p.t >= p.digest) { if (p.prey) this._enter(p, STATES.indexOf('spit')); else { p.cool = EAT.COOL; this._enter(p, 0); } }
                return;
            case 'spit':
                if (!p.spat) { p.spat = true; this._hold(p, false); this._flingPrey(p); }
                if (p.t >= 0.7) { this._letGo(p, prey?.k === 'p' ? EAT.COOL_MAN : EAT.COOL); }
                return;
            case 'frozen': return;
            default: p.cool = EAT.COOL; this._enter(p, 0);
        }
    }

    /** (host) An animal / a villager held by the tendrils is drawn up to the jaws. */
    _carry(p, prey) {
        const g = this.game, mouth = this._mouth(p, _w);
        const k = p.st === 2 ? ease(Math.min(1, p.t / EAT.PULL)) : 1;
        if (!p.carryFrom) p.carryFrom = this._preyPos(prey, new THREE.Vector3());
        if (!p.carryFrom) return;
        _v.lerpVectors(p.carryFrom, mouth, k);
        if (prey.k === 'a') { const a = g.animals?.byId?.get(prey.id); if (a) { a.group.position.copy(_v).y -= 0.4; a.group.rotation.x = 0.9 * k; a.net = a.group.position; } }
        else { const v = g.castleLife?.byId?.get(prey.id); if (v) { v.x = _v.x; v.y = _v.y - 1.4; v.z = _v.z; } }
    }
    _letGo(p, cool) { this._hold(p, false); p.prey = null; p.carryFrom = null; p.cool = cool; this._enter(p, 0); }
    _taken(b) { for (const q of this.near) if (q.prey && q.prey.id === (b.kind === 'player' ? String(b.id) : b.ref.id) ) return true; return false; }
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
    /** World point of the prey (its feet-ish middle). */
    _preyPos(prey, out) {
        const g = this.game;
        if (prey.k === 'a') { const a = g.animals?.byId?.get(prey.id); return a ? out.copy(a.group.position) : null; }
        if (prey.k === 'v') { const v = g.castleLife?.byId?.get(prey.id); return v ? out.set(v.x, v.y + 1.4, v.z) : null; }
        if (prey.id === g.localId) return out.copy(g.character.group.position).setY(g.character.group.position.y - 1.6);
        const r = g.remotes?.get(prey.id); return r ? out.copy(r.position).setY(r.position.y - 1.6) : null;
    }
    /** (host) Take hold of the prey (animals and villagers are carried to the jaws by the host). */
    _hold(p, on) {
        const g = this.game, prey = p.prey;
        if (!prey) return;
        if (prey.k === 'a') { const a = g.animals?.byId?.get(prey.id); if (a) { a.plantHeld = on; if (!on) a.group.rotation.x = 0; } }
        if (prey.k === 'v') { const v = g.castleLife?.byId?.get(prey.id); if (v) { v.carriedBy = on ? p : null; if (!on) v.vy = v.vy || -0.01; } }
    }
    /** (host) A bite: an animal loses 6 HP a bite, a villager 3. A player takes his own bites (_holdMe). */
    _bite(p) {
        const g = this.game, prey = p.prey;
        g.sound?.playPlant?.(this._top(p, _v), 'snap', 1);
        if (prey.k === 'a') { const a = g.animals?.byId?.get(prey.id); if (a) a.hp -= EAT.ANIMAL_BITE * 0.5; if (a?.hp <= 0) a.hp = 1; } // (three bites weaken it; it is swallowed alive-or-nearly: no carcass)
        else if (prey.k === 'v') { const v = g.castleLife?.byId?.get(prey.id); if (v) g.castleLife.hit(v, 3, null, null, { kind: 'bite' }); }
    }
    /** (host) Spit an animal / villager out: flung away from the stem. */
    _flingPrey(p) {
        const g = this.game, prey = p.prey;
        if (!prey) return;
        this._top(p, _v);
        g.sound?.playPlant?.(_v, 'spit', 1);
        const dir = _w.set(Math.sin(p.yaw + p.hy), 0, Math.cos(p.yaw + p.hy));
        if (prey.k === 'a') { const a = g.animals?.byId?.get(prey.id); if (a) { a.plantHeld = false; a.group.rotation.x = 0; a.group.position.set(p.x + dir.x * 4.5, p.y + 0.3, p.z + dir.z * 4.5); g.animals.push?.(a, _v.copy(dir).multiplyScalar(EAT.SPIT_V).setY(3), 0.6); a.state = 'flee'; a.stateT = 6; } }
        else if (prey.k === 'v') { const v = g.castleLife?.byId?.get(prey.id); if (v) { v.carriedBy = null; v.x = p.x + dir.x * 4.5; v.z = p.z + dir.z * 4.5; v.y = p.y; v.fleeT = 6; } }
    }

    // ---- the victim's side: ME (every computer decides about its own player)
    _holdMe(dt) {
        const g = this.game, c = g.combat, ch = g.character;
        let mine = null;
        for (const p of this.near) if (!p.dead && p.prey && p.prey.k === 'p' && p.prey.id === g.localId && p.st >= 2 && p.st <= 6 && !p.meSpat) { mine = p; break; }
        if (!mine) { if (this.mine) this._release(this.mine, false); return; }
        const p = mine, S = STATES[p.st];
        if (this.mine !== p) { this.mine = p; p.from = ch.group.position.clone(); p.myBite = 0; p.myT = 0; }
        p.myT += dt;
        if (c) c.eaten = S === 'pull' || S === 'bite' || S === 'gulp' || S === 'digest';
        ch.verticalVelocity = 0;
        if (g.knockback) g.knockback.set(0, 0, 0);
        const mouth = this._mouth(p, _v);
        if (S === 'pull') ch.group.position.lerpVectors(p.from, mouth, ease(Math.min(1, p.t / EAT.PULL)));
        else if (S === 'bite' || S === 'gulp') ch.group.position.copy(mouth).add(_w.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, 0));
        else if (S === 'digest') {
            this._inside(p, ch.group.position);
            p.inT = (p.inT || 0) + dt;
            if (p.inT >= 1) { p.inT -= 1; if (c?.enabled) c.damage(EAT.HURT, null, 'bite'); else g.damageLocalPlayer?.(EAT.HURT, 'bite'); }
            g.hud?.setStatus?.('🌿 Вас съела плотоядная голова! −1 ❤ в секунду. Убейте её — бейте мечом или колдуйте');
        }
        if (S === 'bite' && Math.floor(p.t / EAT.BITE_EVERY) > p.myBite) {
            p.myBite = Math.floor(p.t / EAT.BITE_EVERY);
            if (c?.enabled) c.damage(EAT.BITE_DMG, null, 'bite'); else g.damageLocalPlayer?.(EAT.BITE_DMG, 'bite'); // (steel takes its share — Armor.absorb)
            g.hud?.damageFlash?.();
        }
        if (S === 'spit') { p.meSpat = true; this._release(p, false, true); }
    }
    _mouth(p, out) { return p.pivot ? p.pivot.localToWorld(out.set(0, 0.15, 1.5)) : out.set(p.x, p.y + 6, p.z); }
    _inside(p, out) { return p.pivot ? p.pivot.localToWorld(out.set(0, -0.2, 1.0)) : out; }
    /** Let me go (spat out with a push, or just freed). */
    _release(p, died, spit = false) {
        const g = this.game, c = g.combat;
        if (this.mine !== p) return;
        if (c) c.eaten = false;
        {
            this.mine = null; p.inT = 0;
            g.hud?.setStatus?.('');
            if (spit || died) {
                const d = _w.set(Math.sin(p.yaw + p.hy), 0, Math.cos(p.yaw + p.hy));
                const ch = g.character;
                ch.group.position.set(p.x + d.x * 4.2, Math.max(p.y + 2.1, ch.group.position.y - 3), p.z + d.z * 4.2);
                ch.verticalVelocity = 3;
                if (g.knockback) { g.knockback.x = d.x * EAT.SPIT_V * 0.8; g.knockback.z = d.z * EAT.SPIT_V * 0.8; }
                g.sound?.playPlant?.(ch.group.position, 'spit', 1);
            }
        }
    }

    // ---- looks
    _animate(p, dt, me, S) {
        if (!p.root) return;
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        if (d > PLANT_RANGE.ANIM) return;
        const g = this.game, t = this._clock + p.phase;
        // where it looks: its prey, else the nearest person within 30 m, else straight on
        let tgt = null;
        if (p.prey) tgt = this._preyPos(p.prey, _o);
        else if (d < 30) tgt = _o.copy(me);
        let hy = Math.sin(t * 0.4) * 0.35, hp = 0.1 + 0.05 * Math.sin(t * 0.7);
        if (tgt) { hy = Math.atan2(tgt.x - p.x, tgt.z - p.z) - p.yaw; hy = Math.atan2(Math.sin(hy), Math.cos(hy)); const dh = Math.hypot(tgt.x - p.x, tgt.z - p.z); this._top(p, _v); hp = Math.max(0, Math.min(0.8, Math.atan2(_v.y - tgt.y, Math.max(1, dh)) * 0.8)); }
        const k = Math.min(1, dt * 4);
        p.hy += (hy - p.hy) * k; p.hpit += (hp - p.hpit) * k;
        // the jaws by state
        let jaw;
        switch (S) {
            case 'grab': jaw = 0.55 + 0.1 * Math.sin(t * 9); break;
            case 'pull': jaw = 0.95; break;
            case 'bite': { const ph = (p.t % EAT.BITE_EVERY) / EAT.BITE_EVERY; jaw = 0.95 * Math.pow(Math.cos(ph * Math.PI * 0.5), 3); break; }
            case 'gulp': jaw = Math.max(0, 0.2 - p.t * 0.4); break;
            case 'digest': jaw = 0.02; break;
            case 'spit': jaw = 1.1 * Math.max(0, 1 - p.t * 1.2); break;
            case 'frozen': jaw = 0.3; break;
            default: jaw = 0.14 + 0.05 * Math.sin(t * 1.3);
        }
        if (p.flinch > 0) jaw += 0.3 * p.flinch;
        p.jaw += (jaw - p.jaw) * Math.min(1, dt * (S === 'bite' ? 30 : 9));
        p.pivot.rotation.set(p.hpit, p.hy, 0);
        p.top.rotation.x = -p.jaw; p.low.rotation.x = Math.PI - p.jaw;
        // the swelling goes down the stem while it digests
        const dig = S === 'digest' || (S === 'idle' && p.cool > EAT.COOL - 3 && p.digest > 0);
        p.bulge.visible = S === 'digest' && !p.prey ? true : S === 'gulp';
        if (p.bulge.visible) {
            const u = S === 'gulp' ? 1 - Math.min(1, p.t / EAT.GULP) * 0.15 : 0.85 - 0.8 * Math.min(1, p.t / (p.digest || EAT.DIGEST));
            const pt = p.curve.getPoint(Math.max(0.05, u));
            p.bulge.position.copy(pt); p.bulge.scale.set(1, 1.5, 1).multiplyScalar(0.8 + 0.3 * Math.sin(t * 6));
        }
        // the tendrils
        p.vineT -= dt;
        const active = S !== 'idle' && S !== 'cool' && S !== 'frozen';
        if (active || (d < PLANT_RANGE.IDLE_VINES && p.vineT <= 0)) { p.vineT = 0.05; this._poseVines(p, t, false, S); }
    }

    _poseVines(p, t, first, S = 'idle') {
        const V = p.vines;
        const grabbing = S === 'grab' || S === 'pull' || S === 'bite';
        let tgt = null;
        if (grabbing && p.prey) { const w = this._preyPos(p.prey, _o); if (w) tgt = p.root.worldToLocal(_v.copy(w)); }
        const reach = S === 'grab' ? ease(Math.min(1, p.t / EAT.GRAB)) : 1;
        for (let i = 0; i < V.N; i++) {
            const h = (0.22 + 0.62 * i / (V.N - 1)) * HEAD.STEM_H, base = p.curve ? p.curve.getPoint(0.2 + 0.65 * i / (V.N - 1)) : _w.set(0, h, 0);
            const yaw = i * 2.4 + 0.5;
            const mine = grabbing && tgt && i < 4; // (four of the six tendrils take hold; the rest lash about)
            V.set(i, base, yaw, mine ? tgt : null, t * (grabbing ? 2.2 : 1), mine ? reach : 0, mine && S !== 'grab' ? 1 : 0);
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
        for (const p of this.near) if (p.kind === 'carnivore' && !p.dead && (p.st !== 0 || p.freezeT > 0 || p.burnT > 0)) l.push([p.id, p.st, r2(p.t), p.prey ? p.prey.k + ':' + p.prey.id : 0, Math.round(p.hp), p.freezeT > 0 ? 1 : 0, p.burnT > 0 ? 1 : 0, p.digest || 0]);
        this._send({ op: 's', l, idle: this._lastActive && !l.length ? 1 : 0 });
        this._lastActive = l.length > 0;
    }
    onNet(m, isHost) {
        if (!m) return;
        if (m.op === 'bolt' && isHost) { const p = this.byId.get(m.id); if (p) this.boltHit(p, m.spell, null); }
        else if (m.op === 'hit' && isHost) { const p = this.byId.get(m.id); if (p) this.hit(p, +m.dmg || 0, m.kind || 'melee', null); }
        else if (m.op === 'die' && !isHost) { const p = this.byId.get(m.id); if (p) this.die(p, 'net', null); else this._gone.set(m.id, true); }
        else if (m.op === 's' && !isHost) {
            const seen = new Set();
            for (const e of m.l || []) {
                const p = this.byId.get(e[0]); if (!p || p.dead) continue;
                seen.add(p);
                if (p.st !== e[1]) { p.st = e[1]; p.t = e[2]; } else if (Math.abs(p.t - e[2]) > 0.4) p.t = e[2];
                if (e[3]) { const [k, ...rest] = String(e[3]).split(':'); p.prey = { k, id: k === 'p' ? rest.join(':') : +rest.join(':') || rest.join(':') }; } else p.prey = null;
                p.hp = e[4]; p.freezeT = e[5] ? 1 : 0; p.burnT = e[6] ? 1 : 0; p.digest = e[7];
            }
            for (const p of this.near) if (p.kind === 'carnivore' && !seen.has(p) && p.st !== 0 && !p.dead) { p.st = 0; p.prey = null; p.freezeT = 0; }
        }
    }

    // ============================================================ the rest
    /** Samples for the shader warm-up (Game.prewarm). */
    sampleModels() { return null; }
    dispose() {
        for (const grp of this.groups.values()) if (grp) this._unload(grp);
        this.groups.clear(); this.byId.clear(); this.near.length = 0;
    }
}
