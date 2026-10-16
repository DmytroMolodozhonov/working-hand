/**
 * CastleMagic.js — «Create a Castle»: a whole castle made by magic (as «Create a House», HouseMagic.js,
 * on the same ground: its chests, its net, its save — this class is a HouseMagic of its own kind).
 *
 *   Say «Create a Castle» («Создай замок») with the wand in the hand, the hand towards the place (or just
 *   facing it): the castle stands ~44 m ahead, its gate towards you. −500 mana at once (Creative: free,
 *   no wand needed). It needs stone round it: the rock under the ground and the bare stones on it within
 *   34 m (there is always enough round — but not on a beach of sand, over water…). No other things.
 *   The magic lasts 30 s, the wand in the hand (as a house's — let it go and the magic breaks: what has
 *   risen so far stays, unfinished and empty):
 *     - the ground shakes and rumbles, dust bursts along the walls: the walls, the palace and its towers
 *       grow out of the earth layer by layer (to ~60 % of the time); the bare stones round the place
 *       come loose, rise and fly into the walls; stones burst out of the ground all round;
 *     - then it is built on, piece by piece, from the middle out: the battlements, the hall's steep roof,
 *       the spires and their gold — stones flying in and setting with a knock;
 *     - the tune of the house magic, in its grandest form, for the whole 30 s (made ahead).
 *   Then: the gate (two leaves, opened by the hand), the throne hall with the throne, iron doors (both ways,
 *   by the hand), four beds (lie down; you come back to life there — Beds.js), three chests in the treasury
 *   — empty, as a magic house's (the castle is made, not found: nothing lies in it) — open by the hand, put things in them.
 *
 * The castle is real: its walls, floors, towers, roofs are terrain blocks (solid; collisions for the
 * hands, the players and every creature; the creatures walk round them as round any wall). A blast,
 * fire, «Total Destruction» break them as a house's stone; the castles' builders never rebuild it
 * (Rebuild.js: it is nobody's castle of the world). Blown down to less than a third: a ruin — its chests
 * spill what was in them.
 *
 * «На кого и на что» (CLAUDE.md): it acts on no creature — nobody is hit, pushed or hurt; a block it
 * would put where somebody stands (a player, a zombie, a villager, an animal, a sailor, the spider…) waits
 * until they have gone. It acts on things: the ground in its place (bumps, bushes, trees cleared; the
 * foundation laid), the bare natural stones round it (taken). Water, the sea, a ship, a castle or a
 * village, a magic house or another magic castle near, a house's sphere of protection — not there.
 * The shaking ground and the castle growing out of it frighten the people near (Danger «castlemagic»).
 *
 * Multiplayer: the host decides (checks the place and the stone, puts the blocks — they travel as block
 * edits — the doors, the beds, keeps the chests' things); every computer sees the same magic and makes the
 * doors, the chests and the glass from the castle's record. The blocks of the plan are made in a worker
 * (castle.worker.js): never a long frame.
 */

import * as THREE from 'three';
import { BLOCK, isCastleBlock, isSolid } from '../world/Terrain.js';
import { faceTowards, HOUSE_REACH } from '../world/MagicHouse.js';
import { castleLayout, castleCells, CASTLE, PART } from '../world/MagicCastle.js';
import { HouseMagic, HOUSE_MAGIC } from './HouseMagic.js';
import { Chest } from '../entities/Chest.js';

const r2 = (v) => Math.round(v * 100) / 100;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
/** Natural stone: what the castle is made of. */
const STONES = new Set([BLOCK.STONE, BLOCK.GRAVEL, BLOCK.DEEPSTONE]);
const GATE_COLOR = 0x5a3a1e, IRON_COLOR = 0x5b6068;
const STONE_COLORS = [0x8a8a8a, 0x7d7c78, 0x9a9893, 0x6a6c70];

/** How much natural stone lies round (x, z) (data: the terrain) — counted every 2 m, down to 12 layers under the top. */
export function stoneAround(data, x, z, r = CASTLE.STONE_R) {
    let n = 0;
    for (let dx = -r; dx <= r; dx += 2) for (let dz = -r; dz <= r; dz += 2) {
        if (dx * dx + dz * dz > r * r) continue;
        const cx = Math.round(x + dx), cz = Math.round(z + dz);
        const top = data.topLayer(cx, cz);
        for (let L = top; L > top - 12; L--) if (STONES.has(data.get(cx, L, cz))) n += 4;
    }
    return n;
}

/** What may stop the spell (pure: tests). null — nothing. */
export function castleProblem({ mana, free, stone }) {
    if (!free && mana < CASTLE.MANA) return `😮‍💨 Не хватает маны: нужно ${CASTLE.MANA}, есть ${Math.floor(mana)}`;
    if (!free && stone < CASTLE.STONE_NEED) return '🪨 Рядом слишком мало камня — замок строится из камня. Найдите место, где под землёй или вокруг есть скалы';
    return null;
}

export class CastleMagic extends HouseMagic {
    constructor(game) {
        super(game);
        this.netType = 'mcastle';
        this._layouts = new Map(); // id -> castleLayout
        this._cells = new Map(); // id -> {cells, fill, n, nAir, nRise} | 'wait'
        this._worker = null;
        this._repairQ = []; // [{rec, i}] castles whose blocks are put back a little a frame
        this._ruinI = 0;
    }

