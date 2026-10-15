/**
 * LevitationMaxima.js — «Вингардиум Левиоса Максима».
 *
 * The big form of «Вингардиум Левиоса»: it lifts what the plain one never could.
 *   Mana       50 at once, then 2 a second while it holds (no mana comes back meanwhile) — as long
 *              as there is mana it holds; «стоп» (or no mana) lets go: what it held falls.
 *              Saying the words again sets it down gently. Creative: no mana rules.
 *              Outside Creative it is learnt from a burnt scroll (a lilac ribbon).
 *   A group    the hand (the wand) points at a creature: every creature round it (GROUP_R) rises
 *              at once — players, villagers, knights, wizards, sailors, zombies, animals, the giant
 *              spider, living trees — each hanging where it was against the hand's line and
 *              following the hand (kicking, struggling). Let go: they fall and get hurt (Levitation).
 *   A tree     pointed at, it does not come at once: it rocks, and the hand must pull UP, again
 *              and again — like pulling a tooth. When it has been pulled enough (PULL.tree, and
 *              not before LOOSEN.tree seconds) it tears out with its roots and a lump of earth
 *              (a hole is left), then floats after the hand.
 *   A house    the same, without roots: it creaks and cracks, then tears off the ground whole with
 *              what is inside (the people inside rise with it; the beds, chests, door and glass break).
 *   A ship     rises out of the water at once (the sea pours off its keel) with its crew and all on
 *              its deck — they ride it in its own coordinates (Ships._carry).
 *   Let go     a house / a tree falls by gravity and breaks where it lands: a heap of rubble / a
 *              felled tree, and it crushes what it falls on (CRUSH: creatures under it are hurt and
 *              knocked down, the blocks it lands on break). Set down gently: a house stands again
 *              whole where it was put, a tree is planted upright. A ship dropped into the sea takes
 *              damage by the height; dropped on land it is a wreck (set down gently on land: it is
 *              stranded, whole).
 *   Armour     the plain «Левиоса» is stopped by magic armour (levBlocked); the Maxima goes through.
 *   Collisions what is carried does not pass through the world: it rises over what is under it;
 *              a lifted house / tree has its own collision boxes (walls, floor, trunk, crown) that
 *              move with it on every computer.
 *   Network    the host decides everything (who rises, the pulling, the carrying, the landing and
 *              its block edits); the caster's own computer counts the mana and says when it ends.
 *              A house / a tree is drawn on every computer as ONE instanced mesh from that
 *              computer's own world data (the same everywhere) — cheap, it does not drop the FPS.
 *
 * «На кого и на что» (CLAUDE.md): MAXIMA_TARGETS below.
 */

import * as THREE from 'three';
import { BLOCK, TREE_KINDS, BASE_COLORS, WATER_LEVEL_Y } from '../world/Terrain.js';
import { aimOffset, applyAimOffset, steadyDir, fallDamage, levBlocked } from './Levitation.js';
import { spiderCenter } from './Spider.js';
import { keelY } from './ShipLayout.js';

export const LEV_MAX = {
    NAME: 'LevitationMaxima',
    COST: 50, // mana at once
    DRAIN: 2, // mana a second while it holds
    RANGE: 60, // m: what the hand can reach
    CONE: 0.4, // rad round the hand's line (a creature)
    GROUP_R: 7, // m round the creature pointed at: all of them rise
    MAX_GROUP: 24,
    FOLLOW: 1.6, // 1/s: a house / a tree / a ship follows the hand (heavier than the plain one: 3.5)
    MIN_HOLD: 4,
    LOWER: 2.5, // m/s: set down gently
    G: 22, // m/s² (as everything that falls in the game)
    SAME_PHRASE: 2.5, // s: the same words again within this are the same phrase (not «let it down»)
};

/** Pulling it out: metres the hand must pull up in all (with the pitch of the hand), and the least time it takes. */
export const PULL = { tree: 2.6, house: 1.8 };
export const LOOSEN = { tree: 3, house: 2.2 };
/** Unpulled, the pull settles back this much a second (one has to keep pulling). */
export const PULL_DECAY = 0.12;

/**
 * «На кого и на что» (CLAUDE.md) — what «Вингардиум Левиоса Максима» does to every creature and thing.
 * «Не действует» is a decision too: written here with why. tests/unit/levitation-maxima.test.js checks it.
 */
export const MAXIMA_TARGETS = {
    me: { why: 'свой же — нет: заклинание держит рука колдующего' },
    players: { why: 'игроки в области поднимаются вместе с остальными (на своём компьютере — liftMe), магические доспехи не спасают; «Protection» в сторону колдующего вырывает, как от обычной' },
    zombies: { why: 'поднимаются группой, дрыгают ногами; отпущенные с высоты падают с ног и ушибаются (хост)' },
    castlePeople: { why: 'жители, рыцари, король, волшебники замков — поднимаются группой, машут руками; жители пугаются (castleLife.alarm)' },
    animals: { why: 'поднимаются группой, бьют ногами; падение ранит' },
    sailors: { why: 'с палубы — поднимаются отдельно (летят «за бортом»), отпущенные падают в воду или на палубу; поднятый корабль несёт их в своих координатах' },
    spider: { why: 'гигантская паучиха поднимается группой (дёргает лапами), падение ранит её втрое сильнее (тяжёлая)' },
    livingTrees: { why: 'живое дерево поднимается группой; падение ему не вредит — его ранит только огонь' },
    bookBirds: { why: 'не действует: книги-птицы летают сами, Максима берёт стоящих на земле (книгу ловит обычная «Левиоса»)' },
    phoenix: { why: 'не действует: феникс летит сам (его ловит обычная «Левиоса»)' },
    dragon: { why: 'не действует: дракон вырывается из любой Левиосы — он сильнее магии' },
    servants: { why: 'слуги «Брейнрота» — это жители/зомби/животные: поднимаются как они' },
    ships: { why: 'корабль целиком поднимается из воды с экипажем и всем на палубе; брошенный в море — пробоины по высоте, на суше — обломки' },
    houses: { why: 'дом шатается, трещит и отрывается от земли целиком (без корней); брошенный — груда обломков, давит тех, кто под ним; поставленный — стоит целый на новом месте' },
    trees: { why: 'дерево раскачивается, игрок тянет вверх — вырывается с корнями и комом земли (остаётся яма); брошенное — лежит поваленным, поставленное — растёт стоя' },
    castleWalls: { why: 'не действует: стены и башни замков — не дома, их не оторвать (Максима поднимает дома деревень и замков)' },
    looseThings: { why: 'не поднимаются Максимой (её дело — существа и большое); вещи на палубе едут с кораблём; вещи — обычной «Левиосой»' },
    water: { why: 'не действует: воду поднимают водяные заклинания' },
    ground: { why: 'не действует: земля остаётся — только ком земли на корнях дерева' },
};

/** Magic armour stops the plain «Левиоса» — never the Maxima: Levitation.levBlocked. */
export { levBlocked };

/** Natural ground (stays when a house is torn off; a tree takes a lump of it on its roots). */
const GROUND = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SNOW, BLOCK.BEDROCK, BLOCK.SAND, BLOCK.GRAVEL, BLOCK.DEEPSTONE, BLOCK.WATER, BLOCK.ICE, BLOCK.ICE_SHAPE]);
/** A village's ground round a house (not the house itself). */
const YARD = new Set([BLOCK.PATH, BLOCK.FARMLAND, BLOCK.WHEAT, BLOCK.VEG, BLOCK.FLOWERS]);
const isTreeBlock = (t) => TREE_KINDS.some((k) => k.wood === t || k.leaves === t);

/** The blocks of a house record `h` (Castles.js: c, r): everything built from its floor up, not the ground. */
export function houseCells(data, h, max = 6000) {
    const out = [];
    const Lf = Math.round(h.c.y + 0.5); // (the floor: layer L(−1) — Castles.pt: y = L(0) − 1.5)
    const R = Math.ceil(h.r) + 1;
    const cx = Math.round(h.c.x), cz = Math.round(h.c.z);
    for (let x = cx - R; x <= cx + R; x++) for (let z = cz - R; z <= cz + R; z++) {
        for (let L = Lf; L <= Lf + 22; L++) {
            const t = data.get(x, L, z);
            if (!t || GROUND.has(t) || YARD.has(t) || isTreeBlock(t)) continue;
            out.push([x, L, z, t]);
            if (out.length >= max) return out;
        }
    }
    return out;
}

