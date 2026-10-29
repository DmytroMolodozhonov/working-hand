/**
 * DragonSmash.js — the weight of a dragon that holds a mind of «Империус Максима» (rules and tables: DragonImperius.js).
 *
 * The author: «Крылья и тело дракона ломают всё, с чем взаимодействуют: огромное существо с большой массой — взмах крыла,
 * удар хвоста, тела ломает стены, деревья, крыши, постройки, корабли, толкает существ».
 *
 * The host looks at the wings (middle and tip), the tail (middle and tip) and the body (chest, rump) every SMASH.TICK s:
 * how fast each part moves (from where it was a moment ago) is the strike — a touch (slow) shoves a little, a flap or a dive
 * breaks. Blocks go nearest first while the strike's budget lasts (each block costs its hardness: leaves 0.4 … castle stone 3),
 * at most a few dozen a look (a piece at a time, never a hitch), through builder._sendEdits(settle) → Structure/Collapse: what
 * lost its support comes down. The land, water, bedrock, the gods' gifts (Terrain.set refuses) and the enchanted stone are not broken.
 * Trees (of blocks and the standing ones), the ships' hulls (Ships.smash), living creatures (hits + CreatureImpact shoves).
 * Guests: they see the edits, the falls and the shoves from the host (the same as for any change of the world).
 */
import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';
import { isEnchanted } from '../world/EnchantedStone.js';
import { SMASH, PARTS, strikeOf, pickBreaks, blowOn, hardnessOf } from './DragonImperius.js';

const _p = new THREE.Vector3(), _w = new THREE.Vector3(), _dir = new THREE.Vector3();
const HIT_KIND = 'Bombardo'; // (what the creatures' hit tables know of a heavy blunt blow: a blast)

export class DragonSmash {
    constructor(game) {
        this.g = game;
        this.of = new Map(); // dragon id → {t, prev: Map(part → Vector3), hit: Map(creature → s), sound}
        this._cells = [];
    }

    /** (host, every frame of a dragon with a mind in it) */
    update(d, dt) {
        const g = this.g;
        if (!g.authority || d.dead || !d.model) { this.of.delete(d.id); return; }
        let s = this.of.get(d.id);
        if (!s) this.of.set(d.id, s = { t: 0, prev: new Map(), hit: new Map(), sound: 0 });
        s.t += dt; s.sound -= dt;
        if (s.t < SMASH.TICK) return;
        const el = s.t; s.t = 0;
        for (const [c, t] of [...s.hit]) { if (t - el <= 0) s.hit.delete(c); else s.hit.set(c, t - el); } // (a handful at most)
        d.model.updateMatrixWorld(true);
        const size = d.size || 1;
        const parts = this._parts(d);
        const data = g.builder?.data || g.terrain?.data;
        const edits = [];
        const hits = [];
        let budgetLeft = SMASH.MAX_BLOCKS;
        for (const P of parts) {
            const prev = s.prev.get(P.name);
            let speed = 0;
            if (prev) {
                _dir.subVectors(P.p, prev);
                speed = _dir.length() / el;
                if (speed > 90) speed = 0; // (set down somewhere else — a teleport, not a blow)
            } else _dir.set(0, 0, 0);
            (prev || (s.prev.set(P.name, new THREE.Vector3()), s.prev.get(P.name))).copy(P.p);
            if (speed < 0.6) continue;
            const R = P.r * size;
            const st = strikeOf(speed, size, P.mass);
            if (st.budget > 0 && data && budgetLeft > 0) {
                const n = this._breakBlocks(data, P.p, R + (st.depth - 1) * 0.35, st.budget, Math.min(SMASH.MAX_PER_PART, budgetLeft), edits);
                budgetLeft -= n;
                if (st.budget >= hardnessOf(BLOCK.WOOD)) this._breakTrees(P.p, R, st.budget);
                if (g.ships?.smash?.(P.p, R, st.budget * 0.5, null)) this._sound(s, P.p, 0.5);
            }
            hits.push({ p: P.p.clone(), v: _dir.clone().divideScalar(el), speed, R, mass: P.mass });
        }
        if (edits.length) this._broke(s, edits, parts);
        for (const h of hits) this._creatures(d, s, h);
    }

