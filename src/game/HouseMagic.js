/**
 * HouseMagic.js — «Create a House» and «Improve a House»: a house made by magic.
 *
 *   «Create a House»   Have at least 3 wool and 10 sand: in the slots / the hands (nothing has to be
 *                      thrown out — Stock.js) or lying together on the ground («Gather» takes
 *                      sand from a beach or a river bank), stand where some
 *                      trees grow round (at least 3 within ~26 m), take the wand, point it at the heap
 *                      and say the words. −20 mana, then 0.5 a second for the 10 seconds the magic
 *                      lasts: flashes of light, the resources and the trees whirl into the place, dust —
 *                      and the house rises from the ground up, with its roof. The sand is melted into
 *                      the glass of the windows, the wool goes into the bed, everything else comes
 *                      from the trees round it: they are gone. Each house is a little different
 *                      (src/world/MagicHouse.js): a door, a room with a bed, a store room with an
 *                      empty chest, glass in the windows.
 *   «Improve a House»  Come out of the house, throw what the next level needs beside it, point the
 *                      wand at it and say the words: the house changes again by magic (10 s) — bigger,
 *                      a second floor, a balcony… up to level 5, a big stone house (the stone comes up
 *                      from under the ground: no resource is needed for it). Each level takes twice as
 *                      much of everything (HOUSE_LEVELS): 40 mana and 1 a second for level 2, 80 for 3,
 *                      160 for 4, 320 for 5. Nothing in the chests is lost: they move with the house.
 *                      Each level is said anew, and only a while (3 min) after the house last changed.
 *   The wand must stay in the hand the whole time, and the mana must last: let it go (or run out) and
 *   the magic breaks — the place catches fire (what was built so far is logs: it burns).
 *
 * The house is real: its walls, floors and roof are terrain blocks (solid; a blast breaks them, the
 * castles' builders never touch them — Rebuild.js), the door opens with the hand (Doors.js), the beds
 * are beds (lie down, they are where you come back to life — Beds.js), the chests are chests: the hand
 * lifts the lid, what lies in it rises out of it, a thing let fall (or thrown) into the open chest goes
 * in, and when everybody has gone away from it the lid shuts with whatever still floats over it inside.
 * The glass breaks like a village house's glass (Houses.js). A house blown down to less than a third of
 * its walls is a ruin: its chests burst and spill what was in them.
 *
 * «На кого и на что» (CLAUDE.md): the spell acts on no creature — nobody is hit, pushed or hurt; a
 * block the house would put where somebody stands (a player, a zombie, a villager, an animal, a sailor,
 * the spider, a living tree…) waits until they have gone (nobody is shut into a wall). It acts on things:
 * the wool and the sand thrown for it (used up), the trees round it (taken: the instanced ones and the
 * trees of blocks), the ground and the bushes under it (cleared, a stone foundation laid). Water, a ship,
 * a castle or a village, another magic house, a house's sphere of protection — it is not built there.
 * Its flashes and the whirl frighten the people of a castle near (Danger «housemagic»); a broken magic
 * starts a fire (Danger «fire»).
 *
 * Multiplayer: the host decides (checks the heaps and the trees, uses them up, puts the blocks — they
 * travel as ordinary block edits — the door, the beds, keeps the chests' things); every computer sees
 * the same whirl, makes the chests and the glass from the house's record. The caster's computer keeps
 * the wand in the hand and pays the mana, and tells the host when the magic breaks. The houses (their
 * records and what lies in their chests) are saved with the world.
 */

import { manaRules } from './HeroSetup.js';
import * as THREE from 'three';
import { stockOf, stockTake, cleanClaim } from './Stock.js';
import { BLOCK, TREE_KINDS, isLeaves, isCastleBlock, isSolid } from '../world/Terrain.js';
import { housePlan, faceTowards, HOUSE_LEVELS, MAX_LEVEL, MAGIC_TIME, TREE_RADIUS, HOUSE_REACH } from '../world/MagicHouse.js';
import { Chest } from '../entities/Chest.js';
import { KINDS } from './CreatureImpact.js';
import { newUid } from './ItemTypes.js';
import { HouseMagicFx } from '../fx/HouseMagicFx.js';

export const HOUSE_MAGIC = {
    PILE_R: 12, // m: the heap — wool and sand lying this near the point the wand shows, or near the hero, count (any piles, summed)
    AIM: 30, // m: how far the wand reaches the heap
    AHEAD: 13, // m: Creative, the hand not pointing at the ground — the house this far ahead
    NEAR_HOUSE: 22, // m from the house's middle: a heap thrown «beside the house»
    IMPROVE_WAIT: 180, // s after the house last changed (Creative: no wait)
    GRACE: 0.7, // s without the wand in the hand before the magic breaks (a glitch of the camera is no letting go)
    SCROLL_FIRST: 0.35, // the chance of a «Create a House» scroll in a chest — until the player has found one
    RUIN: 0.33, // less than this share of its blocks left: a ruin
};
const DOOR_COLOR = 0x7a4f2a;
const _v = new THREE.Vector3();
/** Is a plan's cell [x, L, z, block, shape?] there as planned — the block and its shape (a ramp of the roof: BlockShapes.js)? */
const isThere = (data, c) => data.get(c[0], c[1], c[2]) === c[3] && (!data.shapeAt || (data.shapeAt(c[0], c[1], c[2]) || 0) === (c[4] | 0));
/** A plan's cell as a block edit (its shape as the fifth number only when it has one). */
const edit = (c) => (c[4] ? [c[0], c[1], c[2], c[3], c[4]] : [c[0], c[1], c[2], c[3]]);
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const r2 = (v) => Math.round(v * 100) / 100;

/** The wood (trunk) blocks of the trees — never planks (a floor, a woodpile is no tree). */
const TREE_WOOD = new Set(TREE_KINDS.map((k) => k.wood));
const leavesOf = (wood) => TREE_KINDS.find((k) => k.wood === wood)?.leaves;

/** What the heap holds: {wool, sand}. items: loose items ({kind, count, block}). */
export function countPile(items) {
    let wool = 0, sand = 0;
    for (const it of items) {
        if (it.kind === 'wool') wool += it.count || 1;
        else if ((it.kind === 'blocks' || it.kind === 'res') && it.block === BLOCK.SAND) sand += it.count || 1;
    }
    return { wool, sand };
}

/** What is missing for a level (null: nothing). */
export function missingFor(level, pile, trees) {
    const need = HOUSE_LEVELS[level];
    if (!need) return null;
    const miss = [];
    if (pile.wool < need.wool) miss.push(`шерсть ${need.wool - pile.wool} из ${need.wool} (есть ${pile.wool})`);
    if (pile.sand < need.sand) miss.push(`песок ${need.sand - pile.sand} из ${need.sand} (есть ${pile.sand})`);
    if (trees < need.trees) miss.push(`деревьев рядом ${need.trees - trees} из ${need.trees} (есть ${trees})`);
    return miss.length ? miss : null;
}

export class HouseMagic {
    constructor(game) {
        this.game = game;
        this.list = new Map(); // house id -> record {id, seed, level, x, z, G, face, woods, d, owner, name, t, store?}
        this.magic = null; // the magic going on now (seen on every computer): {id, level, by, t, x, z, ...}
        this.found = new Set(); // (host) the players who have found a «Create a House» scroll
        this.chests = new Map(); // chest id -> Chest (on every computer)
        this._plans = new Map(); // "id:level" -> plan (cache)
        this._lastCast = 0;
        this._interim = null;
        this._sweepT = 0;
        this._ruinT = 0;
        this._holdT = 0;
        this._noWand = 0;
        this.testAim = null; // (tests) a point to aim at instead of the wand
        this.netType = 'mhouse'; // (its messages; «Create a Castle» — CastleMagic.js — has its own)
        this.look = new HouseMagicFx(game.scene); // the logs and planks flying in, the melting sand, the spun wool (HouseMagicFx.js)
    }

