// «Ground Vortex»: the words, the price, the scroll, the sound, the rules (blocks, funnel, shield, train) and the class on a small flat world.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { START_SPELLS, knows, teachKey } from '../../src/game/SpellBook.js';
import { firstSpellGain } from '../../src/game/Mana.js';
import { SCROLL_WEIGHTS, SPELL_RU, SCROLL_SPELL_COLOR, SCROLL_RIBBON_RU } from '../../src/game/ItemTypes.js';
import { SHOP_SPELLS } from '../../src/game/WizardShop.js';
import { SPELL_SOUND, HELD_SOUND } from '../../src/audio/SpellMusic.js';
import { SPELLS } from '../../src/ui/Codex.js';
import { HELD, mayCast } from '../../src/game/Concentration.js';
import { BLOCK } from '../../src/world/Terrain.js';
import * as R from '../../src/game/GroundVortexRules.js';
import { GroundVortex } from '../../src/game/GroundVortex.js';

const { GV } = R;

test('words: «Ground Vortex» both words together; «Shield» alone; never from talk, never the water\'s vortex or Protection', () => {
    for (const t of ['Ground Vortex', 'ground vortex', 'граунд вортекс', 'граунт вортекс', 'groundvortex']) assert.equal(matchSpell(t), 'GroundVortex', t);
    for (const t of ['Water Vortex', 'вотер вортекс']) assert.equal(matchSpell(t), 'WaterVortex', t);
    for (const t of ['ground', 'граунд', 'вортекс', 'на земле ground floor', 'вихрь']) assert.notEqual(matchSpell(t), 'GroundVortex', t);
    assert.equal(matchSpell('Groundprud'), 'Groundprud');
    for (const t of ['Shield', 'shield', 'шилд']) assert.equal(matchSpell(t), 'GroundShield', t);
    for (const t of ['щит', 'протекшн', 'Protection Maxima']) assert.ok(!/GroundShield/.test(matchSpell(t) || ''), t);
    for (const t of ['мы взяли щит и пошли', 'where is the shield of the knight and the sword']) assert.notEqual(matchSpell(t), 'GroundShield', t);
});

test('price, first-lift cells, scroll, shop, sound, concentration, codex', () => {
    assert.equal(SPELL_COST.GroundVortex, 20);
    assert.equal(firstSpellGain('GroundVortex'), 8);
    assert.ok(!START_SPELLS.has('GroundVortex'));
    assert.equal(knows('GroundVortex', { mode: 'freeworld' }), false);
    assert.equal(knows('GroundVortex', { mode: 'freeworld', spells: { GroundVortex: true } }), true);
    assert.equal(knows('GroundShield', { mode: 'freeworld', spells: { GroundVortex: true } }), true, 'the shield word comes with the scroll');
    assert.equal(teachKey('GroundShield'), 'GroundVortex');
    assert.equal(knows('GroundVortex', { mode: 'creative' }), true);
    assert.ok(SCROLL_WEIGHTS.some(([n, w]) => n === 'GroundVortex' && w > 0));
    assert.ok(SPELL_RU.GroundVortex && SCROLL_SPELL_COLOR.GroundVortex && SCROLL_RIBBON_RU.GroundVortex);
    assert.ok(SHOP_SPELLS.includes('GroundVortex'));
    assert.ok(SPELL_SOUND.GroundVortex.theme === 'thEarth' && HELD_SOUND.GroundVortex.loop === 'loopEarth', 'a tune and a held loop');
    assert.ok(HELD.GroundVortex);
    assert.equal(mayCast('GroundVortex', 'GroundShield'), true);
    assert.equal(mayCast('GroundVortex', 'Attack'), true);
    assert.equal(mayCast('GroundVortex', 'Bombardo'), false);
    assert.equal(mayCast('GroundVortex', 'Protection'), true);
    assert.ok(SPELLS.some((s) => s.name === 'Ground Vortex' && /Shield/.test(s.say)));
});

