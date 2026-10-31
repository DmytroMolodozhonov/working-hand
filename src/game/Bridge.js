/**
 * Bridge.js — «Create a Bridge» (10 mana, no scroll — the author: «доступно без свитка»): a strip of blocks that
 * grows from where the hero stands to the place the wand points at.
 *
 * The author: «Мост должен создаваться НЕ только над рекой, а по любым условиям… Можно везде создать мост. Главное,
 * чтобы палочка упиралась в какой-то твёрдый объект. Может быть мост ввысь, через расщелины, пропасти, неважно.
 * ЕМУ ВООБЩЕ ДОЛЖНО БЫТЬ ПОФИГ. До 200 метров, больше нельзя». So there is no «bank» to look for and no «gap» to
 * find: the wand's ray (`TerrainData.raycast`, up to 200 m) hits a solid block, and the strip (five wide, a straight
 * line in height from the hero's feet to the target — level over a lake, an even climb up a hill, 1:1 at the steepest, a ramp on every step) is laid from under the feet
 * to that block: over a river, a ravine, the sea, lava, thin air, up a mountain or a tower, down a cliff. Only
 * EMPTY cells (air, water) are filled — a wall, a house, a tree, an enchanted or a god's block in the way is left
 * as it is (never replaced). Half-block rails on the edges, flared slab feet at both ends. On solid level ground,
 * where nothing is empty, a low walkway of slabs is laid half a block up.
 *
 * It is made of what the ends are made of — the near half of the block under the feet, the far half of the block
 * hit; an unfit end takes the other's, else what is most around (`bridgeMaterials`, `BRIDGE_MATERIAL_OF`; wood only where wood is about). Price: ten mana up to 16 m, +0.5 per metre beyond (200 m → ~102).
 * The strip grows by pieces (the front of the magic runs from the hero to the target, 1.5 s up to ~10 s for the
 * longest; the caster's computer lays the blocks a few at a time), the others only see the magic run.
 *
 * What it lays is ordinary blocks of the world (Builder._sendEdits): solid at once — the players and every
 * creature walk on it; «Бомбардо», a blast break it like any wall (a broken block lets what it held come down —
 * Collapse); saved with the world, everybody gets the blocks. Instant (not held: nothing to hold after the words).
 *
 * Who decides: the caster's computer finds the place and lays the blocks; the spell goes to everybody
 * ('spell': o = the caster's feet, d = to the far end). A block waits while somebody stands in its place (never
 * laid into a body) and is left out after 2 s.
 */

import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';
import { castingHand } from './WandAim.js';
import { occupied } from './Stitching.js';
import { stepRamps } from '../world/PlanSlopes.js';
import { SHAPE } from '../world/BlockShapes.js';

export const BRIDGE = {
    REACH: 200, // m along the wand: how far the solid thing it points at may be (the author: «до 200 метров»)
    MIN: 2, MAX: 200, // m across (horizontal, from the feet to the target)
    CHEAP: 16, // m: up to this the price is the usual 10, beyond it +EXTRA per metre
    EXTRA: 0.5,
    STEP: 8, // m: the ray is checked for ground that is not made yet at this step
    GROW: 1.5, // s from the hero to the target (up to GROW_MAX for the longest)
    GROW_MAX: 10,
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
    canary: { does: 'none', why: 'не касается' },
    spencer: { does: 'none', why: 'не касается' },
    ghost: { does: 'none', why: 'не касается: призрак бестелесный' },
    custom: { does: 'none', why: 'не касается' },
    gargoyle: { does: 'none', why: 'не касается' },
    blocks: { does: 'build', why: 'кладёт блоки материала, что рядом (камень, песчаник, снег, лёд, блок замка; земля — только если вокруг одна земля), только в пустоту и воду; землю, стены, чужие блоки не трогает' },
    gap: { does: 'build', why: 'пропасти, ущелья, ямы и пустота: мост ложится в любое пустое место, берега искать не нужно (палочка упирается в твёрдое — туда он и идёт)' },
    water: { does: 'build', why: 'вода — пустая клетка: настил ложится на уровне ног, над водой или в воду' },
    trees: { does: 'none', why: 'деревья не трогает; блок там, где дерево, не кладётся; доски — материал моста только если вокруг доски и брёвна, листва — никогда' },
    houses: { does: 'none', why: 'стены домов и замков не ломает — упирается в них' },
    ships: { does: 'none', why: 'корабль — не блоки мира (его палубы двигаются)' },
    ward: { does: 'none', why: 'в чужой сфере защиты дома не строит (HouseWards.forbids)' },
    godGift: { does: 'none', why: 'мост ничего не разрушает, поэтому дары богов (храм, пьедесталы) он не задевает' },
    fire: { does: 'burned', why: 'горит только если края горючие (солома, сено); камень, земля, песок, лёд огнём не берутся (лёд тает, как любой лёд)' },
    blast: { does: 'broken', why: 'взрывы, «Бомбардо», Total Destruction ломают его, как любые блоки; строители замков его не восстанавливают' },
};

