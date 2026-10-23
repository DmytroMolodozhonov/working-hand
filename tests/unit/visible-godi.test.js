// «Visible Godi»: the words, the price and the scroll, how clear the look is (material × thickness), the ray through the
// real blocks (several walls, magic that stops it), the held spell (mana, «стоп», concentration), the first-time cells,
// and the cloud's picture (nothing is made or freed in a frame; the second pass only while the look goes through a wall).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { visibleGodiWords } from '../../src/game/VisibleGodiWords.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { START_SPELLS, knows } from '../../src/game/SpellBook.js';
import { firstSpellGain } from '../../src/game/Mana.js';
import { SCROLL_WEIGHTS, SCROLL_SPELL_COLOR, SCROLL_RIBBON_RU, SPELL_RU } from '../../src/game/ItemTypes.js';
import { SHOP_SPELLS } from '../../src/game/WizardShop.js';
import { HELD, mayCast, Concentration } from '../../src/game/Concentration.js';
import { SPELL_SOUND, HELD_SOUND } from '../../src/audio/SpellMusic.js';
import { VOCAB } from '../../src/audio/SpellSpotter.js';
import { spellPhrase } from '../../src/audio/SpellPhrase.js';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { SEE, SEEN, MU, VISIBLE_TARGETS, SEE_THROUGH, seeThrough, clearOf, bandOf, traceView, nearOf, VisibleGodi, BLOCK_HINT } from '../../src/game/VisibleGodi.js';
import { SeeThroughFx, SEE_FAR } from '../../src/fx/SeeThroughFx.js';

const seg = (code, n) => ({ code, from: 1, to: 1 + n });
const wallOf = (type, n, z0 = 1) => (x, y, z) => (z >= z0 && z < z0 + n ? type : 0);
const O = { x: 0, y: 0, z: 0 }, D = { x: 0, y: 0, z: 1 };

test('«Visible Godi»: both words together; one word, «видимый», «Invisible» and talk never cast it', () => {
    for (const t of ['визибл годи', 'Визибл Годи', 'визибл гоуди', 'визибл гади', 'визибл боди', 'визибл годи.', 'visible godi', 'Visible Godi', 'visible body', 'визиблгоди', 'ну, визибл, годи!']) {
        assert.equal(matchSpell(t), 'VisibleGodi', t);
        assert.ok(visibleGodiWords(t), t);
    }
    for (const t of ['визибл', 'годи', 'видимый', 'он видимый', 'я вижу тело', 'visible', 'godi', 'привет как дела', 'нужен визибл и ещё годи', 'боди', 'видно']) {
        assert.notEqual(matchSpell(t), 'VisibleGodi', t);
    }
    assert.equal(matchSpell('инвизибл'), 'Invisibility');
    assert.equal(matchSpell('инвизибл годи'), 'Invisibility', 'the other spell keeps its word');
    assert.equal(matchSpell('invisible body'), 'Invisibility');
    // every way of saying it that the sound spotter looks for is this spell (and passes the phrase check)
    const ways = VOCAB.filter((w) => w.spell === 'VisibleGodi');
    assert.ok(ways.length >= 4, 'ways of saying it: ' + ways.length);
    for (const w of ways) {
        assert.equal(matchSpell(w.phrase), 'VisibleGodi', w.phrase);
        assert.ok(spellPhrase(w.phrase).ok, w.phrase);
    }
});

