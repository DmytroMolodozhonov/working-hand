/**
 * MagicFloraLife.js — the wild magic plants in the game (rules and tables: MagicFlora.js, the look: fx/FloraModels.js).
 *
 * Placed like the apple trees, in small cells (48 m) round the hero, the same on every computer (biome + hash); a plant is ONE instance of a
 * shared body shape, what is picked from it (caps, fiddleheads, berries, blooms, needles) is one instance of a small shared shape — so the whole
 * meadow is ~15 draws. Nothing piles up: cells beyond KEEP are put away (their picked parts remembered in a tiny record), the land is never made
 * in the frame (`landMade`), a few groups are placed per frame within a time budget.
 *
 * An empty hand touching a ripe part picks it (the host decides: `flpick` → `flgone`). Fire / blasts / lightning / the gods' spells act on the plants
 * (`floraHarm`: hitAt / hitRay, host only; `flkill` tells the guests); «Gather» pointed at a plant takes everything ripe.
 */
import * as THREE from 'three';
import { BLOCK, BAKSADI_FROM_GEN } from '../world/Terrain.js';
import { BIOMES } from '../world/Landscape.js';
import { FLORA, FLORA_KINDS, FLORA_ORDER, FLORA_OF_ITEM, BURN_TIME, SCATTER_MAX, floraGroupIn, floraHarm } from './MagicFlora.js';
import { floraBody, floraPick, floraMaterials, FLORA_MATERIAL, FLORA_VARIANTS, FLORA_CLOCK } from '../fx/FloraModels.js';
import { newUid, ITEM_INFO } from './ItemTypes.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const PICK_COUNT = { glowcap: 8, giantfern: 5, azureberry: 9, sunherb: 7, frostcrystal: 5 }; // (a plant has at most this many picked parts)
const BUDGET_MS = 1.2; // placing groups: at most this long a frame
const REACH = { glowcap: 2.2, giantfern: 4.5, azureberry: 2.4, sunherb: 1.8, frostcrystal: 3 }; // m round the plant: what a spell / ray touches

export class MagicFloraLife {
    constructor(game) {
        this.game = game;
        this.groups = new Map(); // 'kind|gx,gz' → group {plants[]} | null (a cell with nothing there)
        this.byId = new Map(); // plant id → plant
        this.list = {}; // kind → plants loaded
        this.picked = new Map(); // plant id → [until…] — the picked parts of unloaded plants (a tiny record; expired ones dropped)
        this.gone = new Set(); // plant ids destroyed in this session (they stay gone when their place is loaded again)
        this.burning = [];
        for (const k of FLORA_ORDER) this.list[k] = [];
        this.meshes = null; this.group = new THREE.Group(); this.group.name = 'magicFlora';
        this._dirty = new Set(); this._pickDirty = new Set();
        this._scanT = 0; this._handT = 0; this._fxT = 0; this._clock = 0; this._queue = []; this._qCell = ''; this._pending = 0;
        this.enabled = !game.config?.map && game.config?.mode !== 'test';
        this._lastNight = -1;
        game.scene?.add(this.group);
    }

    get active() { return (this.game.gen ?? 1) >= BAKSADI_FROM_GEN && this.enabled; }
    get auth() { return this.game.authority !== false; }

    // ----------------------------------------------------------- meshes
    _ensureMeshes() {
        if (this.meshes) return this.meshes;
        const M = floraMaterials(), out = { body: {}, pick: {} };
        for (const kind of FLORA_ORDER) {
            const fm = FLORA_MATERIAL[kind];
            out.body[kind] = [];
            for (let v = 0; v < FLORA_VARIANTS; v++) out.body[kind].push(this._inst(floraBody(kind, v), M[fm.body], FLORA.MAX_PER_KIND));
            out.pick[kind] = this._inst(floraPick(kind), M[fm.pick], FLORA.MAX_PER_KIND * PICK_COUNT[kind]);
        }
        return (this.meshes = out);
    }

    _inst(geo, mat, cap) {
        const m = new THREE.InstancedMesh(geo, mat, cap);
        m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true;
        m.matrixAutoUpdate = false; m.userData.noFar = true;
        this.group.add(m);
        return m;
    }