    // ============================================================== the plan
    plan(rec) {
        let p = this._layouts.get(rec.id);
        if (!p) { p = castleLayout(rec); this._layouts.set(rec.id, p); }
        return p;
    }

    /** The castle's blocks (null until made — in a worker in the browser, at once without one). */
    cells(rec) {
        const c = this._cells.get(rec.id);
        if (c && c !== 'wait') return c;
        if (c === 'wait') return null;
        const o = { seed: rec.seed, x: rec.x, z: rec.z, G: rec.G, face: rec.face };
        if (typeof Worker === 'undefined' || this.syncCells) { const r = castleCells(o); this._cells.set(rec.id, r); return r; }
        this._cells.set(rec.id, 'wait');
        try {
            if (!this._worker) {
                this._worker = new Worker(new URL('../world/castle.worker.js', import.meta.url), { type: 'module' });
                this._worker.onmessage = (e) => { const d = e.data; if (d?.id) this._cells.set(d.id, d); };
                this._worker.onerror = () => { this.syncCells = true; for (const [k, v] of this._cells) if (v === 'wait') this._cells.delete(k); };
            }
            this._worker.postMessage({ id: rec.id, o });
        } catch (e) { this.syncCells = true; this._cells.delete(rec.id); }
        return null;
    }

    /** (the terrain's light: the castle's halls lit as a house's — chained with the houses' own) */
    _hookLight() {
        const data = this.data;
        if (!data || this._lit) return;
        this._lit = true;
        const was = data.litLand;
        data.litLand = (x, z) => {
            if (was?.(x, z)) return true;
            for (const rec of this.list.values()) { const rc = this.plan(rec).rect; if (x >= rc.x0 && x <= rc.x1 && z >= rc.z0 && z <= rc.z1) return true; }
            return false;
        };
    }

    houseNear(p, r = 0) {
        let best = null;
        for (const rec of this.list.values()) {
            const rc = this.plan(rec).rect;
            const d = Math.hypot(Math.max(rc.x0 - p.x, 0, p.x - rc.x1), Math.max(rc.z0 - p.z, 0, p.z - rc.z1));
            if (d <= r && (!best || d < best.d)) best = { rec, d };
        }
        return best?.rec || null;
    }

    // =================================================================== the spell
    /** «Create a Castle» (from Game.castLocalSpell). */
    cast(name, isFinal = true) {
        const g = this.game;
        const now = Date.now();
        if (now - this._lastCast < 1500) return null;
        const say = (t) => { if (isFinal && t) g.hud.setVoice(t, true); return null; };
        // (a castle only on purpose: the hand (the wand) raised for magic as the words are said — talk about a
        // castle or a throne with the hands down never makes one; without a camera the words alone)
        if (!this._intent()) { g.netLog?.(`🏰 «Create a Castle» без поднятой руки — не колдую`); return null; }
        if (this.magic) return say('🏰 Магия замка уже идёт — держите палочку');
        if (g.houseMagic?.magic) return say('🏠 Сначала дождитесь, пока достроится дом');
        if (!g.items?.heldOf?.('wand') && !this.testAim && !this.free) return say('🪄 Возьмите палочку в руку и направьте её туда, где встанет замок');
        const why = castleProblem({ mana: g.combat?.enabled ? g.combat.fatigue : Infinity, free: this.free, stone: Infinity });
        if (why) return say(why);
        const at = this._aimPoint();
        const me = g.character.group.position;
        const ask = { kind: 'CreateCastle', at: [r2(at.x), r2(at.y), r2(at.z)], c: [r2(me.x), r2(me.z)] };
        if (!this.auth) { g.sync?.net?.send({ t: this.netType, a: 'ask', ...ask }); say('🏰 …'); }
        else { const res = this._hostStart(ask, g.localId); if (res === 'search') say('🏰 Перед вами место не подходит — замок ищет себе место рядом…'); else if (res !== true) return say(res); }
        this._lastCast = now;
        g._manaLater = true;
        return name;
    }

    /** Was the hand (the wand) raised for magic just now? (No camera: the words alone are enough.) */
    _intent() {
        const g = this.game, now = Date.now();
        if (this.testAim || !g.currentPose?.hasPose) return true;
        return !!(g.isMagicActive || now - (g.lastMagicTime || 0) < 3000 || now - (g._armsUpAt || 0) < 3000);
    }

    /** Where the castle's middle stands: ahead, where the hand (or the body) faces. */
    _aimPoint() {
        const g = this.game;
        if (this.testAim) return new THREE.Vector3(this.testAim.x, 0, this.testAim.z);
        const side = g.wandSide?.() || g.magicHand || 'right';
        const dir = g.character.getHandDirection?.(side, new THREE.Vector3()) || new THREE.Vector3();
        const h = Math.hypot(dir.x, dir.z), ry = g.character.group.rotation.y;
        const fx = h > 0.3 ? dir.x / h : -Math.sin(ry), fz = h > 0.3 ? dir.z / h : -Math.cos(ry);
        const me = g.character.group.position;
        return new THREE.Vector3(me.x + fx * CASTLE.AHEAD, 0, me.z + fz * CASTLE.AHEAD);
    }

    /** (host) The ground layer under the castle: the middle one of its columns (sampled). */
    _groundOf(rect) {
        const hs = [];
        for (let x = rect.x0 + 2; x <= rect.x1 - 2; x += 4) for (let z = rect.z0 + 2; z <= rect.z1 - 2; z += 4) {
            const G = this._ground(Math.round(x), Math.round(z));
            if (G == null) return null;
            hs.push(G);
        }
        hs.sort((a, b) => a - b);
        return hs[hs.length >> 1];
    }

