/**
 * FishPier.js — the fishermen's mini-pier of the Creative test ground and its free fishing rods (`g.fishPier`). The plan (blocks, the rack) — world/FishPierPlan.js.
 *
 * The author 07.11: «в творческом режиме… недалеко там моря… отдельный мини-причал для рыбаков. И там можно было бесплатно удочку взять. Чтобы я ее протестировал».
 *
 * Where: on the shore of the test sea (the one by the sea castle's quay), a good way west of the castle's land — `pierSite`. The world's own land there is whatever
 * the seed made; the pier is BUILT in blocks when the hero comes within `RANGE` m of it (or chooses «Причал рыбаков» in «Где появиться»): the shore row is found
 * by the sea's own shore function, the deck laid two layers over the sea's top water layer, the posts down to the sea floor — whatever the beach slopes
 * are. Like the Potion-maker's lair (PotionLair.js) the blocks are NOT written into the save (they are made again when the place is near and gone), and every computer makes
 * the same ones (the plan is a pure function of the world).
 *
 * The rods: `RACK.SLOTS` rods lie on the rack; a taken one is replaced after `REFILL` s (free, as many as you like). They are ordinary rods (`kind: 'fishingRod'`, `pier: 1`).
 *
 * «А если»: the land is not made yet — we wait (no ground made in the frame: `landMade`); no sea there (a world with no test sea) — nothing is built, nothing breaks; the hero dies /
 * leaves during the building — the slices simply go on / stop (the blocks that are put stay put); the same blocks again (the place regenerated, a second visit) — the marker block
 * is checked first, no double building; a rod taken to the far end of the world is the player's own; a rod left lying on the deck is not cleaned away.
 */
import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';
import { testSeaCastleSpot } from '../world/Castles.js';
import { plan as planPier, pierSite, PIER } from '../world/FishPierPlan.js';
import { newUid } from './ItemTypes.js';

export const PIER_RULES = {
    RANGE: 170, // m from the pier: the building starts
    KEEP_R: 90, // m: the rack is kept full
    SLICE: 1800, // blocks a frame
    REFILL: 2.5, // s after a rod was taken
    CHECK: 1.0,
    SCAN_UP: 40, // layers to look for the sea's top from
};

const _q = new THREE.Quaternion(), _p = new THREE.Vector3();

export class FishPier {
    constructor(game) {
        this.game = game;
        this._site = undefined;
        this.plan = null; this.state = null; this.bad = false;
        this._chkT = 0; this._t = 0; this._emptyAt = new Map();
        this.welcome = false;
        this.why = '';
    }

    get data() { return this.game.world?.terrain?.data; }

    /** The pier's place {xc, zShore} in the test sea of a Creative world (null: no such sea — an old world, another mode). */
    site() {
        if (this._site !== undefined) return this._site;
        const d = this.data;
        if (!d?.test || !d.seas?.test || this.game.config?.mode !== 'creative') return null; // (not cached: the world may not be ready yet)
        const sp = testSeaCastleSpot(d.seed, d.bigHouses);
        this._site = sp ? pierSite(d.seas.test, sp.X, sp.rect.u1, sp.shore.z) : null;
        return this._site;
    }

    /** Where the hero is put by «Где появиться → Причал рыбаков»: on the land behind the pier, facing the sea. */
    arrival() {
        const s = this.site();
        return s ? { x: s.xc, z: s.zShore + 12 } : null;
    }

    _landReady(P) {
        const d = this.data;
        for (let x = P.xc - 6; x <= P.xc + 6; x += 6) for (let z = P.zTop; z >= P.zBot; z -= 8) if (!d.landMade(x, z)) return false;
        return d.landMade(P.xc, P.zBot);
    }

    /** The plan from the real land: the shore row, the sea's top layer, the length that gets deep water. null — not now (land not made) / never (no sea here). */
    _make() {
        const d = this.data, s = this.site();
        if (!s) return null;
        const probe = { xc: s.xc, zTop: s.zShore + 14, zBot: s.zShore - PIER.LEN - 24 };
        if (!this._landReady(probe)) return null;
        // the shore row: the first row seawards (−z) where the sea's own function says water
        let zs = null;
        for (let z = s.zShore + 30; z >= s.zShore - 40; z--) if (d.seas.signedDist(s.xc, z) > 1) { zs = z; break; }
        if (zs == null) { this.bad = true; this.why = 'моря здесь нет'; return null; }
        const top = (x, z) => { for (let L = PIER_RULES.SCAN_UP; L >= -20; L--) if (d.get(x, L, z) === BLOCK.WATER) return L; return null; };
        const wt = top(s.xc, zs - 10);
        if (wt == null) { this.bad = true; this.why = 'воды у берега нет'; return null; }
        const D = wt + PIER.DECK;
        const zL = zs + 4;
        let len = PIER.LEN;
        const floorAt = (x, z) => d.floorBelow(Math.round(x), Math.round(z), D - 1);
        const groundAt = (x, z) => d.floorBelow(Math.round(x), Math.round(z), D + 14);
        while (len < 48 && wt - floorAt(s.xc, zL - len) < 3) len += 6; // (the head over water that is deep enough to fish: 3 m)
        return planPier({ xc: s.xc, zL, D, len, floorAt, groundAt });
    }