    /** The striking parts in the world: [{name, p, r, mass}] (positions reused: copy them). */
    _parts(d) {
        const u = d.model.userData, out = this._buf || (this._buf = []);
        let n = 0;
        const put = (name, r, mass, fn) => { const e = out[n] || (out[n] = { name, p: new THREE.Vector3(), r: 0, mass: 0 }); e.name = name; e.r = r; e.mass = mass; fn(e.p); n++; };
        const span = u.span || 10.5;
        u.wings.forEach((sh, i) => {
            const sg = i ? 1 : -1;
            put('wingMid' + i, PARTS.wingMid.r, PARTS.wingMid.mass, (v) => sh.localToWorld(v.set(sg * span * 0.5, 0, 0)));
            put('wingTip' + i, PARTS.wingTip.r, PARTS.wingTip.mass, (v) => sh.localToWorld(v.set(sg * span * 0.95, 0, 0)));
        });
        put('tailMid', PARTS.tailMid.r, PARTS.tailMid.mass, (v) => u.tail[Math.min(2, u.tail.length - 1)].getWorldPosition(v));
        put('tailTip', PARTS.tailTip.r, PARTS.tailTip.mass, (v) => u.tail[u.tail.length - 1].getWorldPosition(v));
        d.model.getWorldPosition(_w);
        const ry = d.model.rotation.y, sz = d.size || 1;
        const fx = Math.sin(ry) * sz, fz = Math.cos(ry) * sz, y = _w.y + 2.9 * sz; // (the body's capsule: DragonModel.BODY)
        put('chest', PARTS.chest.r, PARTS.chest.mass, (v) => v.set(_w.x - fx * 1.6, y, _w.z - fz * 1.6));
        put('rump', PARTS.rump.r, PARTS.rump.mass, (v) => v.set(_w.x + fx * 2.0, y, _w.z + fz * 2.0));
        out.length = n;
        return out;
    }