test('«Visible Godi»: 20 mana + 1 a second, +5 cells the first time, only from a scroll (and from where scrolls come)', () => {
    assert.equal(SPELL_COST.VisibleGodi, 20);
    assert.equal(SEE.DRAIN, 1);
    assert.equal(firstSpellGain('VisibleGodi'), 5);
    assert.ok(!START_SPELLS.has('VisibleGodi'), 'known only from a scroll');
    assert.equal(knows('VisibleGodi', { mode: 'freeworld' }), false);
    assert.equal(knows('VisibleGodi', { mode: 'freeworld', spells: { VisibleGodi: true } }), true);
    assert.equal(knows('VisibleGodi', { mode: 'creative' }), true, 'Creative knows everything');
    const w = SCROLL_WEIGHTS.find(([n]) => n === 'VisibleGodi');
    assert.ok(w && w[1] === 2.5, 'chests, bird-books, wizards: the scroll falls with weight 2.5');
    assert.ok(SCROLL_SPELL_COLOR.VisibleGodi && SCROLL_RIBBON_RU.VisibleGodi && SPELL_RU.VisibleGodi === 'Visible Godi', 'ribbon, colour in words, name');
    assert.ok(SHOP_SPELLS.includes('VisibleGodi'), 'the towers\' shops sell it');
    // not divine
    assert.ok(!SPELL_SOUND.VisibleGodi.theme, 'a small effect, not a tune');
    assert.ok(SPELL_SOUND.VisibleGodi.cast && HELD_SOUND.VisibleGodi.loop, 'its sound, and a quiet loop while held');
});

test('the clearness of the look: exp(−Σ μ·metres) — 1 block of planks ≈ 88%, 1 of stone ≈ 65%, 3 ≈ 27%, 6 ≈ 8% (shapes), 8+ nothing', () => {
    const wood = (n) => clearOf([seg(BLOCK.PLANKS, n)]), stone = (n) => clearOf([seg(BLOCK.CS_GREY, n)]);
    assert.ok(wood(1) >= 0.85 && wood(1) <= 0.9, 'one block of planks: ' + wood(1));
    assert.ok(stone(1) >= 0.6 && stone(1) <= 0.7, 'one block of stone: ' + stone(1));
    assert.ok(stone(3) >= 0.25 && stone(3) <= 0.35, 'three of stone: ' + stone(3));
    assert.ok(stone(6) < SEE.SHAPES && stone(6) >= SEE.WORKED, 'six of stone: only shapes ' + stone(6));
    assert.ok(stone(8) < SEE.WORKED, 'eight of stone: nothing ' + stone(8));
    // thicker is always worse; simpler is always better
    for (const t of [BLOCK.PLANKS, BLOCK.DIRT, BLOCK.BRICK, BLOCK.STONE, BLOCK.DEEPSTONE]) for (let n = 1; n < 8; n++) assert.ok(clearOf([seg(t, n + 1)]) < clearOf([seg(t, n)]), `${t} ${n}`);
    const order = [BLOCK.FENCE, BLOCK.LEAVES, BLOCK.THATCH, BLOCK.PLANKS, BLOCK.PLASTER, BLOCK.DIRT, BLOCK.BRICK, BLOCK.STONE, BLOCK.DEEPSTONE, BLOCK.BEDROCK];
    for (let i = 0; i + 1 < order.length; i++) assert.ok(clearOf([seg(order[i], 2)]) > clearOf([seg(order[i + 1], 2)]), `${order[i]} clearer than ${order[i + 1]}`);
    // the walls add up (a wall, a different wall)
    const sum = clearOf([seg(BLOCK.PLANKS, 1), { code: BLOCK.STONE, from: 5, to: 6 }]);
    assert.ok(Math.abs(sum - wood(1) * stone(1)) < 1e-9, 'a product: ' + sum);
    assert.equal(clearOf([seg(BLOCK.ARCANE, 1)]), 0, 'magic: none');
    // the bands the log and the hints use
    assert.deepEqual([0.01, 0.06, 0.2, 0.5, 0.9].map(bandOf), ['milk', 'shapes', 'dim', 'good', 'clear']);
    // every solid block of the world has a row (an unknown one is taken for stone, never for glass)
    for (const [name, id] of Object.entries(BLOCK)) {
        if (['AIR', 'WATER'].includes(name)) continue;
        const p = seeThrough(id);
        assert.ok(p.blocked || (p.mu > 0 && Number.isFinite(p.mu)), name);
    }
    assert.ok(SEE_THROUGH[BLOCK.PLANKS].mu === MU.WOOD);
});