/**
 * WHAT THE BRIDGE IS MADE OF (the author: «он создал мост из ДЕРЕВА, хотя должен — из МАТЕРИАЛОВ, КОТОРЫЕ РЯДОМ»):
 * block nearby → the bridge's block. `EARTH` — ground that is only a last resort (a bridge of stone is preferred when
 * stone is anywhere around; with only earth about, an earthen causeway). Not listed = never a bridge's material:
 * air, water, bedrock, leaves, thatch / hay / fences / crops, cloth, lamps, gold, the enchanted and ghost stone, a
 * god's gift (the bridge only lays; it never copies what no spell makes).
 */
export const EARTH = -1;
export const BRIDGE_MATERIAL_OF = (() => {
    const B = BLOCK, m = {};
    const put = (list, to) => { for (const k of list) if (B[k] != null) m[B[k]] = to ?? B[k]; };
    put(['STONE', 'DEEPSTONE', 'GRAVEL', 'ARCANE', 'ARCANE_DARK'], B.STONE);
    put(['SAND'], B.CS_SAND); // (sandstone)
    put(['SNOW'], B.SNOW);
    put(['ICE', 'ICE_SHAPE', 'ICE_WALL', 'ICE_GLOW', 'ICE_FLOOR', 'ICE_DARK'], B.ICE);
    put(['CS_GREY', 'CS_SAND', 'CS_DARK', 'CS_WHITE', 'CS_MOSSY', 'COBBLE', 'BRICK', 'PLASTER']); // (castle walls: the same stone)
    put(['PLANKS', 'PLANKS_DARK']);
    put(['WOOD', 'BIRCH', 'SPRUCE', 'CHERRY', 'DARK'], B.PLANKS); // (a trunk: planks — only where wood is what is around)
    put(['REGOLITH', 'PLANET_ROCK', 'PLANET_ICE', 'PLANET_DARK']); // (other planets: their own ground)
    put(['GRASS', 'DIRT', 'FARMLAND', 'PATH', 'PLANET_GRASS'], EARTH);
    return m;
})();

/**
 * The two materials of a bridge: the near half from the block under the feet `nearB`, the far half from the block the
 * wand hit `farB`; an end that is no fit (grass, water, air, leaves…) takes the other end's; both unfit → the most
 * common fit material among `around` (the blocks round the hero within 8 m); only earth about → earth; nothing →
 * stone. → {near, far}
 */
