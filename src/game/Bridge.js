/**
 * Bridge.js — «Create a Bridge» (10 mana, no scroll — the author: «доступно без свитка»): a simple bridge
 * over a river or a small ravine, where one would have to jump.
 *
 * Standing at the edge, the raised hand (the wand) points at the other bank (3–16 m away): a bridge of
 * planks grows from under the feet to that point in ~1.5 s — a deck three wide, a dark beam along each
 * side, a railing with posts where it hangs over the gap (on the banks it is open: one walks on and off).
 * The deck runs level from bank to bank, or with a gentle slope when one bank is higher (at most 2 in 5).
 * Over rock (stone, gravel, a castle's stones) it is a bridge of stone instead.
 *
 * What it lays is ordinary blocks of the world (Builder._sendEdits): solid at once — the players and
 * every creature walk on it (Crowd / the terrain), nobody goes through its railing; «Бомбардо», a blast,
 * fire (the planks burn) break it like any wall; saved with the world, everybody gets the blocks.
 * Instant (not held: Concentration — nothing to hold after the words).
 *
 * Who decides: the caster's computer finds the place and lays the blocks; the spell goes to everybody
 * ('spell': o = the caster's feet, d = to the far end) so every computer sees the magic run along it.
 * A block waits while somebody stands in its place (never laid into a body) and is left out after 2 s.
 */

import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';
import { castingHand } from './WandAim.js';
import { occupied } from './Stitching.js';

export const BRIDGE = {
    REACH: 20, // m along the hand: where it points
    MIN: 3, MAX: 16, // m across (the author: «на небольшое расстояние»)
    SLOPE: 0.4, // the far bank at most this much higher / lower per metre (a gentle slope)
    GROW: 1.5, // s from the near bank to the far one
    WAIT: 2, // s a block waits for a body to step aside
    SEND: 0.12, // s: the blocks laid go out together
};

/** ON WHOM AND ON WHAT (CLAUDE.md). The bridge lays planks; it never strikes. */
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
    dragon: { does: 'wait', why: 'в дракона блок не кладётся; его огонь сжигает деревянный мост' },
    phoenix: { does: 'none', why: 'не касается' },
    owl: { does: 'none', why: 'не касается' },
    blocks: { does: 'build', why: 'кладёт доски (над камнем — камень) только в пустоту и воду; землю, стены, чужие блоки не трогает' },
    gap: { does: 'build', why: 'нужен провал между краями (река, ущелье, яма); на ровном месте мост не строится — подсказка говорит почему' },
    water: { does: 'build', why: 'над рекой мост идёт на уровне берега; если берег вровень с водой — настил ложится на воду' },
    trees: { does: 'none', why: 'деревья не трогает: блок там, где ствол или листва, просто не кладётся' },
    houses: { does: 'none', why: 'стены домов и замков не ломает — упирается в них' },
    ships: { does: 'none', why: 'корабль — не блоки мира (его палубы двигаются)' },
    ward: { does: 'none', why: 'в чужой сфере защиты дома не строит (HouseWards.forbids)' },
    godGift: { does: 'none', why: 'мост ничего не разрушает, поэтому дары богов (храм, пьедесталы) он не задевает' },
    fire: { does: 'burned', why: 'деревянный мост горит, как любые доски; каменный — нет' },
    blast: { does: 'broken', why: 'взрывы, «Бомбардо», Total Destruction ломают его, как любые блоки; строители замков его не восстанавливают' },
};

const STONY = new Set([BLOCK.STONE, BLOCK.GRAVEL, BLOCK.DEEPSTONE, BLOCK.COBBLE, BLOCK.CS_GREY, BLOCK.CS_SAND, BLOCK.CS_DARK, BLOCK.CS_WHITE, BLOCK.CS_MOSSY,
    BLOCK.BRICK, BLOCK.REGOLITH, BLOCK.PLANET_ROCK, BLOCK.PLANET_DARK]);
const WOOD = { deck: BLOCK.PLANKS, beam: BLOCK.PLANKS_DARK, rail: BLOCK.FENCE, post: BLOCK.PLANKS_DARK };
const STONE = { deck: BLOCK.COBBLE, beam: BLOCK.CS_GREY, rail: BLOCK.CS_GREY, post: BLOCK.CS_DARK };
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
 * {cells: [[x, L, z, block, t]…] sorted from A to B, len} — or {why} when it cannot be built there.
 * get(x, L, z) → block; top(x, z) → the highest solid layer of a column.
 */
