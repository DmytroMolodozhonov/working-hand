/**
 * CustomPlants.js — plants of one's own, made by «Да пусть создастся дерево / цветок / гриб …» (DivineCreation.js).
 *
 * They sprout where the wand pointed (as many as said), grow (fast, normal or slow — as said) and spread by themselves:
 * a grown plant drops a seed now and then (`spread`: never, rarely, normally, often — CreationRules.SPREAD) 2–9 m away,
 * where its habitat is (a meadow, a forest, mountains, water's edge, a desert, snow, a swamp, anywhere — the ground's
 * top block and what is round tells), up to PLANTS_PER_SPECIES of a kind and MAX_PLANTS in the world.
 * Each kind is ONE instanced shape (CustomPlantModel — its body lit, its glow unlit): one or two draws however many.
 * A tree, a cactus, a crystal, a big mushroom has a trunk the bodies bump into (a collision box); flowers, grass, reeds,
 * vines are walked through, as the world's own.
 *
 * «На кого и на что» (PLANT_TARGETS): fire burns them (Инферно, Hellfire, a fire-breathing creature, a burning tree near),
 * blasts and «Total Destruction», «Circle Attack», «Inspirius», lightning break them; the gods' spells too; nothing else
 * (no charge, no wind) harms a plant. They harm nobody.
 *
 * Multiplayer: the host grows and spreads them ('cpl'); every computer draws them from their kind's recipe. Saved with the world.
 */

import * as THREE from 'three';
import { CREATION, SPREAD, recipeKey, sanitizeRecipe } from './CreationRules.js';
import { plantShape, plantMaterials } from '../fx/CustomPlantModel.js';
import { BLOCK, isLeaves } from '../world/Terrain.js';
import { realmAt } from '../world/Planets.js';

const r2 = (v) => Math.round(v * 100) / 100;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const GROW_T = { fast: 40, normal: 120, slow: 300 }; // s from a seed to its full height
// (a glowing kind's halo: where its light is and how wide, against its height — the crown of a tree, a flower's head…)
const HALO = { tree: [0.68, 0.42], bush: [0.5, 0.62], flower: [0.86, 0.32], grass: [0.5, 0.55], vine: [0.55, 0.38], mushroom: [0.72, 0.5], cactus: [0.6, 0.36], reed: [0.85, 0.3], crystal: [0.5, 0.58] };
let HALO_GEO = null;
const haloGeo = () => { if (!HALO_GEO) { HALO_GEO = new THREE.SphereGeometry(1, 14, 10); HALO_GEO.userData.shared = true; } return HALO_GEO; };
const haloMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
const BURNS = /^(Inferno|Fire|FireMaxima|Hellfire|InfernoMaxima|fire|burn|Lightning|LightningStrike)$/i;
const BREAKS = /^(Bombardo|BombardoMaxima|blast|TotalDestruction|TotalDestructionMaxima|CircleAttack|CircleAttackMaxima|Inspirius|Boom|Die|crush)$/;

/** ON WHOM AND ON WHAT: what acts on a plant of one's own. */
export const PLANT_TARGETS = {
    fire: 'сгорает: «Инферно», «Fire», «Let the Hellfire Come», огонь существ, молния — с пеплом и искрами',
    blasts: 'ломается: «Бомбардо», «Total Destruction», «Circle Attack», «Inspirius», «Бум», падение с высоты',
    gods: 'заклинания богов сметают его',
    charges: 'дуэльные заряды, ветер, вода, Левиоса — не действуют (живое растение держится корнями)',
    creatures: 'никого не ранит; дерево, кактус, кристалл и большой гриб — препятствие, их обходят',
    villagers: 'жители не трогают и не пугаются',
    spread: 'само расселяется по своим местам (лес, луг, горы, вода, пустыня, снег, болото, везде) — не больше предела вида и мира',
};

export class CustomPlants {
    constructor(game) {
        this.game = game;
        this.species = new Map(); // key → {key, recipe, owner, name, made, mesh, glowMesh, n}
        this.list = []; // {id, sp, x, y, z, rot, s, age (0…1), born (0…1 the sprouting), box}
        this._spreadT = 5;
        this._dirty = new Set();
        this._netT = 0;
    }

    get auth() { return this.game.authority !== false; }
    get data() { return this.game.terrain?.data || this.game.world?.terrain?.data || null; }