test('the ray: nothing / far (more than 3 m) / a wall within reach; a wall, a courtyard, a wall add up; a far wall is another wall', () => {
    assert.equal(traceView(() => 0, O, D).state, 'open');
    const far = traceView(wallOf(BLOCK.STONE, 2, 5), O, D);
    assert.equal(far.state, 'far');
    assert.ok(Math.abs(far.first - 5) < 0.11);
    const edge = traceView(wallOf(BLOCK.STONE, 2, SEE.REACH - 0.05), O, D), edge2 = traceView(wallOf(BLOCK.STONE, 2, SEE.REACH + 0.3), O, D);
    assert.equal(edge.state, 'see');
    assert.equal(edge2.state, 'far', 'REACH is 3 m: «прямо возле стены»');
    const w1 = traceView(wallOf(BLOCK.PLANKS, 1), O, D);
    assert.equal(w1.state, 'see');
    assert.ok(Math.abs(w1.thick - 1) < 0.11 && Math.abs(w1.exit - 2) < 0.11, JSON.stringify(w1));
    // wood, 3 m of air, stone: both count; the near plane stands behind the second
    const two = traceView((x, y, z) => (z >= 1 && z < 2 ? BLOCK.PLANKS : z >= 5 && z < 7 ? BLOCK.STONE : 0), O, D);
    assert.equal(two.state, 'see');
    assert.equal(two.segs.length, 2);
    assert.ok(Math.abs(two.clear - clearOf([seg(BLOCK.PLANKS, 1), seg(BLOCK.STONE, 2)])) < 0.02, String(two.clear));
    assert.ok(two.exit > 6.9, 'the look goes to the far side of the second wall');
    // a wide gap: the second wall is just a wall seen from behind the first
    const apart = traceView((x, y, z) => (z >= 1 && z < 2 ? BLOCK.PLANKS : z >= 9 && z < 10 ? BLOCK.STONE : 0), O, D);
    assert.equal(apart.segs.length, 1);
    assert.ok(apart.exit < 2.1);
    // two kinds of stuff side by side are one thickness
    const mix = traceView((x, y, z) => (z >= 1 && z < 2 ? BLOCK.PLANKS : z >= 2 && z < 3 ? BLOCK.STONE : 0), O, D);
    assert.ok(Math.abs(mix.thick - 2) < 0.11 && Math.abs(mix.exit - 3) < 0.11);
    // a mountain: the wall goes on beyond what is followed — nothing
    const mountain = traceView(wallOf(BLOCK.STONE, 99), O, D);
    assert.equal(mountain.clear, 0);
    assert.ok(mountain.endless);
    // a diagonal look through a block is longer inside it (the thickness along the ray)
    const s2 = Math.SQRT1_2;
    const dia = traceView((x, y, z) => (z >= 1 && z < 2 ? BLOCK.STONE : 0), O, { x: s2, y: 0, z: s2 });
    assert.ok(dia.thick > 1.35 && dia.thick < 1.5, String(dia.thick));
});

