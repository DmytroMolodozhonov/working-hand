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
    assert.equal(R.shieldSlot(96, {}), null, 'the rest circle outside');
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
