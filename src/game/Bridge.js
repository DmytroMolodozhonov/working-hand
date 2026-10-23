/**
 * Bridge.js — «Create a Bridge» (10 mana, no scroll — the author: «доступно без свитка»): a path of blocks
 * laid over a river or a small ravine, where one would have to jump.
 *
 * It is not really a bridge, just a filling so that one can walk across (the author: «из какого материала
 * края — из такого и создаётся мост… Не надо думать про деревья»). Standing at the edge, the raised hand (the
 * wand) shows the other bank — not a precise block (the author: «показал на другой берег — мост построился»):
 * `findBank` walks along the hand's direction (flat, and a little to both sides if that finds nothing) from the
 * edge, meets the FIRST gap (water, a ravine, a pit 1+ deep) and the first solid land behind it — the near edge of
 * the far bank, not the far slope. From under the feet to there a strip three wide grows (1.5 s, up to 3 s for
 * the longest), level with the banks, or sloping up to 1:1 when one bank is higher (up to 12 layers; more than the
 * length allows → as far as it gets). Across 2–40 m (the widest rivers of the world are well under that): ten mana
 * up to 16 m, +0.5 per metre beyond. No planks, no railings, no beams, no wood at all: the strip is made of what
 * the banks are made of — the near half of the near bank's top block (stone → stone, earth/grass → grass, sand →
 * sand, snow → snow, ice → ice, a castle's block → the same block), the far half of the far bank's (`bridgeMaterial`).
 * On level ground with a pit or water beside the way, a plain path is laid to the pointed place.
 *
 * What it lays is ordinary blocks of the world (Builder._sendEdits): solid at once — the players and
 * every creature walk on it (Crowd / the terrain); «Бомбардо», a blast break it like any wall (it burns only
 * if its blocks do, e.g. thatch); saved with the world, everybody gets the blocks.
 * Instant (not held: Concentration — nothing to hold after the words).
 *
 * Who decides: the caster's computer finds the place and lays the blocks; the spell goes to everybody
 * ('spell': o = the caster's feet, d = to the far end) so every computer sees the magic run along it.
 * A block waits while somebody stands in its place (never laid into a body) and is left out after 2 s.
 */

import * as THREE from 'three';
import { BLOCK, isLeaves, isWood, isPlanetBlock } from '../world/Terrain.js';
import { isEnchanted } from '../world/EnchantedStone.js';
import { castingHand } from './WandAim.js';
import { occupied } from './Stitching.js';
import { stepRamps } from '../world/PlanSlopes.js';

export const BRIDGE = {
    REACH: 45, // m along the hand: how far the far bank is looked for (MAX + 5)
    MIN: 2, MAX: 40, // m across (a 1-block gap too; the widest river of the world is ~20 m)
    CHEAP: 16, // m: up to this the price is the usual 10, beyond it +EXTRA per metre
    EXTRA: 0.5,
    RISE: 12, // layers: the far bank at most this much higher / lower
    FAN: [0, 0.14, -0.14, 0.28, -0.28], // rad: the hand's direction, then a little to both sides
    GROW: 1.5, // s from the near bank to the far one (up to GROW_MAX for the longest)
    GROW_MAX: 3,
    WAIT: 2, // s a block waits for a body to step aside
    SEND: 0.12, // s: the blocks laid go out together
};