    /** Break blocks round `c` within R: nearest first while `budget` lasts. → how many. */
    _breakBlocks(data, c, R, budget, max, edits) {
        const g = this.g;
        if (data.landMade && !data.landMade(Math.round(c.x), Math.round(c.z))) return 0; // (the land is not made here yet: never make it in a frame)
        // far over everything under it: nothing to look at
        let top = -1e9;
        for (const [ox, oz] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]]) top = Math.max(top, data.topLayer(Math.round(c.x + ox), Math.round(c.z + oz)));
        if (c.y - R + 1.5 > top + 1) return 0;
        const cells = this._cells; cells.length = 0;
        const x0 = Math.floor(c.x - R), x1 = Math.ceil(c.x + R), z0 = Math.floor(c.z - R), z1 = Math.ceil(c.z + R);
        const L0 = Math.floor(c.y - R + 1), L1 = Math.ceil(c.y + R + 1);
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let L = L0; L <= L1; L++) {
            const t = data.get(x, L, z);
            if (t === BLOCK.AIR || hardnessOf(t) == null || isEnchanted(t)) continue;
            const d = Math.hypot(x - c.x, L - 1 - c.y, z - c.z);
            if (d > R) continue;
            cells.push({ x, L, z, t, d });
        }
        if (!cells.length) return 0;
        let n = 0;
        for (const q of pickBreaks(cells, budget, max)) {
            if (g.wards?.protects?.(q.x, q.L - 1, q.z) || g.temple?.wards?.(_p.set(q.x, q.L - 1, q.z))) continue; // (a house's sphere / the gods' temple holds it)
            data.set(q.x, q.L, q.z, BLOCK.AIR);
            if (data.get(q.x, q.L, q.z) !== BLOCK.AIR) continue; // (a gift of the gods / the enchanted stone: Terrain.set refused)
            edits.push([q.x, q.L, q.z, BLOCK.AIR, q.t]);
            n++;
        }
        return n;
    }

    /** The standing trees (not of blocks) the part reaches fall. */
    _breakTrees(c, R, budget) {
        const g = this.g, trees = g.world?.trees;
        if (!trees) return;
        let left = budget;
        for (const t of trees) {
            if (!t.alive || left < 1.3) continue;
            const y0 = (t.y ?? -0.5) - 1, y1 = y0 + (t.h ? t.h + 1 : 13);
            if (c.y + R < y0 || c.y - R > y1) continue;
            if (Math.hypot(t.x - c.x, t.z - c.z) > R + 1) continue;
            g.world.removeTree(t);
            g.sync?.treeGone?.(t.index);
            left -= 1.3;
        }
    }

    /** Blocks broke: tell everybody, let the building settle, dust and noise, the people are afraid. */
    _broke(s, edits, parts) {
        const g = this.g;
        let castle = 0;
        const deb = [];
        const at = _p.set(0, 0, 0);
        for (const e of edits) {
            at.x += e[0]; at.y += e[1] - 1; at.z += e[2];
            if (e[4] >= BLOCK.CS_GREY && e[4] <= BLOCK.RUNE) castle++;
            if (deb.length < 14) deb.push({ x: e[0] + (Math.random() - 0.5), y: e[1] - 1 + Math.random(), z: e[2] + (Math.random() - 0.5), color: 0x8a7d6a });
        }
        at.multiplyScalar(1 / edits.length);
        g.builder?._sendEdits(edits.map((e) => [e[0], e[1], e[2], e[3]]), true); // (what the broken blocks held may come down)
        g.fx?.debrisFrom?.(deb, at.clone(), 40);
        this._sound(s, at, Math.min(1, 0.3 + edits.length / 40));
        const me = g.character?.group.position;
        if (me && me.distanceTo(at) < 40) g.fx.shake = Math.max(g.fx.shake || 0, Math.min(0.6, 0.15 + edits.length / 120));
        g.castleLife?.alarm?.(at.clone(), 'blast', null, 12);
        if (castle) g.castleLife?.damaged?.(at.clone(), null, castle, true, { r: 8, kind: 'blast' });
    }

    _sound(s, at, k) {
        if (s.sound > 0) return;
        s.sound = SMASH.SOUND_CD;
        this.g.sound?.playExplosion?.(at.clone(), at.clone(), k);
    }

    /** The creatures a part strikes: hurt by the speed and the weight, shoved away along the blow (the heavy body: a dragon is never knocked back). */
    _creatures(d, s, h) {
        const g = this.g;
        if (h.speed < 1.5) return;
        const size = d.size || 1, b = blowOn(h.speed, size, h.mass);
        const R = h.R + 0.6;
        _dir.copy(h.v);
        const push = (p, c) => {
            if (c === d) return null;
            const to = _w.subVectors(p, h.p);
            if (to.length() > R + 1.1) return null;
            if (s.hit.has(c)) return null;
            const v = new THREE.Vector3(to.x, 0, to.z);
            if (v.lengthSq() < 1e-4) v.set(_dir.x, 0, _dir.z);
            v.normalize().multiplyScalar(b.push).addScaledVector(new THREE.Vector3(_dir.x, 0, _dir.z).normalize(), b.push * 0.5);
            return v;
        };
        let n = 0;
        n += g.creatureImpact?.spellArea?.('DragonSmash', null, push, { from: h.p.clone(), toss: Math.min(8, b.push * 0.25), down: 2 + b.push * 0.05,
            each: (c) => s.hit.set(c, SMASH.HIT_CD) }) || 0;
        if (b.dmg < 1) return;
        const at = h.p, dm = b.dmg;
        g.animals?.hitAt?.(at, R, dm, null);
        g.spiders?.hitAt?.(at, R, dm, HIT_KIND, null);
        g.plants?.hitAt?.(at, R, dm, HIT_KIND, null);
        g.gargoyles?.hitAt?.(at, R, dm, HIT_KIND, null);
        g.iceCastle?.hitAt?.(at, R, dm, HIT_KIND, null);
        g.castleLife?.hitAt?.(at, R, dm, null);
        g.livingTrees?.hitAt?.(at, R, dm, HIT_KIND);
        g.ships?.crew?.hitAt?.(at, R, dm, null, HIT_KIND);
        g.carriages?.hitAt?.(at, R, dm, null, 'blast');
        for (const z of g.zombies || []) {
            if (z.isDead) continue;
            _w.copy(z.group.position); _w.y += 1;
            if (_w.distanceTo(at) < R + 0.6) g.damageZombie?.(z, dm, false, _dir.clone().normalize(), 'dragon');
        }
        // (me, when it is not my mind in it: the shove only — my computer counts my own hurt)
        const me = g.character?.group.position;
        if (me && !d.imp?.mine && g.impact && !g.isDeadLocal && me.distanceTo(at) < R + 1.2 && !s.hit.has('me')) {
            s.hit.set('me', SMASH.HIT_CD);
            const v = _w.subVectors(me, at).setY(0);
            if (v.lengthSq() > 1e-4) g.impact.apply({ v: v.normalize().multiplyScalar(b.push).clone(), from: at.clone(), by: null, spell: 'DragonSmash', jolt: 0.6 });
        }
    }

    forget(id) { this.of.delete(id); }
}