test('what can be lifted: any block of the world, but not water, bedrock, plants, magic stone', () => {
    for (const n of ['GRASS', 'DIRT', 'STONE', 'SAND', 'SNOW', 'GRAVEL', 'WOOD', 'LEAVES', 'PLANKS', 'BRICK']) if (BLOCK[n] != null) assert.ok(R.liftable(BLOCK[n]), n);
    for (const n of ['AIR', 'WATER', 'BEDROCK', 'WHEAT', 'FLOWERS', 'ENCHANTED', 'ARCANE']) if (BLOCK[n] != null) assert.ok(!R.liftable(BLOCK[n]), n);
    assert.equal(R.lifted(BLOCK.FARMLAND), BLOCK.DIRT);
});

test('the funnel: 160 blocks, stable slots, 7 m tall and ~9 m wide, blocks never inside the hero', () => {
    const seen = new Set();
    let maxY = -9, maxR = 0, minR = 99;
    for (let i = 0; i < GV.MAX_BLOCKS; i++) {
        const o = R.ringOffset(i, 0.3, 1, {});
        assert.deepEqual(R.funnelSlot(i, {}), R.funnelSlot(i, {}), 'a block keeps its slot');
        maxY = Math.max(maxY, o.y); maxR = Math.max(maxR, Math.hypot(o.x, o.z)); minR = Math.min(minR, Math.hypot(o.x, o.z));
        seen.add(Math.round(o.x * 5) + ',' + Math.round(o.y * 5) + ',' + Math.round(o.z * 5));
    }
    assert.ok(minR > 1.6, `inner radius ${minR}`);
    assert.ok(maxR > 4 && maxR < 5.2, `outer radius ${maxR}`);
    assert.ok(maxY > 3.2 && maxY < 5.5, `top ${maxY}`);
    assert.ok(seen.size > 150, 'the blocks do not sit on each other');
    assert.ok(R.turnBlocks(0.2) < R.turnBlocks(3) && R.turnBlocks(3) <= GV.TURN * GV.TURN_FAST + 1e-9);
});

test('digging: the top block of the nearest columns, never under the hero, never a tree\'s base roof, not deeper than 5', () => {
    const cells = new Map();
    const get = (x, L, z) => cells.get(x + ',' + L + ',' + z) ?? (L <= 10 ? BLOCK.DIRT : BLOCK.AIR);
    const top = (x, z) => { for (let L = 30; L >= 0; L--) if (get(x, L, z) !== BLOCK.AIR) return L; return 0; };
    cells.set('3,11,0', BLOCK.WOOD); // a post on the column (3, 0)
    const out = R.digCells(get, top, { x: 0, z: 0, L: 10 }, { x: 0, z: 0 }, 40);
    assert.equal(out.length, 40);
    for (const [x, L, z] of out) { assert.ok(Math.hypot(x, z) >= GV.NEAR_ME); assert.ok(L >= 10 - GV.DIG_DEPTH); }
    assert.ok(out.some(([x, L, z]) => x === 3 && z === 0 && L === 11), 'the post is lifted from its top');
    assert.ok(!out.some(([x, L, z]) => x === 3 && z === 0 && L === 10), 'not the block under the post');
    // a dug hole is dug deeper but never below the depth limit
    for (const [x, L, z] of out) cells.set(x + ',' + L + ',' + z, BLOCK.AIR);
    for (let k = 0; k < 20; k++) for (const [x, L, z] of R.digCells(get, top, { x: 0, z: 0, L: 10 }, { x: 0, z: 0 }, 60)) { assert.ok(L >= 5); cells.set(x + ',' + L + ',' + z, BLOCK.AIR); }
});