/** A tree's blocks from one of them (wood and leaves of its kind) + a lump of the earth under its trunk. */
export function treeCells(data, x0, L0, z0, max = 900) {
    const t0 = data.get(x0, L0, z0);
    const k = TREE_KINDS.find((q) => q.wood === t0 || q.leaves === t0);
    if (!k) return null;
    const ok = (t) => t === k.wood || t === k.leaves;
    const seen = new Set([x0 + ',' + L0 + ',' + z0]);
    const cells = [[x0, L0, z0, t0]];
    for (let i = 0; i < cells.length && cells.length < max; i++) {
        const [cx, cL, cz] = cells[i];
        for (const [dx, dL, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
            const x = cx + dx, L = cL + dL, z = cz + dz, key = x + ',' + L + ',' + z;
            if (seen.has(key)) continue;
            seen.add(key);
            if (Math.hypot(x - x0, (L - L0) * 0.6, z - z0) > 8) continue;
            const t = data.get(x, L, z);
            if (!ok(t)) continue;
            cells.push([x, L, z, t]);
        }
    }
    // the trunk's foot: the lowest wood
    let minL = Infinity;
    for (const c of cells) if (c[3] === k.wood) minL = Math.min(minL, c[1]);
    if (!Number.isFinite(minL)) return null;
    const foot = cells.filter((c) => c[3] === k.wood && c[1] === minL);
    let fx = 0, fz = 0;
    for (const c of foot) { fx += c[0]; fz += c[2]; }
    fx = Math.round(fx / foot.length); fz = Math.round(fz / foot.length);
    // the lump of earth on the roots: 3×3, two deep (only the earth: grass, dirt, sand, snow)
    const earth = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let d = 1; d <= 2; d++) {
        if (d === 2 && Math.abs(dx) + Math.abs(dz) === 2) continue; // (round below)
        const t = data.get(fx + dx, minL - d, fz + dz);
        if (t === BLOCK.GRASS || t === BLOCK.DIRT || t === BLOCK.SAND || t === BLOCK.SNOW) earth.push([fx + dx, minL - d, fz + dz, t]);
    }
    return { cells: cells.concat(earth), kind: TREE_KINDS.indexOf(k), foot: [fx, minL, fz], earth: earth.length };
}

/** A spawn-area tree (World.trees, an instanced model): blocks of the same look (to carry and to lay down). */
export function instTreeCells(t, groundL) {
    const k = TREE_KINDS[t.kind || 0];
    const x = Math.round(t.x), z = Math.round(t.z);
    const cells = [];
    for (let i = 0; i < 7; i++) cells.push([x, groundL + i, z, k.wood]);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dL = 0; dL <= 3; dL++) {
        if (dx * dx + dz * dz + (dL - 1.5) * (dL - 1.5) > 6.5 || (!dx && !dz && dL < 2)) continue;
        cells.push([x + dx, groundL + 5 + dL, z + dz, k.leaves]);
    }
    return { cells, kind: t.kind || 0, foot: [x, groundL, z], earth: 0 };
}

/**
 * How much a hand pulled UP this frame (m): the rise of the hand against the body plus the rise
 * of its pointing (rad → m at arm's length). A hand going down pulls nothing.
 */
export function pullStep(prev, now) {
    if (!prev) return 0;
    return Math.max(0, now.rel - prev.rel) + Math.max(0, now.pitch - prev.pitch) * 0.6;
}

/** Hurt by what fell on it: by the height and how heavy it is. */
export function crushDamage(kind, h) {
    const base = kind === 'ship' ? 10 : kind === 'house' ? 8 : 5;
    return Math.min(kind === 'ship' ? 45 : 35, Math.round(base + Math.max(0, h) * (kind === 'tree' ? 1.2 : 2)));
}

/**
 * Where a falling house's blocks end up: about half of them break (rubble flies), the rest pile
 * up in their columns (shifted by dx, dz) on what is there. → {set: [[x, L, z, t]], broken: [...]}
 * `top(x, z)` is the highest solid layer of a column. Pure: tests use it.
 */
export function rubbleOf(cells, dx, dz, top, rnd = Math.random, keep = 0.5) {
    const heights = new Map();
    const set = [], broken = [];
    const sorted = cells.slice().sort((a, b) => a[1] - b[1]);
    for (const c of sorted) {
        const x = c[0] + dx, z = c[2] + dz;
        if (rnd() > keep) { broken.push([x, c[1], z, c[3]]); continue; }
        const key = x + ',' + z;
        const L = (heights.has(key) ? heights.get(key) : top(x, z)) + 1;
        heights.set(key, L);
        set.push([x, L, z, c[3]]);
    }
    return { set, broken };
}

/**
 * A tree lying where it fell: the trunk along `dir` (+x, −x, +z or −z) from its foot, its crown
 * beyond; each block on top of what is in its column. Pure: tests use it.
 */
export function felledOf(cells, foot, dir, top, rnd = Math.random) {
    const [fx, fL, fz] = foot;
    const ax = dir === 'x' ? 1 : dir === '-x' ? -1 : 0, az = dir === 'z' ? 1 : dir === '-z' ? -1 : 0;
    const heights = new Map();
    const set = [], broken = [];
    for (const c of cells.slice().sort((a, b) => a[1] - b[1])) {
        const up = c[1] - fL; // (how high it stood: now how far along the ground)
        if (up < 0) { broken.push(c); continue; } // (the lump of earth breaks up)
        const side = ax ? c[2] - fz : c[0] - fx;
        const x = fx + ax * up + (ax ? 0 : side), z = fz + az * up + (az ? 0 : side);
        if (isLeafType(c[3]) && rnd() < 0.3) { broken.push([x, c[1], z, c[3]]); continue; }
        const key = x + ',' + z;
        const L = (heights.has(key) ? heights.get(key) : top(x, z)) + 1;
        if (L > top(x, z) + 3) { broken.push([x, L, z, c[3]]); continue; }
        heights.set(key, L);
        set.push([x, L, z, c[3]]);
    }
    return { set, broken };
}
const isLeafType = (t) => TREE_KINDS.some((k) => k.leaves === t);

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _hd = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

const BOX = new THREE.BoxGeometry(1, 1, 1);
const ROOT = new THREE.CylinderGeometry(0.06, 0.22, 1, 5).translate(0, -0.5, 0);

export class LevitationMaxima {
    constructor(game) {
        this.game = game;
        this.mine = null; // (my computer) my spell: {id, side, players: [], t}
        this.lifts = new Map(); // id -> lift (host: everything; others: what they draw — houses, trees)
        this._seq = 0;
        this._last = 0;
        this._netT = 0;
        this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        this.rootMat = new THREE.MeshLambertMaterial({ color: 0x5b3a1e });
    }

    get auth() { return this.game.authority || !this.game.sync; }
    get active() { return !!this.mine; }
    get creative() { const m = this.game.config?.mode; return m === 'creative' || m === 'test'; }

    // ================================================================ cast (my computer)
    /** «Вингардиум Левиоса Максима» said. */
    cast(isFinal = true) {
        const g = this.game;
        const now = Date.now();
        const early = g._interimCast;
        if (isFinal && early && early.name === LEV_MAX.NAME && now - early.at < 3000) { g._interimCast = null; return null; }
        if (now - this._last < 1500) return null;
        const say = (t) => { if (isFinal) g.hud?.setVoice?.(t, true); return null; };
        // said again: set it down gently
        if (this.mine) {
            if (this.mine.t < LEV_MAX.SAME_PHRASE) return null;
            this._last = now;
            this.release(true);
            return 'Stop';
        }
        // (the first words were heard as the plain «Левиоса» a moment ago: that was this — undo it)
        if (early && early.name === 'Levitation' && now - early.at < 3000 && g.levitation?.active) g.levitation.release(true);
        const h = g.builder?._hand?.();
        if (!h) return say('✋ Поднимите руку (или палочку) и направьте её на то, что хотите поднять');
        const aim = this.pick(h.o, h.d);
        if (!aim) return say('🪶 Направьте руку на людей, животных, дерево, дом или корабль — не дальше 60 м — и скажите «Вингардиум Левиоса Максима»');
        if (aim.no) return say(aim.no);
        const tired = g.combat?.check?.(LEV_MAX.NAME);
        if (tired) return say(tired);
        g.combat?.pay?.(LEV_MAX.NAME);
        this._last = now;
        g._interimCast = isFinal ? null : { name: LEV_MAX.NAME, at: now };
        const id = (g.localId || 'h') + ':m' + (++this._seq);
        this.mine = { id, side: h.side, players: aim.players || [], t: 0, kind: aim.desc.k };
        // the players in the group: their own computers lift them
        for (const pid of this.mine.players) this._liftPlayer(pid, h.side, true);
        if (this.auth) this.begin(id, g.localId, h.side, aim.desc);
        else g.sync?.levMax?.({ a: 'on', id, side: h.side, d: aim.desc });
        for (let i = 0; i < 30; i++) {
            const p = _v1.copy(h.o).lerp(aim.at, Math.random());
            g.fx?.spark(p, i % 2 ? 0xffe9a8 : 0xc9a8ff, 0.14, _v2.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.9);
        }
        g.sound?.playBombardoCast?.();
        const k = aim.desc.k;
        g.hud?.setVoice?.(k === 'tree' ? '🌳 <b>Левиоса Максима!</b> Дерево раскачивается — тяните руку вверх, ещё и ещё, пока не вырвется с корнями'
            : k === 'house' ? '🏠 <b>Левиоса Максима!</b> Дом трещит — тяните руку вверх, пока он не оторвётся от земли'
            : k === 'ship' ? '⛵ <b>Левиоса Максима!</b> Корабль поднимается из воды'
            : `🪶 <b>Левиоса Максима!</b> Поднято: ${aim.n}. Держится, пока есть мана (2 в секунду); «стоп» — отпустить, слова ещё раз — опустить`, true);
        return LEV_MAX.NAME;
    }