    get auth() { return this.game.authority; }
    get data() { return this.game.terrain?.data || this.game.world?.terrain?.data || null; }
    /** Creative: every spell works without a wand (the hand casts) and the house needs no heap. */
    get free() { const m = this.game.config?.mode; return m === 'creative' || m === 'test'; }

    /** Cost of a level: upfront mana and mana a second. */
    static cost(level) { const L = HOUSE_LEVELS[level]; return L ? { mana: L.mana, drain: L.drain } : null; }

    /** (the terrain's light: a magic house's rooms are lit like a village house's, never a cave's dark) */
    _hookLight() {
        const data = this.data;
        if (!data || data._houseLit) return;
        data._houseLit = true;
        const prev = data.litLand; // (the castles of ice light their halls too — IceMagic._hookLight)
        data.litLand = (x, z) => {
            if (prev?.(x, z)) return true;
            for (const rec of this.list.values()) { const rc = this._rectOf(rec); if (x >= rc.x0 && x <= rc.x1 && z >= rc.z0 && z <= rc.z1) return true; }
            return false;
        };
        // (the same as shapes, for a whole piece of land at once — TerrainView._sendRebuild)
        const prevS = data._litPair === prev ? data.litShapes : null;
        data.litShapes = (x0, z0, x1, z1, out) => {
            prevS?.(x0, z0, x1, z1, out);
            for (const rec of this.list.values()) { const rc = this._rectOf(rec); if (rc.x1 >= x0 && rc.x0 <= x1 && rc.z1 >= z0 && rc.z0 <= z1) out.push(rc); }
            return out;
        };
        data._litPair = prev && !prevS ? null : data.litLand;
    }

    /** Its ground plan's rectangle (kept: asked for every column of a chunk made again — the plan's own key was too slow). */
    _rectOf(rec) {
        const m = this._rects || (this._rects = new WeakMap());
        let e = m.get(rec);
        if (!e || e.level !== rec.level) m.set(rec, e = { level: rec.level, rc: this.plan(rec).rect });
        return e.rc;
    }

    /** Its piece of the world drawn again — and lit as a house's (its blocks came before the record: a cave's dark). */
    _relight(rec) {
        const data = this.data, rc = rec && this.plan(rec).rect;
        if (!data?._markDirty || !rc) return;
        for (let x = Math.floor(rc.x0) - 1; x <= Math.ceil(rc.x1) + 9; x += 8) for (let z = Math.floor(rc.z0) - 1; z <= Math.ceil(rc.z1) + 9; z += 8) data._markDirty(Math.min(x, Math.ceil(rc.x1) + 1), Math.min(z, Math.ceil(rc.z1) + 1));
    }

    plan(rec, level = rec.level) {
        const key = rec.id + ':' + level + ':' + (rec.woods || []).join('.');
        let p = this._plans.get(key);
        if (!p) {
            p = housePlan({ seed: rec.seed, level, x: rec.x, z: rec.z, G: rec.G, face: rec.face, woods: rec.woods, minD: level > 1 ? rec.d || 0 : 0 });
            if (this._plans.size > 24) this._plans.clear();
            this._plans.set(key, p);
        }
        return p;
    }

    // =================================================================== spells
    /** «Create a House» / «Improve a House» (from Game.castLocalSpell). */
    cast(name, isFinal = true) {
        const g = this.game;
        const now = Date.now();
        const early = this._interim;
        if (isFinal && early && early.name === name && now - early.at < 3000) { this._interim = null; return null; }
        if (now - this._lastCast < 1500) return null;
        const say = (t) => { if (isFinal && t) g.hud.setVoice(t, true); return null; };
        if (this.magic) return say('🏠 Магия дома уже идёт — держите палочку');
        if (!g.items?.heldOf?.('wand') && !this.testAim && !this.free) return say('🪄 Возьмите палочку в руку и направьте её на землю, где поставить дом (шерсть и песок — в ячейках или рядом на земле)');
        const at = this._aimPoint();
        if (!at) return say(this.free ? '🏠 Покажите рукой на землю, где поставить дом' : '🏠 Направьте палочку на землю, где поставить дом');
        const me = g.character.group.position;
        let level = 1, hid = null;
        if (name === 'ImproveHouse') {
            const rec = this.houseNear(at, HOUSE_MAGIC.NEAR_HOUSE);
            if (!rec) return say('🏠 Рядом нет дома, созданного магией. Держите ресурсы в ячейках (или положите рядом) и направьте палочку на дом');
            if (rec.level >= MAX_LEVEL) return say('🏰 Этот дом уже самого высокого, пятого уровня');
            const p = this.plan(rec);
            if (me.x > p.rect.x0 && me.x < p.rect.x1 && me.z > p.rect.z0 && me.z < p.rect.z1) return say('🏠 Выйдите из дома — улучшают его снаружи');
            level = rec.level + 1; hid = rec.id;
        }
        const cost = HouseMagic.cost(level);
        if (manaRules(g) && g.combat.fatigue < cost.mana) return say(`😮‍💨 Не хватает маны: нужно ${cost.mana}, есть ${Math.floor(g.combat.fatigue)}`);
        const st = stockOf(g); // (what the hero carries in the slots and the hands counts too: nothing has to be thrown out)
        const ask = { kind: name, at: [r2(at.x), r2(at.y), r2(at.z)], c: [r2(me.x), r2(me.z)], hid, level, inv: { wool: st.wool, sand: st.sand } };
        if (!this.auth) {
            g.sync?.net?.send({ t: this.netType, a: 'ask', ...ask });
            say('🏠 …');
        } else {
            const res = this._hostStart(ask, g.localId);
            if (res !== true) return say(res);
        }
        this._lastCast = now;
        this._interim = isFinal ? null : { name, at: now };
        g._manaLater = true; // (mana grows when the house is done — paid in _go)
        return name;
    }

    /** Where the wand points: the ground it reaches, or the heap nearest to its ray. */
    _aimPoint() {
        const g = this.game;
        if (this.testAim) return new THREE.Vector3(this.testAim.x, this.testAim.y ?? g.collision.groundY(this.testAim.x, this.testAim.z), this.testAim.z);
        const side = g.wandSide?.() || g.magicHand || 'right';
        const hand = g.character.getHandWorldPosition(side, new THREE.Vector3());
        const dir = g.character.getHandDirection(side, new THREE.Vector3());
        let hit = null;
        for (let k = 0.5; k < HOUSE_MAGIC.AIM; k += 0.25) {
            const p = _v.copy(hand).addScaledVector(dir, k);
            const gy = g.collision.groundAt ? g.collision.groundAt(p.x, p.z, p.y) : g.collision.groundY(p.x, p.z);
            if (p.y <= gy + 0.2) { hit = new THREE.Vector3(p.x, gy, p.z); break; }
        }
        if (hit && this._pileAt(hit).length) return hit;
        let best = null;
        for (const L of g.items?.loose.values() || []) {
            if (!this._isRes(L)) continue;
            const to = _v2.subVectors(L.model.position, hand);
            const d = to.length();
            if (d > HOUSE_MAGIC.AIM) continue;
            const ang = dir.angleTo(to.normalize());
            if (ang < 0.4 && (!best || ang < best.ang)) best = { ang, p: L.model.position.clone() };
        }
        if (best || hit || !this.free) return best ? best.p : hit;
        // Creative, the hand raised as for any spell (its ray never meets the ground): the house stands
        // on the ground ahead, where the hand points (the body's front when it points straight up)
        const h = Math.hypot(dir.x, dir.z), ry = g.character.group.rotation.y;
        const fx = h > 0.2 ? dir.x / h : -Math.sin(ry), fz = h > 0.2 ? dir.z / h : -Math.cos(ry);
        const me = g.character.group.position;
        const x = me.x + fx * HOUSE_MAGIC.AHEAD, z = me.z + fz * HOUSE_MAGIC.AHEAD;
        return new THREE.Vector3(x, g.collision.groundY(x, z), z);
    }

    _isRes(L) { return !L.hover && (L.item.kind === 'wool' || ((L.item.kind === 'blocks' || L.item.kind === 'res') && L.item.block === BLOCK.SAND)); }