test('the shield: 12 blocks needed, a full ring covers all round, a hole lets a blow through, blows break the blocks facing them', () => {
    const alive = new Set(); for (let i = 0; i < 48; i++) alive.add(i);
    const a = (i) => alive.has(i);
    for (let b = -3; b <= 3; b += 0.5) assert.ok(R.shieldCovers(48, a, 0.4, b), `bearing ${b}`);
    // 12 blocks spread round: gaps (the shield is thin) — but at 48 it is whole
    const few = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    let open = 0; for (let b = -3; b <= 3; b += 0.25) if (!R.shieldCovers(12, (i) => few.has(i), 0, b)) open++;
    assert.ok(open > 0, 'twelve blocks leave gaps');
    // a blow from 1.0 rad breaks the facing blocks, and then that side is open
    const hit = R.blocksToBreak(48, a, 0.4, 1.0, 40);
    assert.ok(hit.length >= 2);
    for (const i of hit) alive.delete(i);
    assert.equal(R.shieldCovers(48, a, 0.4, 1.0), false, 'the side that was hit is open now');
    assert.ok(R.shieldCovers(48, a, 0.4, 1.0 + Math.PI), 'the far side holds');
    assert.ok(R.hitBlocks('BombardoMaxima') > R.hitBlocks('Bombardo') && R.hitBlocks('Bombardo') > R.hitBlocks('Sapira'));
    assert.ok(R.sweepsShield('AvadaKedavra') && R.sweepsShield('TotalDestruction') && !R.sweepsShield('Sapira'));
    assert.equal(R.shieldSlot(112, {}), null, 'the rest circle outside');
});

test('the train: blocks follow the wand\'s trail, the older the further back', () => {
    const h = [];
    for (let i = 0; i <= 60; i++) R.trailPush(h, i / 40, i * 0.2, 0, 0);
    const now = 60 / 40;
    const p0 = R.trailAt(h, now, 0, {}), p1 = R.trailAt(h, now, 0.5, {});
    assert.ok(Math.abs(p0.x - 12) < 0.3 && Math.abs(p1.x - 8) < 0.4, `${p0.x} ${p1.x}`);
    assert.ok(R.trailAt(h, now, 99, {}).x < 0.5, 'before the trail: its start');
    assert.ok(160 * GV.TRAIN_STEP <= 3, 'the tail is 3 s at most');
});

test('a thrown block: the same flight on every computer, falls under gravity, spreads a little', () => {
    const d = { x: 0, y: 0, z: 1 };
    const v1 = R.salvoVelocity(d, 5, 3, {}), v2 = R.salvoVelocity(d, 5, 3, {});
    assert.deepEqual(v1, v2);
    assert.ok(Math.abs(Math.hypot(v1.x, v1.y, v1.z) - GV.SPEED) < GV.SPEED * 0.06);
    const p = { x: 0, y: 0, z: 0 }, v = { ...v1 };
    for (let i = 0; i < 60; i++) R.flyStep(p, v, 1 / 60);
    assert.ok(p.z > 20 && p.y < v1.y * 1 + 0.01);
});

// ---------------------------------------------------------------------- the class on a small world
function fakeGame() {
    const cells = new Map();
    const key = (x, L, z) => x + ',' + L + ',' + z;
    const data = {
        get: (x, L, z) => cells.get(key(x, L, z)) ?? (L <= 10 ? BLOCK.DIRT : BLOCK.AIR),
        set: (x, L, z, t) => cells.set(key(x, L, z), t),
        topLayer: (x, z) => { for (let L = 30; L >= 0; L--) if ((cells.get(key(x, L, z)) ?? (L <= 10 ? BLOCK.DIRT : BLOCK.AIR)) !== BLOCK.AIR) return L; return 0; },
        isSolidAt: () => false,
        raycast: () => null,
    };
    const edits = [], said = [];
    const hero = new THREE.Vector3(0, 12, 0);
    const g = {
        scene: null, localId: 'me', authority: true, terrain: { data },
        character: { group: { position: hero, rotation: { y: 0 } } },
        combat: { enabled: true, fatigue: 100, dead: false, center: (o) => o.set(0, 12.6, 0), hitBySpell: () => true, check: () => null, pay() {}, drain() { return true; } },
        builder: { _sendEdits: (l) => edits.push(...l) },
        hud: { setVoice: (t) => said.push(t) },
        duel: { _bodies: () => [] },
        config: { mode: 'creative' },
        collision: { groundY: () => 9.5 },
    };
    return { g, data, edits, said, hero };
}