test('what stops the look: enchanted and arcane stone, the Queen\'s ice, the gods\' gift, the cursed hull, another\'s sphere — and magic farther on only ends the look before it', () => {
    for (const [type, why] of [[BLOCK.ENCHANTED, 'enchanted'], [BLOCK.ENCHANTED_SEAT, 'enchanted'], [BLOCK.ARCANE_WARD, 'enchanted'], [BLOCK.ARCANE, 'arcane'], [BLOCK.ARCANE_DARK, 'arcane'], [BLOCK.RUNE, 'arcane'],
        [BLOCK.ICE_WALL, 'queen'], [BLOCK.ICE_DARK, 'queen'], [SEEN.GOD, 'gods'], [SEEN.WARD, 'ward'], [SEEN.SHIP_CURSED, 'cursed']]) {
        const r = traceView(wallOf(type, 1), O, D);
        assert.equal(r.state, 'blocked', String(type));
        assert.equal(r.why, why, String(type));
        assert.equal(r.clear, 0);
    }
    // an ordinary ship's boards, a door and natural ice let the look through
    for (const type of [SEEN.SHIP_WOOD, SEEN.DOOR, BLOCK.ICE, BLOCK.PLANET_ICE]) assert.equal(traceView(wallOf(type, 1), O, D).state, 'see', String(type));
    // planks, a gap, an enchanted tower wall: the look ends before the magic (the near plane never enters it)
    const r = traceView((x, y, z) => (z >= 1 && z < 2 ? BLOCK.PLANKS : z >= 4 && z < 5 ? BLOCK.ENCHANTED : 0), O, D);
    assert.equal(r.state, 'see');
    assert.ok(r.stopAt > 3.9 && r.stopAt < 4.1);
    assert.ok(nearOf(r) < r.stopAt && nearOf(r) > r.exit);
    const touching = traceView((x, y, z) => (z >= 1 && z < 2 ? BLOCK.PLANKS : z >= 2 && z < 3 ? BLOCK.ENCHANTED : 0), O, D);
    assert.ok(nearOf(touching) <= touching.stopAt - 0.02 + 1e-9, 'magic right behind the wall: the near plane stays before it');
});

/** A flat world with a wall of `type`, `n` blocks thick, in front of the eyes at (0, top+1, 0), looking along +z. */
function worldWithWall(type, n, { z0 = 2, height = 4, shape = 0 } = {}) {
    const data = new TerrainData();
    data.generate({ seed: 1 });
    const top = data.topLayer(0, 0);
    data.enchantFree = true; // (the world's own edits: the enchanted stone may be laid so)
    for (let x = -4; x <= 4; x++) for (let z = z0; z < z0 + n; z++) for (let L = top + 1; L <= top + height; L++) data.set(x, L, z, type, shape);
    data.enchantFree = false;
    return { data, eye: { x: 0, y: top + 1.0, z: 0 }, top };
}
function fakeGame(data, eye, extra = {}) {
    const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
    cam.position.set(eye.x, eye.y, eye.z);
    cam.lookAt(eye.x, eye.y, eye.z + 10);
    cam.updateMatrixWorld(true);
    const said = [];
    const g = {
        localId: 'me', camera: cam, terrain: { data }, ships: { list: new Map() }, wards: { list: new Map(), mine: () => false }, doors: null,
        combat: { enabled: true, fatigue: 100, dead: false, check() { return null; }, pay(n) { this.fatigue -= SPELL_COST[n]; this.paid = (this.paid || 0) + 1; }, drain(a) { if (this.fatigue <= 0) return false; this.fatigue = Math.max(0, this.fatigue - a); return true; } },
        hud: { setVoice: (t) => said.push(t) }, perf: { note() {} }, mana: { calls: [], success(n) { this.calls.push(n); } },
        character: { isArmRaised: () => true, getHandWorldPosition: (s, v) => v.set(0, 1, 0), getHandDirection: (s, v) => v.set(0, 0, 1) },
        seeFx: { on: null, target: null, setOn(o) { this.on = o; }, setTarget(i) { this.target = i; } },
        ...extra,
    };
    return { g, said };
}