    /** The wool and sand lying round a point (and round `also`, e.g. the hero): [{L, item}], every pile once. */
    _pileAt(p, r = HOUSE_MAGIC.PILE_R, also = null) {
        const out = [];
        for (const L of this.game.items?.loose.values() || []) {
            if (!this._isRes(L)) continue;
            const m = L.model.position;
            const near = (q) => Math.hypot(m.x - q.x, m.z - q.z) <= r && Math.abs(m.y - (q.y ?? m.y)) < 6;
            if (near(p) || (also && near(also))) out.push(L);
        }
        return out;
    }

    /** The magic house whose middle is nearest to p (within r of its walls). */
    houseNear(p, r = 0) {
        let best = null;
        for (const rec of this.list.values()) {
            const rc = this.plan(rec).rect;
            const dx = Math.max(rc.x0 - p.x, 0, p.x - rc.x1), dz = Math.max(rc.z0 - p.z, 0, p.z - rc.z1);
            const d = Math.hypot(dx, dz);
            if (d <= r && (!best || d < best.d)) best = { rec, d };
        }
        return best?.rec || null;
    }

    // ============================================================ the host checks
    /** The ground layer of a column: under the trees and the bushes. null: water. */
    _ground(x, z) {
        const data = this.data;
        let L = data.topLayer(x, z);
        for (let k = 0; k < 40; k++) {
            const t = data.get(x, L, z);
            if (t === BLOCK.WATER || t === BLOCK.ICE) return null;
            if (t === BLOCK.AIR || TREE_WOOD.has(t) || isLeaves(t)) { L--; continue; }
            return L;
        }
        return L;
    }