/** ON WHOM AND ON WHAT (CLAUDE.md). The bridge lays a strip of blocks; it never strikes. */
export const BRIDGE_TARGETS = {
    me: { does: 'none', why: 'колдующего не задевает: мост начинается из-под ног, на берегу блоки не кладутся' },
    players: { does: 'wait', why: 'блок не кладётся в игрока: ждёт, пока он отойдёт (2 с — иначе это место остаётся пустым); по мосту все ходят' },
    zombies: { does: 'wait', why: 'в тело блок не кладётся; по мосту зомби ходят, перила для них — стена (коллизия блоков)' },
    castlePeople: { does: 'wait', why: 'жителей не задевает и не пугает (мост — не опасность); ходят по нему, как по земле' },
    animals: { does: 'wait', why: 'так же — ждёт, пока отойдут; животные ходят по мосту' },
    sailors: { does: 'none', why: 'корабль — не блоки мира: на корабле и через его палубу мост не строится' },
    spider: { does: 'wait', why: 'в паучиху блок не кладётся; по мосту она ходит, как по земле' },
    livingTrees: { does: 'wait', why: 'в живое дерево блок не кладётся' },
    bookBirds: { does: 'none', why: 'летают — их не касается' },
    iceCastle: { does: 'wait', why: 'Королеву, снеговиков, ледяных монстров не задевает; блок ждёт, пока уйдут' },
    blackship: { does: 'none', why: 'капитан и скелеты на корабле в море — мост строится только между берегами' },
    dragon: { does: 'wait', why: 'в дракона блок не кладётся; его огонь не страшен каменному и земляному настилу' },
    phoenix: { does: 'none', why: 'не касается' },
    owl: { does: 'none', why: 'не касается' },
    blocks: { does: 'build', why: 'кладёт блоки того же материала, что и края (камень, земля, песок, снег, лёд, блок замка), только в пустоту и воду; землю, стены, чужие блоки не трогает' },
    gap: { does: 'build', why: 'берег ищется по направлению руки: первый провал (вода, ущелье, яма от 1 блока) и первая твёрдая земля за ним; на ровном месте — дорожка к указанной точке, если рядом вода или яма, иначе подсказка «можно просто пройти»' },
    water: { does: 'build', why: 'над рекой мост идёт на уровне берега; если берег вровень с водой — настил ложится на воду' },
    trees: { does: 'none', why: 'деревья не трогает и из дерева не строит: ствол или листва с края — это просто земля; блок там, где дерево, не кладётся' },
    houses: { does: 'none', why: 'стены домов и замков не ломает — упирается в них' },
    ships: { does: 'none', why: 'корабль — не блоки мира (его палубы двигаются)' },
    ward: { does: 'none', why: 'в чужой сфере защиты дома не строит (HouseWards.forbids)' },
    godGift: { does: 'none', why: 'мост ничего не разрушает, поэтому дары богов (храм, пьедесталы) он не задевает' },
    fire: { does: 'burned', why: 'горит только если края горючие (солома, сено); камень, земля, песок, лёд огнём не берутся (лёд тает, как любой лёд)' },
    blast: { does: 'broken', why: 'взрывы, «Бомбардо», Total Destruction ломают его, как любые блоки; строители замков его не восстанавливают' },
};

/**
 * What the strip is made of for a bank whose top block is `b` — the same material. Exceptions, each with its reason:
 * trees (a trunk / leaves / planks at the edge: no wood is used — the ground under it is earth), tilled land and
 * paths (just earth), the enchanted stone (no spell makes it — plain stone, as Stitching does), glowing / decor
 * and unknown blocks (stone). Sand and gravel stay sand and gravel: no block of this world falls, so a strip of
 * them hangs as any filling does.
 */
export function bridgeMaterial(b) {
    if (isEnchanted(b)) return BLOCK.STONE;
    if (isWood(b) || isLeaves(b) || b === BLOCK.THATCH || b === BLOCK.HAY || b === BLOCK.FENCE) return BLOCK.DIRT;
    if (b === BLOCK.FARMLAND || b === BLOCK.PATH || b === BLOCK.WHEAT || b === BLOCK.VEG || b === BLOCK.FLOWERS) return BLOCK.DIRT;
    if (b === BLOCK.ICE_SHAPE) return BLOCK.ICE;
    if (b === BLOCK.AIR || b === BLOCK.WATER || b === BLOCK.BEDROCK) return BLOCK.STONE;
    if (b === BLOCK.GRASS || b === BLOCK.DIRT || b === BLOCK.STONE || b === BLOCK.SNOW || b === BLOCK.SAND || b === BLOCK.ICE || b === BLOCK.GRAVEL || b === BLOCK.DEEPSTONE) return b;
    if ((b >= BLOCK.CS_GREY && b <= BLOCK.BRICK) || b === BLOCK.PLASTER || isPlanetBlock(b)) return b;
    if (b >= BLOCK.ICE_WALL && b <= BLOCK.ICE_DARK) return b;
    return BLOCK.STONE;
}
/** The colour of the magic's sparks over a material. */
const sparkColor = (b) => (b === BLOCK.SAND ? 0xe6d8a0 : b === BLOCK.SNOW ? 0xf4f8ff : b === BLOCK.ICE || (b >= BLOCK.ICE_WALL && b <= BLOCK.ICE_DARK) ? 0xa8dcff : b === BLOCK.GRASS ? 0x7fbf5a : b === BLOCK.DIRT ? 0x9a7448 : 0xb8b4aa);
const free = (t) => t === BLOCK.AIR || t === BLOCK.WATER;