export function bridgePlan(get, top, A, B) {
    const dx = B.x - A.x, dz = B.z - A.z;
    const len = Math.hypot(dx, dz);
    if (len < BRIDGE.MIN) return { why: 'near' };
    if (len > BRIDGE.MAX) return { why: 'far' };
    if (Math.abs(B.L - A.L) > Math.max(1, Math.floor(len * BRIDGE.SLOPE))) return { why: 'steep' };
    const fx = dx / len, fz = dz / len, sx = -fz, sz = fx; // (along, across)
    const deckAt = (t) => Math.round(A.L + (B.L - A.L) * t);
    // the columns of the deck (three wide) and of its edges, sampled finely so a slanting bridge has no holes
    const cols = new Map(); // "x,z" → {x, z, t, edge}
    for (let s = 0; s <= len + 0.01; s += 0.25) {
        const t = s / len;
        for (let w = -1.75; w <= 1.8; w += 0.5) { // (off the halves: Math.round would lean to one side)
            const x = Math.round(A.x + fx * s + sx * w), z = Math.round(A.z + fz * s + sz * w);
            const k = x + ',' + z, edge = Math.abs(w) > 1.5;
            const was = cols.get(k);
            if (!was || (was.edge && !edge)) cols.set(k, { x, z, t, edge });
        }
    }
    // a gap to bridge: somewhere along the middle the ground is 2+ below the deck, or there is water
    let gap = 0, stone = STONY.has(get(A.x, A.L, A.z)) || STONY.has(get(B.x, B.L, B.z));
    for (let s = 1; s < len; s += 0.5) {
        const t = s / len, x = Math.round(A.x + fx * s), z = Math.round(A.z + fz * s), L = deckAt(t);
        if (free(get(x, L, z)) && (top(x, z) <= L - 2 || get(x, L, z) === BLOCK.WATER || get(x, L - 1, z) === BLOCK.WATER)) gap++;
    }
    if (gap < 2) return { why: 'nogap' };
    const M = stone ? STONE : WOOD;
    const cells = [];
    for (const c of cols.values()) {
        const L = deckAt(c.t);
        if (!free(get(c.x, L, c.z))) continue; // (the banks, a wall, a tree: left as they are)
        if (!c.edge) { cells.push([c.x, L, c.z, M.deck, c.t]); continue; }
        // the side: a beam at the deck's level, a railing (a post every 3 m) over it
        cells.push([c.x, L, c.z, M.beam, c.t]);
        if (get(c.x, L + 1, c.z) === BLOCK.AIR) cells.push([c.x, L + 1, c.z, Math.round(c.t * len) % 3 === 0 ? M.post : M.rail, c.t]);
    }
    cells.sort((a, b) => a[4] - b[4] || a[1] - b[1]);
    return { cells, len, stone };
}

/** Why it cannot be built — the hint for the player. */
export function bridgeHint(why) {
    if (why === 'near') return '🌉 Слишком близко — направьте палочку на другой берег (от 3 м)';
    if (why === 'far') return `🌉 Слишком далеко — мост достаёт до ${BRIDGE.MAX} м`;
    if (why === 'steep') return '🌉 Тот край намного выше или ниже — мост был бы слишком крутым';
    if (why === 'nogap') return '🌉 Здесь нечего перекрывать — мост строится через реку, ущелье или яму';
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
        if (!hit) return { why: 'none' };
        const bx = Math.round(hit.x + dir.x * 0.05), bz = Math.round(hit.z + dir.z * 0.05);
        const B = { x: bx, z: bz, L: top(bx, bz) };
        if (get(bx, B.L + 1, bz) === BLOCK.WATER) return { why: 'water' };
        const plan = bridgePlan(get, top, A, B);
        return plan.cells ? { A, B, plan } : { why: plan.why };
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
        const tired = g.combat.check('CreateBridge');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('CreateBridge');
        this._lastAt = now;
        const o = new THREE.Vector3(at.A.x, at.A.L, at.A.z), d = new THREE.Vector3(at.B.x - at.A.x, at.B.L - at.A.L, at.B.z - at.A.z);
        this.grow(o, d, g.localId, at.plan);
        g.sync?.spell('CreateBridge', o, d, hand.side);
        return 'CreateBridge';
    }

    /**
     * (every computer) the bridge grows from the near bank to the far one: plank after plank appears in a
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
        const color = plan.stone ? 0xb8b4aa : 0xd9a066;
        g.sound?.playWhoosh?.();
        let t = 0, i = 0, sendT = 0, done = false;
        const out = [];
        const flush = () => { if (out.length) { g.builder?._sendEdits(out.splice(0)); } };
        g.spells.spells.push({
            life: BRIDGE.GROW + BRIDGE.WAIT + 1,
            onUpdate: (spell, dt) => {
                t += dt;
                const front = Math.min(1, t / BRIDGE.GROW);
                // the front of the magic runs over the gap
                const fp = _v.set(A.x + d.x * front, A.L - 0.4 + d.y * front, A.z + d.z * front);
                for (let k = 0; k < 2; k++) g.fx.spark(fp, k ? 0xfff2a8 : color, 0.1, _w.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.5);
                let left = 0;
                for (let j = i; j < cells.length; j++) {
                    const e = cells[j];
                    if (e.done) continue;
                    if (e.c[4] > front) { left++; continue; }
                    const [x, L, z, block] = e.c;
                    if (occupied(g, { x, L, z })) { e.wait += dt; if (e.wait < BRIDGE.WAIT) { left++; continue; } e.done = true; continue; }
                    e.done = true;
                    if (Math.random() < 0.5) g.fx.spark(_v.set(x, L - 1, z), color, 0.12, _w.set(0, 1.5, 0), 0.4);
                    if (!mine || !free(data.get(x, L, z))) continue;
                    data.set(x, L, z, block);
                    out.push([x, L, z, block]);
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