    /** May the castle stand here? null or why not. Also gives the columns to raise (low ground under it). */
    _siteProblem(rec) {
        const g = this.game, data = this.data;
        const rc = this.plan(rec).rect;
        const low = [], high = [];
        for (let x = Math.floor(rc.x0); x <= Math.ceil(rc.x1); x += 2) for (let z = Math.floor(rc.z0); z <= Math.ceil(rc.z1); z += 2) {
            if (data.isSeaColumn?.(x, z)) return '🌊 Тут море — замок здесь не встанет';
            const G = this._ground(x, z);
            if (G == null) return '💧 Там вода — найдите для замка сухое место';
            // (a slope is no matter: the low ground is raised with stone, a hump is cut away — but no cliff)
            if (G < rec.G - 16 || G > rec.G + 24) return '⛰️ Там слишком неровно для замка — найдите место поровнее';
            if (G < rec.G - 6) low.push([x, z, G]);
            if (G > rec.G + 14) high.push([x, z, G]);
            for (let L = rec.G - 1; L <= rec.G + 14; L += 2) if (isCastleBlock(data.get(x, L, z))) return '🏘️ Там уже что-то построено — замку нужно свободное место';
            if (g.ships?.footprintAt?.(x, rec.G, z)) return '⚓ Там корабль';
        }
        const mid = _v.set(rec.x, rec.G + 1, rec.z);
        if (g.wards?.list?.size && g.wards.forbids?.(g.character.group.position, mid)) return '🛡️ Там чужая защита дома';
        rec._low = low; rec._high = high;
        return null;
    }

    /** (host) The bare natural stones on the ground round the place (the ones that really fly in). */
    _bareStones(rec, rect) {
        const data = this.data, out = [];
        const R = CASTLE.STONE_R + 6;
        for (let dx = -R; dx <= R; dx += 2) for (let dz = -R; dz <= R; dz += 2) {
            const x = Math.round(rec.x + dx), z = Math.round(rec.z + dz);
            if (x >= rect.x0 - 1 && x <= rect.x1 + 1 && z >= rect.z0 - 1 && z <= rect.z1 + 1) continue;
            const L = data.topLayer(x, z);
            if (!STONES.has(data.get(x, L, z)) || data.get(x, L + 1, z) !== BLOCK.AIR) continue;
            out.push([x, L, z, Math.hypot(dx, dz)]);
        }
        out.sort((a, b) => a[3] - b[3]);
        return out.slice(0, CASTLE.STONE_TAKE).map(([x, L, z]) => [x, L, z]);
    }