    _built() {
        const m = this.plan?.marker;
        return !!m && this.data.get(m[0], m[1], m[2]) === m[3];
    }

    update(dt) {
        const g = this.game;
        if (!(dt > 0)) return;
        this._t += dt;
        const s = this.site();
        const me = g.character?.group?.position;
        if (!s || !me || this.bad) return;
        const near = Math.hypot(me.x - s.xc, me.z - s.zShore) < PIER_RULES.RANGE;
        if (this.state) { this._step(this.state, dt); return; }
        if (!near) return;
        this._chkT -= dt;
        if (this._chkT > 0) return;
        this._chkT = PIER_RULES.CHECK;
        if (!this.plan) { this.plan = this._make(); if (!this.plan) return; }
        if (!this._built()) { this.state = { i: 0 }; return; }
        if (Math.hypot(me.x - s.xc, me.z - this.plan.zL) < PIER_RULES.KEEP_R) { const n = this._rods(); if (n > 0) this._chkT = 0.2; }
        if (this.welcome && Math.hypot(me.x - s.xc, me.z - this.plan.zL) < 32) { this.welcome = false; g.hud?.toast?.('🎣 Причал рыбаков: на стойке у входа лежат удочки — берите бесплатно (сколько хотите). Закиньте взмахом руки вперёд; клюнет — подсеките рывком вверх'); }
    }

    _step(S, dt) {
        const d = this.data, B = this.plan.blocks;
        void dt;
        const end = Math.min(B.length, S.i + PIER_RULES.SLICE);
        for (; S.i < end; S.i++) { const b = B[S.i]; d.set(b[0], b[1], b[2], b[3], b[4]); }
        if (S.i >= B.length) { this._dirty(); this.state = null; this._chkT = 0; this._emptyAt.clear(); }
    }

    _dirty() {
        const d = this.data, R = this.plan.rect;
        if (!d?._markDirty) return;
        for (let x = R.x0; x <= R.x1 + 8; x += 8) for (let z = R.z0; z <= R.z1 + 8; z += 8) d._markDirty(Math.min(x, R.x1), Math.min(z, R.z1));
    }

    /** The rack keeps its rods: an empty place gets a new rod after REFILL s (the first time at once). → how many were put now. */
    _rods() {
        const g = this.game, items = g.items;
        if (!items?.loose || !this.plan) return 0;
        const R = this.plan.rack;
        _q.set(R.quat[0], R.quat[1], R.quat[2], R.quat[3]);
        let n = 0;
        const have = [];
        for (const L of items.loose.values()) { if (L.item?.kind === 'fishingRod' && L.item.pier && L.model?.position) have.push(L.model.position); }
        for (let k = 0; k < R.slots.length; k++) {
            const sl = R.slots[k];
            const here = have.some((p) => Math.abs(p.x - sl.x) < 0.2 && Math.abs(p.z - sl.z) < 0.9 && Math.abs(p.y - sl.y) < 1.2);
            if (here) { this._emptyAt.delete(k); continue; }
            const t0 = this._emptyAt.get(k);
            if (t0 == null && this._built() && this._rackSeen) { this._emptyAt.set(k, this._t); continue; }
            if (t0 != null && this._t - t0 < PIER_RULES.REFILL) continue;
            this._emptyAt.delete(k);
            const L0 = items.spawnLoose({ kind: 'fishingRod', uid: newUid(), pier: 1 }, _p.set(sl.x, sl.y, sl.z), { broadcast: false, quat: _q.clone(), spin: new THREE.Vector3() });
            if (L0) { L0.rest = true; L0.vel?.set(0, 0, 0); L0.spin?.set(0, 0, 0); n++; }
        }
        this._rackSeen = true;
        return n;
    }

    dispose() { this.state = null; }
}