/** The phrase: «Create a Bridge» («криейт э бридж», «бридж»), «создай / построй мост» → 'CreateBridge' | null. */
export function bridgeWords(text) {
    const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
    const words = s.split(/[^a-zа-я]+/).filter(Boolean);
    if (words.some((w) => /^(?:айс|айз|аис|ice|ais|ays|лед|ледян[а-я]*|ледов[а-я]*)$/.test(w))) return null; // («Ice Bridge»: IceMagic.js)
    if (words.some((w) => /^(?:bridge|bridg|brige|bridj|бридж|бриж|брыдж|бридз|бриджь)$/.test(w))) return 'CreateBridge';
    // the Russian word «мост» only with a word of making (never «мост» in talk, «самостоятельно», «мостовая»)
    const most = words.some((w) => /^(?:мост|мостик|моста|мосты)$/.test(w));
    const make = words.some((w) => /^(?:созда[а-я]*|постро[а-я]*|сотвори|сделай|наведи|перекинь)$/.test(w));
    return most && make ? 'CreateBridge' : null;
}

/**
 * The bridge between A (the caster's feet: the bank's top layer aL) and the far end B (bx, bz, bL):
 * {cells: [[x, L, z, block, t, shape?]…] sorted from A to B, len} — or {why} when it cannot be built there
 * (shape: a ramp on a step of a slanting deck — BlockShapes.js).
 * get(x, L, z) → block; top(x, z) → the highest solid layer of a column.
 * The strip is three wide, made of the banks' material: the near half of the near bank's, the far half of the far one's.
 */
export function bridgePlan(get, top, A, B, opts = {}) {
    const dx = B.x - A.x, dz = B.z - A.z;
    const len = Math.hypot(dx, dz);
    if (len < BRIDGE.MIN) return { why: 'near' };
    if (len > BRIDGE.MAX) return { why: 'far' };
    const rise = B.L - A.L;
    if (Math.abs(rise) > BRIDGE.RISE) return { why: 'steep' };
    const fx = dx / len, fz = dz / len, sx = -fz, sz = fx; // (along, across)
    // up to 1:1 along the way; a bank steeper than that is reached as far as the slope gets
    const deckAt = (t) => { const r = rise * t, m = len * t; return Math.round(A.L + Math.max(-m, Math.min(m, r))); };
    // the columns of the deck (three wide) and of its edges, sampled finely so a slanting bridge has no holes
    const cols = new Map(); // "x,z" → {x, z, t}
    for (let s = 0; s <= len + 0.01; s += 0.25) {
        const t = s / len;
        for (let w = -1.25; w <= 1.3; w += 0.5) { // (three wide; off the halves: Math.round would lean to one side)
            const x = Math.round(A.x + fx * s + sx * w), z = Math.round(A.z + fz * s + sz * w);
            const k = x + ',' + z;
            if (!cols.has(k)) cols.set(k, { x, z, t });
        }
    }
    // a gap to bridge: somewhere along the way the ground is 1+ below the deck, or there is water
    let gap = 0;
    for (let s = 0.5; s < len; s += 0.5) {
        const t = s / len, x = Math.round(A.x + fx * s), z = Math.round(A.z + fz * s), L = deckAt(t);
        if (free(get(x, L, z)) && (top(x, z) <= L - 1 || get(x, L, z) === BLOCK.WATER || get(x, L - 1, z) === BLOCK.WATER)) gap++;
    }
    if (gap < 1 && !opts.path) return { why: 'nogap' };
    const near = bridgeMaterial(get(A.x, A.L, A.z)), far = bridgeMaterial(get(B.x, B.L, B.z));
    const cells = [];
    for (const c of cols.values()) {
        const L = deckAt(c.t);
        if (!free(get(c.x, L, c.z))) continue; // (the banks, a wall, a tree: left as they are)
        cells.push([c.x, L, c.z, c.t < 0.5 ? near : far, c.t]);
    }
    // where the deck goes up a block (a slanting bridge): a ramp on the lower step — walked up, not climbed (BlockShapes.js)
    const tops = new Map();
    for (const c of cols.values()) tops.set(c.x + ',' + c.z, deckAt(c.t));
    for (const [x, L, z, shape] of stepRamps(tops)) {
        const c = cols.get(x + ',' + z);
        if (c && free(get(x, L, z))) cells.push([x, L, z, c.t < 0.5 ? near : far, c.t, shape]);
    }
    cells.sort((a, b) => a[4] - b[4] || a[1] - b[1]);
    return { cells, len, near, far };
}