    /** One of each look (Game.prewarm): the shared materials on a small shape. */
    sampleModels() {
        const M = plantMaterials();
        const s = plantShape({ form: 'flower', flowers: { color: 0xf08cb4 }, glow: 0x9ef0ff }, 1);
        const g = new THREE.Group();
        g.add(new THREE.InstancedMesh(s.body, M.body, 1), new THREE.InstancedMesh(s.glow || s.body, M.glow, 1), new THREE.InstancedMesh(haloGeo(), haloMat(0x9ef0ff), 1));
        return [g];
    }

    // ============================================================ the gods make it
    /** (host) Plants of a kind sprout at `at`. @returns {true|string} */
    create(recipe, at, by, opts = {}) {
        const g = this.game;
        if (!recipe || recipe.type !== 'plant') return 'Боги не поняли, какое это растение';
        if (realmAt(at.x, at.y, at.z, g.space?.planets) === 'space') return 'В космосе ничего не растёт';
        if (this.list.length >= CREATION.MAX_PLANTS) return 'В мире уже слишком много созданных растений';
        const key = recipeKey(recipe);
        if (!this.species.has(key)) {
            if (this.species.size >= CREATION.MAX_PLANT_SPECIES) this._forget();
            if (this.species.size >= CREATION.MAX_PLANT_SPECIES) return 'В мире уже слишком много видов созданных растений';
            this._addSpecies({ key, recipe, owner: opts.key ?? String(by), name: recipe.name, made: Date.now() });
            this._send({ op: 'sp', sp: [this._spNet(this.species.get(key))] });
        }
        const n = Math.max(1, Math.min(recipe.count || 1, CREATION.PLANTS_PER_SPECIES));
        const added = [];
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random(), rr = n > 1 ? 1 + Math.sqrt(i) * Math.max(1.2, recipe.height * 0.6) : 0;
            const x = at.x + Math.cos(a) * rr, z = at.z + Math.sin(a) * rr;
            const p = this._plant(key, x, z, { age: 1, born: 0 }); // (made by the gods: whole at once — its seedlings grow by themselves)
            if (p) added.push(p);
        }
        if (!added.length) return 'Здесь ему негде вырасти';
        this._send({ op: 'add', l: added.map((p) => this._net(p)) });
        return true;
    }

    _forget() {
        const used = new Set(this.list.map((p) => p.sp));
        const free = [...this.species.values()].filter((s) => !used.has(s.key)).sort((a, b) => a.made - b.made);
        if (free.length) this._dropSpecies(free[0].key);
    }

    _addSpecies(S) {
        const g = this.game, M = plantMaterials();
        const sh = plantShape(S.recipe, parseInt(S.key, 36) || 1);
        const cap = CREATION.PLANTS_PER_SPECIES;
        S.mesh = new THREE.InstancedMesh(sh.body, M.body, cap);
        S.mesh.castShadow = true; S.mesh.receiveShadow = true;
        S.glowMesh = sh.glow ? new THREE.InstancedMesh(sh.glow, M.glow, cap) : null;
        // (it glows: a soft halo of its light round its crown — faint by day, bright at night — and motes rising)
        S.haloMesh = S.recipe.glow != null ? new THREE.InstancedMesh(haloGeo(), haloMat(S.recipe.glow), cap) : null;
        if (S.haloMesh) { S.haloMesh.castShadow = false; S.haloMesh.renderOrder = 2; }
        for (const m of [S.mesh, S.glowMesh, S.haloMesh]) if (m) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.scene?.add(m); }
        S.trunkR = sh.trunkR;
        this.species.set(S.key, S);
    }

    _dropSpecies(key) {
        const S = this.species.get(key);
        if (!S) return;
        for (const m of [S.mesh, S.glowMesh]) if (m) { this.game.scene?.remove(m); m.geometry.dispose(); m.dispose?.(); }
        if (S.haloMesh) { this.game.scene?.remove(S.haloMesh); S.haloMesh.material.dispose(); S.haloMesh.dispose?.(); }
        this.species.delete(key);
    }

    /** One plant of a kind at (x, z) on the ground (its habitat checked by the spreading, not here). */
    _plant(key, x, z, o = {}) {
        const S = this.species.get(key);
        if (!S || this.list.filter((p) => p.sp === key).length >= CREATION.PLANTS_PER_SPECIES) return null;
        const y = o.y ?? this._ground(x, z);
        if (y == null) return null;
        const p = { id: o.id ?? 'pl' + Math.floor(Math.random() * 1e9).toString(36), sp: key, x: r2(x), y: r2(y), z: r2(z), rot: o.rot ?? r2(Math.random() * 6.28), s: o.s ?? r2(0.85 + Math.random() * 0.3), age: o.age ?? 1, born: o.born ?? 1 };
        this.list.push(p);
        this._dirty.add(key);
        this._collide(p);
        return p;
    }

    /** Its trunk as an obstacle (a tree, a cactus, a crystal, a big mushroom), once grown enough. */
    _collide(p) {
        const S = this.species.get(p.sp), col = this.game.collision;
        if (!S || !col?.addBox || p.box != null || !(S.trunkR > 0) || p.age < 0.5) return;
        const h = S.recipe.height * p.s * p.age, r = Math.max(0.25, S.trunkR * S.recipe.height * p.s * p.age);
        if (h < 1.2) return;
        p.box = col.addBox({ minX: p.x - r, maxX: p.x + r, minY: p.y, maxY: p.y + Math.min(h, 4), minZ: p.z - r, maxZ: p.z + r, kind: 'tree', noSupport: true });
    }

    _remove(p) {
        const i = this.list.indexOf(p);
        if (i < 0) return;
        this.list.splice(i, 1);
        if (p.box != null) this.game.collision?.removeBox?.(p.box);
        this._dirty.add(p.sp);
    }

    /** The ground at (x, z): the top of the land (null — water too deep, nothing made there yet). */
    _ground(x, z) {
        const d = this.data;
        if (d?.landMade && !d.landMade(Math.round(x), Math.round(z))) return null;
        const y = this.game.collision?.groundAt ? this.game.collision.groundAt(x, z, 400) : this.game.collision?.groundY?.(x, z);
        return Number.isFinite(y) ? y : null;
    }

    /** Is (x, z) its habitat? (the ground's top block and its neighbourhood) */
    _fits(recipe, x, z) {
        const d = this.data;
        const hab = recipe.habitat || ['any'];
        if (hab.includes('any') || !d?.topLayer) return true;
        const L = d.topLayer(Math.round(x), Math.round(z)), t = d.get(Math.round(x), L, Math.round(z));
        const near = (ok) => { for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) { if (d.landMade && !d.landMade(Math.round(x + dx), Math.round(z + dz))) continue; const LL = d.topLayer(Math.round(x + dx), Math.round(z + dz)); if (ok(d.get(Math.round(x + dx), LL, Math.round(z + dz)))) return true; } return false; };
        for (const h of hab) {
            if (h === 'meadow' && (t === BLOCK.GRASS || t === BLOCK.PLANET_GRASS)) return true;
            if (h === 'forest' && (t === BLOCK.GRASS || isLeaves(t)) && near((b) => isLeaves(b))) return true;
            if (h === 'mountain' && (t === BLOCK.STONE || t === BLOCK.GRAVEL || L > 40)) return true;
            if ((h === 'water' || h === 'swamp') && t !== BLOCK.WATER && near((b) => b === BLOCK.WATER)) return true;
            if (h === 'desert' && t === BLOCK.SAND) return true;
            if (h === 'snow' && (t === BLOCK.SNOW || t === BLOCK.ICE)) return true;
            if (h === 'cave' && d.get(Math.round(x), L + 6, Math.round(z)) !== BLOCK.AIR) return true;
        }
        return false;
    }

    // ============================================================ harm
    /** Fire / a blast / the gods at p within radius: plants there burn or break. */
    hitAt(p, radius, dmg, kind, by = null) {
        if (!this.auth || !this.list.length) return;
        const k = String(kind || '');
        if (!BURNS.test(k) && !BREAKS.test(k) && !/^(Die|Boom|PlanetLiquidation)$/.test(k)) return; // (charges, wind, water: rooted — nothing)
        const gone = [];
        for (const q of this.list) if (Math.hypot(q.x - p.x, q.z - p.z) < radius + 0.5 && Math.abs(q.y - p.y) < radius + 6) gone.push(q);
        this._kill(gone, BURNS.test(k));
        void dmg; void by;
    }

    /** A ray of fire (or a beam) along o + d·t. */
    hitRay(o, d, len, width, dmg, kind) {
        if (!this.auth || !this.list.length) return;
        const gone = [];
        for (const q of this.list) {
            const S = this.species.get(q.sp);
            const h = (S?.recipe.height || 1) * q.s * q.age;
            _p.set(q.x - o.x, q.y + h * 0.5 - o.y, q.z - o.z);
            const t = Math.max(0, Math.min(len, _p.dot(d)));
            _p.addScaledVector(d, -t);
            if (_p.length() < width + Math.max(0.4, h * 0.4)) gone.push(q);
        }
        this._kill(gone, BURNS.test(String(kind || '')));
        void dmg;
    }

    _kill(list, fire) {
        if (!list.length) return;
        for (const q of list) { this._remove(q); this._fx(q, fire); }
        this._send({ op: 'del', l: list.map((q) => q.id), f: fire ? 1 : 0 });
    }

    _fx(q, fire) {
        const fx = this.game.fx, S = this.species.get(q.sp);
        const h = (S?.recipe.height || 1) * q.s;
        for (let i = 0; i < 18; i++) fx?.spark?.(_p.set(q.x + (Math.random() - 0.5) * h * 0.4, q.y + Math.random() * h, q.z + (Math.random() - 0.5) * h * 0.4), fire ? (i % 2 ? 0xff7a1a : 0x3a3a3a) : (S?.recipe.leafColor ?? 0x3f8a32), 0.12, _s.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), 1.2);
        if (fire) this.game.fire?.ignite?.(_p.set(q.x, q.y + 0.5, q.z), Math.min(2, h * 0.3));
    }

    // ============================================================ frame
    update(dt) {
        if (dt <= 0) return;
        const g = this.game;
        // growing and sprouting
        for (const p of this.list) {
            if (p.born < 1) { p.born = Math.min(1, p.born + dt / 2.5); this._dirty.add(p.sp); if (Math.random() < dt * 8) g.divine?.fx2?.birth?.(_p.set(p.x, p.y, p.z), p.born, 0.6, dt, 0x8aff9a); }
            if (p.age < 1) {
                const S = this.species.get(p.sp);
                p.age = Math.min(1, p.age + dt / (GROW_T[S?.recipe.grow] || 120));
                this._dirty.add(p.sp);
                if (p.box == null && p.age >= 0.5) this._collide(p);
            }
        }
        if (this.auth) this._spread(dt);
        // the instances of the kinds that changed (and the far ones not drawn)
        const me = g.character?.group?.position;
        for (const S of this.species.values()) {
            const near = !me || this.list.some((p) => p.sp === S.key && Math.abs(p.x - me.x) < 300 && Math.abs(p.z - me.z) < 300);
            S.mesh.visible = near; if (S.glowMesh) S.glowMesh.visible = near; if (S.haloMesh) S.haloMesh.visible = near;
        }
        this._glow(dt);
        for (const key of this._dirty) this._draw(key);
        this._dirty.clear();
        if (this.auth) { this._netT -= dt; if (this._netT <= 0) { this._netT = 5; this._send({ op: 'age', l: this.list.filter((p) => p.age < 1).slice(0, 200).map((p) => [p.id, r2(p.age)]) }); } }
    }

    /**
     * (every frame) The glowing kinds: their halo breathes, faint by day and bright at night; at night motes of their light
     * rise from the near ones (the fireworks' glow points — no light of their own: the light count stays the same).
     */
    _glow(dt) {
        const g = this.game;
        const night = Math.max(0, Math.min(1, g.fireLights?.darkness?.() ?? (g.dayCycle ? g.world?.nightAmount || 0 : g.isNight ? 1 : 0)));
        this._gt = (this._gt || 0) + dt;
        for (const S of this.species.values()) if (S.haloMesh) S.haloMesh.material.opacity = (0.06 + 0.34 * night) * (0.85 + 0.15 * Math.sin(this._gt * 1.7));
        if (night < 0.25) return;
        this._moteT = (this._moteT || 0) - dt;
        if (this._moteT > 0) return;
        this._moteT = 0.12;
        const pool = g.fx?.fireworks, me = g.character?.group?.position;
        if (!pool || !me) return;
        g.divine?.fx2?._view?.();
        let n = 0;
        for (const p of this.list) {
            const S = this.species.get(p.sp);
            if (!S?.haloMesh || p.age < 0.3 || Math.abs(p.x - me.x) > 70 || Math.abs(p.z - me.z) > 70) continue;
            const k = S.recipe.height * p.s * p.age, h = HALO[S.recipe.form] || HALO.bush;
            const a = Math.random() * 6.283, r = Math.random() * h[1] * k;
            pool.spawn(p.x + Math.cos(a) * r, p.y + h[0] * k + (Math.random() - 0.5) * h[1] * k, p.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.3, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, S.recipe.glow, 0.12 + 0.08 * Math.min(3, k / 4), 2.2 + Math.random(), { shrink: 0.4, drag: 0.4 });
            if (++n >= 14) break;
        }
    }

    /** (host) Grown plants drop seeds now and then into their habitat. */
    _spread(dt) {
        this._spreadT -= dt;
        if (this._spreadT > 0) return;
        const step = 5;
        this._spreadT = step;
        if (this.list.length >= CREATION.MAX_PLANTS) return;
        const added = [];
        for (const p of [...this.list]) {
            if (p.age < 1) continue;
            const S = this.species.get(p.sp);
            const per = SPREAD[S?.recipe.spread]?.perMin || 0;
            if (!per || Math.random() > per * step / 60) continue;
            const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * 7 * Math.max(1, S.recipe.height / 4);
            const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
            if (this.list.some((q) => Math.hypot(q.x - x, q.z - z) < Math.max(0.8, S.recipe.height * 0.35))) continue;
            if (!this._fits(S.recipe, x, z)) continue;
            const y = this._ground(x, z);
            if (y == null || Math.abs(y - p.y) > 8) continue;
            const t = this.data?.get?.(Math.round(x), Math.floor(y + 0.4), Math.round(z));
            if (t === BLOCK.WATER) continue;
            const q = this._plant(p.sp, x, z, { y, age: 0.05, born: 1 });
            if (q) added.push(q);
            if (added.length >= 8 || this.list.length >= CREATION.MAX_PLANTS) break;
        }
        if (added.length) this._send({ op: 'add', l: added.map((q) => this._net(q)) });
    }

    _draw(key) {
        const S = this.species.get(key);
        if (!S) return;
        let n = 0;
        for (const p of this.list) {
            if (p.sp !== key) continue;
            const k = S.recipe.height * p.s * Math.max(0.05, p.age) * (p.born < 1 ? p.born : 1);
            _m.compose(_p.set(p.x, p.y - 0.05, p.z), _q.setFromAxisAngle(_up, p.rot), _s.set(k, k, k));
            S.mesh.setMatrixAt(n, _m);
            if (S.glowMesh) S.glowMesh.setMatrixAt(n, _m);
            if (S.haloMesh) { const h = HALO[S.recipe.form] || HALO.bush; _m.compose(_p.set(p.x, p.y + h[0] * k, p.z), _q.identity(), _s.set(h[1] * k, h[1] * k * 0.9, h[1] * k)); S.haloMesh.setMatrixAt(n, _m); }
            if (++n >= CREATION.PLANTS_PER_SPECIES) break;
        }
        for (const m of [S.mesh, S.glowMesh, S.haloMesh]) if (m) { m.count = n; m.instanceMatrix.needsUpdate = true; }
    }

    // ============================================================ network / save
    _send(m) { const net = this.game.sync?.net; if (net && this.auth) net.send({ t: 'cpl', ...m }); }
    _spNet(S) { return { key: S.key, recipe: S.recipe, owner: S.owner, name: S.name, made: S.made }; }
    _net(p) { return [p.id, p.sp, p.x, p.y, p.z, p.rot, p.s, r2(p.age), r2(p.born)]; }

    _acceptSpecies(s) {
        if (!s || typeof s.key !== 'string' || !s.recipe || this.species.has(s.key)) return;
        const recipe = sanitizeRecipe({ ...s.recipe, type: 'plant', plant: s.recipe }, '', 1);
        recipe.name = String(s.recipe.name || s.name || recipe.name).slice(0, 40);
        this._addSpecies({ key: s.key, recipe, owner: s.owner, name: recipe.name, made: s.made || Date.now() });
    }

    _acceptPlants(l) {
        for (const e of (l || []).slice(0, CREATION.MAX_PLANTS)) {
            if (!Array.isArray(e) || this.list.some((p) => p.id === e[0])) continue;
            this._plant(e[1], +e[2] || 0, +e[4] || 0, { id: e[0], y: +e[3] || 0, rot: +e[5] || 0, s: +e[6] || 1, age: +e[7] || 1, born: e[8] ?? 1 });
        }
    }

    onNet(m, isHost) {
        if (isHost || !m) return;
        switch (m.op) {
            case 'sp': for (const s of (m.sp || []).slice(0, CREATION.MAX_PLANT_SPECIES)) this._acceptSpecies(s); break;
            case 'add': this._acceptPlants(m.l); break;
            case 'del': for (const id of m.l || []) { const p = this.list.find((q) => q.id === id); if (p) { this._remove(p); this._fx(p, !!m.f); } } break;
            case 'age': for (const [id, a] of m.l || []) { const p = this.list.find((q) => q.id === id); if (p) p.age = Math.max(p.age, +a || 0); } break;
        }
    }

    netList() { return this.snapshot(); }
    applyNet(d) { this.restore(d, true); }

    snapshot() { return { species: [...this.species.values()].map((S) => this._spNet(S)), list: this.list.map((p) => this._net(p)) }; }

    restore(s) {
        if (!s) return;
        for (const sp of s.species || []) this._acceptSpecies(sp);
        this._acceptPlants(s.list);
    }

    dispose() { for (const k of [...this.species.keys()]) this._dropSpecies(k); this.list = []; }
}