    /** «Стоп»: what I hold falls. */
    stop() {
        if (!this.mine) return false;
        this.release(false);
        return true;
    }

    /** I let go (gently: set down). */
    release(gentle) {
        const M = this.mine;
        if (!M) return;
        this.mine = null;
        const g = this.game;
        for (const pid of M.players) this._liftPlayer(pid, M.side, false, gentle);
        if (this.auth) this.end(M.id, gentle);
        else g.sync?.levMax?.({ a: 'off', id: M.id, g: gentle ? 1 : 0 });
    }

    _liftPlayer(pid, side, on, gentle = false) {
        const g = this.game;
        if (pid === g.localId) return;
        if (on) g.sync?.levMax?.({ a: 'p', to: pid, side });
        else g.sync?.lev?.('p', pid, side, 0, false, gentle);
    }

    // ================================================================ aim
    /** Living bodies spells can lift: {ck, c, pos, r} (the host's list; on a guest the same creatures as drawn). */
    _bodies() {
        const g = this.game;
        const out = [];
        const centre = (ck, c) => { const p = new THREE.Vector3(); this.centre(ck, c, p); return p; };
        for (const z of g.zombies || []) if (!z.isDead && !z.isDying && !z.lev) out.push({ ck: 'z', c: z, pos: centre('z', z), r: 0.9 });
        for (const a of g.animals?.targets?.() || []) if (!a.dead && !a.rider && !a.lev && g.animals.riding !== a) out.push({ ck: 'a', c: a, pos: centre('a', a), r: g.duel?._animalBody?.(a)?.r || 1 });
        for (const v of g.castleLife?.targets?.() || []) if (!v.dead && !v.lev && !v.seated && !v.climb) out.push({ ck: 'v', c: v, pos: centre('v', v), r: 1.2 });
        for (const v of g.ships?.crew?.byId?.values?.() || []) if (!v.dead && !v.lev) out.push({ ck: 's', c: v, pos: centre('s', v), r: 1.2 });
        for (const t of g.livingTrees?.targets?.() || []) if (!t.lev && !t.isDead) out.push({ ck: 't', c: t, pos: centre('t', t), r: 2.5 });
        for (const s of g.spiders?.targets?.() || []) if (!s.lev) out.push({ ck: 'sp', c: s, pos: spiderCenter(s, new THREE.Vector3()), r: 3 });
        for (const [id, r] of g.remotes || []) if (!r.dead) out.push({ ck: 'p', c: { id }, pos: new THREE.Vector3(r.position.x, r.position.y - 0.5, r.position.z), r: 1 });
        return out;
    }

    /**
     * What the hand points at: the nearest of a creature (→ the group round it), a ship, a house,
     * a tree. → {desc, at, players, n} | {no: hint} | null
     */
    pick(o, d) {
        const g = this.game;
        const R = LEV_MAX.RANGE;
        let best = null;
        // a creature
        let cr = null;
        for (const b of this._bodies()) {
            const to = _v1.subVectors(b.pos, o);
            const dist = to.length();
            if (dist > R || dist < 0.5) continue;
            const ang = d.angleTo(to.normalize());
            if (ang > LEV_MAX.CONE + Math.atan2(b.r, dist)) continue;
            const score = Math.max(0, ang - Math.atan2(b.r, dist)) * 10 + dist * 0.01;
            if (!cr || score < cr.score) cr = { ...b, dist, score };
        }
        // a dragon: no
        for (const dr of g.dragons?.targets?.() || []) {
            const p = _v2.copy(dr.model.position); p.y += 3 * dr.size;
            const dist = p.distanceTo(o);
            if (dist < R && d.angleTo(_v1.subVectors(p, o).normalize()) < Math.atan2(3 * dr.size, dist) + 0.1 && (!cr || dist < cr.dist)) return { no: '🐉 Дракона не поднимет даже «Левиоса Максима» — он вырывается из любой магии' };
        }
        if (cr) best = { kind: 'group', dist: cr.dist, cr };
        // a ship (along the line, metre by metre)
        if (g.ships?.awake?.size) {
            for (let t = 2; t <= R && (!best || t < best.dist); t += 1) {
                _v1.copy(o).addScaledVector(d, t);
                const s = g.ships.shipAt(_v1.x, _v1.y, _v1.z);
                if (s && !s.lifted) { best = { kind: 'ship', dist: t, s, at: _v1.clone() }; break; }
            }
        }
        // a block: a tree or a house
        const cell = g.builder?._hitCell?.(o, d, R);
        if (cell && (!best || cell.point.distanceTo(o) < best.dist)) {
            const dist = cell.point.distanceTo(o);
            if (isTreeBlock(cell.type)) best = { kind: 'tree', dist, cell };
            else {
                const h = this._houseAt(cell.x, cell.L, cell.z);
                if (h) best = { kind: 'house', dist, h, at: cell.point.clone() };
                else if (!best && !GROUND.has(cell.type) && cell.type !== BLOCK.WATER) return { no: '🏰 Стены и башни замков «Левиоса Максима» не отрывает — только дома, деревья, корабли и живых' };
            }
        }
        const inst = g.builder?._treeOnRay?.(o, d, R);
        if (inst && (!best || Math.hypot(inst.x - o.x, inst.z - o.z) < best.dist)) best = { kind: 'inst', dist: Math.hypot(inst.x - o.x, inst.z - o.z), inst };
        if (!best) return null;
        if (best.kind === 'group') {
            const c0 = best.cr.pos;
            const members = [], players = [];
            for (const b of this._bodies()) {
                if (Math.hypot(b.pos.x - c0.x, b.pos.z - c0.z) > LEV_MAX.GROUP_R || Math.abs(b.pos.y - c0.y) > 8) continue;
                if (b.ck === 'p') players.push(b.c.id);
                else if (members.length < LEV_MAX.MAX_GROUP) members.push([b.ck, b.c.id]);
            }
            return { desc: { k: 'group', m: members, np: players.length }, at: c0.clone(), players, n: members.length + players.length };
        }
        if (best.kind === 'ship') return { desc: { k: 'ship', id: best.s.id }, at: best.at, players: this._playersNear(best.at, best.s.cls.L / 2 + 2, true), n: 1 };
        if (best.kind === 'house') {
            const h = best.h;
            return { desc: { k: 'house', id: h.id, x: h.c.x, z: h.c.z }, at: best.at, players: this._playersNear(h.c, h.r + 0.5, false), n: 1 };
        }
        if (best.kind === 'inst') return { desc: { k: 'tree', i: best.inst.index }, at: new THREE.Vector3(best.inst.x, o.y, best.inst.z), players: [], n: 1 };
        return { desc: { k: 'tree', c: [best.cell.x, best.cell.L, best.cell.z] }, at: best.cell.point.clone(), players: [], n: 1 };
    }

    /** Other players standing in that place (on that ship's deck they ride it: not lifted apart). */
    _playersNear(p, r, onShip) {
        if (onShip) return [];
        const out = [];
        for (const [id, rp] of this.game.remotes || []) if (!rp.dead && Math.hypot(rp.position.x - p.x, rp.position.z - p.z) < r) out.push(id);
        return out;
    }

    /** The village / castle house whose walls hold a block (x, L, z). */
    _houseAt(x, L, z, id = null) {
        const data = this.game.world?.terrain?.data || this.game.terrain?.data;
        const idx = data?.sites || data?.castles;
        if (!idx?.near) return null;
        for (const def of idx.near(x, z, 40)) for (const h of def.houses || []) {
            if (id != null ? h.id !== id : (h.lifted || Math.abs(x - h.c.x) > h.r + 1.5 || Math.abs(z - h.c.z) > h.r + 1.5 || L < Math.round(h.c.y + 0.5))) continue;
            return h;
        }
        return null;
    }

    // ================================================================ bodies (every kind)
    /** A body's middle (where the magic holds it) into `out`; returns how high that is above its feet. */
    centre(ck, c, out) {
        if (ck === 's') { const o = c.overboard; out.set(o ? o.x : c.x, (o ? o.y : c.y) + 2.4, o ? o.z : c.z); return 2.4; }
        if (ck === 't') { out.copy(c.model.position); out.y += 4; return 4; }
        if (ck === 'sp') { spiderCenter(c, out); return out.y - c.model.position.y; }
        if (this.game.levitation) return this.game.levitation._centre(ck, c, out);
        out.set(c.x || 0, (c.y || 0) + 1, c.z || 0);
        return 1;
    }