test('the ray through real blocks: wood and stone walls of 1, 3, 6, 9 blocks; slabs count half; ground; water is no wall', () => {
    const clears = {};
    for (const [name, type] of [['wood', BLOCK.PLANKS], ['stone', BLOCK.CS_GREY]]) {
        for (const n of [1, 3, 6, 9]) {
            const { data, eye } = worldWithWall(type, n);
            const { g } = fakeGame(data, eye);
            const v = new VisibleGodi(g);
            const i = v.scan();
            assert.equal(i.state, 'see', `${name} ${n}`);
            assert.ok(Math.abs(i.thick - n) < 0.25, `${name} ${n}: thickness ${i.thick}`);
            clears[name + n] = i.clear;
        }
    }
    assert.ok(clears.wood1 >= 0.85 && clears.wood1 <= 0.9, JSON.stringify(clears));
    assert.ok(clears.stone1 >= 0.6 && clears.stone1 <= 0.7);
    assert.ok(clears.stone3 >= 0.25 && clears.stone3 <= 0.35);
    assert.ok(clears.stone6 < SEE.SHAPES);
    assert.ok(clears.stone9 < SEE.WORKED);
    // a wall farther than 3 m: far
    const far = worldWithWall(BLOCK.PLANKS, 1, { z0: 6 });
    assert.equal(new VisibleGodi(fakeGame(far.data, far.eye).g).scan().state, 'far');
    // slabs (half blocks): the upper half of a cell is air — a look through it meets nothing, a look through the lower half meets the wall
    const slab = worldWithWall(BLOCK.PLANKS, 1, { shape: 1 });
    assert.equal(new VisibleGodi(fakeGame(slab.data, { ...slab.eye, y: slab.top + 1.25 }).g).scan().state, 'open', 'over the slab');
    assert.equal(new VisibleGodi(fakeGame(slab.data, { ...slab.eye, y: slab.top + 0.75 }).g).scan().state, 'see', 'through the slab');
    // enchanted wall: magic
    const ench = worldWithWall(BLOCK.ENCHANTED, 2);
    assert.equal(new VisibleGodi(fakeGame(ench.data, ench.eye).g).scan().why, 'enchanted');
    // the gods' temple (godGiftAt): blocked even for common stone
    const temple = worldWithWall(BLOCK.STONE, 2);
    temple.data.godGiftAt = (x, L, z) => z >= 0;
    assert.equal(new VisibleGodi(fakeGame(temple.data, temple.eye).g).scan().why, 'gods');
    // water is not a wall
    const wet = worldWithWall(BLOCK.WATER, 2);
    assert.equal(new VisibleGodi(fakeGame(wet.data, wet.eye).g).scan().state, 'open');
});

test('things that are not blocks: a ship\'s hull (wood; the black one is cursed), a door, another\'s house sphere (mine are no wall)', () => {
    const { data, eye } = worldWithWall(BLOCK.AIR, 1);
    const ship = (cursed) => ({ cls: { magic: cursed }, owner: cursed ? null : 'x', collider: { hasXZ: () => true, pointBlocked: (x, y, z) => z >= 1 && z < 1.4 } });
    for (const [cursed, state] of [[false, 'see'], [true, 'blocked']]) {
        const { g } = fakeGame(data, eye, { ships: { list: new Map([['s', ship(cursed)]]) } });
        const i = new VisibleGodi(g).scan();
        assert.equal(i.state, state);
        if (!cursed) assert.ok(i.clear > 0.9 && Math.abs(i.thick - 0.4) < 0.15, 'boards 0.4 m thick: ' + i.clear + ' ' + i.thick);
        else assert.equal(i.why, 'cursed');
    }
    // a door: a leaf 0.2 m thick, found by Doors.segmentHit
    const door = fakeGame(data, eye, { doors: { segmentHit: () => ({ s: 0.5 }) } });
    const di = new VisibleGodi(door.g).scan();
    assert.equal(di.state, 'see');
    assert.ok(di.thick > 0.15 && di.thick < 0.3 && di.clear > 0.95, JSON.stringify([di.thick, di.clear]));
    // a house sphere in the way: another's blocks the look, mine does not
    const sphere = { c: { x: 0, y: eye.y, z: 3 }, r: 2 };
    const other = fakeGame(data, eye, { wards: { list: new Map([['w', sphere]]), mine: () => false } });
    const oi = new VisibleGodi(other.g).scan();
    assert.equal(oi.why, 'ward');
    const own = fakeGame(data, eye, { wards: { list: new Map([['w', sphere]]), mine: () => true } });
    assert.equal(new VisibleGodi(own.g).scan().state, 'open');
});