export function bridgeMaterials(nearB, farB, around = []) {
    const pick = (b) => { const v = BRIDGE_MATERIAL_OF[b]; return v === undefined || v === EARTH ? null : v; };
    const nm = pick(nearB), fm = pick(farB);
    let a = null;
    if (nm == null || fm == null) {
        const n = new Map(); let earth = 0;
        for (const b of around) { const v = BRIDGE_MATERIAL_OF[b]; if (v === undefined) continue; if (v === EARTH) earth++; else n.set(v, (n.get(v) || 0) + 1); }
        let best = 0;
        for (const [v, c] of n) if (c > best) { best = c; a = v; }
        if (a == null) a = earth || BRIDGE_MATERIAL_OF[nearB] === EARTH || BRIDGE_MATERIAL_OF[farB] === EARTH ? BLOCK.DIRT : BLOCK.STONE;
    }
    return { near: nm ?? fm ?? a, far: fm ?? nm ?? a };
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
 * The bridge between A (the hero's feet: the layer aL they stand on) and the target B (bx, bz, bL: the solid
 * block the wand hit): {cells: [[x, L, z, block, t, shape?]…] sorted from A to B, len} — or {why}:
 * 'near' (under 2 m across), 'far' (over 200 m), 'unknown' (the ground on the way is not made yet), 'empty'
 * (no cell can be filled: the way is walled). get(x, L, z) → block; known(x, z) → is this ground made;
 * around: the blocks round the hero (for the material, `bridgeMaterials`).
 * The deck is FIVE wide (the hero is 3.5 m), a straight line in height from the feet to the target (level when the
 * target is level — over a lake too; a rise spread evenly, never steeper than 1:1: where it is steeper the target is
 * reached as far as the slope gets; each step up is a ramp), flush with the ground at both ends. Half-block rails
 * (slabs) on the two edges, none in the first / last 3 blocks, where the outer columns are slabs as well: a flared
 * foot, so one steps on from the side without a jump. Only EMPTY cells (air, water) are laid. On solid level ground
 * (nothing empty at the feet) it is a low walkway of slabs one half-block up.
 */
export function bridgePlan(get, A, B, known = null, around = []) {
    const dx = B.x - A.x, dz = B.z - A.z;
    const len = Math.hypot(dx, dz);
    if (len < BRIDGE.MIN) return { why: 'near' };
    if (len > BRIDGE.MAX + 0.5) return { why: 'far' };
    const rise = B.L - A.L;
    const fx = dx / len, fz = dz / len, sx = -fz, sz = fx; // (along, across)
    const { near, far } = bridgeMaterials(get(A.x, A.L, A.z), get(B.x, B.L, B.z), around);
    // the columns of the deck (five wide), sampled finely so a slanting bridge has no holes
    const cols = new Map(); // "x,z" → {x, z, t, lat}
    for (let s = 0; s <= len + 0.01; s += 0.25) {
        const t = s / len;
        for (let w = -2.25; w <= 2.3; w += 0.5) { // (off the halves: Math.round would lean to one side)
            const x = Math.round(A.x + fx * s + sx * w), z = Math.round(A.z + fz * s + sz * w);
            const k = x + ',' + z;
            if (!cols.has(k)) cols.set(k, { x, z, t, m: s, lat: Math.round(w) });
        }
    }
    // (each column's place along the way is its own centre's, not the first sample that touched it: neighbours then differ by one layer at most)
    for (const c of cols.values()) { c.m = Math.max(0, Math.min(len, (c.x - A.x) * fx + (c.z - A.z) * fz)); c.t = c.m / len; }
    if (known) for (const c of cols.values()) if (!known(c.x, c.z)) return { why: 'unknown' };
    // a straight line from the feet to the target, 1:1 at the steepest
    const deckAt = (t) => { const m = len * t; return A.L + Math.round(Math.max(-m, Math.min(m, rise * t))); };
    const foot = (c) => c.m < 3 || c.m > len - 3; // (the first / last 3 blocks)
    const cells = [];
    const tops = new Map();
    for (const c of cols.values()) tops.set(c.x + ',' + c.z, deckAt(c.t));
    const ramps = stepRamps(tops), rampAt = new Set();
    for (const [x, L, z] of ramps) rampAt.add(x + ',' + L + ',' + z);
    const mat = (c) => (c.t < 0.5 ? near : far);
    for (const c of cols.values()) {
        const L = tops.get(c.x + ',' + c.z);
        if (!free(get(c.x, L, c.z))) continue; // (the ground, a wall, a tree, a house: left as they are)
        cells.push([c.x, L, c.z, mat(c), c.t, Math.abs(c.lat) === 2 && foot(c) ? SHAPE.SLAB : 0]);
        if (Math.abs(c.lat) === 2 && !foot(c) && !rampAt.has(c.x + ',' + (L + 1) + ',' + c.z) && free(get(c.x, L + 1, c.z))) cells.push([c.x, L + 1, c.z, mat(c), c.t, SHAPE.SLAB]); // (a rail)
    }
    // where the deck goes up a block (a slanting bridge): a ramp on the lower step — walked up, not climbed (BlockShapes.js)
    for (const [x, L, z, shape] of ramps) {
        const c = cols.get(x + ',' + z);
        if (c && free(get(x, L, z))) cells.push([x, L, z, mat(c), c.t, shape]);
    }
    let raised = false;
    if (!cells.length) { // solid level ground: a low walkway of slabs, half a block up
        for (const c of cols.values()) {
            const L = deckAt(c.t) + 1;
            if (c.m < 1 || !free(get(c.x, L, c.z))) continue;
            cells.push([c.x, L, c.z, mat(c), c.t, SHAPE.SLAB]);
        }
        raised = cells.length > 0;
    }
    if (!cells.length) return { why: 'empty' };
    cells.sort((a, b) => a[4] - b[4] || a[1] - b[1]);
    return { cells, len, near, far, raised };
}

/** The blocks round the hero within 8 m (every 2nd column, the top solid block near his feet): the bridge's material when the ends are no fit. */
export function aroundBlocks(get, A, r = 8) {
    const out = [];
    for (let dx = -r; dx <= r; dx += 2) for (let dz = -r; dz <= r; dz += 2) {
        if (dx * dx + dz * dz > r * r) continue;
        for (let L = A.L + 2; L >= A.L - 4; L--) { const b = get(A.x + dx, L, A.z + dz); if (b !== BLOCK.AIR && b !== BLOCK.WATER) { out.push(b); break; } }
    }
    return out;
}

/** The mana beyond the usual ten for a long bridge. */
export const bridgeExtra = (len) => Math.max(0, Math.ceil((Math.min(len, BRIDGE.MAX) - BRIDGE.CHEAP) * BRIDGE.EXTRA));

/** The block layer a point (on a face of a block, the ray going `dir`) is in, and its column. */
export function blockAt(hit, dir) {
    return { x: Math.floor(hit.x + dir.x * 0.02 + 0.5), L: Math.floor(hit.y + dir.y * 0.02 + 1.5), z: Math.floor(hit.z + dir.z * 0.02 + 0.5) };
}

/**
 * The first solid thing the ray hits within `max` m, looking no further than the ground that is made
 * (nothing is made in the frame: `known` false → {why: 'unknown'}). → {hit} | {why: 'none' | 'unknown'}
 */
export function rayTarget(data, origin, dir, max = BRIDGE.REACH, known = null) {
    let reach = max;
    if (known) {
        for (let s = BRIDGE.STEP; s <= max + BRIDGE.STEP; s += BRIDGE.STEP) {
            if (!known(origin.x + dir.x * Math.min(s, max), origin.z + dir.z * Math.min(s, max))) { reach = Math.min(max, s - BRIDGE.STEP / 2); break; }
        }
    }
    const hit = data.raycast(origin, dir, reach);
    if (hit && hit.dist > 1) return { hit };
    return { why: reach < max ? 'unknown' : 'none' };
}

/** Why it cannot be built — the hint for the player (only when they try to cast). */
export function bridgeHint(why) {
    if (why === 'near') return '🌉 Покажите палочкой чуть дальше — мосту нужно хотя бы пара шагов';
    if (why === 'far') return '🌉 Слишком далеко — мост строится не дальше 200 метров';
    if (why === 'unknown') return '🌉 Там земля ещё не готова — подождите секунду';
    if (why === 'empty') return '🌉 Дорогу к этому месту перегородили стены — мосту негде лечь. Покажите палочкой на другое место';
    return '🌉 Палочка должна упираться во что-то твёрдое не дальше 200 метров';
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
        const known = data.landMade ? (x, z) => data.landMade(x, z) : null;
        const p = this.game.character.group.position;
        // (the layer the feet stand on, or would: in the air as well as on the ground)
        const A = { x: Math.round(p.x), z: Math.round(p.z), L: Math.floor(p.y - 1.3) };
        if (known && !known(A.x, A.z)) return { why: 'unknown' };
        const r = rayTarget(data, origin, dir, BRIDGE.REACH, known);
        if (!r.hit) return { why: r.why };
        const B = blockAt(r.hit, dir);
        const get = (x, L, z) => data.get(x, L, z);
        const plan = bridgePlan(get, A, B, known, aroundBlocks(get, A));
        return plan.cells ? { A, B, plan } : { why: plan.why };
    }

    /** Voice on my computer. */
    cast(isFinal) {
        const g = this.game;
        const now = performance.now();
        if (now - this._lastAt < 1500) return null;
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        const hand = castingHand(g);
        if (!hand || !g.character.isArmRaised(hand.side)) return hint('🌉 Поднимите руку (палочку), направьте её на твёрдое место — и скажите «Create a Bridge»');
        const at = this.aim(hand.origin, hand.dir);
        if (!at.plan) return hint(bridgeHint(at.why));
        const mid = _v.set((at.A.x + at.B.x) / 2, (at.A.L + at.B.L) / 2 - 1, (at.A.z + at.B.z) / 2);
        if (g.wards?.forbids?.(hand.origin, mid) || g.wards?.forbids?.(hand.origin, _w.set(at.B.x, at.B.L - 1, at.B.z))) return hint('🛡️ Здесь чужая защита дома — мост не построить');
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
        const mine = casterId === g.localId || casterId === 'local';
        // (the others only watch the magic run: the blocks come as edits — no plan, so no far ground is asked for in the frame)
        if (!mine) plan = null;
        else if (!plan) {
            const B = { x: Math.round(o.x + d.x), L: Math.round(o.y + d.y), z: Math.round(o.z + d.z) };
            const get = (x, L, z) => data.get(x, L, z);
            plan = bridgePlan(get, A, B, data.landMade ? (x, z) => data.landMade(x, z) : null, aroundBlocks(get, A));
            if (!plan.cells) return;
        }
        const cells = plan ? plan.cells.map((c) => ({ c, wait: 0 })) : [];
        const color = plan ? sparkColor(plan.near) : 0xfff2a8;
        const len = plan ? plan.len : Math.hypot(d.x, d.z);
        const growT = BRIDGE.GROW + Math.max(0, Math.min(1, (len - BRIDGE.CHEAP) / (BRIDGE.MAX - BRIDGE.CHEAP))) * (BRIDGE.GROW_MAX - BRIDGE.GROW);
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
                    if (e.c[4] > front) { left++; break; } // (sorted from the hero: the rest is further still)
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