test('class: a lifted block comes out of the world as an edit; the shield takes the blow into blocks and the hero is untouched; returnAll lays every block back', () => {
    const { g, data, edits, hero } = fakeGame();
    const v = g.groundVortex = new GroundVortex(g);
    // a state by hand: 60 stone blocks in the vortex
    const sw = (function () {
        const o = { by: 'me', mine: true, B: [], n: 0, angle: 0, spin: 1, sangle: 0, k: 0, tk: 0, sk: 1, shield: true, body: hero.clone(), head: hero.clone(), hist: [], spot: null, side: 'right', jerk: [], fire: null, calm: 0, acc: 0, idle: 0, life: 0, lifted: true, spotAt: -9, alarmAt: -9, worked: true, t: 0 };
        return o;
    })();
    for (let i = 0; i < 60; i++) v._newBlock(sw, i, BLOCK.STONE, i, 11, 0, null);
    v.state = sw;
    assert.equal(sw.n, 60);
    assert.ok(v.shielding);
    // a blow from the +x side: covered; the blocks facing it break
    const from = new THREE.Vector3(8, 12, 0);
    assert.ok(v.covers(from));
    assert.equal(v.take(from, 'Bombardo'), true);
    assert.ok(sw.n <= 60 - R.hitBlocks('Bombardo') + 1 && sw.n >= 40, `n ${sw.n}`);
    // the gods' spell sweeps the whole shield and goes on
    assert.equal(v.take(from, 'AvadaKedavra'), false);
    assert.equal(sw.n, 0);
    // returnAll: what is left (in flight / falling, mine) is laid back
    v.state = sw;
    for (let i = 0; i < 30; i++) v._newBlock(sw, i, BLOCK.STONE, i, 11, 0, null);
    const n = v.returnAll();
    assert.equal(n, 30);
    assert.equal(edits.filter((e) => e[3] === BLOCK.STONE).length >= 30, true);
    assert.equal(v.state, null);
    // every laid cell is free ground with something under it
    for (const e of edits) if (e[3] === BLOCK.STONE) assert.notEqual(data.get(e[0], e[1] - 1, e[2]), BLOCK.AIR);
});

test('price: 20 at once + 1 a second (the shared VortexCost); the swarm maths is in ObjectSwarm and the rules re-export it', async () => {
    const { VORTEX_PRICE, vortexDrain, vortexAffordable } = await import('../../src/game/VortexCost.js');
    const S = await import('../../src/game/ObjectSwarm.js');
    assert.equal(VORTEX_PRICE.COST_ONCE, 20); assert.equal(VORTEX_PRICE.PER_SECOND, 1);
    assert.equal(GV.COST, 20); assert.equal(GV.DRAIN, 1); assert.equal(SPELL_COST.GroundVortex, 20);
    assert.equal(vortexDrain(2.5), 2.5); assert.equal(vortexAffordable(19), false); assert.equal(vortexAffordable(20), true);
    for (const f of ['funnelSlot', 'ringOffset', 'shieldCovers', 'blocksToBreak', 'trailAt', 'trailPush', 'salvoVelocity', 'flyStep']) assert.equal(R[f], S[f], f);
    assert.equal(S.SWARM.MAX_THINGS, 160); assert.equal(GV.MAX_BLOCKS, 160);
});

// ---- the shield is a tidy lattice: no two blocks touch (the author: «блоки налезают друг на друга»)
/** Do two unit cubes (turned about the vertical axis by ya, yb) at a, b overlap? Separating-axis test in plan + the height. */
function cubesOverlap(a, ya, b, yb) {
    if (Math.abs(a.y - b.y) >= 1) return false; // (side by side in height: a gap)
    const sq = (x, z, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [[0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]].map(([u, v]) => [x + u * c - v * s, z + u * s + v * c]); };
    const A = sq(a.x, a.z, ya), B = sq(b.x, b.z, yb);
    for (const poly of [A, B]) for (let i = 0; i < 4; i++) {
        const p = poly[i], q = poly[(i + 1) % 4], nx = -(q[1] - p[1]), nz = q[0] - p[0];
        const pr = (P) => { const d = P.map(([x, z]) => x * nx + z * nz); return [Math.min(...d), Math.max(...d)]; };
        const [a0, a1] = pr(A), [b0, b1] = pr(B);
        if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
    }
    return true;
}