test('held: 20 mana at once, 1 a second after; «стоп», no mana, death and a broken concentration end it; nothing is sent to others', () => {
    const { data, eye } = worldWithWall(BLOCK.PLANKS, 1);
    const { g, said } = fakeGame(data, eye);
    const v = g.visibleGodi = new VisibleGodi(g);
    assert.equal(v.cast(true), 'VisibleGodi');
    assert.equal(g.combat.fatigue, 80, '20 at once');
    assert.ok(v.on && g.seeFx.on === true);
    assert.match(said.at(-1), /стене/, 'the hint: go to a wall and look at it');
    assert.equal(v.cast(true), null, 'again: it is on already');
    for (let i = 0; i < 20; i++) v.update(0.05); // 1 s
    assert.ok(Math.abs(g.combat.fatigue - 79) < 0.01, 'one a second: ' + g.combat.fatigue);
    assert.equal(g.seeFx.target.state, 'see', 'the ray goes ten times a second and the picture is told');
    assert.ok(v.rays >= 9 && v.rays <= 11, 'rays: ' + v.rays);
    // «стоп»
    assert.equal(v.stop('stop'), true);
    assert.ok(!v.on && g.seeFx.on === false);
    assert.equal(v.stop('stop'), false);
    // out of mana
    g.combat.fatigue = 21;
    v.cast(true);
    assert.equal(g.combat.fatigue, 1);
    for (let i = 0; i < 40 && v.on; i++) v.update(0.05);
    assert.ok(!v.on, 'no mana: the cloud melts');
    assert.match(said.at(-1), /Мана кончилась/);
    // death
    g.combat.fatigue = 100;
    v.cast(true);
    g.combat.dead = true;
    v.update(0.05);
    assert.ok(!v.on);
    // not enough mana to cast
    g.combat.dead = false;
    g.combat.check = () => 'мало маны';
    assert.equal(v.cast(true), null);
    assert.ok(!v.on);
    // the wand (the hand) must be up
    g.combat.check = () => null;
    g.character.isArmRaised = () => false;
    assert.equal(v.cast(true), null);
});

test('concentration: while the cloud is open no other spell works (except «стоп», Люмос, Нокс, Protection); a stun or a fall closes it', () => {
    assert.ok(HELD.VisibleGodi, 'a held spell');
    assert.equal(mayCast('VisibleGodi', 'Bombardo'), false);
    assert.equal(mayCast('VisibleGodi', 'Invisibility'), false);
    assert.equal(mayCast('VisibleGodi', 'VisibleGodi'), false, 'saying it again is not a new spell (the cast says «already on»)');
    for (const free of ['Stand', 'Lumos', 'Nox', 'Protection']) assert.equal(mayCast('VisibleGodi', free), true, free);
    const { data, eye } = worldWithWall(BLOCK.PLANKS, 1);
    const { g } = fakeGame(data, eye);
    const v = g.visibleGodi = new VisibleGodi(g);
    const c = new Concentration(g);
    assert.equal(c.held(), null);
    v.cast(true);
    assert.equal(c.held(), 'VisibleGodi');
    assert.equal(c.gate('Bombardo', false), 'VisibleGodi', 'the gate says «сначала стоп»');
    assert.equal(c.gate('Stand', false), null);
    assert.equal(c.lose('stun'), true, 'a stun breaks the concentration');
    assert.ok(!v.on);
    assert.equal(c.held(), null);
});