    /** The shared shapes and shaders built ahead (the loading screen: Game.prewarm). */
    sample() {
        const M = this._ensureMeshes();
        const out = [];
        for (const kind of FLORA_ORDER) { const g = new THREE.Group(); g.add(new THREE.Mesh(M.body[kind][0].geometry, M.body[kind][0].material), new THREE.Mesh(M.pick[kind].geometry, M.pick[kind].material)); out.push(g); }
        return out;
    }

    // ----------------------------------------------------------- placing
    _biomeOf(t) { return (x, z) => BIOMES[t.biomeAt(Math.floor(x), Math.floor(z))]?.id || ''; }

    /** The cells round `p` that still need to be looked at, nearest first. */
    _plan(p) {
        const C = FLORA.CELL, R = FLORA.LOAD;
        const gx0 = Math.floor((p.x - R) / C), gx1 = Math.floor((p.x + R) / C), gz0 = Math.floor((p.z - R) / C), gz1 = Math.floor((p.z + R) / C);
        const cx = p.x / C - 0.5, cz = p.z / C - 0.5, q = [];
        for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
            for (const kind of FLORA_ORDER) { const key = kind + '|' + gx + ',' + gz; if (!this.groups.has(key)) q.push({ key, kind, gx, gz, d: (gx - cx) ** 2 + (gz - cz) ** 2 }); }
        }
        q.sort((a, b) => a.d - b.d);
        this._queue = q;
        // the far ones are put away
        const FAR = Math.ceil((FLORA.KEEP - FLORA.LOAD) / C);
        for (const [key, grp] of this.groups) {
            const cell = key.split('|')[1].split(',').map(Number);
            if (cell[0] >= gx0 - FAR && cell[0] <= gx1 + FAR && cell[1] >= gz0 - FAR && cell[1] <= gz1 + FAR) continue;
            if (grp) this._unload(grp);
            this.groups.delete(key);
        }
    }

    _place(t, e, seed) {
        const grp = floraGroupIn(e.kind, e.gx, e.gz, seed, this._biomeOf(t));
        if (!grp) { this.groups.set(e.key, null); return; }
        // the land of every member must be made already (never made in the frame — TerrainData.landMade)
        if (grp.members.some((m) => t.landMade && !t.landMade(m.x, m.z))) return; // (try again later)
        const K = FLORA_KINDS[e.kind], out = { key: e.key, kind: e.kind, plants: [] };
        for (const m of grp.members) {
            if (this.gone.has(m.id)) continue;
            const x = m.x, z = m.z;
            if (Math.hypot(x, z) < 40) continue; // (the start place stays clear)
            const top = t.topLayer(x, z), b = t.get(x, top, z);
            if (b !== BLOCK.GRASS && !(e.kind === 'frostcrystal' && b === BLOCK.SNOW)) continue;
            if (t.get(x, top + 1, z) === BLOCK.WATER || t.get(x, top + 1, z) === BLOCK.SNOW && e.kind !== 'frostcrystal') continue;
            if ((t.sites || t.castles)?.landAt?.(x, z) || t.isIsland?.(x, z)) continue; // (not in castles, villages, towers; not on islands)
            if (Math.abs(t.topLayer(x + 2, z) - top) > 2 || Math.abs(t.topLayer(x, z + 2) - top) > 2 || Math.abs(t.topLayer(x - 2, z) - top) > 2 || Math.abs(t.topLayer(x, z - 2) - top) > 2) continue; // (a steep slope: nothing grows)
            const pl = { ...m, kind: e.kind, y: top - 0.5, picks: [], boxId: null, burn: 0, group: out };
            const spots = floraBody(e.kind, m.variant).userData.picks;
            const was = this.picked.get(m.id);
            for (let i = 0; i < spots.length; i++) {
                const [lx, ly, lz, ps] = spots[i], c = Math.cos(m.yaw), s = Math.sin(m.yaw);
                pl.picks.push({ until: was?.[i] || 0, ps, wp: [m.x + (lx * c + lz * s) * m.scale, pl.y + ly * m.scale, m.z + (-lx * s + lz * c) * m.scale] });
            }
            this.picked.delete(m.id);
            if (K.solid && this.game.collision?.addBox) {
                const r = K.solid.r * m.scale;
                pl.boxId = this.game.collision.addBox({ minX: x - r, maxX: x + r, minY: pl.y, maxY: pl.y + K.solid.h * m.scale, minZ: z - r, maxZ: z + r, kind: 'tree', noSupport: true });
            }
            out.plants.push(pl);
            this.byId.set(m.id, pl);
            this.list[e.kind].push(pl);
        }
        this.groups.set(e.key, out.plants.length ? out : null);
        if (out.plants.length) { this._dirty.add(e.kind); this._pickDirty.add(e.kind); }
    }

    _unload(grp) {
        for (const pl of grp.plants) this._drop(pl, true);
        this._dirty.add(grp.kind); this._pickDirty.add(grp.kind);
    }

    _drop(pl, remember) {
        if (remember) {
            const until = pl.picks.map((p) => p.until);
            if (until.some((u) => u > Date.now())) this.picked.set(pl.id, until); else this.picked.delete(pl.id);
        }
        if (pl.boxId != null) this.game.collision?.removeBox?.(pl.boxId);
        this.byId.delete(pl.id);
        const L = this.list[pl.kind], i = L.indexOf(pl);
        if (i >= 0) L.splice(i, 1);
        const b = this.burning.indexOf(pl);
        if (b >= 0) this.burning.splice(b, 1);
    }

    // ----------------------------------------------------------- instances
    _writeBody(kind) {
        const M = this._ensureMeshes(), counts = new Array(FLORA_VARIANTS).fill(0);
        for (const pl of this.list[kind]) {
            if (pl.burn < 0) continue;
            const mesh = M.body[kind][pl.variant];
            if (counts[pl.variant] >= mesh.instanceMatrix.count) continue;
            _m.compose(_p.set(pl.x, pl.y, pl.z), _q.setFromAxisAngle(_up, pl.yaw), _s.setScalar(pl.scale * (pl.burn > 0 ? 1 - 0.4 * (1 - pl.burn / BURN_TIME) : 1)));
            mesh.setMatrixAt(counts[pl.variant]++, _m);
        }
        for (let v = 0; v < FLORA_VARIANTS; v++) { const mesh = M.body[kind][v]; mesh.count = counts[v]; mesh.instanceMatrix.needsUpdate = true; }
    }

    _writePicks(kind) {
        const M = this._ensureMeshes(), mesh = M.pick[kind], now = Date.now();
        let n = 0;
        for (const pl of this.list[kind]) {
            if (pl.burn < 0) continue;
            for (const pk of pl.picks) {
                if (n >= mesh.instanceMatrix.count) break;
                if (pk.until > now) { mesh.setMatrixAt(n++, ZERO); continue; }
                _m.compose(_p.set(pk.wp[0], pk.wp[1], pk.wp[2]), _q.setFromAxisAngle(_up, pl.yaw + pk.wp[0] * 3.1), _s.setScalar(pl.scale * pk.ps));
                mesh.setMatrixAt(n++, _m);
            }
        }
        mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    }

    // ----------------------------------------------------------- picking
    _give(item, side, pos) {
        const g = this.game;
        if (side && !g.items.held[side] && !g.weapons.hands[side].held) g.items.takeIntoHand(item, side);
        else g.inventory.storeItem(item);
        g.sound?.playPlant?.(pos, 'rustle', 0.6);
        const info = ITEM_INFO[item.kind];
        g.hud?.setVoice?.(`${info?.icon || '🌿'} ${info?.name || 'Растение'} — взято`, true);
    }

    /** (host) A part of a plant is picked by `toId`: it grows again in FLORA.REGROW_MS. */
    pick(pl, i, toId, side) {
        const pk = pl.picks[i];
        if (!pk || pk.until > Date.now() || pl.burn !== 0) return;
        pk.until = Date.now() + FLORA.REGROW_MS;
        this._pickDirty.add(pl.kind);
        if (this.game.sync && this.auth) this.game.sync.floraGone?.(pl.id, i, pk.until);
        const item = { kind: FLORA_KINDS[pl.kind].item, uid: newUid(), count: 1 };
        if (toId === this.game.localId) this._give(item, side, _v.set(pk.wp[0], pk.wp[1], pk.wp[2]));
        else this.game.sync?.animalMeatTo?.(toId, item, side);
    }

    /** (any computer) The host says a part was picked / a plant is gone. */
    netGone(id, i, until) {
        const pl = this.byId.get(id);
        if (!pl || !pl.picks[i]) return;
        pl.picks[i].until = Date.now() + Math.max(0, (until || 0) - Date.now());
        this._pickDirty.add(pl.kind);
    }

    _handPicks() {
        const g = this.game, now = performance.now();
        if (now - (this._pickAt || 0) < FLORA.PICK_COOL) return;
        const me = g.character.group.position;
        for (const side of ['right', 'left']) {
            if (g.items.held[side] || g.weapons.hands[side].held) continue;
            const hand = g.character.getHandWorldPosition(side, _v2);
            for (const kind of FLORA_ORDER) for (const pl of this.list[kind]) {
                if (Math.abs(pl.x - me.x) > 9 || Math.abs(pl.z - me.z) > 9 || pl.burn !== 0) continue;
                for (let i = 0; i < pl.picks.length; i++) {
                    const pk = pl.picks[i];
                    if (pk.until > Date.now()) continue;
                    if (Math.hypot(pk.wp[0] - hand.x, pk.wp[1] - hand.y, pk.wp[2] - hand.z) > FLORA.HAND * Math.max(0.7, pk.ps)) continue;
                    this._pickAt = now;
                    if (this.auth) this.pick(pl, i, g.localId, side);
                    else g.sync?.floraPick?.(pl.id, i, side);
                    return;
                }
            }
        }
    }

    /** «Gather» pointed at a plant: everything ripe into the slots. Returns a hint or null. */
    gatherAt(o, d) {
        const g = this.game;
        let best = null, bd = 12;
        for (const kind of FLORA_ORDER) for (const pl of this.list[kind]) {
            const to = _v.set(pl.x - o.x, pl.y + 1.4 - o.y, pl.z - o.z), dist = to.length();
            if (dist > bd || d.angleTo(to.normalize()) > 0.35) continue;
            best = pl; bd = dist;
        }
        if (!best) return null;
        let n = 0;
        best.picks.forEach((pk, i) => { if (pk.until <= Date.now()) { if (this.auth) this.pick(best, i, g.localId, null); else g.sync?.floraPick?.(best.id, i, null); n++; } });
        const K = FLORA_KINDS[best.kind];
        return n ? `✨ Gather: ${n} — ${K.name}` : `🌿 ${K.name}: пока нечего собирать — вырастет через несколько минут`;
    }

    // ----------------------------------------------------------- spells (host only; the callers check `authority`)
    /** A blast / lightning / fire ball at `pos`, radius r, of spell kind `kind`. */
    hitAt(pos, radius, dmg, kind) {
        if (!this.active) return false;
        let any = false;
        for (const fk of FLORA_ORDER) for (const pl of this.list[fk].slice()) {
            const reach = radius + REACH[fk] * pl.scale * 0.6;
            if (Math.hypot(pl.x - pos.x, pl.z - pos.z) > reach || Math.abs(pl.y + 1.2 - pos.y) > reach + 2) continue;
            if (this._harm(pl, kind)) any = true;
        }
        return any;
    }

    /** A ray (Inferno, Thunderwave, the cold rays…) from o along d for len m, width w. */
    hitRay(o, d, len, width, dmg, name) {
        if (!this.active) return false;
        let any = false;
        for (const fk of FLORA_ORDER) for (const pl of this.list[fk].slice()) {
            const to = _v.set(pl.x - o.x, pl.y + 1.0 - o.y, pl.z - o.z), t = to.dot(d);
            if (t < 0 || t > len) continue;
            if (_v2.copy(d).multiplyScalar(t).sub(to).length() > width + REACH[fk] * pl.scale * 0.5) continue;
            if (this._harm(pl, name)) any = true;
        }
        return any;
    }

    _harm(pl, spell) {
        const h = floraHarm(pl.kind, spell);
        if (h === 'none') return false;
        if (h === 'burn') { if (pl.burn === 0) this.ignite(pl); return true; }
        this.kill(pl, h);
        return true;
    }

    ignite(pl, fromNet = false) {
        if (pl.burn !== 0) return;
        pl.burn = BURN_TIME;
        this.burning.push(pl);
        this.game.sound?.playPlant?.(_v.set(pl.x, pl.y + 1.5, pl.z), 'burn', 0.7);
        if (!fromNet && this.game.sync && this.auth) this.game.sync.floraKill?.(pl.id, 'burn');
    }

    /** (any computer) The plant is gone: 'destroy' (blast / the gods), 'melt' (the crystal tree), 'ash' (burnt out). Its ripe parts fall as items on the host. */
    kill(pl, how, fromNet = false) {
        if (!this.byId.has(pl.id)) return;
        const g = this.game, K = FLORA_KINDS[pl.kind];
        this.gone.add(pl.id);
        if (!fromNet && this.auth) {
            let n = 0;
            if (how !== 'ash') for (const pk of pl.picks) {
                if (pk.until > Date.now() || n >= SCATTER_MAX) continue;
                g.items?.spawnLoose?.({ kind: K.item, uid: newUid(), count: 1 }, _p.set(pk.wp[0], pk.wp[1], pk.wp[2]), { vel: _s.set((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3) });
                n++;
            }
            g.sync?.floraKill?.(pl.id, how);
        }
        const at = _v.set(pl.x, pl.y + 1.5, pl.z);
        if (how === 'melt') { g.sound?.playSplashAt?.(at, 0.8); for (let i = 0; i < 14; i++) g.fx?.spark?.(at, 0x9fdcff, 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.7); }
        else if (how === 'destroy') { g.sound?.playPlant?.(at, 'fall', 0.9); for (let i = 0; i < 16; i++) g.fx?.spark?.(at, K.glow ? 0xbfe8ff : 0x6fae4a, 0.12, _v2.set((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.8); }
        this._drop(pl, false);
        if (pl.group) pl.group.plants = pl.group.plants.filter((q) => q !== pl);
        this._dirty.add(pl.kind); this._pickDirty.add(pl.kind);
    }

    // ----------------------------------------------------------- frame
    update(dt) {
        if (!this.active) { this.group.visible = false; return; }
        this.group.visible = true;
        const g = this.game, t = g.terrain?.data;
        if (!t) return;
        const me = g.character.group.position;
        this._clock += dt;
        FLORA_CLOCK.t.value += Math.min(0.1, dt);
        const night = g.world?._night || 0;
        // (the glow: a faint breath by day, strong at night)
        FLORA_CLOCK.glow.value = 0.28 + 0.22 * Math.sin(this._clock * 0.9) * 0.5 + 0.95 * night;

        // placing: the plan every 1.5 s or when the queue ran dry; a few groups per frame within the budget
        this._scanT -= dt;
        if (this._scanT <= 0) { this._scanT = 1.5; this._plan(me); }
        const seed = g.seed || 1, t0 = performance.now();
        while (this._queue.length && performance.now() - t0 < BUDGET_MS) {
            const e = this._queue.shift();
            if (!this.groups.has(e.key)) this._place(t, e, seed);
        }

        // instances: only the kinds that changed
        if (this._dirty.size || this._pickDirty.size) {
            for (const k of this._dirty) this._writeBody(k);
            for (const k of this._pickDirty) this._writePicks(k);
            this._dirty.clear(); this._pickDirty.clear();
        }
        // parts grow again
        this._growT = (this._growT || 0) - dt;
        if (this._growT <= 0) {
            this._growT = 1;
            const now = Date.now();
            for (const k of FLORA_ORDER) { let ripe = false; for (const pl of this.list[k]) for (const pk of pl.picks) if (pk.until && pk.until <= now) { pk.until = 0; ripe = true; } if (ripe) this._pickDirty.add(k); }
            if (this.picked.size > 600) for (const [id, u] of this.picked) if (!u.some((x) => x > now)) this.picked.delete(id);
        }

        // burning plants: embers, then ash
        for (let i = this.burning.length - 1; i >= 0; i--) {
            const pl = this.burning[i];
            pl.burn -= dt;
            if (g.fx?.spark && Math.random() < dt * 14) g.fx.spark(_v.set(pl.x + (Math.random() - 0.5) * 2, pl.y + 0.5 + Math.random() * 2, pl.z + (Math.random() - 0.5) * 2), Math.random() < 0.5 ? 0xff7a1c : 0xffc040, 0.14, _v2.set((Math.random() - 0.5), 1.5 + Math.random() * 2, (Math.random() - 0.5)), 0.7);
            if (pl.burn <= 0) { pl.burn = -1; this.kill(pl, 'ash'); }
            else this._dirty.add(pl.kind);
        }

        // the hand: pick
        this._handT -= dt;
        if (this._handT <= 0) { this._handT = 0.08; this._handPicks(); }

        // little lights and spores near the hero
        this._fxT -= dt;
        if (this._fxT <= 0 && g.fx?.glow) {
            this._fxT = 0.25;
            for (const kind of FLORA_ORDER) for (const pl of this.list[kind]) {
                const dx = Math.abs(pl.x - me.x), dz = Math.abs(pl.z - me.z);
                if (dx + dz > 55 || pl.burn !== 0) continue;
                if (kind === 'giantfern' && dx + dz < 6 && Math.random() < 0.8) g.fx.glow.spawn(pl.x + (Math.random() - 0.5) * 4, pl.y + 1 + Math.random() * 2.5, pl.z + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3, 0xcff59a, 0.07 + Math.random() * 0.06, 2.5 + Math.random() * 2, { shrink: 0.4 }); // (spores drift up when somebody walks through)
                else if (kind === 'glowcap' && Math.random() < 0.12 + night * 0.25) g.fx.glow.spawn(pl.x + (Math.random() - 0.5) * 2, pl.y + 0.8 + Math.random() * 1.2, pl.z + (Math.random() - 0.5) * 2, 0, 0.2 + Math.random() * 0.25, 0, Math.random() < 0.5 ? 0x7ff9ff : 0xb59cff, 0.07 + Math.random() * 0.07, 3 + Math.random() * 2, { shrink: 0.5 });
                else if (kind === 'frostcrystal' && Math.random() < 0.1) g.fx.glow.spawn(pl.x + (Math.random() - 0.5) * 2.5, pl.y + 0.5 + Math.random() * 3.5, pl.z + (Math.random() - 0.5) * 2.5, 0, 0.1, 0, 0xe8f8ff, 0.07, 1.4 + Math.random(), { shrink: 0.8 });
                else if (kind === 'sunherb' && night > 0.5 && Math.random() < 0.06) g.fx.glow.spawn(pl.x + (Math.random() - 0.5) * 1.2, pl.y + 1 + Math.random() * 0.5, pl.z + (Math.random() - 0.5) * 1.2, 0, 0.15, 0, 0xffd860, 0.07, 2.5, { shrink: 0.6 });
            }
        }
    }

    /** The current plants near a point (for the tests and the crowd's hints). */
    near(x, z, r) { const out = []; for (const k of FLORA_ORDER) for (const pl of this.list[k]) if (Math.hypot(pl.x - x, pl.z - z) <= r) out.push(pl); return out; }

    dispose() {
        for (const pl of [...this.byId.values()]) this._drop(pl, false);
        this.groups.clear();
        this.group.removeFromParent();
        if (this.meshes) { for (const kind of FLORA_ORDER) { for (const m of this.meshes.body[kind]) m.dispose?.(); this.meshes.pick[kind].dispose?.(); } }
    }
}

export { FLORA_OF_ITEM };