const _wallish = (b) => (b >= BLOCK.CS_GREY && b <= BLOCK.BRICK) || b === BLOCK.PLASTER || b === BLOCK.PLANKS || b === BLOCK.PLANKS_DARK;
/**
 * The far bank along the direction (fx, fz) from A: the first gap (water, a drop of 2+, a pit of 1 that the ground
 * climbs out of within 6 m) and the first solid land behind it (dry, two free layers above, not a tree) →
 * {B:{x, z, L}} — or {why}: 'nogap' (no gap on the way), 'far' (the land is beyond MAX), 'sea' (only water up to MAX),
 * 'wall' (a house's wall stands at the edge), 'steep' (the land is over RISE higher), 'unknown' (not made yet).
 * known(x, z) → is this ground made yet (default: yes).
 */
export function findBank(get, top, A, fx, fz, known = null) {
    const col = (s) => { const x = Math.round(A.x + fx * s), z = Math.round(A.z + fz * s); return { x, z, t: top(x, z) }; };
    const wet = (c) => get(c.x, c.t + 1, c.z) === BLOCK.WATER;
    let cur = A.L, inGap = false, onlyWater = true, firstGap = -1;
    for (let s = 1; s <= BRIDGE.MAX + 0.01; s += 0.5) {
        const x = Math.round(A.x + fx * s), z = Math.round(A.z + fz * s);
        if (known && !known(x, z)) return { why: 'unknown' };
        const c = { x, z, t: top(x, z) }, w = wet(c);
        if (!inGap) {
            let gap = w || c.t <= cur - 2;
            if (!gap && c.t === cur - 1) { // a pit one deep: the ground comes back up soon
                for (let k = s + 0.5; k <= s + 6; k += 0.5) { const n = col(k); if (n.t >= cur && !wet(n)) { gap = true; break; } }
            }
            if (gap) { inGap = true; firstGap = s; onlyWater = w; continue; }
            if (c.t < cur) cur = c.t; // (a slope down: walked)
            else if (c.t > cur) cur = Math.min(c.t, cur + 1);
            if (c.t > A.L + 1) return { why: 'nogap' }; // (a hill, not a gap)
            continue;
        }
        // behind the gap: the first land
        if (w) { continue; }
        if (c.t <= cur - 4 && c.t < A.L - 3) { onlyWater = false; continue; } // (the bottom or the slope of a ravine)
        const b = get(c.x, c.t, c.z);
        if (isWood(b) || isLeaves(b)) { onlyWater = false; continue; } // (a tree at the edge: the ground is further)
        if (!free(get(c.x, c.t + 1, c.z)) || !free(get(c.x, c.t + 2, c.z))) { onlyWater = false; continue; }
        if (_wallish(b) && c.t > A.L + 1) return { why: 'wall' };
        if (c.t - A.L > BRIDGE.RISE) return { why: 'steep' };
        return { B: { x: c.x, z: c.z, L: c.t } };
    }
    if (!inGap) return { why: 'nogap' };
    return { why: onlyWater ? 'sea' : 'far' };
}

/** The mana beyond the usual ten for a long bridge. */
export const bridgeExtra = (len) => Math.max(0, Math.ceil((Math.min(len, BRIDGE.MAX) - BRIDGE.CHEAP) * BRIDGE.EXTRA));

/**
 * Where the hand shows: the bridge for the direction (hx, hz) (flat), looked for along it and a little to both
 * sides. `point` (the place the ray hit, or null): with no gap on the way, a plain path to it is laid when a pit
 * or water lies beside the way. → {A, B, plan} | {why}
 */