    _move(ck, c, d) {
        if (ck === 's') { const o = c.overboard; o.x += d.x; o.y += d.y; o.z += d.z; }
        else if (ck === 't' || ck === 'sp') c.model.position.add(d);
    }

    _creature(ck, id) {
        const g = this.game;
        if (ck === 's') { const v = g.ships?.crew?.byId?.get(id); return v && !v.dead ? v : null; }
        if (ck === 't') { const t = g.livingTrees?.byId?.get(id); return t && !t.isDead ? t : null; }
        if (ck === 'sp') { const s = g.spiders?.list?.find((x) => x.id === id); return s && !s.dead ? s : null; }
        return g.levitation?._creature(ck, id) || null;
    }

    // ================================================================ host
    /** (host) A caster's Maxima begins: lift what it is pointed at (or say no). */
    begin(id, by, side, desc) {
        const g = this.game;
        if (!desc || this.lifts.has(id)) return false;
        const L = { id, by, side, kind: desc.k, desc, members: [], bodies: [], t: 0 };
        if (desc.k === 'group') {
            for (const [ck, cid] of (desc.m || []).slice(0, LEV_MAX.MAX_GROUP)) this._grabBody(L, String(ck), cid);
            if (!L.members.length && !L.bodies.length && !(desc.np > 0)) return this._refuse(id, by);
            this.lifts.set(id, L);
            return true;
        }
        if (desc.k === 'ship') {
            const s = g.ships?.list?.get(desc.id);
            if (!s || s.lifted || !s.awake) return this._refuse(id, by);
            this.lifts.set(id, L);
            this._shipStart(L, s);
            return true;
        }
        if (!this._bigStart(L, desc)) return this._refuse(id, by);
        this.lifts.set(id, L);
        g.sync?.levMax?.({ a: 'big', id, by, side, d: desc });
        this._takeBlocks(L);
        return true;
    }

    _refuse(id, by) {
        const g = this.game;
        if (by === g.localId) { this._over(id); g.hud?.setVoice?.('🪶 Это уже поднято или до него не дотянуться', true); }
        else g.sync?.levMax?.({ a: 'no', id, to: by });
        return false;
    }

    /** (host) One body joins the group. */
    _grabBody(L, ck, id) {
        const g = this.game;
        const c = this._creature(ck, id);
        if (!c || c.lev) return;
        const p = new THREE.Vector3();
        const up = this.centre(ck, c, p);
        let hold = LEV_MAX.MIN_HOLD;
        if (g.duel?._handOf(L.by, L.side, _hp, _hd)) hold = Math.min(LEV_MAX.RANGE, Math.max(2, p.distanceTo(_hp)));
        if (ck === 'z' || ck === 'a' || ck === 'v') {
            if (!g.levitation?.grab(ck, c, L.by, L.side, hold)) return;
            c.lev.mx = L.id;
            L.members.push({ ck, c });
            return;
        }
        // the others: carried here (sailors fly «overboard», living trees and the spider stop)
        if (ck === 's') {
            if (!c.overboard) c.overboard = { x: c.x, y: c.y, z: c.z, vy: 0, vx: 0, vz: 0, t: 0, wet: false };
            c.overboard.vy = 0; c.overboard.vx = c.overboard.vz = 0; c.overboard.wet = false;
            c.mode = 'idle'; c.fs = null; c.busy = false;
        }
        c.lev = { by: L.by, side: L.side, hold, target: p.clone(), vel: new THREE.Vector3(), top: p.y - up, mx: L.id };
        if (g.duel?._handOf(L.by, L.side, _hp, _hd)) c.lev.off = aimOffset(_hd, _v1.subVectors(p, _hp));
        L.bodies.push({ ck, c });
    }

    /** (host) A house / a tree is taken: its blocks (and what it rests on) — or false. */
    _bigStart(L, desc) {
        const g = this.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        if (!data) return false;
        if (desc.k === 'house') {
            const h = this._houseAt(desc.x, 0, desc.z, desc.id);
            if (!h || h.lifted) return false;
            // the people inside rise with it
            const members = [];
            for (const b of this._bodies()) if (b.ck !== 'p' && Math.abs(b.pos.x - h.c.x) < h.r && Math.abs(b.pos.z - h.c.z) < h.r && b.pos.y < h.c.y + 14) members.push(b);
            if (!this._makeBig(L, desc)) return false;
            for (const b of members) this._grabBody(L, b.ck, b.c.id);
            return true;
        }
        return this._makeBig(L, desc);
    }