test('the first time (and only when it really showed something): +5 cells once; a far wall, magic or milk do not count', () => {
    const run = (type, n, z0 = 2) => {
        const { data, eye } = worldWithWall(type, n, { z0 });
        const { g } = fakeGame(data, eye);
        const v = g.visibleGodi = new VisibleGodi(g);
        v.cast(true);
        for (let i = 0; i < 30; i++) v.update(0.05);
        return g.mana.calls;
    };
    assert.deepEqual(run(BLOCK.PLANKS, 1), ['VisibleGodi']);
    assert.deepEqual(run(BLOCK.STONE, 3), ['VisibleGodi']);
    assert.deepEqual(run(BLOCK.PLANKS, 1, 8), [], 'too far from the wall');
    assert.deepEqual(run(BLOCK.ENCHANTED, 1), [], 'magic stops the look');
    assert.deepEqual(run(BLOCK.STONE, 9), [], 'nine blocks of stone: nothing seen');
    // looking again later does not ask again by itself (the mana module keeps the once-per-life list)
    const { data, eye } = worldWithWall(BLOCK.PLANKS, 1);
    const { g } = fakeGame(data, eye);
    const v = g.visibleGodi = new VisibleGodi(g);
    v.cast(true);
    for (let i = 0; i < 80; i++) v.update(0.05);
    assert.equal(g.mana.calls.length, 1, 'once per switching on');
});

test('«Visible Godi» decides every creature and thing (VISIBLE_TARGETS — «не действует» is written too, with why)', () => {
    for (const k of ['me', 'players', 'servants', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'dragon', 'phoenix', 'owl', 'iceCastle', 'blackship', 'bosses',
        'blocks', 'doors', 'ships', 'water', 'ward', 'godGift', 'enchanted', 'space', 'spells', 'concentration']) {
        assert.ok(VISIBLE_TARGETS[k]?.why && ['see', 'none', 'blocked'].includes(VISIBLE_TARGETS[k].does), `forgets: ${k}`);
    }
    assert.equal(VISIBLE_TARGETS.players.does, 'none', 'nobody else sees the cloud or learns of it');
    assert.match(BLOCK_HINT, /Магия этой стены не пускает ваш взгляд/);
});

// ------------------------------------------------------------------ the picture
/** A renderer that only counts (no graphics card in the tests). */
function fakeRenderer() {
    const r = {
        calls: [], target: null, autoClear: true, shadowMap: { autoUpdate: true, needsUpdate: true, seen: [] },
        getDrawingBufferSize(v) { return v.set(1280, 720); }, getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; },
        render(scene, cam) { this.calls.push({ scene, cam, target: this.target, shadow: [this.shadowMap.autoUpdate, this.shadowMap.needsUpdate] }); }, compile() { this.compiled = (this.compiled || 0) + 1; },
    };
    return r;
}