export function bridgeAim(get, top, A, hx, hz, point = null, known = null) {
    const h = Math.hypot(hx, hz);
    if (h < 1e-3) return { why: 'none' };
    hx /= h; hz /= h;
    let fail = null;
    for (const a of BRIDGE.FAN) {
        const c = Math.cos(a), s = Math.sin(a);
        const fx = hx * c - hz * s, fz = hx * s + hz * c;
        const r = findBank(get, top, A, fx, fz, known);
        if (r.B) {
            const plan = bridgePlan(get, top, A, r.B);
            if (plan.cells) return { A, B: r.B, plan };
            fail = fail || plan.why;
        } else if (!fail || (fail === 'nogap' && r.why !== 'nogap')) fail = r.why;
    }
    if (fail === 'nogap' && point) {
        // level ground: a path to the pointed place, if a pit or water lies beside the way
        const dx = point.x - A.x, dz = point.z - A.z, len = Math.hypot(dx, dz);
        if (len >= BRIDGE.MIN && len <= BRIDGE.MAX) {
            const B = { x: Math.round(point.x), z: Math.round(point.z), L: top(Math.round(point.x), Math.round(point.z)) };
            if (Math.abs(B.L - A.L) <= 2) {
                const fx = dx / len, fz = dz / len;
                let near = false;
                for (let s = 1; s < len && !near; s += 1) for (let w = -3; w <= 3; w++) {
                    const x = Math.round(A.x + fx * s - fz * w), z = Math.round(A.z + fz * s + fx * w);
                    if (get(x, A.L, z) === BLOCK.WATER || top(x, z) <= A.L - 2) { near = true; break; }
                }
                if (near) {
                    const plan = bridgePlan(get, top, A, B, { path: true });
                    if (plan.cells && plan.cells.length) return { A, B, plan };
                }
            }
        }
    }
    return { why: fail || 'none' };
}