    /** (every computer) The carried house / tree: its blocks as one instanced mesh, its collision boxes. */
    _makeBig(L, desc) {
        const g = this.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        if (!data) return false;
        let cells = null, tree = null;
        if (desc.k === 'house') {
            const h = this._houseAt(desc.x, 0, desc.z, desc.id);
            if (!h || h.lifted) return false;
            cells = houseCells(data, h);
            if (cells.length < 8) return false;
            L.house = h;
            h.lifted = true;
            g.houses?.liftedAway?.(h);
        } else if (desc.k === 'tree') {
            if (desc.i != null) {
                const t = g.world?.trees?.find((x) => x.index === desc.i);
                if (!t || !t.alive) return false;
                tree = instTreeCells(t, data.topLayer(Math.round(t.x), Math.round(t.z)) + 1);
                L.inst = t;
            } else if (Array.isArray(desc.c)) tree = treeCells(data, desc.c[0] | 0, desc.c[1] | 0, desc.c[2] | 0);
            if (!tree) return false;
            cells = tree.cells;
            L.tree = tree;
        } else return false;
        // the anchor: the middle of its foot (houses: the floor; trees: the trunk's foot)
        let minL = Infinity, maxL = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const c of cells) { minL = Math.min(minL, c[1]); maxL = Math.max(maxL, c[1]); x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); z0 = Math.min(z0, c[2]); z1 = Math.max(z1, c[2]); }
        const ax = tree ? tree.foot[0] : Math.round((x0 + x1) / 2), az = tree ? tree.foot[2] : Math.round((z0 + z1) / 2);
        const baseL = tree ? tree.foot[1] : minL;
        L.cells = cells;
        L.baseL = baseL;
        L.base = new THREE.Vector3(ax, baseL - 1.5, az); // (the world y of the bottom of its foot)
        L.pos = L.base.clone();
        L.vel = new THREE.Vector3();
        L.ext = { x0: x0 - ax - 0.5, x1: x1 - ax + 0.5, z0: z0 - az - 0.5, z1: z1 - az + 0.5, y0: minL - baseL, y1: maxL - baseL + 1 };
        L.phase = 'loosen';
        L.pull = 0;
        L.sway = { x: 0, z: 0 };
        // the mesh (one draw call; rocks round its foot)
        const group = new THREE.Group();
        const mesh = new THREE.InstancedMesh(BOX, this.mat, cells.length);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        cells.forEach((c, i) => {
            _m.makeTranslation(c[0] - ax, c[1] - baseL + 0.5, c[2] - az);
            mesh.setMatrixAt(i, _m);
            mesh.setColorAt(i, _c.setHex(BASE_COLORS[c[3]] ?? 0x888888));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.frustumCulled = false;
        group.add(mesh);
        if (tree) group.add(this._roots(tree, baseL));
        group.position.copy(L.pos);
        g.scene?.add(group);
        L.group = group;
        L.boxes = [];
        this._boxes(L);
        return true;
    }

    /** Roots under a torn-out tree's lump of earth (hidden in the ground until it comes out). */
    _roots(tree, baseL) {
        const n = 9;
        const roots = new THREE.InstancedMesh(ROOT, this.rootMat, n);
        roots.castShadow = true;
        roots.frustumCulled = false;
        const depth = tree.earth ? -1.6 : -0.2;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + (i % 2) * 0.3;
            const len = 1.4 + ((i * 37) % 10) / 6;
            _e.set(Math.cos(a) * 0.9, 0, Math.sin(a) * -0.9);
            _q.setFromEuler(_e);
            _m.compose(_v1.set(Math.cos(a) * 0.6, depth + 0.4, Math.sin(a) * 0.6), _q, _s.set(1, len, 1));
            roots.setMatrixAt(i, _m);
        }
        roots.instanceMatrix.needsUpdate = true;
        return roots;
    }

    /** Its collision boxes where it is now (a house: floor, four walls, the roof; a tree: trunk and crown). */
    _boxes(L) {
        const col = this.game.collision;
        if (!col) return;
        for (const id of L.boxes) col.removeBox(id);
        L.boxes.length = 0;
        if (L.gone) return;
        const p = L.pos, e = L.ext;
        const add = (x0, x1, y0, y1, z0, z1) => L.boxes.push(col.addBox({ minX: p.x + x0, maxX: p.x + x1, minY: p.y + y0, maxY: p.y + y1, minZ: p.z + z0, maxZ: p.z + z1, kind: 'levmax' }));
        if (L.kind === 'house') {
            const h = e.y1;
            add(e.x0, e.x1, 0, 1, e.z0, e.z1); // the floor
            add(e.x0, e.x0 + 1, 0, h, e.z0, e.z1); add(e.x1 - 1, e.x1, 0, h, e.z0, e.z1);
            add(e.x0, e.x1, 0, h, e.z0, e.z0 + 1); add(e.x0, e.x1, 0, h, e.z1 - 1, e.z1);
            add(e.x0, e.x1, h - 1.5, h, e.z0, e.z1); // the roof
        } else {
            const t = L.tree;
            add(-0.6, 0.6, Math.min(0, e.y0), Math.max(4, e.y1 * 0.55), -0.6, 0.6); // the trunk (and its lump of earth)
            add(e.x0, e.x1, e.y1 * 0.45, e.y1, e.z0, e.z1); // the crown
            if (t?.earth) add(-1.5, 1.5, e.y0, 0, -1.5, 1.5);
        }
        L.boxAt = p.clone();
    }

    /** (host) The blocks leave the world (the others build the same mesh from the same data first). */
    _takeBlocks(L) {
        const g = this.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        if (L.inst) { g.world.removeTree(L.inst); g.sync?.treeGone?.(L.inst.index); return; }
        const edits = [];
        for (const c of L.cells) { data.set(c[0], c[1], c[2], BLOCK.AIR); edits.push([c[0], c[1], c[2], BLOCK.AIR]); }
        g.builder?._sendEdits?.(edits);
        if (L.house) g.castleLife?.damaged?.(L.base, L.by, edits.length, true, { r: 10, kind: 'uproot' });
        else g.castleLife?.alarm?.(L.base, 'uproot', L.by, 6);
    }

    // ---------------------------------------------------------------- the ship
    _shipStart(L, s) {
        const g = this.game;
        s.lifted = L;
        L.ship = s;
        s.liftY = s.liftY || 0;
        L.vel = new THREE.Vector3();
        L.phase = 'carry';
        L.top = s.liftY;
        s.lines?.forEach((l) => { if (l.state === 'tied') l.state = 'snapped'; });
        if (s.state === 'moored') s.state = 'free';
        if (s.plank?.state === 'laid') g.ships._plankFalls?.(s);
        s.st.u = s.st.v = s.st.r = 0;
        s.changed = true;
        if (g.duel?._handOf(L.by, L.side, _hp, _hd)) {
            _v1.set(s.st.x, WATER_LEVEL_Y + s.liftY, s.st.z);
            L.off = aimOffset(_hd, _v2.subVectors(_v1, _hp));
            L.hold = Math.min(LEV_MAX.RANGE, Math.max(LEV_MAX.MIN_HOLD, _v2.length()));
        } else L.hold = 20;
        g.castleLife?.alarm?.(_v1.set(s.st.x, WATER_LEVEL_Y, s.st.z), 'uproot', L.by, s.cls.L / 2);
        if (s.owner !== L.by) g.ships?.crew?.provoke?.(s, L.by, '⛵ Корабль подняли в воздух!');
        g.sound?.playWaterRise?.();
    }

    /** The lowest point of a ship's hull below its waterline (local y, < 0). */
    _keel(s) {
        const La = s.layout;
        return Math.min(keelY(La, 0), keelY(La, La.L * 0.3), keelY(La, -La.L * 0.3));
    }

    /** The highest LAND under a ship's hull (world y; the sea and the seabed under it count as WATER_LEVEL_Y: it floated there). */
    _groundUnderShip(s, x, z) {
        const data = this.game.terrain?.data || this.game.world?.terrain?.data;
        let y = WATER_LEVEL_Y;
        if (!data) return y;
        const c = Math.cos(s.st.yaw), sn = Math.sin(s.st.yaw);
        for (const lz of [-s.cls.L * 0.42, -s.cls.L * 0.2, 0, s.cls.L * 0.2, s.cls.L * 0.42]) for (const lx of [-s.cls.B * 0.4, 0, s.cls.B * 0.4]) {
            const top = data.surfaceY(x + lx * c + lz * sn, z - lx * sn + lz * c);
            if (top > WATER_LEVEL_Y + 0.5) y = Math.max(y, top);
        }
        return y;
    }

    _carryShip(L, dt) {
        const g = this.game;
        const s = L.ship;
        if (!s || !g.ships?.list.has(s.id)) { this._finish(L); return; }
        const st = s.st;
        const keel = this._keel(s);
        st.u = st.v = st.r = 0;
        if (L.phase === 'carry' || L.phase === 'lower') {
            const hand = this._hand(L, dt);
            if (!hand && L.phase === 'carry') { L.phase = 'fall'; return; }
            const want = L.phase === 'carry' ? _v3.copy(hand.p).addScaledVector(hand.d, L.hold) : _v3.set(st.x, WATER_LEVEL_Y + s.liftY - LEV_MAX.LOWER * 4 * dt, st.z);
            const k = 1 - Math.exp(-dt * LEV_MAX.FOLLOW);
            const nx = st.x + (want.x - st.x) * k, nz = st.z + (want.z - st.z) * k;
            let ny = s.liftY + (want.y - WATER_LEVEL_Y - s.liftY) * k;
            if (L.phase === 'lower') ny = want.y - WATER_LEVEL_Y;
            // the hull rises over what is under it — never through the land
            const ground = this._groundUnderShip(s, nx, nz);
            const minLift = ground > WATER_LEVEL_Y ? ground - WATER_LEVEL_Y - keel + 0.2 : 0;
            L.vel.set((nx - st.x) / dt, (Math.max(ny, minLift) - s.liftY) / dt, (nz - st.z) / dt);
            st.x = nx; st.z = nz;
            s.liftY = Math.max(0, ny, minLift);
            L.top = Math.max(L.top, s.liftY);
            if (L.phase === 'lower' && s.liftY <= Math.max(0, minLift) + 0.01) { this._landShip(L, true); return; }
        } else if (L.phase === 'fall') {
            L.vel.y -= LEV_MAX.G * dt;
            st.x += L.vel.x * dt; st.z += L.vel.z * dt;
            L.vel.x *= Math.exp(-dt * 0.3); L.vel.z *= Math.exp(-dt * 0.3);
            s.liftY += L.vel.y * dt;
            const ground = this._groundUnderShip(s, st.x, st.z);
            const minLift = ground > WATER_LEVEL_Y ? ground - WATER_LEVEL_Y - keel : 0;
            if (s.liftY <= Math.max(0, minLift)) { s.liftY = Math.max(0, minLift); this._landShip(L, false); return; }
        }
        s.changed = true;
        // the sea pours off the keel as it rises
        if (s.liftY > 0.2 && s.liftY < 10 && Math.random() < 0.7) {
            const c = Math.cos(st.yaw), sn = Math.sin(st.yaw), lz = (Math.random() - 0.5) * s.cls.L * 0.8, lx = (Math.random() - 0.5) * s.cls.B * 0.6;
            g.fx?.spark(_v1.set(st.x + lx * c + lz * sn, WATER_LEVEL_Y + s.liftY + keel, st.z - lx * sn + lz * c), Math.random() < 0.5 ? 0xe8f6ff : 0x9fd3ea, 0.18, _v2.set(0, -6, 0), 0.8);
        }
    }

    /** (host) The ship comes down: into the sea (hurt by the height) or on land (a wreck; gently: stranded, whole). */
    _landShip(L, gentle) {
        const g = this.game;
        const s = L.ship;
        const h = L.top - s.liftY;
        const onLand = s.liftY > 0.05;
        const dmg = gentle ? (onLand ? 5 : 0) : crushDamage('ship', h);
        if (!onLand) {
            for (let i = 0; i < 60; i++) g.fx?.spark(_v1.set(s.st.x + (Math.random() - 0.5) * s.cls.B, WATER_LEVEL_Y + 0.3, s.st.z + (Math.random() - 0.5) * s.cls.L * 0.6), i % 3 ? 0xe8f6ff : 0x9fd3ea, 0.22, _v2.set((Math.random() - 0.5) * 8, 3 + Math.random() * (gentle ? 3 : 9), (Math.random() - 0.5) * 8), 1.1);
            g.sound?.playSplash?.();
            if (!gentle && h > 3) {
                g.ships?.damage?.(s, Math.round(h * 4), L.by);
                if (h > 8) g.ships?.hole?.(s, 0, this._keel(s) + 0.8, (Math.random() - 0.5) * s.cls.L * 0.4, Math.min(2, 0.6 + h * 0.06), L.by);
            }
        } else {
            g.ships?.damage?.(s, gentle ? 5 : Math.round(20 + h * 6), L.by);
            if (!gentle) { s.state = 'wreck'; s.st.u = s.st.v = s.st.r = 0; }
            g.sound?.playExplosion?.(_v1.set(s.st.x, WATER_LEVEL_Y + s.liftY, s.st.z), g.character?.group?.position, 0.5);
        }
        // what was under it
        if (!gentle || onLand) {
            const c = Math.cos(s.st.yaw), sn = Math.sin(s.st.yaw);
            const hx = Math.abs(c) * s.cls.B / 2 + Math.abs(sn) * s.cls.L / 2, hz = Math.abs(sn) * s.cls.B / 2 + Math.abs(c) * s.cls.L / 2;
            const y0 = WATER_LEVEL_Y + s.liftY + this._keel(s);
            this.crush({ x0: s.st.x - hx, x1: s.st.x + hx, z0: s.st.z - hz, z1: s.st.z + hz, y0 }, gentle ? 3 : dmg, L.by, 'ship', s);
        }
        this._finish(L);
    }

    // ---------------------------------------------------------------- the hand
    /** The caster's hand now: {p, d} (its line turned by the offset this was taken at), or null. */
    _hand(L, dt) {
        const g = this.game;
        if (L.by !== g.localId && !g.remotes?.has(L.by)) return null;
        if (!g.duel?._handOf(L.by, L.side, _hp, _hd)) return null;
        steadyDir(L.steady || (L.steady = {}), _hd, dt);
        if (L.off) applyAimOffset(_hd, L.off, _hd);
        return { p: _hp, d: _hd };
    }

    /** How high the caster's hand is against their body, and how far up it points. */
    _handRise(L) {
        const g = this.game;
        if (!g.duel?._handOf(L.by, L.side, _hp, _hd)) return null;
        const body = L.by === g.localId ? g.character.group.position : g.remotes?.get(L.by)?.position;
        if (!body) return null;
        return { rel: _hp.y - body.y, pitch: Math.asin(Math.max(-1, Math.min(1, _hd.y))) };
    }

    // ---------------------------------------------------------------- houses and trees
    _carryBig(L, dt) {
        const g = this.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        if (L.phase === 'loosen') {
            // it rocks; the hand pulls it up, again and again (like a tooth)
            const now = this._handRise(L);
            if (!now) { L.phase = 'settle'; return; }
            const step = pullStep(L.prevRise, now);
            L.prevRise = now;
            const need = PULL[L.kind] || 2;
            L.pull = Math.max(0, L.pull + step - PULL_DECAY * dt);
            const p = Math.min(1, L.pull / need);
            L.kick = Math.max(0, (L.kick || 0) - dt * 2) + step * 2;
            const A = (L.kind === 'tree' ? 0.03 : 0.012) + p * (L.kind === 'tree' ? 0.13 : 0.035) + Math.min(0.08, L.kick * 0.1);
            const w = L.kind === 'tree' ? 5 : 9;
            L.sway.x = A * Math.sin(L.t * w);
            L.sway.z = A * 0.7 * Math.sin(L.t * w * 1.27 + 1);
            L.pos.set(L.base.x, L.base.y + p * (L.kind === 'tree' ? 0.35 : 0.15), L.base.z);
            if (Math.random() < 0.15 + p) this._crumbs(L, p);
            if (step > 0.05 && Math.random() < 0.5) g.sound?.playCrack?.(L.pos, 0.3 + p * 0.5);
            if (L.pull >= need && L.t >= (LOOSEN[L.kind] || 2)) this._tearOut(L);
            return;
        }
        if (L.phase === 'carry') {
            const hand = this._hand(L, dt);
            if (!hand) { L.phase = 'fall'; return; }
            const want = _v3.copy(hand.p).addScaledVector(hand.d, L.hold);
            want.y -= (L.ext.y1 * 0.5); // (held by its middle)
            L.pos.lerp(want, 1 - Math.exp(-dt * LEV_MAX.FOLLOW));
            // over what is under it — never through a hill, a wall or a roof
            const floor = this._groundUnder(L, data) - L.ext.y0 + 0.15;
            if (L.pos.y < floor) L.pos.y = floor;
            L.vel.subVectors(L.pos, L.prev || L.pos).divideScalar(Math.max(1e-3, dt));
            L.prev = (L.prev || new THREE.Vector3()).copy(L.pos);
            L.top = Math.max(L.top ?? L.pos.y, L.pos.y);
            // it swings a little as it is carried
            L.sway.x += (-L.vel.z * 0.012 - L.sway.x) * Math.min(1, dt * 2);
            L.sway.z += (L.vel.x * 0.012 - L.sway.z) * Math.min(1, dt * 2);
            if (L.kind === 'tree' && Math.random() < 0.2) this._crumbs(L, 0.3, true);
            return;
        }
        // (let go while still rocking: it settles back into its own place)
        const ground = L.phase === 'settle' ? L.base.y : this._groundUnder(L, data) - L.ext.y0;
        if (L.phase === 'lower' || L.phase === 'settle') {
            L.pos.y = Math.max(ground, L.pos.y - LEV_MAX.LOWER * dt);
            L.sway.x *= Math.exp(-dt * 3); L.sway.z *= Math.exp(-dt * 3);
            if (L.pos.y <= ground + 0.01) this._landBig(L, true);
            return;
        }
        if (L.phase === 'fall') {
            L.vel.y -= LEV_MAX.G * dt;
            L.vel.x *= Math.exp(-dt * 0.2); L.vel.z *= Math.exp(-dt * 0.2);
            L.pos.addScaledVector(L.vel, dt);
            L.sway.x += L.vel.z * 0.002 * dt; L.sway.z -= L.vel.x * 0.002 * dt;
            const g2 = this._groundUnder(L, data) - L.ext.y0;
            if (L.pos.y <= g2) { L.pos.y = g2; this._landBig(L, false); }
        }
    }

    /** The highest ground (any solid block) under its footprint, world y. */
    _groundUnder(L, data) {
        if (!data) return L.base.y;
        const e = L.ext, p = L.pos;
        let y = -Infinity;
        for (const fx of [0.15, 0.5, 0.85]) for (const fz of [0.15, 0.5, 0.85]) {
            const x = Math.round(p.x + e.x0 + (e.x1 - e.x0) * fx), z = Math.round(p.z + e.z0 + (e.z1 - e.z0) * fz);
            y = Math.max(y, data.topLayer(x, z) - 0.5);
        }
        return y;
    }

    /** Earth and splinters round its foot as it works loose / dirt falling off the roots. */
    _crumbs(L, p, roots = false) {
        const fx = this.game.fx;
        if (!fx) return;
        const r = L.kind === 'tree' ? 1.5 : Math.max(2, (L.ext.x1 - L.ext.x0) / 2);
        const a = Math.random() * Math.PI * 2;
        const at = roots ? _v1.set(L.pos.x + (Math.random() - 0.5) * 2, L.pos.y + L.ext.y0, L.pos.z + (Math.random() - 0.5) * 2) : _v1.set(L.base.x + Math.cos(a) * r, L.base.y + 0.1, L.base.z + Math.sin(a) * r);
        fx.spark(at, Math.random() < 0.6 ? 0x6b4a2a : 0x8a7a5a, 0.14 + p * 0.1, _v2.set((Math.random() - 0.5) * 2, roots ? -2 : 1 + p * 3, (Math.random() - 0.5) * 2), 0.7);
    }

    /** (host) Out it comes. */
    _tearOut(L) {
        const g = this.game;
        L.phase = 'carry';
        L.top = L.pos.y;
        if (g.duel?._handOf(L.by, L.side, _hp, _hd)) {
            _v1.copy(L.pos); _v1.y += L.ext.y1 * 0.5;
            L.off = aimOffset(_hd, _v2.subVectors(_v1, _hp));
            L.hold = Math.min(LEV_MAX.RANGE, Math.max(LEV_MAX.MIN_HOLD, _v2.length()));
        } else L.hold = 15;
        L.steady = null;
        this._tornFx(L);
        g.sync?.levMax?.({ a: 'torn', id: L.id });
    }

    /** (every computer) Torn out: earth bursts, a crack and a rumble. */
    _tornFx(L) {
        const g = this.game;
        const items = [];
        const r = L.kind === 'tree' ? 2 : Math.max(2.5, (L.ext.x1 - L.ext.x0) / 2);
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2, d = Math.random() * r;
            items.push({ x: L.base.x + Math.cos(a) * d, y: L.base.y + 0.2, z: L.base.z + Math.sin(a) * d, color: i % 3 ? 0x6b4a2a : 0x4a7a2a });
        }
        g.fx?.debrisFrom?.(items, _v1.set(L.base.x, L.base.y - 1, L.base.z), 80);
        g.sound?.playCrack?.(L.base, 1);
        g.sound?.playRumble?.(L.base, g.character?.group?.position);
        g.fx && (g.fx.shake = Math.max(g.fx.shake || 0, L.kind === 'house' ? 0.5 : 0.3));
    }

    /** (host) A house / a tree comes down: set down whole (gently) or broken where it falls. */
    _landBig(L, gentle) {
        const g = this.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        const h = Math.max(0, (L.top ?? L.pos.y) - L.pos.y);
        const dx = Math.round(L.pos.x - L.base.x), dz = Math.round(L.pos.z - L.base.z);
        const top = (x, z) => data.topLayer(x, z);
        let res;
        const edits = [];
        // set down where it was before it ever came out (let go while still rocking): back in place
        const back = L.phase === 'settle' || (gentle && L.top == null);
        if (back || gentle) {
            // whole: every block shifted, its foot on the highest ground under it
            const dL = back ? 0 : Math.round(L.pos.y + 1.5) - L.baseL;
            res = { set: [], broken: [] };
            for (const c of L.cells) {
                const x = c[0] + dx, Lc = c[1] + dL, z = c[2] + dz;
                const was = data.get(x, Lc, z);
                if (was && was !== BLOCK.WATER) { res.broken.push([x, Lc, z, c[3]]); continue; }
                res.set.push([x, Lc, z, c[3]]);
            }
        } else {
            // broken: it crushes what it lands on first (a roof, a fence, a wall — not the ground)
            if (h > 3) {
                const e = L.ext;
                for (let x = Math.round(L.pos.x + e.x0 + 0.5); x <= Math.round(L.pos.x + e.x1 - 0.5); x++) for (let z = Math.round(L.pos.z + e.z0 + 0.5); z <= Math.round(L.pos.z + e.z1 - 0.5); z++) {
                    for (let k = 0; k < 2; k++) {
                        const Lt = data.topLayer(x, z), t = data.get(x, Lt, z);
                        if (!t || GROUND.has(t)) break;
                        data.set(x, Lt, z, BLOCK.AIR);
                        edits.push([x, Lt, z, BLOCK.AIR]);
                    }
                }
            }
            if (L.kind === 'house') res = rubbleOf(L.cells, dx, dz, top);
            else {
                const v = L.vel;
                const dir = Math.abs(v.x) > Math.abs(v.z) ? (v.x > 0 ? 'x' : '-x') : (v.z > 0 ? 'z' : v.z < 0 ? '-z' : ['x', '-x', 'z', '-z'][Math.floor(Math.random() * 4)]);
                const foot = [L.tree.foot[0] + dx, L.tree.foot[1], L.tree.foot[2] + dz];
                res = felledOf(L.cells.map((c) => [c[0] + dx, c[1], c[2] + dz, c[3]]), foot, dir, top);
            }
        }
        for (const c of res.set) { data.set(c[0], c[1], c[2], c[3]); edits.push(c); }
        if (edits.length) g.builder?._sendEdits?.(edits);
        const e = L.ext;
        const box = { x0: L.pos.x + e.x0, x1: L.pos.x + e.x1, z0: L.pos.z + e.z0, z1: L.pos.z + e.z1, y0: L.pos.y + e.y0 };
        const dmg = gentle || back ? 0 : crushDamage(L.kind, h);
        g.sync?.levMax?.({ a: 'land', id: L.id, b: [box.x0, box.x1, box.z0, box.z1, box.y0].map((v) => Math.round(v * 10) / 10), dmg, by: L.by, br: res.broken.length });
        this._landFx(L, box, res.broken, dmg);
        if (dmg) this.crush(box, dmg, L.by, L.kind);
        if (!gentle && !back) g.castleLife?.alarm?.(L.pos, 'uproot', L.by, Math.max(4, (e.x1 - e.x0) / 2));
        this._finish(L);
    }

    /** (every computer) Dust, flying rubble and the thud as it lands. */
    _landFx(L, box, broken, dmg) {
        const g = this.game;
        const c = _v1.set((box.x0 + box.x1) / 2, box.y0 + 0.5, (box.z0 + box.z1) / 2);
        const debris = broken.slice(0, 300).map(([x, Lb, z, t]) => ({ x, y: Math.min(Lb - 1, box.y0 + 2), z, color: BASE_COLORS[t] ?? 0x888888 }));
        for (let i = 0; i < 30; i++) debris.push({ x: box.x0 + Math.random() * (box.x1 - box.x0), y: box.y0 + 0.2, z: box.z0 + Math.random() * (box.z1 - box.z0), color: 0x9a8f80, size: 0.6 });
        g.fx?.debrisFrom?.(debris, c, dmg ? 220 : 60);
        if (dmg) { g.sound?.playExplosion?.(c, g.character?.group?.position, Math.min(0.8, 0.2 + dmg * 0.02)); if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.6); }
        else g.sound?.playCrack?.(c, 0.6);
    }

    /**
     * What it fell on is crushed: every creature under the box is hurt (dmg) and knocked down —
     * my own player on every computer, the creatures by the host.
     */
    crush(b, dmg, by, kind, ship = null) {
        const g = this.game;
        const under = (p, h = 4.6) => p.x > b.x0 - 0.4 && p.x < b.x1 + 0.4 && p.z > b.z0 - 0.4 && p.z < b.z1 + 0.4 && p.y > b.y0 - h - 1 && p.y < b.y0 + 1.5;
        const me = g.character?.group?.position;
        // (on the ship's own deck one is not under it)
        if (me && !g.isDeadLocal && !(ship && g.ships?.me?.ship === ship) && under({ x: me.x, y: me.y - 1.95, z: me.z })) {
            if (g.combat?.enabled) g.combat.damage(dmg, by, 'crush'); else g.damageLocalPlayer?.(dmg);
            g.hud?.setVoice?.(`${kind === 'tree' ? '🌳 На вас упало дерево' : kind === 'ship' ? '⛵ На вас упал корабль' : '🏚️ На вас рухнул дом'}: −${dmg}`, true);
        }
        if (!this.auth) return;
        const c = new THREE.Vector3((b.x0 + b.x1) / 2, b.y0 - 1, (b.z0 + b.z1) / 2);
        const r = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + 0.4;
        for (const z of [...(g.zombies || [])]) if (!z.isDead && under({ x: z.group.position.x, y: z.group.position.y - 1, z: z.group.position.z })) g.damageZombie?.(z, dmg, false, _v2.set(0, -1, 0), by);
        g.castleLife?.hitAt?.(c, r, dmg, by);
        g.animals?.hitAt?.(c, r, dmg, by);
        if (!ship) g.ships?.crew?.hitAt?.(c, r, dmg, by);
        g.spiders?.hitAt?.(c, r, dmg, 'crush', by);
        g.phoenixes?.hitAt?.(c, r, dmg, 'crush', by);
        // (a living tree is hurt only by fire; a dragon is never under it — it flies; book-birds fly)
        // knocked down
        for (const ent of [...(g.zombies || []), ...(g.castleLife?.targets?.() || []), ...(g.animals?.targets?.() || [])]) {
            const p = ent.group?.position || ent;
            if (!under({ x: p.x, y: (p.y ?? 0) - 1, z: p.z }) || ent.dead || ent.isDead) continue;
            g.creatureImpact?.apply?.(ent, { v: _v2.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), by, kind: 'fall', always: { down: 2 } });
        }
    }

    /** (host) A caster lets go: the group falls (or is set down), the big thing falls (or comes down gently). */
    end(id, gentle) {
        const g = this.game;
        const L = this.lifts.get(id);
        if (!L) return;
        for (const { ck, c } of L.members) if (c.lev?.mx === id) g.levitation?.letGo(ck, c, gentle);
        L.members.length = 0;
        for (const b of L.bodies) this._letBody(b, gentle);
        L.bodies.length = 0;
        if (L.kind === 'group') { this._finish(L); return; }
        if (L.kind === 'ship') { L.phase = gentle ? 'lower' : 'fall'; return; }
        L.phase = L.phase === 'loosen' ? 'settle' : gentle ? 'lower' : 'fall';
    }

    /** (host) Let go of a sailor / a living tree / the spider. */
    _letBody(b, gentle) {
        const { ck, c } = b;
        const Lv = c.lev;
        if (!Lv) return;
        c.lev = null;
        const v = gentle ? _v1.set(0, 0, 0) : _v1.copy(Lv.vel).multiplyScalar(1.5);
        if (ck === 's' && c.overboard) {
            Object.assign(c.overboard, { vy: gentle ? -1 : v.y, vx: v.x, vz: v.z, top: Lv.top, by: Lv.by, gentle });
            return;
        }
        this.falls.push({ ck, c, vy: gentle ? -1 : v.y, vx: v.x, vz: v.z, top: Lv.top, by: Lv.by, gentle, t: 0 });
    }

    get falls() { return this._falls || (this._falls = []); }

    /** (host) A living tree / the spider falling after it was let go. */
    _fallStep(dt) {
        const g = this.game;
        for (let i = this.falls.length - 1; i >= 0; i--) {
            const f = this.falls[i];
            const p = f.c.model?.position;
            f.t += dt;
            if (!p || f.c.lev || f.c.dead || f.t > 12) { this.falls.splice(i, 1); continue; }
            f.vy -= LEV_MAX.G * dt;
            p.x += f.vx * dt; p.z += f.vz * dt; p.y += f.vy * dt;
            const ground = g.collision?.groundY?.(p.x, p.z) ?? 0;
            if (p.y > ground) continue;
            p.y = ground;
            this.falls.splice(i, 1);
            if (f.ck === 'sp' && !f.gentle) {
                const d = fallDamage(f.top - ground) * 3;
                if (d) g.spiders?.hit?.(f.c, d, 'fall', f.by);
            }
        }
    }

    /** (host) Carry the group's own bodies (sailors, living trees, the spider) after the hand. */
    _carryBodies(L, dt) {
        const g = this.game;
        for (let i = L.bodies.length - 1; i >= 0; i--) {
            const b = L.bodies[i];
            const { ck, c } = b;
            const Lv = c.lev;
            if (!Lv || !this._creature(ck, c.id)) { if (Lv) c.lev = null; L.bodies.splice(i, 1); continue; }
            const up = this.centre(ck, c, _v1);
            if (Lv.off) Lv.off.dp *= Math.exp(-dt * 2.5);
            const want = g.levitation?.holdPoint(Lv.by, Lv.side, Lv.hold, up, _v2, Lv.off, Lv.steady || (Lv.steady = {}), dt);
            if (!want) { this._letBody(b, false); L.bodies.splice(i, 1); continue; }
            Lv.target.lerp(want, 1 - Math.exp(-dt * 3));
            _v3.subVectors(Lv.target, _v1);
            Lv.vel.lerp(_v3.multiplyScalar(4), Math.min(1, dt * 6));
            this._move(ck, c, _v3.copy(Lv.vel).multiplyScalar(dt));
            Lv.top = Math.max(Lv.top, _v1.y - up);
            // struggling in the air
            if (ck === 's') { c.mode = 'idle'; c.speed = 0; }
            if (ck === 't') { c.walkT = (c.walkT || 0) + dt * 6; c.speed = 1; }
            if (ck === 'sp') g.spiders?._animate?.(c, 1, dt);
        }
    }

    _finish(L) {
        const g = this.game;
        L.gone = true;
        this.lifts.delete(L.id);
        if (L.ship) { L.ship.lifted = null; L.ship.changed = true; }
        for (const { ck, c } of L.members) if (c.lev?.mx === L.id) g.levitation?.letGo(ck, c, false);
        for (const b of L.bodies) this._letBody(b, false);
        this._dropVisual(L);
        if (this.auth) g.sync?.levMax?.({ a: 'done', id: L.id });
        this._over(L.id);
    }

    /** My spell is over (what it held is down, or gone): the players it held are let go too. */
    _over(id) {
        const M = this.mine;
        if (M?.id !== id) return;
        this.mine = null;
        for (const pid of M.players) this._liftPlayer(pid, M.side, false, false);
    }

    _dropVisual(L) {
        const g = this.game;
        if (L.group) {
            g.scene?.remove(L.group);
            L.group.traverse((o) => { if (o.isInstancedMesh) o.dispose?.(); });
            L.group = null;
        }
        if (L.boxes) { const col = g.collision; for (const id of L.boxes) col?.removeBox(id); L.boxes.length = 0; }
    }

    // ================================================================ frame
    update(dt) {
        const g = this.game;
        // my mana: 2 a second while it holds (nothing comes back meanwhile)
        const M = this.mine;
        if (M) {
            M.t += dt;
            const c = g.combat;
            if (c && !this.creative && c.drain(LEV_MAX.DRAIN * dt, dt) === false) {
                g.hud?.setVoice?.('😮‍💨 Мана кончилась — «Левиоса Максима» отпускает', true);
                this.release(false);
            }
        }
        if (this.auth) {
            for (const L of [...this.lifts.values()]) {
                L.t += dt;
                if (L.bodies.length) this._carryBodies(L, dt);
                if (L.members.length) for (let i = L.members.length - 1; i >= 0; i--) if (L.members[i].c.lev?.mx !== L.id) L.members.splice(i, 1);
                // the caster gone: what it held falls
                if (L.by !== g.localId && !g.remotes?.has(L.by) && L.phase !== 'fall' && L.phase !== 'lower' && L.phase !== 'settle') this.end(L.id, false);
                if (L.kind === 'ship') this._carryShip(L, dt);
                else if (L.kind === 'group') { if (!L.members.length && !L.bodies.length && !(L.desc.np > 0) && L.t > 0.5) this._finish(L); }
                else if (!L.gone) this._carryBig(L, dt);
            }
            if (this._falls?.length) this._fallStep(dt);
            this._net(dt);
        } else {
            for (const L of this.lifts.values()) this._follow(L, dt);
        }
        // every computer: the house / tree where it is, and its collision boxes
        for (const L of this.lifts.values()) {
            if (!L.group) continue;
            L.group.position.copy(L.pos);
            L.group.rotation.set(L.sway.x, 0, L.sway.z);
            if (!L.boxAt || L.boxAt.distanceToSquared(L.pos) > 0.01) this._boxes(L);
        }
    }

    _net(dt) {
        const g = this.game;
        if (!g.sync) return;
        this._netT += dt;
        if (this._netT < 0.1) return;
        this._netT = 0;
        const l = [];
        const r2 = (v) => Math.round(v * 100) / 100;
        for (const L of this.lifts.values()) if (L.group) l.push([L.id, r2(L.pos.x), r2(L.pos.y), r2(L.pos.z), r2(L.sway.x * 100) / 100, r2(L.sway.z * 100) / 100]);
        if (l.length) g.sync.levMaxState?.(l);
    }

    /** (guests) The host's house / tree, smoothly. */
    _follow(L, dt) {
        if (!L.net) return;
        L.pos.lerp(L.net.p, Math.min(1, dt * 8));
        L.sway.x += (L.net.sx - L.sway.x) * Math.min(1, dt * 10);
        L.sway.z += (L.net.sz - L.sway.z) * Math.min(1, dt * 10);
    }

    // ================================================================ network
    onNet(m, isHost) {
        const g = this.game;
        const from = m.from || m.by;
        switch (m.a) {
            case 'on': if (isHost && m.d && typeof m.id === 'string' && m.id.startsWith(String(from) + ':')) this.begin(m.id, from, m.side === 'left' ? 'left' : 'right', m.d); return;
            case 'off': if (isHost) { const L = this.lifts.get(m.id); if (L && L.by === from) this.end(m.id, !!m.g); } return;
            case 'p': if (m.to === g.localId) g.levitation?.liftMe?.(from, m.side === 'left' ? 'left' : 'right', { mx: true }); return;
            case 'no': if (m.to === g.localId && this.mine?.id === m.id) { this._over(m.id); g.hud?.setVoice?.('🪶 Это уже поднято или до него не дотянуться', true); } return;
            case 'big': {
                if (isHost || this.lifts.has(m.id)) return;
                const L = { id: m.id, by: m.by, side: m.side, kind: m.d?.k, desc: m.d, members: [], bodies: [], t: 0 };
                if (this._makeBig(L, m.d || {})) this.lifts.set(m.id, L);
                return;
            }
            case 'torn': if (!isHost) { const L = this.lifts.get(m.id); if (L) { L.phase = 'carry'; this._tornFx(L); } } return;
            case 'land': {
                if (isHost || !Array.isArray(m.b)) return;
                const [x0, x1, z0, z1, y0] = m.b.map(Number);
                const box = { x0, x1, z0, z1, y0 };
                const L = this.lifts.get(m.id);
                if (L) this._landFx(L, box, [], +m.dmg || 0);
                if (+m.dmg > 0) this.crush(box, Math.min(45, +m.dmg), m.by, L?.kind || 'house');
                return;
            }
            case 'done': if (!isHost) { const L = this.lifts.get(m.id); if (L) { this.lifts.delete(m.id); this._dropVisual(L); } this._over(m.id); } return;
            default:
        }
    }

    /** (guests) The host's houses and trees in the air (~10×/s). */
    onNetState(list) {
        if (!Array.isArray(list)) return;
        for (const a of list) {
            const L = this.lifts.get(a[0]);
            if (!L) continue;
            L.net = L.net || { p: new THREE.Vector3() };
            L.net.p.set(+a[1] || 0, +a[2] || 0, +a[3] || 0);
            L.net.sx = +a[4] || 0; L.net.sz = +a[5] || 0;
            if (!L.pos) L.pos = L.net.p.clone();
        }
    }

    /** A player left: what they held falls. */
    onLeave(id) {
        if (!this.auth) return;
        for (const L of [...this.lifts.values()]) if (L.by === id) this.end(L.id, false);
    }

    dispose() {
        for (const L of this.lifts.values()) this._dropVisual(L);
        this.lifts.clear();
    }
}