test('the shield: every slot has its own place, no two blocks ever touch or overlap, at any turn of the shield', () => {
    const slots = [];
    for (let i = 0; i < GV.SHIELD_CAP; i++) slots.push(R.shieldSlot(i, {}));
    assert.equal(new Set(slots.map((s) => s.shell + ':' + s.ring + ':' + s.col)).size, GV.SHIELD_CAP, 'a slot of its own for each');
    for (const angle of [0, 0.3, 1.7]) {
        const P = slots.map((s, i) => R.shieldOffset(i, angle, {}, s));
        let min = 9;
        for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
            const d = Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y, P[i].z - P[j].z);
            min = Math.min(min, d);
            if (d < 1.45) assert.ok(!cubesOverlap(P[i], slots[i].ph + angle, P[j], slots[j].ph + angle), `blocks ${i} and ${j} overlap (${d.toFixed(2)})`);
        }
        assert.ok(min >= 1.2 - 1e-9, `the nearest centres are ${min.toFixed(3)} m apart (a block is 1 m)`);
    }
    // not hollow: the gap between neighbours is small (≤ 0.5 m of air in a ring) so the wall reads as whole
    const inner = slots.filter((s) => s.shell === 0 && s.ring === 0).sort((a, b) => a.col - b.col);
    assert.equal(inner.length, GV.SHIELD_COLS);
    const chord = 2 * GV.SHIELD_R * Math.sin(Math.PI / GV.SHIELD_COLS);
    assert.ok(chord - 1 < 0.5 && chord >= 1.2, `${chord}`);
});

test('things of a swarm are pushed apart by a grid (cheap), never closer than the minimum', () => {
    const P = [];
    for (let i = 0; i < 160; i++) P.push({ x: (i % 6) * 0.5, y: Math.floor(i / 36) * 0.5, z: (Math.floor(i / 6) % 6) * 0.5 });
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) R.separate(P, 1.05, 4, new Map());
    const ms = (performance.now() - t0) / 20;
    let min = 9;
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) min = Math.min(min, Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y, P[i].z - P[j].z));
    assert.ok(min > 0.8, `a packed cloud of 160 opened to ${min.toFixed(2)}`);
    assert.ok(ms < 8, `${ms.toFixed(2)} ms for 160 things`);
    const Q = [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }];
    assert.equal(R.separate(Q, 1.05, 2), 0, 'far things are left alone');
});

// ---- the hand's intent: no mode flips by accident
const aimAt = (a) => ({ x: Math.sin(a), y: -0.2, z: Math.cos(a) });
function run(intent, seconds, f, dt = 1 / 30) {
    let fired = 0;
    for (let t = 0; t < seconds; t += dt) if (intent.step(t + (run.t0 || 0), dt, ...f(t))) fired++;
    run.t0 = (run.t0 || 0) + seconds;
    return fired;
}
const noJerk = () => null;

test('ring → train: a shiver or a still wand does not switch; a hand that stopped going round and leads the wand one way does; only circling brings it back', () => {
    run.t0 = 0;
    let I = new R.SwarmIntent();
    // a still hand: not enough (no lead)
    run(I, 3, () => [0.02, 0.1, aimAt(0.2)]);
    assert.equal(I.train, false, 'a still wand is not a lead');
    // a shiver: the wand shakes ±0.1 rad, back and forth
    I = new R.SwarmIntent(); run.t0 = 0;
    run(I, 3, (t) => [0.05, 0.3, aimAt(0.2 + 0.1 * Math.sin(t * 25))]);
    assert.equal(I.train, false, 'a shiver does not switch');
    // a hand still going round (rate high) never switches, however the wand moves
    I = new R.SwarmIntent(); run.t0 = 0;
    run(I, 3, (t) => [0.8, 1.5, aimAt(t * 0.8)]);
    assert.equal(I.train, false);
    // a clear lead: the circling stopped for 0.7 s+, the wand is led one way (0.8 rad a second)
    I = new R.SwarmIntent(); run.t0 = 0;
    run(I, 0.5, () => [0.02, 0.1, aimAt(0)]);
    assert.equal(I.train, false, 'not at once');
    run(I, 2, (t) => [0.02, 0.1, aimAt(t * 0.8)]);
    assert.equal(I.train, true, 'led one way: the train');
    // stays a train while the hand is calm (hysteresis), a single circle of a moment does not drop it
    run(I, 1, () => [0.02, 0.1, aimAt(1.5)]);
    assert.equal(I.train, true);
    run(I, 0.2, () => [0.9, 1.5, aimAt(1.5)]);
    assert.equal(I.train, true, 'a moment of circling is not enough to leave');
    run(I, 0.6, () => [0.9, 1.5, aimAt(1.5)]);
    assert.equal(I.train, false, 'a really going-round hand brings it back');
});