    /** Trees round (x, z): the instanced ones and the trees of blocks, nearest first. */
    _treesNear(x, z, r = TREE_RADIUS) {
        const g = this.game, data = this.data;
        const out = [];
        for (const t of g.world?.trees || []) {
            if (!t.alive || t.burning) continue;
            const d = Math.hypot(t.x - x, t.z - z);
            if (d <= r) out.push({ i: t, x: t.x, z: t.z, y: (t.y ?? -0.5) + 4.5, d, wood: TREE_KINDS[t.kind || 0].wood });
        }
        const R = Math.ceil(r);
        const houses = [...this.list.values()].map((h) => this.plan(h).rect);
        for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
            const d = Math.hypot(dx, dz);
            if (d > r) continue;
            const cx = Math.round(x) + dx, cz = Math.round(z) + dz;
            if (houses.some((rc) => cx >= rc.x0 - 1 && cx <= rc.x1 + 1 && cz >= rc.z0 - 1 && cz <= rc.z1 + 1)) continue;
            const top = data.topLayer(cx, cz);
            // a trunk: its lowest log stands on the ground, a crown of its leaves over it
            let L = top, crown = false;
            while (L > top - 30 && !TREE_WOOD.has(data.get(cx, L, cz))) { if (isLeaves(data.get(cx, L, cz))) crown = true; L--; }
            if (!TREE_WOOD.has(data.get(cx, L, cz))) continue;
            const wood = data.get(cx, L, cz);
            while (TREE_WOOD.has(data.get(cx, L - 1, cz))) L--;
            // (a thick trunk of 2 × 2 logs is one tree: counted at its corner with no log beside it)
            if (TREE_WOOD.has(data.get(cx - 1, L, cz)) || TREE_WOOD.has(data.get(cx, L, cz - 1)) || TREE_WOOD.has(data.get(cx - 1, L, cz - 1))) continue;
            const below = data.get(cx, L - 1, cz);
            if (!isSolid(below) || isCastleBlock(below)) continue;
            if (!crown && !isLeaves(data.get(cx, L + 6, cz)) && !isLeaves(data.get(cx + 1, L + 4, cz))) continue;
            if (leavesOf(wood) == null) continue;
            out.push({ x: cx, z: cz, L, y: L - 1 + 3, d, wood });
        }
        out.sort((a, b) => a.d - b.d);
        return out;
    }

    /** May a house of `level` stand at (x, z), ground G? null or why not. */
    _siteProblem(rec, level) {
        const g = this.game, data = this.data;
        const p = this.plan(rec, level);
        const rc = p.rect;
        const was = this.list.has(rec.id) ? this.plan(this.list.get(rec.id)).rect : null; // (the house it grows from stands there)
        let bad = 0, n = 0;
        for (let x = Math.floor(rc.x0); x <= Math.ceil(rc.x1); x++) for (let z = Math.floor(rc.z0); z <= Math.ceil(rc.z1); z++) {
            if (was && x >= was.x0 && x <= was.x1 && z >= was.z0 && z <= was.z1) continue;
            n++;
            if (data.isSeaColumn?.(x, z)) return '🌊 Тут море — дом здесь не встанет';
            const G = this._ground(x, z);
            if (G == null) return '💧 Тут вода — найдите сухое место';
            if (Math.abs(G - rec.G) > 3) bad++;
            for (let L = rec.G - 1; L <= rec.G + 12; L++) {
                const t = data.get(x, L, z);
                if (isCastleBlock(t) && !p.own.has(x + ',' + L + ',' + z) && !this._mine(x, L, z, rec.id)) return '🏘️ Здесь уже что-то построено — найдите свободное место';
            }
            if (g.ships?.footprintAt?.(x, rec.G, z)) return '⚓ Здесь корабль';
        }
        if (bad > n * 0.18) return '⛰️ Слишком неровно — найдите место поровнее';
        const mid = _v.set(rec.x, rec.G + 1, rec.z);
        if (g.wards?.list?.size && g.wards.forbids?.(g.character.group.position, mid)) return '🛡️ Здесь чужая защита дома';
        return null;
    }

    /** Is this block part of another magic house's (or this house's earlier) plan? */
    _mine(x, L, z, id) {
        const rec = this.list.get(id);
        return !!rec && this.plan(rec).own.has(x + ',' + L + ',' + z);
    }

    /**
     * (host) Someone asks for the magic: check everything, use the heap, start it.
     * @returns {true|string} true, or why not
     */
    _hostStart(ask, by) {
        const g = this.game;
        if (this.magic) return '🏠 Магия дома уже идёт';
        const creative = g.config?.mode === 'creative' || g.config?.mode === 'test';
        const at = { x: +ask.at[0] || 0, y: +ask.at[1] || 0, z: +ask.at[2] || 0 };
        let level = 1, rec;
        if (ask.kind === 'ImproveHouse') {
            rec = this.list.get(ask.hid) || this.houseNear(at, HOUSE_MAGIC.NEAR_HOUSE);
            if (!rec) return '🏠 Рядом нет дома, созданного магией';
            if (rec.level >= MAX_LEVEL) return '🏰 Этот дом уже пятого уровня';
            const wait = creative ? 0 : HOUSE_MAGIC.IMPROVE_WAIT - (Date.now() - (rec.t || 0)) / 1000;
            if (wait > 0) return `⏳ Дом ещё не готов к новой магии — подождите ${Math.ceil(wait)} с`;
            level = rec.level + 1;
        } else {
            const x = Math.round(at.x), z = Math.round(at.z);
            for (const o of this.list.values()) if (Math.hypot(o.x - x, o.z - z) < HOUSE_REACH * 2) return '🏠 Слишком близко к другому дому, созданному магией';
            const G = this._ground(x, z);
            if (G == null) return '💧 Тут вода — найдите сухое место';
            const seed = (Math.random() * 0x7fffffff) | 0;
            const dx = (+ask.c?.[0] || 0) - x, dz = (+ask.c?.[1] || 0) - z;
            rec = { id: 'mh' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), seed, level: 0, x, z, G, face: faceTowards(dx, dz), woods: [], d: 0, owner: this._key(by), name: this._name(by), t: 0 };
        }
        const need = HOUSE_LEVELS[level];
        const pile = this._pileAt(at, HOUSE_MAGIC.PILE_R, ask.c ? { x: +ask.c[0] || 0, z: +ask.c[1] || 0 } : null); // (what lies round the wand's point or round the hero; wool and sand only — sheep and blocks of the world do not count)
        const onGround = countPile(pile.map((L) => L.item));
        // (the wool and sand carried in the slots / the hands add to the heap: the ground is used first)
        const carried = cleanClaim(ask.inv);
        const has = { wool: onGround.wool + carried.wool, sand: onGround.sand + carried.sand };
        const trees = this._treesNear(rec.x, rec.z);
        const miss = missingFor(level, has, trees.length);
        if (miss && !creative) return `🏠 Не хватает: ${miss.join(', ')}. Считаются: лежащее рядом (12 м), в руках, в ячейках и сумке; деревья — стоящие рядом`;
        // the wood the walls are made of: the trees it takes, the most of a kind first
        const take = trees.slice(0, need.trees);
        const count = new Map();
        for (const t of take) count.set(t.wood, (count.get(t.wood) || 0) + 1);
        const woods = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
        const next = { ...rec, woods: woods.length ? woods : rec.woods?.length ? rec.woods : [BLOCK.WOOD] };
        const why = this._siteProblem(next, level);
        if (why) return why;
        // the heap is used up (what is more than needed stays where it lay)
        const useWool = creative ? Math.min(need.wool, has.wool) : need.wool, useSand = creative ? Math.min(need.sand, has.sand) : need.sand;
        const piles = this._useUp(pile, Math.min(useWool, onGround.wool), Math.min(useSand, onGround.sand));
        const fromMe = { wool: Math.max(0, useWool - onGround.wool), sand: Math.max(0, useSand - onGround.sand) };
        if (fromMe.wool || fromMe.sand) {
            if (by === g.localId) stockTake(g, fromMe);
            else g.sync?.net?.send({ t: this.netType, a: 'spend', to: by, ...fromMe });
        }
        // the chests' things floating over them go back in (they move with the house)
        if (this.list.has(rec.id)) for (const c of this._chestsOf(rec.id)) this._sweep(c, true);
        const old = this.list.has(rec.id) ? this.plan(rec) : null;
        const plan = this.plan(next, level);
        if (level === 1) next.d = plan.d;
        // the order: first the old house's blocks that are not in the new one and the air, from the top; then the new blocks from the ground up
        const clear = [], build = [];
        for (const c of plan.cells) (c[3] === BLOCK.AIR ? clear : build).push(c);
        if (old) for (const k of old.own) if (!plan.own.has(k)) { const [x, L, z] = k.split(',').map(Number); clear.push([x, L, z, BLOCK.AIR]); }
        clear.sort((a, b) => b[1] - a[1]);
        this.magic = {
            id: next.id, level, by, t: 0, x: next.x, z: next.z, y: next.G + 1, G: next.G, rect: plan.rect,
            rec: next, plan, clear, build, fill: plan.fill, ci: 0, bi: 0, fi: 0, wait: [],
            trees: take, ti: 0, piles, flashT: 0, soundT: 0, beat: 0,
            win: plan.windows.map((w) => [r2(w.x), r2(w.y), r2(w.z)]), beds: plan.beds.map((b) => [r2(b.x), r2(b.y), r2(b.z)]),
        };
        const M = this.magic;
        g.sync?.net?.send({ t: this.netType, a: 'go', id: next.id, level, by, x: next.x, z: next.z, G: next.G, rect: plan.rect, trees: take.map((t) => [r2(t.x), r2(t.y), r2(t.z), t.wood]), piles, win: M.win, beds: M.beds });
        this._go(by, level, next.x, next.z);
        g.castleLife?.alarm?.({ x: next.x, y: next.G, z: next.z }, 'housemagic', by, 10);
        return true;
    }

    /** Take `wool` and `sand` from the heap: [[x, y, z]] where it lay (for the whirl). */
    _useUp(pile, wool, sand) {
        const g = this.game;
        const at = [];
        const need = { wool, sand };
        for (const L of pile) {
            const k = L.item.kind === 'wool' ? 'wool' : 'sand';
            if (need[k] <= 0) continue;
            const n = L.item.count || 1;
            const use = Math.min(n, need[k]);
            need[k] -= use;
            const pos = L.model.position.clone();
            at.push([r2(pos.x), r2(pos.y), r2(pos.z), k === 'sand' ? 1 : 0]); // (0 wool, 1 sand: how it flies — HouseMagicFx)
            g.items.removeLoose(L.item.uid);
            g.sync?.itemGone?.(L.item.uid, null, null);
            if (n - use > 0) g.items.spawnLoose({ ...L.item, uid: newUid(), count: n - use }, pos.add(_v.set(0, 0.3, 0)));
        }
        return at;
    }

    /** The magic begins (every computer): the whirl; the caster pays the mana. */
    _go(by, level, x, z) {
        const g = this.game;
        if (by === g.localId) {
            const c = g.combat;
            if (c?.enabled) c.fatigue = Math.max(0, c.fatigue - HOUSE_LEVELS[level].mana);
            if (c) c.paidCount = (c.paidCount || 0) + 1;
            this._noWand = 0;
            const hold = g.items?.heldOf?.('wand') || !this.free ? ' Держите палочку 10 секунд!' : ''; // (Creative without a wand: nothing to hold)
            g.hud?.setVoice?.(`✨ ${level === 1 ? 'Дом создаётся' : `Дом растёт до уровня ${level}`}…${hold}`, true);
        }
        const here = new THREE.Vector3(x, (this.magic?.y ?? 0) + 3, z);
        g.sound?.playHouseHum?.(here, MAGIC_TIME); // (every computer: heard near, faint far away)
        g.sound?.playHouseTheme?.(here, MAGIC_TIME, level); // (the tune: its last chord as the house is done)
        g.fx?.lightFlash?.(_v.set(x, this.magic?.y ?? 0, z), 0xfff2c4, 4, 0.6, 60);
    }

    // =================================================================== frame
    update(dt) {
        const g = this.game;
        if (this._repairAfter > 0 && (this._repairAfter -= dt) <= 0) this._repair();
        const m = this.magic;
        if (!m) this.look.idle(dt, g.fx);
        if (m) {
            this._last = m;
            m.t += dt;
            this._whirl(m, dt);
            if (m.by === g.localId) this._casterHold(m, dt);
            if (this.auth && this.magic === m) this._build(m, dt);
        }
        if (this.auth) {
            this._sweepT -= dt;
            if (this._sweepT <= 0) { this._sweepT = 0.4; this._chestsTick(); }
            this._ruinT -= dt;
            if (this._ruinT <= 0) { this._ruinT = 3; this._ruinCheck(); }
            if (this._waiting?.length) this._placeWaiting();
        }
    }

    /** My concentration is lost (Concentration.js): my magic of a house breaks now (the place catches fire). */
    breakMine() {
        const m = this.magic, g = this.game;
        if (!m || m.by !== g.localId) return false;
        this._focusLost = true;
        this._casterHold(m, 0);
        return true;
    }

    /** The caster keeps the wand in the hand and pays a little mana every second — or the magic breaks. */
    _casterHold(m, dt) {
        const g = this.game;
        const held = !!g.items?.heldOf?.('wand') || !!this.testAim || this.free; // (Creative: the hand casts)
        this._noWand = held ? 0 : this._noWand + dt;
        let why = null;
        if (this._noWand > HOUSE_MAGIC.GRACE) why = '🔥 Палочка выпала из руки — магия сорвалась, начался пожар!';
        else if (g.combat?.dead || this._focusLost) why = '🔥 Концентрация сорвалась — магия дома сорвалась, начался пожар!';
        else if (g.combat?.drain && !g.combat.drain(HOUSE_LEVELS[m.level].drain * dt, dt)) why = '🔥 Мана кончилась — магия сорвалась, начался пожар!';
        this._focusLost = false;
        if (why) {
            g.hud?.setVoice?.(why, true);
            if (this.auth) this._break(m);
            else { g.sync?.net?.send({ t: this.netType, a: 'break', id: m.id }); this._broke(m.id, [m.x, m.y, m.z]); }
            return;
        }
        if (!this.auth) { this._holdT -= dt; if (this._holdT <= 0) { this._holdT = 1; g.sync?.net?.send({ t: this.netType, a: 'hold', id: m.id }); } }
    }

    /** (host) The blocks appear: the old ones and the air go first (0–25 % of the time), then the house from the ground up. */
    _build(m) {
        const g = this.game, data = this.data;
        if (m.by !== g.localId && m.t - m.beat > 3.5) { this._break(m); return; } // (the caster's computer stopped answering)
        const f = Math.min(1, m.t / (MAGIC_TIME * 0.95));
        const edits = [];
        const goC = Math.floor(Math.min(1, f / 0.25) * m.clear.length);
        for (; m.ci < goC; m.ci++) {
            const [x, L, z] = m.clear[m.ci];
            const cur = data.get(x, L, z);
            if (cur === BLOCK.AIR || cur === BLOCK.BEDROCK) continue;
            data.set(x, L, z, BLOCK.AIR); edits.push([x, L, z, BLOCK.AIR]);
        }
        const fb = Math.max(0, (f - 0.2) / 0.8);
        const goF = Math.floor(Math.min(1, fb * 3) * m.fill.length);
        for (; m.fi < goF; m.fi++) {
            const [x, L, z, t] = m.fill[m.fi];
            if (isSolid(data.get(x, L, z))) continue;
            data.set(x, L, z, t); edits.push([x, L, z, t]);
        }
        const goB = Math.floor(fb * m.build.length);
        const bodies = m.bi < goB ? this._bodies() : null;
        for (; m.bi < goB; m.bi++) {
            const c = m.build[m.bi];
            if (isThere(data, c)) continue;
            if (this._occupied(c[0], c[1], c[2], bodies)) { m.wait.push(c); continue; }
            data.set(c[0], c[1], c[2], c[3], c[4] | 0); edits.push(edit(c));
        }
        if (edits.length) g.builder?._sendEdits(edits);
        // the trees: taken one by one in the first 70 % of the time
        const goT = Math.floor(Math.min(1, m.t / (MAGIC_TIME * 0.7)) * m.trees.length);
        for (; m.ti < goT; m.ti++) this._takeTree(m.trees[m.ti]);
        if (m.t >= MAGIC_TIME) this._done(m);
    }

    /** Every body (players and every kind of creature): [{x, z, y0, y1}]. */
    _bodies() {
        const g = this.game;
        const out = [];
        const ch = g.character?.group.position;
        if (ch) out.push({ x: ch.x, z: ch.z, y0: ch.y - 3.1, y1: ch.y + 2.5 });
        for (const r of g.remotes?.values() || []) if (r.position) out.push({ x: r.position.x, z: r.position.z, y0: r.position.y - 3.1, y1: r.position.y + 2.5 });
        for (const k of Object.values(KINDS)) {
            let list;
            try { list = k.list(g); } catch (e) { continue; }
            for (const c of list || []) {
                if (k.alive && !k.alive(c)) continue;
                const p = k.centre ? k.centre(c, _v2) : null;
                if (p) out.push({ x: p.x, z: p.z, y0: p.y - 2.8, y1: p.y + 2.2 });
            }
        }
        return out;
    }

    /** Is a creature's or a player's body in this block? (a block waits until they have gone) */
    _occupied(x, L, z, bodies = this._bodies()) {
        const y = L - 1; // (the block's middle)
        for (const b of bodies) if (Math.abs(b.x - x) < 1.3 && Math.abs(b.z - z) < 1.3 && y > b.y0 && y < b.y1) return true;
        return false;
    }

    /** (host) Blocks that waited for a body to go: put them when it has. */
    _placeWaiting() {
        this._waitT = (this._waitT || 0) - 1 / 60;
        if (this._waitT > 0) return;
        this._waitT = 1;
        const data = this.data, edits = [];
        const bodies = this._bodies();
        this._waiting = this._waiting.filter((c) => {
            if (isThere(data, c)) return false;
            if (this._occupied(c[0], c[1], c[2], bodies)) return true;
            data.set(c[0], c[1], c[2], c[3], c[4] | 0); edits.push(edit(c));
            return false;
        });
        if (edits.length) this.game.builder?._sendEdits(edits);
    }

    /** (host) A tree is taken by the magic: it comes apart and flies into the house. */
    _takeTree(t) {
        const g = this.game, data = this.data;
        if (t.i) {
            if (!t.i.alive) return;
            g.world.removeTree(t.i);
            g.sync?.treeGone?.(t.i.index);
            return;
        }
        const leaves = leavesOf(t.wood);
        const start = { x: t.x, L: t.L, z: t.z };
        const seen = new Set([t.x + ',' + t.L + ',' + t.z]);
        const out = [start];
        for (let i = 0; i < out.length && out.length < 600; i++) {
            const c = out[i];
            for (const [dx, dL, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
                const x = c.x + dx, L = c.L + dL, z = c.z + dz, k = x + ',' + L + ',' + z;
                if (seen.has(k)) continue;
                seen.add(k);
                if (Math.hypot(x - t.x, z - t.z) > 4.6 || L < t.L) continue; // (its own crown)
                const b = data.get(x, L, z);
                if (b !== t.wood && b !== leaves) continue;
                if (b === t.wood && Math.hypot(x - t.x, z - t.z) > 2.3) continue; // (a neighbour's trunk under touching crowns is not this tree)
                out.push({ x, L, z });
            }
        }
        const edits = out.filter((c) => data.get(c.x, c.L, c.z) !== BLOCK.AIR).map((c) => { data.set(c.x, c.L, c.z, BLOCK.AIR); return [c.x, c.L, c.z, BLOCK.AIR]; });
        if (edits.length) g.builder?._sendEdits(edits);
    }

    /** (host) Done: the house is there — its door, beds, chests and glass. */
    _done(m) {
        const g = this.game;
        this.magic = null;
        const rec = { ...m.rec, level: m.level, t: Date.now() };
        if (m.level === 1) rec.d = m.plan.d;
        else rec.d = Math.max(rec.d || 0, m.plan.d);
        rec.store = this.list.get(rec.id)?.store || rec.store || {};
        if (m.wait.length) (this._waiting = this._waiting || []).push(...m.wait);
        this.list.set(rec.id, rec);
        this._hookLight();
        this._relight(rec);
        this._furnish(rec, true);
        if (rec.level === 1) this.found.add(rec.owner);
        g.sync?.net?.send({ t: this.netType, a: 'done', rec: this._net(rec), by: m.by });
        this._finished(rec, m.by);
    }

    /** (every computer) The magic is over: the last flash; the caster's mana grows. */
    _finished(rec, by) {
        const g = this.game;
        if (this._last) this.look.finish(this._last, g.fx);
        this.magic = null;
        for (let i = 0; i < 60; i++) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 8;
            g.fx?.spark(_v.set(rec.x + Math.cos(a) * r, rec.G + 1 + Math.random() * 10, rec.z + Math.sin(a) * r), i % 2 ? 0xfff2c4 : 0xc9a8ff, 0.16, _v2.set(0, 1.5, 0), 1.2);
        }
        g.fx?.lightFlash?.(_v.set(rec.x, rec.G + 6, rec.z), 0xffffff, 6, 0.8, 80);
        g.sound?.playHouseDone?.(_v.set(rec.x, rec.G + 4, rec.z));
        if (by === g.localId) {
            g.mana?.success(rec.level === 1 ? 'CreateHouse' : 'ImproveHouse');
            g.hud?.setVoice?.(rec.level === 1 ? '🏠 Дом готов! Дверь открывается рукой; чтобы лечь — запрыгните на кровать; сундук пока пустой' : `🏠 Дом улучшен до уровня ${rec.level}!${rec.level < MAX_LEVEL ? ' Следующий уровень — «Improve a House» через 3 минуты' : ' Это самый большой, каменный дом'}`, true);
        }
    }

    /** (host) The magic breaks: the place catches fire. */
    _break(m) {
        if (this.magic !== m) return;
        const p = [m.x, m.y + 1, m.z];
        this.game.sync?.net?.send({ t: this.netType, a: 'broke', id: m.id, p });
        if (m.wait.length) (this._waiting = this._waiting || []).push(...m.wait);
        this._broke(m.id, p);
        this.game.castleLife?.alarm?.({ x: m.x, y: m.y, z: m.z }, 'fire', m.by, 8);
    }

    /** (every computer) Fire where the magic broke. */
    _broke(id, p) {
        const g = this.game;
        const m = this.magic;
        if (!m || m.id !== id) return;
        this.magic = null;
        g.sound?.stopHouseHum?.();
        const c = _v.set(p[0], p[1], p[2]);
        g.sound?.breakHouseTheme?.(c); // (the tune dies on a sour chord)
        const rc = m.rect;
        g.fx?.explosion?.(c, 2, 0.4);
        g.fx?.lightFlash?.(c, 0xff7a2b, 5, 0.8, 60);
        g.fire?.ignite?.(c, 4);
        // what was built so far (logs) burns: fire along its walls
        if (rc) for (const [fx, fz] of [[rc.x0 + 2, rc.z0 + 2], [rc.x1 - 2, rc.z0 + 2], [rc.x0 + 2, rc.z1 - 2], [rc.x1 - 2, rc.z1 - 2]]) g.fire?.ignite?.(_v2.set(fx, p[1] + 1, fz), 2.5);
    }

    // ============================================================== the whirl
    _whirl(m, dt) {
        const g = this.game, fx = g.fx;
        if (!fx) return;
        this.look.update(m, dt, fx); // (the trees' logs and planks, the sand, the wool, the pillar of light)
        const t = m.t, rc = m.rect || { x0: m.x - 6, x1: m.x + 6, z0: m.z - 6, z1: m.z + 6 };
        const R = Math.max(rc.x1 - rc.x0, rc.z1 - rc.z0) / 2;
        // a whirl of light round the house, rising
        for (let i = 0; i < 5; i++) {
            const a = t * 3 + i * 1.256 + Math.random() * 0.3, r = R * (0.6 + 0.4 * Math.sin(t * 1.3 + i));
            fx.spark(_v.set(m.x + Math.cos(a) * r, m.y + ((t * 2 + i * 1.7) % 12), m.z + Math.sin(a) * r), i % 2 ? 0xfff2a8 : 0xc9a8ff, 0.16, _v2.set(-Math.sin(a) * 6, 1.5, Math.cos(a) * 6), 0.7);
        }
        // the heap flows into it
        for (const s of m.piles || []) {
            if (Math.random() < 0.5) fx.spark(_v.set(s[0], s[1] + 0.3, s[2]), Math.random() < 0.5 ? 0xd6c48a : 0xf6f4ee, 0.15, _v2.set(m.x - s[0], m.y + 4 - s[1], m.z - s[2]).multiplyScalar(0.8), 1.2);
        }
        // dust round the bottom
        for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2;
            fx.spark(_v.set(m.x + Math.cos(a) * R, m.y + Math.random() * 0.8, m.z + Math.sin(a) * R), 0x9a8468, 0.3, _v2.set(Math.cos(a) * 1.5, 0.6, Math.sin(a) * 1.5), 1.4);
        }
        // flashes of light
        m.flashT -= dt;
        if (m.flashT <= 0) {
            m.flashT = 0.3 + Math.random() * 0.35;
            fx.lightFlash?.(_v.set(rc.x0 + Math.random() * (rc.x1 - rc.x0), m.y + 2 + Math.random() * 8, rc.z0 + Math.random() * (rc.z1 - rc.z0)), Math.random() < 0.5 ? 0xfff2c4 : 0xc9a8ff, 3, 0.35, 40);
        }
        // the sounds of the building (over the hum of _go): logs knocking into place, the sand melting
        // into the windows' glass, blocks laid — at the walls, so they come from all round the house
        m.soundT -= dt;
        const S = g.sound;
        if (m.soundT <= 0 && S?.playHouseBit) {
            const u = t / MAGIC_TIME;
            const at = _v.set(rc.x0 + Math.random() * (rc.x1 - rc.x0), m.y + 1 + Math.random() * 5 * Math.min(1, u * 1.5), rc.z0 + Math.random() * (rc.z1 - rc.z0));
            const r = Math.random();
            if (u > 0.08 && u < 0.85 && r < 0.4) S.playHouseBit('wood', at, 0.9);
            else if (u > 0.2 && u < 0.7 && r < 0.55 && m.piles?.length) S.playHouseBit('sand', at, 0.6);
            else if (u > 0.2) S.playHouseBit('block', at, 0.7);
            m.soundT = 0.18 + Math.random() * 0.3;
        }
    }

    // ============================================================== furnishing
    _chestsOf(id) { return [...this.chests.values()].filter((c) => c.store?.house === id); }

    /** (every computer) The house's door, beds (host), chests and glass at its level. */
    _furnish(rec, host = false) {
        const g = this.game;
        const p = this.plan(rec);
        if (p.door && g.doors) {
            const id = rec.id + 'd';
            const was = g.doors.list.get(id);
            g.doors._place({ id, ...p.door, color: DOOR_COLOR, a: was?.a || 0 });
            if (host) g.sync?.door?.({ id, ...p.door, color: DOOR_COLOR, a: 0 });
        }
        if (host && g.beds) p.beds.forEach((b, k) => {
            const id = rec.id + 'b' + k;
            const was = g.beds.list.get(id);
            if (was) { g.beds._place({ id, x: b.x, y: b.y, z: b.z, ry: b.yaw, color: was.color }); g.sync?.bed?.({ a: 'set', d: g.beds._data(was) }); }
            else g.beds.spawnBed({ x: b.x, y: b.y, z: b.z }, b.yaw, 'white', { id });
        });
        // the chests: made again where this level has them (what is in them stays in the record)
        for (const c of this._chestsOf(rec.id)) this._dropChest(c);
        for (const c of p.chests) {
            const id = rec.id + 'c' + c.k;
            const chest = new Chest(g.scene, new THREE.Vector3(c.x, c.y, c.z), 'loot', c.yaw + Math.PI, id, { scale: c.scale });
            chest.setWallGap?.(c.gap);
            chest.mesh.updateMatrixWorld(true);
            chest.boxId = g.collision.addBox(chest.getCollisionBox());
            chest.store = { house: rec.id, k: c.k };
            chest.locked = true; chest.setAjar(); // (not locked: the owner's own — the hand lifts the lid)
            this.chests.set(id, chest);
            g.chests.push(chest);
        }
        // the glass
        g.houses?.setExtraPanes?.(rec.id, p.windows.map((w, k) => ({ id: `${rec.id}L${rec.level}w${k}`, ...w })));
    }

    _dropChest(c) {
        const g = this.game;
        if (c.boxId != null) g.collision.removeBox(c.boxId);
        c.dispose?.();
        const k = g.chests.indexOf(c);
        if (k >= 0) g.chests.splice(k, 1);
        this.chests.delete(c.id);
    }

    _unfurnish(rec) {
        const g = this.game;
        g.doors?.remove?.(rec.id + 'd');
        for (let k = 0; k < 6; k++) { const id = rec.id + 'b' + k; if (g.beds?.list.has(id) && g.beds.lying !== id) g.beds.removeBed?.(id); } // (every computer: the house's record goes everywhere)
        for (const c of this._chestsOf(rec.id)) this._dropChest(c);
        g.houses?.setExtraPanes?.(rec.id, []);
    }

    // ================================================================= chests
    /** (host) A store chest's lid is lifted: what is in it rises out of it, in a row over it. */
    chestOpened(chest) {
        const g = this.game;
        const rec = this.list.get(chest.store.house);
        if (!rec) return;
        const items = rec.store?.[chest.store.k] || [];
        if (rec.store) rec.store[chest.store.k] = [];
        chest.mesh.updateMatrixWorld(true);
        const pos = chest.getRewardPosition(new THREE.Vector3());
        const q = chest.mesh.getWorldQuaternion(new THREE.Quaternion());
        const across = new THREE.Vector3(1, 0, 0).applyQuaternion(q).setY(0).normalize();
        const front = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
        const gap = Math.min(0.9, 3.2 / Math.max(1, items.length));
        items.forEach((it, i) => {
            const p = pos.clone().addScaledVector(across, (i - (items.length - 1) / 2) * gap).addScaledVector(front, 0.3);
            p.y += 1.1;
            g.items.spawnLoose(it, p, { hover: true, rise: true });
        });
        chest.awayT = 0;
        if (!items.length) g.hud?.toast?.('📦 Сундук пуст — положите в него что-нибудь: отпустите вещь над открытым сундуком');
    }

    /** (host) The chest burnt down (BurnWreck.js): what was in it falls into the ashes. */
    chestBurnt(chest, at) {
        const rec = this.list.get(chest.store.house);
        this.chests.delete(chest.id);
        if (!rec?.store) return;
        for (const it of rec.store[chest.store.k] || []) this.game.items?.spawnLoose(it, new THREE.Vector3(at.x + (Math.random() - 0.5), at.y + 0.4, at.z + (Math.random() - 0.5)), { vel: new THREE.Vector3(0, 1, 0) });
        rec.store[chest.store.k] = [];
    }

    /** Is a point in (or just over) the chest's box? */
    _inChest(chest, p, up = 2.4) {
        const l = chest.mesh.worldToLocal(_v.copy(p));
        const s = chest.scale || 2;
        return Math.abs(l.x) < 0.7 && Math.abs(l.z) < 0.5 && p.y > chest.mesh.position.y - 0.2 && p.y < chest.mesh.position.y + up * (s / 2) + 0.6 * s;
    }

    /** May I keep things in this house's chest: my own house, or one whose ward I am let into («Protection House Grant»)? */
    mayStore(rec) {
        const g = this.game;
        if (!rec) return false;
        const key = this._key(g.localId);
        if (rec.owner === key) return true;
        for (const w of g.wards?.list?.values?.() || []) {
            if (w.owner !== rec.owner || !(w.grant || []).includes(key)) continue;
            if (Math.hypot(w.c.x - rec.x, w.c.z - rec.z) <= w.r) return true;
        }
        return false;
    }

    /**
     * The hand's point over my chest of a magic house (not a villager's / a castle's — that is theft, and
     * a cave's / a ship's chest is no store): inside its box ±0.3 m, up to 1.2 m over its top.
     * @returns {{chest, open: boolean}|null} open — the lid is up (it goes in); shut — it lies on the lid.
     */
    chestUnderHand(p) {
        for (const c of this.chests.values()) {
            if (!c.store || c.store.castle) continue;
            const rec = this.list.get(c.store.house);
            if (!rec || !this.mayStore(rec)) continue;
            c.mesh.updateMatrixWorld(true);
            const s = c.scale || 2, l = c.mesh.worldToLocal(_v.copy(p));
            const top = c.mesh.position.y + 0.7 * s;
            if (Math.abs(l.x) > 0.625 + 0.3 / s || Math.abs(l.z) > 0.425 + 0.3 / s || p.y < c.mesh.position.y || p.y > top + 1.2) continue;
            return { chest: c, open: !!c.isOpen && !c.animating, top };
        }
        return null;
    }

    /** (host) A thing laid into an open chest by the hand: kept in its record at once (the sweep would do it a moment later). */
    sweepNow(chest) { return this._sweep(chest, false); }

    /** (host) Things put into (or left floating over) a chest go into it. */
    _sweep(chest, hovering = false) {
        const g = this.game;
        const rec = this.list.get(chest.store?.house);
        if (!rec || !g.items) return 0;
        rec.store = rec.store || {};
        const into = rec.store[chest.store.k] || (rec.store[chest.store.k] = []);
        let n = 0;
        for (const L of [...g.items.loose.values()]) {
            if (L.hover && !hovering) continue;
            if (!L.hover && L.vel && L.vel.lengthSq() > 4) continue; // (still flying: it may yet bounce out)
            if (!this._inChest(chest, L.model.position, L.hover ? 2.6 : 1.4)) continue;
            g.items.removeLoose(L.item.uid);
            g.sync?.itemGone?.(L.item.uid, null, null);
            const { hover, rise, ...item } = L.item; // eslint-disable-line no-unused-vars
            into.push(item);
            n++;
            for (let i = 0; i < 8; i++) g.fx?.spark(_v2.copy(L.model.position), 0xfff2a8, 0.1, _v3.set((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2), 0.5);
        }
        return n;
    }

    /** (host) Things put into open chests; a chest left alone shuts (and what floats over it goes in). */
    _chestsTick() {
        const g = this.game;
        const pts = [g.character.group.position, ...[...(g.remotes?.values() || [])].map((r) => r.position).filter(Boolean)];
        for (const c of this.chests.values()) {
            if (!c.isOpen) continue;
            if (!c.animating) this._sweep(c, false);
            const p = c.mesh.position;
            const far = pts.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > 7);
            c.awayT = far ? (c.awayT || 0) + 0.4 : 0;
            if (c.awayT > 3 && !c.animating) {
                c.awayT = 0;
                this._sweep(c, true);
                this._shut(c);
                g.sync?.net?.send({ t: this.netType, a: 'close', cid: c.id });
            }
        }
    }

    _shut(c) {
        c.close();
        c.setAjar();
        (this.game._openedChests || new Set()).delete(c.id);
    }

    // ============================================== «Вингардиум Левиоса Максима»
    get lifting() { return this._lifting || (this._lifting = new Set()); }

    /** The house a block (x, L, z) is part of (its walls, floor, roof), or null. */
    houseOfBlock(x, L, z) {
        for (const rec of this.list.values()) {
            if (this.lifting.has(rec.id) || (this.magic && this.magic.id === rec.id)) continue;
            const rc = this._rectOf(rec);
            if (x < rc.x0 - 1 || x > rc.x1 + 1 || z < rc.z0 - 1 || z > rc.z1 + 1) continue;
            if (this.plan(rec).own.has(x + ',' + L + ',' + z)) return rec;
        }
        return null;
    }

    /** Its blocks as they stand now (what «Левиоса Максима» lifts): [[x, L, z, type]]. */
    blocksOf(rec) {
        const data = this.data, out = [];
        if (!data) return out;
        for (const c of this.plan(rec).cells) if (c[3] !== BLOCK.AIR && data.get(c[0], c[1], c[2]) === c[3]) out.push([c[0], c[1], c[2], c[3]]);
        return out;
    }

    /** (every computer) Lifted: its door, beds, chests and glass go up with it (what is in the chests stays in the record). */
    liftUp(rec) {
        this.lifting.add(rec.id);
        this._unfurnish(rec);
    }

    /**
     * (every computer) It came down. Whole: the same house stands where it was set down (moved by d = [dx, dL, dz]),
     * furnished again. Broken: it is no more — what was in its chests spills out round `at` (the host).
     */
    putDown(rec, d, broken, at) {
        const g = this.game;
        this.lifting.delete(rec.id);
        if (broken) {
            if (this.auth) for (const items of Object.values(rec.store || {})) for (const it of items || []) {
                const a = Math.random() * Math.PI * 2;
                g.items?.spawnLoose(it, new THREE.Vector3(at.x + Math.cos(a) * 2.5, at.y + 1.5, at.z + Math.sin(a) * 2.5), { vel: new THREE.Vector3(Math.cos(a) * 3, 3, Math.sin(a) * 3) });
            }
            this._relight(rec);
            this.list.delete(rec.id);
            return;
        }
        this._relight(rec);
        rec.x += d[0]; rec.G += d[1]; rec.z += d[2];
        for (const k of [...this._plans.keys()]) if (k.startsWith(rec.id + ':')) this._plans.delete(k);
        this._rects?.delete(rec);
        rec.miss = [];
        this._relight(rec);
        this._furnish(rec, this.auth);
    }

    // ============================================================== ruins
    /** (host) A house blown down to less than a third of its blocks is a ruin: its chests spill. */
    _ruinCheck() {
        const g = this.game, data = this.data;
        if (!data || this.magic) return;
        const pts = [g.character.group.position, ...[...(g.remotes?.values() || [])].map((r) => r.position).filter(Boolean)];
        for (const rec of [...this.list.values()]) {
            if (this.lifting.has(rec.id)) continue; // (up in the air: «Левиоса Максима»)
            if (!pts.some((p) => Math.hypot(p.x - rec.x, p.z - rec.z) < 120)) continue;
            const p = this.plan(rec);
            let have = 0;
            for (const k of p.own) { const [x, L, z] = k.split(',').map(Number); if (data.get(x, L, z) !== BLOCK.AIR) have++; }
            if (have >= p.own.size * HOUSE_MAGIC.RUIN) continue;
            this._ruin(rec);
            g.sync?.net?.send({ t: this.netType, a: 'gone', id: rec.id });
        }
    }

    _ruin(rec) {
        const g = this.game;
        if (this.auth) for (const c of this._chestsOf(rec.id)) {
            const items = rec.store?.[c.store.k] || [];
            const pos = c.mesh.position;
            items.forEach((it) => g.items?.spawnLoose(it, new THREE.Vector3(pos.x, pos.y + 1.5, pos.z), { vel: new THREE.Vector3((Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4) }));
        }
        this._unfurnish(rec);
        this.list.delete(rec.id);
    }

    // ============================================================ scrolls
    /** The lasting key of a player (their things are kept under it — WorldSave). */
    _key(id) {
        const g = this.game;
        if (!id || id === g.localId || id === 'local') return g.keeper?.myKey || 'me';
        const pl = g.net?.players?.get?.(id);
        return pl?.pid ? 'id:' + pl.pid : 'n:' + (pl?.name || id);
    }

    _name(id) {
        const g = this.game;
        if (!id || id === g.localId || id === 'local') return g.net?.name || 'Игрок';
        return g.net?.players?.get?.(id)?.name || 'Игрок';
    }

    /**
     * (host) A chest is opened by `by`: until that player has found one, a «Create a House» scroll is
     * in it far more often (only the first one is easy to find). @returns [scroll] or []
     */
    scrollFor(by, rng = Math.random) {
        const g = this.game;
        if (g.config?.mode === 'creative') return [];
        const key = this._key(by);
        if (this.found.has(key)) return [];
        if ((by === g.localId || by === 'local') && g.bonus?.spells?.CreateHouse) { this.found.add(key); return []; }
        if (rng() >= HOUSE_MAGIC.SCROLL_FIRST) return [];
        this.found.add(key);
        return [{ kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'CreateHouse' }];
    }

    // ============================================================ net / save
    _net(rec) { const { store, ...r } = rec; return { ...r, miss: this._missing(rec) }; } // eslint-disable-line no-unused-vars

    netList() { return [...this.list.values()].map((r) => this._net(r)); }

    applyNet(list) {
        for (const r of list || []) this._accept(r);
        this._repairAfter = 2; // (after the guest's welcome has replayed the old blasts too)
    }

    /**
     * The house's blocks that are not there now (blown away, gathered…): kept with the record, so that a
     * loaded world (or a friend's computer) puts back exactly the house as it stood — no more, no less.
     */
    _missing(rec) {
        const data = this.data;
        if (!data || (this.magic && this.magic.id === rec.id) || this.lifting.has(rec.id)) return rec.miss || [];
        const p = this.plan(rec), out = [];
        for (const c of p.cells) {
            if (c[3] === BLOCK.AIR) continue;
            if (!isThere(data, c)) { out.push(c[0] + ',' + c[1] + ',' + c[2]); if (out.length >= 6000) break; }
        }
        return out;
    }

    /**
     * After a world is loaded (or a guest joined): the house stands block for block as it was saved.
     * The old block edits are replayed before the old blasts (a crater dug before the house was built
     * would eat into its walls), and the oldest edits of a very busy world are dropped from the save —
     * so the house's own blocks are put back from its plan, all but the ones that were really gone, and
     * its piece of the world is drawn (and lit) again.
     */
    _repair() {
        const data = this.data;
        if (!data) return 0;
        let n = 0;
        for (const rec of this.list.values()) {
            const miss = new Set(rec.miss || []);
            const edits = [];
            const p = this.plan(rec);
            for (const c of p.cells) {
                if (c[3] === BLOCK.AIR || miss.has(c[0] + ',' + c[1] + ',' + c[2])) continue;
                if (isThere(data, c)) continue;
                data.set(c[0], c[1], c[2], c[3], c[4] | 0);
                edits.push(edit(c));
            }
            if (edits.length) { n += edits.length; if (this.auth) this.game.builder?._sendEdits(edits); else this.game.blockEdits?.push?.(...edits); }
            this._relight(rec); // (draw it again: its chunks and their light)
        }
        return n;
    }

    _accept(r) {
        if (!r || !r.id || !(r.level >= 1)) return;
        this._hookLight();
        const was = this.list.get(r.id);
        const rec = { ...r, store: was?.store || r.store || {}, miss: Array.isArray(r.miss) ? r.miss.slice(0, 6000) : was?.miss || [] };
        this.list.set(rec.id, rec);
        if (!was || was.level !== rec.level) this._relight(rec);
        if (!was || was.level !== rec.level || !this._chestsOf(rec.id).length) this._furnish(rec, false);
    }

    /** Messages ('mhouse'). */
    onNet(m, isHost) {
        const g = this.game;
        switch (m.a) {
            case 'ask': {
                if (!isHost) break;
                const res = this._hostStart({ kind: m.kind === 'ImproveHouse' ? 'ImproveHouse' : 'CreateHouse', at: m.at || [0, 0, 0], c: m.c, hid: m.hid, inv: m.inv }, m.from);
                if (res !== true) g.sync?.net?.send({ t: this.netType, a: 'no', to: m.from, msg: String(res).slice(0, 200) });
                break;
            }
            case 'spend': if (m.to === g.localId) stockTake(g, cleanClaim(m)); break; // (the host used what I carry)
            case 'no': if (m.to === g.localId) g.hud?.setVoice?.(m.msg, true); break;
            case 'go': {
                if (isHost) break;
                this.magic = { id: m.id, level: m.level, by: m.by, t: 0, x: m.x, z: m.z, y: (m.G | 0) + 1, G: m.G, rect: m.rect, trees: m.trees || [], piles: m.piles || [], win: m.win || [], beds: m.beds || [], flashT: 0, soundT: 0 };
                this._go(m.by, m.level, m.x, m.z);
                break;
            }
            case 'hold': if (isHost && this.magic && this.magic.id === m.id && this.magic.by === m.from) this.magic.beat = this.magic.t; break;
            case 'break': if (isHost && this.magic && this.magic.id === m.id && this.magic.by === m.from) this._break(this.magic); break;
            case 'broke': if (!isHost) this._broke(m.id, m.p || [0, 0, 0]); break;
            case 'done': if (!isHost && m.rec) { this._accept(m.rec); this._finished(m.rec, m.by); } break;
            case 'gone': if (!isHost) { const r = this.list.get(m.id); if (r) this._ruin(r); } break;
            case 'close': if (!isHost) { const c = this.chests.get(m.cid); if (c) this._shut(c); } break;
        }
    }

    snapshot() {
        return { list: [...this.list.values()].map((r) => ({ ...r, store: r.store || {}, miss: this._missing(r) })), found: [...this.found] };
    }

    restore(s) {
        if (!s) return;
        for (const k of s.found || []) this.found.add(k);
        for (const r of s.list || []) this._accept(r);
        if (this.auth) for (const r of this.list.values()) this._furnish(r, true); // (beds and the door too)
        this._repair(); // (the walls exactly as saved — _repair)
        this._repairAfter = 2; // (and once more when everything else of the save is in)
        // (things of a chest saved floating over it go back in)
        this._sweepT = 2;
        this._restoredSweep = true;
        setTimeout(() => { if (this.auth) for (const c of this.chests.values()) if (!c.isOpen) this._sweep(c, true); }, 1500);
    }

    sampleModels() { return []; }
}