test('the cloud: nothing is drawn while off; the small picture is made when switched on and freed after; the second pass only while the look goes through a wall', () => {
    const renderer = fakeRenderer();
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
    camera.updateMatrixWorld(true);
    const fx = new SeeThroughFx({ renderer, scene, camera, quality: { current: { pixelRatio: 1 } } });
    fx.prewarm();
    assert.equal(renderer.compiled, 1, 'the shader is compiled on the loading screen');
    for (let i = 0; i < 30; i++) fx.render(i / 60);
    assert.equal(renderer.calls.length, 0, 'off: not a single draw call');
    assert.equal(fx.stats.rtMade, 0);
    // on, nothing in front yet: the haze only (the cloud, no second pass, no small picture)
    fx.setOn(true);
    fx.setTarget({ state: 'open' });
    for (let i = 0; i < 30; i++) fx.render(1 + i / 60);
    assert.equal(fx.stats.passes, 0);
    assert.equal(fx.stats.rtMade, 0, 'the small picture is not made before it is needed');
    assert.equal(renderer.calls.filter((c) => c.target === null && c.scene !== scene).length, 30, 'one cloud draw per frame');
    // a wall of planks: the second pass, ~24 a second, into one small picture of a quarter of the screen
    const info = { state: 'see', clear: 0.88, first: 1, exit: 2, stopAt: Infinity, thick: 1, segs: [] };
    fx.setTarget(info);
    for (let i = 0; i < 120; i++) fx.render(2 + i / 60); // 2 s
    assert.equal(fx.stats.rtMade, 1, 'one small picture');
    assert.ok(fx.stats.passes >= 44 && fx.stats.passes <= 52, 'about 24 a second: ' + fx.stats.passes);
    assert.equal(fx.rt.width, 640);
    assert.equal(fx.rt.height, 360);
    const behind = renderer.calls.filter((c) => c.scene === scene);
    assert.ok(behind.every((c) => c.target === fx.rt && c.cam !== camera), 'into the small picture, from a camera of its own');
    assert.ok(behind.every((c) => Math.abs(c.cam.near - nearOf(info)) < 1e-6), 'the near plane stands behind the wall: ' + behind[0].cam.near);
    assert.ok(behind.every((c) => c.shadow[0] === false && c.shadow[1] === false), 'no shadow pass of its own');
    assert.ok(behind.every((c) => c.cam.far <= c.cam.near + SEE_FAR + 1e-6), 'what is far behind the wall is not drawn');
    assert.equal(renderer.shadowMap.autoUpdate, true, 'the main picture\'s shadow settings are given back');
    assert.equal(renderer.target, null);
    // too thick (clear < 0.05) or magic: milk only, no second pass
    const before = fx.stats.passes;
    fx.setTarget({ state: 'see', clear: 0.02, exit: 8, stopAt: Infinity });
    for (let i = 0; i < 60; i++) fx.render(4 + i / 60);
    assert.ok(fx.stats.passes - before <= 12, 'milk: the pictures stop once the look fades (' + (fx.stats.passes - before) + ' while it faded)');
    const settled = fx.stats.passes;
    for (let i = 0; i < 60; i++) fx.render(4.9 + i / 60);
    assert.equal(fx.stats.passes, settled, 'and none after');
    fx.setTarget({ state: 'blocked' });
    const p2 = fx.stats.passes;
    for (let i = 0; i < 60; i++) fx.render(5 + i / 60);
    assert.equal(fx.stats.passes, p2, 'magic: no second pass');
    // off: the cloud closes, the picture is freed once; later frames cost nothing
    fx.setOn(false);
    for (let i = 0; i < 60; i++) fx.render(6 + i / 60);
    assert.equal(fx.rt, null);
    assert.equal(fx.stats.rtFreed, 1);
    const n = renderer.calls.length;
    for (let i = 0; i < 30; i++) fx.render(8 + i / 60);
    assert.equal(renderer.calls.length, n, 'closed: nothing is drawn');
    // nothing is made again and again: one material, made at the start
    assert.equal(fx.stats.materials, 1);
    // on again: one more picture (made, then freed — never one per frame)
    fx.setOn(true);
    fx.setTarget(info);
    for (let i = 0; i < 60; i++) fx.render(9 + i / 60);
    assert.equal(fx.stats.rtMade, 2);
    fx.dispose();
});

test('the cloud on a weak computer: a smaller picture, fewer taps, a slower rate', () => {
    const renderer = fakeRenderer();
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
    const fx = new SeeThroughFx({ renderer, scene, camera, quality: { current: { pixelRatio: 0.6 } } });
    fx.setOn(true);
    fx.setTarget({ state: 'see', clear: 0.5, exit: 2, stopAt: Infinity });
    for (let i = 0; i < 120; i++) fx.render(i / 60);
    assert.ok(fx.rt.width < 500, 'about a ninth of the screen: ' + fx.rt.width);
    assert.equal(fx.mat.uniforms.uTaps.value, 7);
    assert.ok(fx.stats.passes >= 28 && fx.stats.passes <= 32, 'about 15 a second: ' + fx.stats.passes);
    fx.dispose();
});