    /** (host) Someone asks for the castle: check everything, start it. @returns {true|string} */
    _hostStart(ask, by) {
        const g = this.game, data = this.data;
        if (this.magic) return '🏰 Магия замка уже идёт';
        if (this._search) return '🏰 Замок уже ищет себе место…';
        if (!data) return '🏰 …';
        const remote = by !== g.localId && by !== 'local' ? g.remotes?.get?.(by) : null;
        const no = castleProblem({ mana: remote ? Infinity : (g.combat?.enabled ? g.combat.fatigue : Infinity), free: this.free, stone: Infinity });
        if (no) return no;
        const x = Math.round(+ask.at?.[0] || 0), z = Math.round(+ask.at?.[2] || 0);
        if (!this.free && stoneAround(data, x, z) < CASTLE.STONE_NEED) return castleProblem({ mana: Infinity, free: false, stone: 0 });
        const first = this._placeAt(x, z, ask, by);
        if (first === true) return true;
        // the place ahead does not fit (a slope, water, a house…): the magic looks for one near it by itself —
        // a few places a frame (_searchStep), the nearest to where the wand showed first; none — the first reason
        const cx = +ask.c?.[0] || 0, cz = +ask.c?.[1] || 0;
        const fx = x - cx, fz = z - cz, fl = Math.hypot(fx, fz) || 1;
        const spots = [];
        for (const r of [16, 32, 48, 64]) for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            const px = Math.round(x + Math.cos(a) * r), pz = Math.round(z + Math.sin(a) * r);
            const ahead = ((px - cx) * fx + (pz - cz) * fz) / fl; // (in front of the caster, not behind)
            if (ahead < 20 || Math.hypot(px - cx, pz - cz) < 36) continue; // (never on the caster's own head)
            spots.push([px, pz, Math.hypot(px - x, pz - z)]);
        }
        spots.sort((p, q) => p[2] - q[2]);
        this._search = { ask, by, spots, i: 0, why: first };
        return 'search';
    }

    /** (host) A few of the places round the first one tried a frame (≤ 3 ms); found — the magic begins. */
    _searchStep() {
        const S = this._search, g = this.game;
        const t0 = performance.now();
        while (S.i < S.spots.length && performance.now() - t0 < 3) {
            const [x, z] = S.spots[S.i++];
            if (this._placeAt(x, z, S.ask, S.by) === true) { this._search = null; return; }
        }
        if (S.i < S.spots.length) return;
        this._search = null;
        const msg = String(S.why).replace(/^(\S+) Там /, '$1 Ни перед вами, ни рядом нет места: там ').replace(/^(\S+) Слишком близко/, '$1 Ни перед вами, ни рядом нет места: слишком близко');
        if (S.by === g.localId || S.by === 'local') g.hud?.setVoice?.(msg, true);
        else g.sync?.net?.send({ t: this.netType, a: 'no', to: S.by, msg: msg.slice(0, 200) });
    }

    /** (host) May the castle stand with its middle at (x, z)? If so, it begins there. @returns {true|string} */
    _placeAt(x, z, ask, by) {
        const g = this.game, data = this.data;
        for (const o of this.list.values()) if (Math.hypot(o.x - x, o.z - z) < CASTLE.REACH * 2) return '🏰 Слишком близко к другому замку, созданному магией';
        for (const o of g.houseMagic?.list?.values() || []) if (Math.hypot(o.x - x, o.z - z) < CASTLE.REACH + HOUSE_REACH) return '🏠 Слишком близко к дому, созданному магией';
        const dx = (+ask.c?.[0] || 0) - x, dz = (+ask.c?.[1] || 0) - z;
        const face = faceTowards(dx, dz);
        const id = 'mc' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        const probe = { id: id + '?', seed: 0, x, z, G: 0, face };
        const prc = castleLayout(probe).rect;
        if (dx + x >= prc.x0 - 3 && dx + x <= prc.x1 + 3 && dz + z >= prc.z0 - 3 && dz + z <= prc.z1 + 3) return '🏰 Отойдите — замок не встанет у вас на голове';
        const G = this._groundOf(prc);
        if (G == null) return '💧 Там вода — найдите для замка сухое место';
        const rec = { id, seed: (Math.random() * 0x7fffffff) | 0, x, z, G, face, owner: this._key(by), name: this._name(by), t: 0 };
        const why = this._siteProblem(rec);
        if (why) { this._layouts.delete(id); return why; }
        if (!this.free && stoneAround(data, x, z) < CASTLE.STONE_NEED) { this._layouts.delete(id); return castleProblem({ mana: Infinity, free: false, stone: 0 }); }
        const lay = this.plan(rec);
        const stones = this._bareStones(rec, lay.rect);
        // the low ground under it is raised: stone up to the foundation (it grows out of the earth)
        const raise = [];
        for (const [cx, cz, cg] of rec._low || []) for (let L = cg + 1; L < G - 5; L++) for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) raise.push([cx + ox, L, cz + oz, BLOCK.STONE]);
        for (const [cx, cz, cg] of rec._high || []) for (let L = cg; L > G + 15; L--) for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) raise.push([cx + ox, L, cz + oz, BLOCK.AIR]);
        raise.sort((a, b) => (a[3] === BLOCK.AIR) - (b[3] === BLOCK.AIR) || (a[3] === BLOCK.AIR ? b[1] - a[1] : a[1] - b[1])); // (the stone from the bottom up; the cut from the top down)
        delete rec._low; delete rec._high;
        this.cells(rec); // (made in the worker meanwhile)
        this.magic = {
            id, by, t: 0, x, z, y: G + 1, G, rect: lay.rect, rec, castle: true,
            ci: 0, fi: 0, ri: 0, si: 0, wait: [], raise, stones, stonesSent: stones.map((s) => [s[0], s[1] - 1, s[2]]),
            flashT: 0, soundT: 0, rumbleT: 0, beat: 0, launchT: 0,
            win: lay.windows.map((w) => [r2(w.x), r2(w.y), r2(w.z)]), beds: [],
        };
        g.sync?.net?.send({ t: this.netType, a: 'go', id, by, x, z, G, face, seed: rec.seed, rect: lay.rect, stones: this.magic.stonesSent });
        this._go(by);
        g.castleLife?.alarm?.({ x, y: G, z }, 'castlemagic', by, 30);
        return true;
    }

    /** The magic begins (every computer): the caster pays the mana, the tune, the first rumble. */
    _go(by) {
        const g = this.game, m = this.magic;
        if (by === g.localId) {
            const c = g.combat;
            if (c?.enabled && !this.free) c.fatigue = Math.max(0, c.fatigue - CASTLE.MANA);
            if (c) c.paidCount = (c.paidCount || 0) + 1;
            this._noWand = 0;
            const hold = g.items?.heldOf?.('wand') || !this.free ? ' Держите палочку 30 секунд!' : '';
            g.hud?.setVoice?.(`✨ Замок вырастает из земли…${hold}`, true);
        }
        const here = new THREE.Vector3(m.x, m.y + 6, m.z);
        g.sound?.playHouseHum?.(here, 10);
        g.sound?.playCastleTheme?.(here, CASTLE.TIME);
        g.sound?.playRumble?.(here, g.character?.group?.position);
        g.fx?.lightFlash?.(_v.set(m.x, m.y, m.z), 0xfff2c4, 5, 0.8, 90);
        this.look._ring(m, 0xfff2c4);
    }

    // =================================================================== frame
    update(dt) {
        const g = this.game;
        if (this._repairAfter > 0 && (this._repairAfter -= dt) <= 0) this._repair();
        if (this._repairQ.length) this._repairStep();
        const m = this.magic;
        if (!m) this.look.idle(dt, g.fx);
        else {
            this._last = m;
            m.t += dt;
            this._whirl(m, dt);
            if (m.by === g.localId) this._casterHold(m, dt);
            if (this.auth && this.magic === m) this._build(m);
        }
        if (this.auth && this._search && !this.magic) this._searchStep();
        if (this.auth) {
            this._sweepT -= dt;
            if (this._sweepT <= 0) { this._sweepT = 0.4; this._chestsTick(); }
            this._ruinT -= dt;
            if (this._ruinT <= 0) { this._ruinT = 2; this._ruinCheck(); }
            if (this._waiting?.length) this._placeWaiting();
        }
    }

    _casterHold(m, dt) {
        const g = this.game;
        const held = !!g.items?.heldOf?.('wand') || !!this.testAim || this.free;
        this._noWand = held ? 0 : this._noWand + dt;
        let why = null;
        if (this._noWand > HOUSE_MAGIC.GRACE) why = '🪨 Палочка выпала из руки — магия замка сорвалась, он остался недостроенным';
        else if (g.combat?.dead || this._focusLost) why = '🪨 Концентрация сорвалась — магия замка остановилась, он остался недостроенным';
        this._focusLost = false;
        if (why) {
            g.hud?.setVoice?.(why, true);
            if (this.auth) this._break(m);
            else { g.sync?.net?.send({ t: this.netType, a: 'break', id: m.id }); this._broke(m.id, [m.x, m.y, m.z]); }
            return;
        }
        if (!this.auth) { this._holdT -= dt; if (this._holdT <= 0) { this._holdT = 1; g.sync?.net?.send({ t: this.netType, a: 'hold', id: m.id }); } }
    }

    /**
     * (host) The blocks, by the time: the place cleared (0–8 %), the foundation and the low ground raised
     * (to 15 %), the walls and the towers rising out of the ground layer by layer (to RISE_END), the
     * battlements, the roofs and the spires built on (to the end). A little a frame (≤ 2.5 ms).
     */
    _build(m) {
        const g = this.game, data = this.data;
        if (m.by !== g.localId && m.t - m.beat > 3.5) { this._break(m); return; }
        const T = CASTLE.TIME;
        const P = this.cells(m.rec);
        if (!P) { if (m.t >= T) m.t = T - 0.01; return; } // (the worker is still making them)
        const t0 = performance.now(), busy = () => performance.now() - t0 > 2.5;
        const f = Math.min(1, m.t / (T * 0.97));
        const edits = [];
        const C = P.cells;
        const nA = P.nAir, nR = P.nRise, n = P.n;
        const goA = Math.floor(Math.min(1, f / 0.08) * nA);
        for (; m.ci < goA && !busy(); m.ci++) {
            const i = m.ci * 5, x = C[i], L = C[i + 1], z = C[i + 2];
            const cur = data.get(x, L, z);
            if (cur === BLOCK.AIR || cur === BLOCK.BEDROCK) continue;
            data.set(x, L, z, BLOCK.AIR); edits.push([x, L, z, BLOCK.AIR]);
        }
        const FL = P.fill, nF = FL.length / 4;
        const goF = Math.floor(Math.min(1, Math.max(0, (f - 0.03) / 0.12)) * nF);
        for (; m.fi < goF && !busy(); m.fi++) {
            const i = m.fi * 4;
            if (isSolid(data.get(FL[i], FL[i + 1], FL[i + 2]))) continue;
            data.set(FL[i], FL[i + 1], FL[i + 2], FL[i + 3]); edits.push([FL[i], FL[i + 1], FL[i + 2], FL[i + 3]]);
        }
        const goR = Math.floor(Math.min(1, Math.max(0, (f - 0.03) / 0.1)) * m.raise.length);
        for (; m.ri < goR && !busy(); m.ri++) {
            const c = m.raise[m.ri], cur = data.get(c[0], c[1], c[2]);
            if (c[3] === BLOCK.AIR ? cur === BLOCK.AIR || cur === BLOCK.BEDROCK : isSolid(cur)) continue;
            data.set(c[0], c[1], c[2], c[3]); edits.push(c);
        }
        // the blocks: the rising ones (part 1), then the built ones (part 2), each by its own share of time
        const rise = Math.min(1, Math.max(0, (f - 0.06) / (CASTLE.RISE_END - 0.06)));
        const top = Math.min(1, Math.max(0, (f - CASTLE.RISE_END + 0.02) / (1 - CASTLE.RISE_END + 0.02)));
        const goB = nA + Math.floor(rise * nR) + Math.floor(top * (n - nA - nR));
        const from = m.bi ?? (m.bi = nA);
        const bodies = from < goB ? this._bodies() : null;
        for (; m.bi < goB && !busy(); m.bi++) {
            const i = m.bi * 5, x = C[i], L = C[i + 1], z = C[i + 2], t = C[i + 3];
            if (data.get(x, L, z) === t) continue;
            if (t !== BLOCK.AIR && this._occupied(x, L, z, bodies)) { m.wait.push([x, L, z, t]); continue; }
            data.set(x, L, z, t); edits.push([x, L, z, t]);
        }
        // the bare stones round it: taken one by one while the walls rise
        const goS = Math.floor(Math.min(1, f / CASTLE.RISE_END) * m.stones.length);
        for (; m.si < goS; m.si++) {
            const [x, L, z] = m.stones[m.si];
            if (!STONES.has(data.get(x, L, z))) continue;
            data.set(x, L, z, BLOCK.AIR); edits.push([x, L, z, BLOCK.AIR]);
        }
        if (edits.length) g.builder?._sendEdits(edits);
        if (m.t >= T && m.bi >= n && m.ci >= nA && m.fi >= nF) this._done(m);
    }

    /** (host) Done: the castle is there — its doors, beds, chests (with things in them) and glass. */
    _done(m) {
        const g = this.game;
        this.magic = null;
        const rec = { ...m.rec, level: 1, t: Date.now() };
        // the treasury's chests: empty (the author: the castle is made by magic, not found — no treasure in it)
        rec.store = this.list.get(rec.id)?.store || {};
        if (m.wait.length) (this._waiting = this._waiting || []).push(...m.wait);
        this.list.set(rec.id, rec);
        this._hookLight();
        this._relight(rec);
        this._furnish(rec, true);
        g.sync?.net?.send({ t: this.netType, a: 'done', rec: this._net(rec), by: m.by });
        this._finished(rec, m.by);
    }

    /** (every computer) The castle is there: the last flash, the last chord. */
    _finished(rec, by) {
        const g = this.game;
        if (this._last) this.look._ring(this._last, 0xc9a8ff);
        this.magic = null;
        for (let i = 0; i < 90; i++) {
            const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 24;
            g.fx?.spark(_v.set(rec.x + Math.cos(a) * r, rec.G + 1 + Math.random() * 40, rec.z + Math.sin(a) * r), i % 2 ? 0xfff2c4 : 0xc9a8ff, 0.2, _v2.set(0, 1.5, 0), 1.4);
        }
        g.fx?.lightFlash?.(_v.set(rec.x, rec.G + 20, rec.z), 0xffffff, 8, 1, 120);
        g.sound?.playHouseDone?.(_v.set(rec.x, rec.G + 6, rec.z));
        if (by === g.localId) {
            g.mana?.success?.('CreateCastle');
            g.hud?.setVoice?.('🏰 Замок готов! Ворота и железные двери открываются рукой, в тронном зале — трон, в спальне — кровати, в сокровищнице — сундуки', true);
        }
    }

    /** (host) The magic breaks: what has risen so far stays. */
    _break(m) {
        if (this.magic !== m) return;
        const p = [m.x, m.y + 1, m.z];
        this.game.sync?.net?.send({ t: this.netType, a: 'broke', id: m.id, p });
        if (m.wait.length) (this._waiting = this._waiting || []).push(...m.wait);
        this._broke(m.id, p);
    }

    /** (every computer) The magic stops: dust and a falling chord; no fire (it is stone). */
    _broke(id, p) {
        const g = this.game;
        const m = this.magic;
        if (!m || m.id !== id) return;
        this.magic = null;
        g.sound?.stopHouseHum?.();
        const c = _v.set(p[0], p[1], p[2]);
        g.sound?.breakHouseTheme?.(c);
        g.fx?.lightFlash?.(c, 0xbba98a, 4, 0.6, 60);
        const rc = m.rect;
        if (rc && g.fx) for (let i = 0; i < 80; i++) g.fx.spark(_v2.set(rc.x0 + Math.random() * (rc.x1 - rc.x0), m.y + Math.random() * 3, rc.z0 + Math.random() * (rc.z1 - rc.z0)), 0x9a8468, 0.4, _v.set((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2), 1.6);
    }

    // ============================================================== how it looks
    _whirl(m, dt) {
        const g = this.game, fx = g.fx;
        if (!fx) return;
        const t = m.t, T = CASTLE.TIME, u = t / T;
        const rc = m.rect;
        const W = rc.x1 - rc.x0, D = rc.z1 - rc.z0;
        const rising = u < CASTLE.RISE_END + 0.03;
        // the ground shakes near
        const me = g.character?.group?.position;
        if (rising && me && fx.shake != null) {
            const d = Math.hypot(me.x - m.x, me.z - m.z);
            fx.shake = Math.max(fx.shake, Math.max(0, 0.45 - d / 160));
        }
        // dust bursts along the castle's edges and the walls growing (up to their height now)
        const hNow = rising ? 2 + 30 * (u / CASTLE.RISE_END) : 0;
        for (let i = 0; i < (rising ? 6 : 2); i++) {
            const side = Math.random() * 4 | 0, k = Math.random();
            const px = side < 2 ? rc.x0 + k * W : side === 2 ? rc.x0 : rc.x1, pz = side >= 2 ? rc.z0 + k * D : side === 0 ? rc.z0 : rc.z1;
            fx.spark(_v.set(px, m.y + Math.random() * 1.5, pz), Math.random() < 0.5 ? 0x9a8468 : 0x7d746a, 0.45, _v2.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), 1.8);
        }
        if (rising) for (let i = 0; i < 3; i++) fx.spark(_v.set(rc.x0 + 6 + Math.random() * (W - 12), m.y + Math.random() * hNow * 0.3, rc.z0 + 6 + Math.random() * (D - 12)), 0xb8a888, 0.35, _v2.set(0, 1.2, 0), 1.2);
        // stones out of the ground all round, flying into the castle (the bare stones taken: from where they lay)
        m.launchT -= dt;
        const look = this.look, G = m.y;
        const NS = m.stonesSent?.length || 0;
        const doneS = Math.floor(Math.min(1, (t / T) / CASTLE.RISE_END) * NS);
        m.sFx = m.sFx || 0;
        for (; m.sFx < doneS; m.sFx++) {
            const s = m.stonesSent[m.sFx];
            for (let k = 0; k < 6; k++) fx.spark(_v.set(s[0], s[1] + 0.5, s[2]), 0x8a8a8a, 0.25, _v2.set((Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 3), 0.8);
            look._launch(new THREE.Vector3(s[0], s[1], s[2]), this._target(m, u), [0.9, 0.9, 0.9], STONE_COLORS[m.sFx % 4], 1.6 + Math.random() * 0.8);
        }
        if (m.launchT <= 0 && u < 0.98) {
            m.launchT = rising ? 0.09 : 0.06;
            const a = Math.random() * Math.PI * 2, r = Math.max(W, D) / 2 + 4 + Math.random() * 14;
            const from = new THREE.Vector3(m.x + Math.cos(a) * r, G - 0.5, m.z + Math.sin(a) * r);
            for (let k = 0; k < 3; k++) fx.spark(_v.set(from.x, from.y + 0.3, from.z), 0x7d746a, 0.3, _v2.set((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2), 0.9);
            const sz = 0.5 + Math.random() * 0.7;
            look._launch(from, this._target(m, u), [sz, sz * (0.7 + Math.random() * 0.5), sz], STONE_COLORS[Math.random() * 4 | 0], 1.2 + Math.random() * 1.1);
        }
        look._step(dt, fx.glow);
        // flashes of light high on the castle while it is built on
        m.flashT -= dt;
        if (m.flashT <= 0) {
            m.flashT = rising ? 0.6 + Math.random() * 0.5 : 0.25 + Math.random() * 0.3;
            const p = this._target(m, u);
            fx.lightFlash?.(p, Math.random() < 0.5 ? 0xfff2c4 : 0xc9a8ff, rising ? 3 : 4, 0.35, 50);
        }
        // sounds: the ground's rumble while it rises; stones knocking into place
        const S = g.sound;
        m.rumbleT -= dt;
        if (rising && m.rumbleT <= 0 && S?.playRumble) { m.rumbleT = 4.5; S.playRumble(_v.set(m.x, m.y, m.z), me); }
        m.soundT -= dt;
        if (m.soundT <= 0 && S?.playHouseBit) {
            S.playHouseBit(rising ? 'stone' : 'block', this._target(m, u), rising ? 1 : 0.8);
            m.soundT = rising ? 0.3 + Math.random() * 0.4 : 0.15 + Math.random() * 0.25;
        }
    }

    /** A point of the castle being made now (its height grows with the time). */
    _target(m, u) {
        const rc = m.rect;
        const h = u < CASTLE.RISE_END ? 1 + 28 * (u / CASTLE.RISE_END) : 18 + 50 * ((u - CASTLE.RISE_END) / (1 - CASTLE.RISE_END)) * Math.random();
        const k = u < CASTLE.RISE_END ? 0.42 : 0.28;
        return new THREE.Vector3(m.x + (Math.random() - 0.5) * (rc.x1 - rc.x0) * k * 2, m.y + Math.random() * h, m.z + (Math.random() - 0.5) * (rc.z1 - rc.z0) * k * 2);
    }

    // ============================================================== furnishing
    /** (every computer) The doors, the beds (host), the chests and the glass. */
    _furnish(rec, host = false) {
        const g = this.game;
        const p = this.plan(rec);
        if (g.doors) for (const d of p.doors) {
            const id = rec.id + d.id;
            const was = g.doors.list.get(id);
            g.doors._place({ ...d, id, color: d.metal ? IRON_COLOR : GATE_COLOR, a: was?.a || 0, gen: true });
        }
        if (host && g.beds) p.beds.forEach((b, k) => {
            const id = rec.id + 'b' + k;
            if (!g.beds.list.has(id)) g.beds.spawnBed({ x: b.x, y: b.y, z: b.z }, b.yaw, k % 2 ? 'red' : 'white', { id });
        });
        for (const c of this._chestsOf(rec.id)) this._dropChest(c);
        for (const c of p.chests) {
            const id = rec.id + 'c' + c.k;
            const chest = new Chest(g.scene, new THREE.Vector3(c.x, c.y, c.z), 'loot', c.yaw + Math.PI, id, { scale: c.scale });
            chest.setWallGap?.(c.gap);
            chest.mesh.updateMatrixWorld(true);
            chest.boxId = g.collision.addBox(chest.getCollisionBox());
            chest.store = { house: rec.id, k: c.k, castle: true };
            chest.locked = true; chest.setAjar?.();
            this.chests.set(id, chest);
            g.chests.push(chest);
        }
        g.houses?.setExtraPanes?.(rec.id, p.windows.map((w, k) => ({ id: `${rec.id}w${k}`, ...w })));
    }

    _unfurnish(rec) {
        const g = this.game;
        for (const d of this.plan(rec).doors) g.doors?.remove?.(rec.id + d.id);
        for (let k = 0; k < 4; k++) { const id = rec.id + 'b' + k; if (g.beds?.list.has(id) && g.beds.lying !== id) g.beds.removeBed?.(id); }
        for (const c of this._chestsOf(rec.id)) this._dropChest(c);
        g.houses?.setExtraPanes?.(rec.id, []);
    }

    // ================================================================== ruins
    /** (host) A castle blown down to less than a third of its blocks is a ruin (one castle a check). */
    _ruinCheck() {
        const data = this.data;
        if (!data || this.magic || !this.list.size || this._repairQ.length || this._repairAfter > 0) return; // (not while its blocks are being put back after a load)
        const g = this.game;
        const all = [...this.list.values()];
        const rec = all[this._ruinI++ % all.length];
        const pts = [g.character.group.position, ...[...(g.remotes?.values() || [])].map((r) => r.position).filter(Boolean)];
        if (!pts.some((p) => Math.hypot(p.x - rec.x, p.z - rec.z) < 160)) return;
        const P = this.cells(rec);
        if (!P) return;
        let have = 0, all2 = 0;
        const C = P.cells;
        for (let i = P.nAir; i < P.n; i += 3) { // (every third block: enough to tell)
            const t = C[i * 5 + 3];
            if (t === BLOCK.AIR) continue;
            all2++;
            if (data.get(C[i * 5], C[i * 5 + 1], C[i * 5 + 2]) !== BLOCK.AIR) have++;
        }
        if (have >= all2 * HOUSE_MAGIC.RUIN) return;
        this._ruin(rec);
        g.sync?.net?.send({ t: this.netType, a: 'gone', id: rec.id });
    }

    // ============================================================ net / save
    scrollFor() { return []; }

    _missing(rec) {
        const data = this.data;
        if (!data || (this.magic && this.magic.id === rec.id)) return rec.miss || [];
        const P = this.cells(rec);
        if (!P) return rec.miss || [];
        const out = [], C = P.cells;
        for (let i = P.nAir; i < P.n; i++) {
            const t = C[i * 5 + 3];
            if (t === BLOCK.AIR) continue;
            if (data.get(C[i * 5], C[i * 5 + 1], C[i * 5 + 2]) !== t) { out.push(C[i * 5] + ',' + C[i * 5 + 1] + ',' + C[i * 5 + 2]); if (out.length >= 8000) break; }
        }
        return out;
    }

    /** After a load / a join: the castle's blocks put back as saved — a little a frame (_repairStep). */
    _repair() {
        for (const rec of this.list.values()) if (!this._repairQ.some((q) => q.rec === rec)) this._repairQ.push({ rec, i: -1, miss: null });
        return 0;
    }

    _repairStep() {
        const data = this.data;
        const q = this._repairQ[0];
        if (!data || !q) return;
        const P = this.cells(q.rec);
        if (!P) return; // (the worker is making them)
        if (q.i < 0) { q.i = P.nAir; q.miss = new Set(q.rec.miss || []); }
        const t0 = performance.now(), C = P.cells, edits = [];
        for (; q.i < P.n && performance.now() - t0 < 2; q.i++) {
            const i = q.i * 5, t = C[i + 3];
            if (t === BLOCK.AIR) continue;
            const x = C[i], L = C[i + 1], z = C[i + 2];
            if (data.get(x, L, z) === t || q.miss.has(x + ',' + L + ',' + z)) continue;
            data.set(x, L, z, t); edits.push([x, L, z, t]);
        }
        if (edits.length) { if (this.auth) this.game.builder?._sendEdits(edits); else this.game.blockEdits?.push?.(...edits); }
        if (q.i >= P.n) { this._repairQ.shift(); this._relight(q.rec); }
    }

    _accept(r) {
        if (!r || !r.id) return;
        this._hookLight();
        const was = this.list.get(r.id);
        const rec = { ...r, level: 1, store: was?.store || r.store || {}, miss: Array.isArray(r.miss) ? r.miss.slice(0, 8000) : was?.miss || [] };
        this.list.set(rec.id, rec);
        this.cells(rec); // (its blocks: made meanwhile)
        if (!was) this._relight(rec);
        if (!was || !this._chestsOf(rec.id).length) this._furnish(rec, false);
    }

    onNet(m, isHost) {
        const g = this.game;
        switch (m.a) {
            case 'ask': {
                if (!isHost) break;
                const res = this._hostStart({ kind: 'CreateCastle', at: m.at || [0, 0, 0], c: m.c }, m.from);
                if (res === 'search') g.sync?.net?.send({ t: this.netType, a: 'no', to: m.from, msg: '🏰 Перед вами место не подходит — замок ищет себе место рядом…' });
                else if (res !== true) g.sync?.net?.send({ t: this.netType, a: 'no', to: m.from, msg: String(res).slice(0, 200) });
                break;
            }
            case 'no': if (m.to === g.localId) g.hud?.setVoice?.(m.msg, true); break;
            case 'go': {
                if (isHost) break;
                const rec = { id: m.id, seed: m.seed, x: m.x, z: m.z, G: m.G, face: m.face };
                this.magic = { id: m.id, by: m.by, t: 0, x: m.x, z: m.z, y: (m.G | 0) + 1, G: m.G, rect: m.rect || this.plan(rec).rect, rec, castle: true, stonesSent: m.stones || [], win: [], beds: [], flashT: 0, soundT: 0, rumbleT: 0, launchT: 0 };
                this._go(m.by);
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
        return { list: [...this.list.values()].map((r) => ({ ...r, store: r.store || {}, miss: this._missing(r) })) };
    }

    restore(s) {
        if (!s) return;
        for (const r of s.list || []) this._accept(r);
        if (this.auth) for (const r of this.list.values()) this._furnish(r, true);
        this._repair();
        this._repairAfter = 2;
        this._sweepT = 2;
        setTimeout(() => { if (this.auth) for (const c of this.chests.values()) if (!c.isOpen) this._sweep(c, true); }, 1500);
    }
}