/** Why it cannot be built — the hint for the player. */
export function bridgeHint(why) {
    if (why === 'near') return '🌉 Покажите палочкой чуть дальше — на другой берег';
    if (why === 'far') return '🌉 Другой берег далеко — подойдите чуть ближе к краю';
    if (why === 'sea') return '🌉 Другого берега не видно — подойдите ближе или укажите на берег';
    if (why === 'steep') return '🌉 Тот берег слишком высоко — поднимитесь повыше или найдите место пониже';
    if (why === 'wall') return '🌉 На том берегу стена — укажите на землю рядом с ней';
    if (why === 'nogap') return '🌉 Здесь можно просто пройти';
    if (why === 'unknown') return '🌉 Там земля ещё не готова — подождите секунду';
    if (why === 'water') return '🌉 Там вода — направьте палочку на другой берег';
    return '🌉 Направьте палочку на другой берег реки или край ущелья — и скажите «Create a Bridge»';
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Bridge {
    constructor(game) {
        this.game = game;
        this._lastAt = -1e9;
    }

    get data() { return this.game.terrain?.data || null; }

    /** Where the bridge would go from here: {A, B, plan} or {why}. */
    aim(origin, dir) {
        const data = this.data;
        if (!data) return { why: 'none' };
        const get = (x, L, z) => data.get(x, L, z), top = (x, z) => data.topLayer(x, z);
        const p = this.game.character.group.position;
        const A = { x: Math.round(p.x), z: Math.round(p.z), L: Math.floor(p.y + 1.4) };
        if (!free(get(A.x, A.L + 1, A.z)) || free(get(A.x, A.L, A.z))) A.L = top(A.x, A.z); // (feet just off the ground: the column's top)
        const hit = data.raycast(origin, dir, BRIDGE.REACH);
        let hx = dir.x, hz = dir.z; // (the hand's way, flat; a hand straight up or down: towards what it hit)
        if (Math.hypot(hx, hz) < 0.25) { if (!hit) return { why: 'none' }; hx = hit.x - p.x; hz = hit.z - p.z; }
        const known = data.landMade ? (x, z) => data.landMade(x, z) : null;
        return bridgeAim(get, top, A, hx, hz, hit && hit.dist > 1 ? hit : null, known);
    }

    /** Voice on my computer. */
    cast(isFinal) {
        const g = this.game;
        const now = performance.now();
        if (now - this._lastAt < 1500) return null;
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        const hand = castingHand(g);
        if (!hand || !g.character.isArmRaised(hand.side)) return hint('🌉 Поднимите руку (палочку), направьте её на другой берег — и скажите «Create a Bridge»');
        const at = this.aim(hand.origin, hand.dir);
        if (!at.plan) return hint(bridgeHint(at.why));
        const mid = _v.set((at.A.x + at.B.x) / 2, at.A.L - 1, (at.A.z + at.B.z) / 2);
        if (g.wards?.forbids?.(hand.origin, mid)) return hint('🛡️ Здесь чужая защита дома — мост не построить');
        if (g.ships?.footprintAt?.(at.B.x, at.B.L - 1, at.B.z)) return hint('⚓ На корабль мост не строится');
        const extra = bridgeExtra(at.plan.len);
        const tired = g.combat.check('CreateBridge', extra);
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('CreateBridge', extra);
        this._lastAt = now;
        const o = new THREE.Vector3(at.A.x, at.A.L, at.A.z), d = new THREE.Vector3(at.B.x - at.A.x, at.B.L - at.A.L, at.B.z - at.A.z);
        this.grow(o, d, g.localId, at.plan);
        g.sync?.spell('CreateBridge', o, d, hand.side);
        return 'CreateBridge';
    }

    /**
     * (every computer) the bridge grows from the near bank to the far one: block after block appears in a
     * puff of golden sparks, the front of the magic running ahead. o: A (x, L, z); d: to B. The caster's
     * computer lays the blocks.
     */
    grow(o, d, casterId, plan = null) {
        const g = this.game;
        const data = this.data;
        if (!data) return;
        const A = { x: Math.round(o.x), L: Math.round(o.y), z: Math.round(o.z) };
        const B = { x: Math.round(o.x + d.x), L: Math.round(o.y + d.y), z: Math.round(o.z + d.z) };
        plan = plan || bridgePlan((x, L, z) => data.get(x, L, z), (x, z) => data.topLayer(x, z), A, B);
        if (!plan.cells) return;
        const mine = casterId === g.localId || casterId === 'local';
        const cells = plan.cells.map((c) => ({ c, wait: 0 }));
        const color = sparkColor(plan.near);
        const growT = BRIDGE.GROW + Math.max(0, Math.min(1, (plan.len - BRIDGE.CHEAP) / (BRIDGE.MAX - BRIDGE.CHEAP))) * (BRIDGE.GROW_MAX - BRIDGE.GROW);
        g.sound?.playWhoosh?.();
        let t = 0, i = 0, sendT = 0, done = false;
        const out = [];
        const flush = () => { if (out.length) { g.builder?._sendEdits(out.splice(0)); } };
        g.spells.spells.push({
            life: growT + BRIDGE.WAIT + 1,
            onUpdate: (spell, dt) => {
                t += dt;
                const front = Math.min(1, t / growT);
                // the front of the magic runs over the gap
                const fp = _v.set(A.x + d.x * front, A.L - 0.4 + d.y * front, A.z + d.z * front);
                for (let k = 0; k < 2; k++) g.fx.spark(fp, k ? 0xfff2a8 : color, 0.1, _w.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.5);
                let left = 0;
                for (let j = i; j < cells.length; j++) {
                    const e = cells[j];
                    if (e.done) continue;
                    if (e.c[4] > front) { left++; continue; }
                    const [x, L, z, block, , shape = 0] = e.c;
                    if (occupied(g, { x, L, z })) { e.wait += dt; if (e.wait < BRIDGE.WAIT) { left++; continue; } e.done = true; continue; }
                    e.done = true;
                    if (Math.random() < 0.5) g.fx.spark(_v.set(x, L - 1, z), color, 0.12, _w.set(0, 1.5, 0), 0.4);
                    if (!mine || !free(data.get(x, L, z))) continue;
                    data.set(x, L, z, block, shape);
                    const sh = shape && data.shapeAt ? data.shapeAt(x, L, z) : 0; // (a material that takes no shape: whole)
                    out.push(sh ? [x, L, z, block, sh] : [x, L, z, block]);
                }
                while (i < cells.length && cells[i].done) i++;
                sendT += dt;
                if (sendT >= BRIDGE.SEND) { sendT = 0; flush(); }
                if (!left && front >= 1 && !done) {
                    done = true;
                    flush();
                    g.sound?.playStep?.();
                    spell.life = 0;
                }
            },
            onEnd: () => flush(),
        });
    }
}