test('the throw: a single jerk, a flick that comes back, a slow sweep do nothing; a long fast throw that keeps its way fires once', () => {
    const jl = (pts) => pts.map(([t, x]) => ({ t, x, y: 0, z: 0 }));
    const sharpAlways = () => true, sharpNever = () => false;
    let I = new R.SwarmIntent(); run.t0 = 0;
    // «it looks like a throw» once, but the wand comes back at once: ignored
    assert.equal(I.step(0, 1 / 30, 0.02, 3, aimAt(0), jl([[0, 0], [0.1, 1], [0.2, 2], [0.3, 3]]), sharpAlways, true), false);
    assert.ok(I.pending, 'waiting for the wand to keep its way');
    assert.equal(I.step(0.08, 1 / 30, 0.02, 3, aimAt(1.0), null, sharpAlways, true), false);
    assert.equal(I.pending, null, 'the wand went the other way: cancelled');
    for (let t = 0.1; t < 2; t += 1 / 30) assert.equal(I.step(t, 1 / 30, 0.02, 0.1, aimAt(1.0), jl([[0, 0], [0.1, 0], [0.2, 0], [0.3, 0]]), sharpNever, true), false);
    // a real throw: the wand keeps its way 0.15 s → fires once, then a pause between two
    I = new R.SwarmIntent();
    let fired = 0;
    for (let t = 0; t < 2; t += 1 / 30) if (I.step(t, 1 / 30, 0.02, 3, aimAt(0.3), jl([[0, 0], [0.1, 1], [0.2, 2], [0.3, 3]]), sharpAlways, true)) fired++;
    assert.equal(fired, 2, 'JERK_GAP: not a machine gun (two in two seconds at most)');
    assert.ok(R.INTENT.JERK_GAP >= 0.9);
    // nothing to throw (no blocks / shield): no fire at all
    I = new R.SwarmIntent(); fired = 0;
    for (let t = 0; t < 2; t += 1 / 30) if (I.step(t, 1 / 30, 0.02, 3, aimAt(0.3), jl([[0, 0], [0.1, 1], [0.2, 2], [0.3, 3]]), sharpAlways, false)) fired++;
    assert.equal(fired, 0);
});

test('the real sharp-jerk reader is stricter for the swarm than for the duel, and the duel\'s own numbers are unchanged', async () => {
    const { sharpJerk, JERK } = await import('../../src/game/Jerk.js');
    assert.equal(JERK.DIST, 1.4);
    const mk = (L) => Array.from({ length: 7 }, (_, i) => ({ t: i * 0.049, x: L * i / 6, y: 0, z: 0 }));
    assert.equal(sharpJerk(mk(1.8)), true, 'the duel: 1.8 m in 0.3 s is a jerk');
    assert.equal(sharpJerk(mk(1.8), R.INTENT.JERK), false, 'the swarm: not enough');
    assert.equal(sharpJerk(mk(2.6), R.INTENT.JERK), true, 'the swarm: a long throw');
    assert.ok(R.INTENT.JERK.DIST > JERK.DIST && R.INTENT.JERK.STRAIGHT > JERK.STRAIGHT);
});

test('the train head follows the wand with a lag, no teleport', () => {
    const p = { x: 0, y: 0, z: 0 }, target = { x: 10, y: 0, z: 0 };
    R.lagHead(p, target, 1 / 60);
    assert.ok(p.x > 0 && p.x < 1, `${p.x}`);
    for (let i = 0; i < 120; i++) R.lagHead(p, target, 1 / 60);
    assert.ok(p.x > 9.5);
});
