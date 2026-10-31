// «Пентаграмма ада» (Pentagranium Infernum — HellRules.js, HellGate.js): 150 маны и +10 тьмы при слове; жертва — тело ЛЮБОГО убитого существа (не кости);
// врата открыты на время; возврат — только с головой горгульи на метке; Творческий — без условий; вода и холод в аду не действуют.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Pentagranium } from '../../src/game/Pentagranium.js';
import { PENT_NAMES, pentagramWords, pentagramSpell } from '../../src/game/PentagramWords.js';
import { figureOf, CAST_COST } from '../../src/game/PentagramRules.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import { OFFERINGS, assess } from '../../src/game/PentagramOfferings.js';
import { INFERNUM, anyBody, hellSpellBlock, HELL_TARGETS, HEAD, headDrops } from '../../src/game/HellRules.js';
import { HellGate } from '../../src/game/HellGate.js';
import { HELL, hellPlan } from '../../src/world/HellMap.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { ITEM_INFO, itemValue, strongPentagrams } from '../../src/game/ItemTypes.js';

function stub({ mode = 'freeworld', fatigue = 500 } = {}) {
    const said = [], sent = [];
    const g = {
        config: { mode }, hud: { setVoice: (t) => said.push(t) },
        combat: { enabled: true, fatigue, _hudKey: '' },
        terrain: { data: { topLayer: () => 1, get: () => 1, raycast(o, d) { const t = (0.5 - o.y) / d.y; return t > 0 ? { x: o.x + d.x * t, y: 0.5, z: o.z + d.z * t } : null; } } },
        fx: { spark() {}, lightFlash() {} }, character: { group: { position: new THREE.Vector3(0, 2, 0) }, onGround: true }, sync: { pentagram: (m) => sent.push(m) },
        mana: { success() {} }, dark: { level: 0, skin: 0, onGrow() {} }, castleLife: { alarm() {} }, perf: { note() {} }, death: { bodies: new Map(), falling: new Set() },
    };
    const p = new Pentagranium(g);
    p.fx = { trailBegin() {}, trailEnd() {}, trailAdd() {}, trailPulse() {}, trailLine() {}, trailBreak() {}, add() {}, set() {}, remove() {}, ambient() {}, sampleModels: () => [] };
    g.pentagranium = p;
    g.hellGate = new HellGate(g);
    return { g, p, said, sent };
}
const aim = () => ({ origin: new THREE.Vector3(0, 4, -6), dir: new THREE.Vector3(0, -1, 1).normalize() });

test('the name, the figure, the price: «Pentagranium Infernum», a black pentagram of its own drawing, 150 mana, +10 darkness', () => {
    assert.equal(PENT_NAMES.infernum.en, 'Infernum');
    assert.equal(pentagramSpell('infernum'), 'Pentagranium Infernum');
    for (const s of ['пентаграниум инфернум', 'Pentagranium Infernum', 'пентаграниум инфэрнум']) assert.equal(pentagramWords(s), 'infernum', s);
    assert.equal(matchSpell('пентаграниум инфернум'), 'Pentagranium', 'the pentagram, never «Инферно»');
    assert.equal(pentagramWords('инфернум'), null, 'the name alone is no spell');
    const def = PENTAGRAMS.infernum;
    assert.ok(def.dark && figureOf('infernum')); assert.equal(def.darkBonus, 10); assert.equal(CAST_COST.infernum, 150); assert.equal(INFERNUM.COST, 150);
    assert.ok(strongPentagrams().dark.includes('infernum'), 'one of the strongest black ones (the Castle of Ghosts\' chests)');
});

test('the word (outside Creative): 150 mana and +10 to the darkness at once; the picture waits for a body; not enough mana — nothing is drawn', () => {
    const t = stub();
    t.p.learnFigure('infernum');
    assert.equal(t.p.cast(true, 'пентаграниум инфернум', aim()), 'Pentagranium');
    assert.equal(t.g.combat.fatigue, 350);
    assert.equal(t.g.dark.level, 10);
    const m = [...t.p.marks.values()][0];
    assert.equal(m.pent, 'infernum'); assert.equal(m.offer, 'infernum'); assert.ok(m.dark);
    assert.match(t.said.at(-1), /тело любого убитого существа/);
    const poor = stub({ fatigue: 100 });
    poor.p.learnFigure('infernum');
    assert.equal(poor.p.cast(true, 'пентаграниум инфернум', aim()), null);
    assert.equal(poor.p.marks.size, 0); assert.equal(poor.g.dark.level, 0, 'no darkness without the pentagram');
    const dark = stub(); dark.g.dark.level = 95; dark.p.learnFigure('infernum'); dark.p.cast(true, 'пентаграниум инфернум', aim());
    assert.equal(dark.g.dark.level, 100, 'the darkness tops at 100');
    const unknown = stub();
    assert.equal(unknown.p.cast(true, 'пентаграниум инфернум', aim()), null, 'not learnt — nothing');
});

test('the offering: ONE body of ANY killed creature (a villager, a player, a zombie, an animal\'s carcass) — never bones, never a hero\'s power', () => {
    const b = (o) => ({ id: 'b' + Math.random(), k: 'v', x: 0, y: 0, z: 0, ...o });
    assert.equal(OFFERINGS.infernum.bodies, 1); assert.ok(OFFERINGS.infernum.any); assert.equal(OFFERINGS.infernum.mana, 0, 'the mana was paid at the word');
    for (const k of ['v', 'p', 'z', 'a', 'x']) assert.ok(assess('infernum', { bodies: [b({ k })] }).ok, 'any creature: ' + k);
    assert.equal(assess('infernum', { bodies: [b({ bones: {} })] }).ok, false);
    assert.equal(assess('infernum', { bodies: [b({ lg: 1 })] }).ok, false);
    assert.match(assess('infernum', { bodies: [] }).text, /любого убитого существа/);
    assert.equal(anyBody(null).ok, false);
    // the way back: a gargoyle's head on the mark, nothing else will do
    assert.equal(assess('hellBack', { things: [] }).ok, false); assert.match(assess('hellBack', { things: [] }).text, /голова горгульи/);
    assert.equal(assess('hellBack', { things: [{ uid: 'x', item: { kind: 'minotaurHorn' } }] }).ok, false);
    assert.equal(assess('hellBack', { things: [{ uid: 'h', item: { kind: HEAD.KIND } }] }).ok, true);
});

test('Creative: no body, no head — the circle is open as soon as it is drawn (and the darkness still comes)', () => {
    const t = stub({ mode: 'creative' });
    assert.equal(t.p.cast(true, 'пентаграниум инфернум', aim()), 'Pentagranium');
    const m = [...t.p.marks.values()][0];
    assert.equal(m.offer, null);
    m.fade = 1; m.anim = null;
    t.g.hellGate.update(0.1);
    assert.equal(m.gateOpen, Infinity);
});

test('the gates: open for OPEN_S s (every computer by the message), then closed; a step in and a stand of STEP_S s — the passage (each hero his own)', () => {
    const t = stub();
    t.p.learnFigure('infernum');
    t.p.cast(true, 'пентаграниум инфернум', aim());
    const m = [...t.p.marks.values()][0];
    m.fade = 1;
    t.g.hellGate.opened(m, true);
    assert.equal(m.gateOpen, INFERNUM.OPEN_S); assert.deepEqual(t.sent.at(-1), { k: 'hell', op: 'open', id: m.id });
    // another computer: its mark opens by the message
    const o = stub(); o.p.onNet('x', { k: 'mark', id: m.id, by: 'x', pent: 'infernum', x: m.x, y: m.y, z: m.z, r: m.r, rot: 0 });
    o.p.onNet('x', { k: 'hell', op: 'open', id: m.id });
    assert.equal(o.p.marks.get(m.id).gateOpen, INFERNUM.OPEN_S);
    // blockers: the Imperius, a duel, a horse
    t.g.terrain.data.hell = true; t.g.terrain.data.hellPlan = hellPlan(1);
    t.g.heroApply = { pending: null, _hover() {} };
    t.g.character.group.position.set(m.x, m.y + 2, m.z);
    t.g.imperius = { active: true };
    for (let i = 0; i < 30; i++) t.g.hellGate.update(0.1);
    assert.equal(t.g.hellGate.trans, null, 'no passage in another body'); assert.ok(t.said.some((s) => /чужом теле/.test(s)));
    t.g.imperius = null;
    for (let i = 0; i < 20; i++) t.g.hellGate.update(0.1);
    assert.ok(t.g.hellGate.trans, 'the passage begins'); assert.equal(t.g.hellGate.trans.dir, 'down');
    assert.deepEqual([t.g.hellGate.from.x, t.g.hellGate.from.z], [Math.round(m.x * 10) / 10, Math.round(m.z * 10) / 10], 'where I went in');
    for (let i = 0; i < 10; i++) t.g.hellGate.update(0.1);
    assert.equal(t.g.heroApply.pending?.id, 'hell', 'the hero is set down by the land of hell (HeroApply waits for the workers)');
    assert.equal(t.g.heroApply.pending.t.layer, HELL.SPAWN_Y);
    // the closing
    const m2 = stub(); m2.p.learnFigure('infernum'); m2.p.cast(true, 'пентаграниум инфернум', aim());
    const k2 = [...m2.p.marks.values()][0]; k2.fade = 1; m2.g.hellGate.opened(k2);
    for (let i = 0; i < INFERNUM.OPEN_S * 10 + 5; i++) m2.g.hellGate.update(0.1);
    assert.equal(k2.gateOpen, 0, 'closed after its time');
});

test('save and death: the way back is kept; a dead hero is never reborn in hell', () => {
    const t = stub();
    t.g.hellGate.from = { x: 10, y: 3, z: -4 }; t.g.hellGate.been = true;
    const s = JSON.parse(JSON.stringify(t.g.hellGate.snapshot()));
    const u = stub(); u.g.hellGate.restore(s);
    assert.deepEqual(u.g.hellGate.from, { x: 10, y: 3, z: -4 }); assert.ok(u.g.hellGate.been);
    u.g.hellGate.restore(null); assert.ok(u.g.hellGate.from, 'an old save without it changes nothing');
    u.g.terrain.data.hell = true; u.g.collision = { groundY: () => 5 };
    const p = new THREE.Vector3(HELL.CX, 30, HELL.CZ);
    u.g.hellGate.onRespawn(p);
    assert.ok(Math.hypot(p.x, p.z) < 20, 'reborn by the start of the world');
});

test('the spells in hell: water and cold do not work (with the reason); fire, Levitation, Lumos, flight do', () => {
    for (const n of ['Waterball', 'WaterVortex', 'LetItRain', 'Frozen', 'Ice', 'IceMaxima', 'Snowman', 'IceCastle', 'IceBridge', 'Firefighting']) assert.ok(hellSpellBlock(n), n);
    for (const n of ['Inferno', 'Fire', 'Levitation', 'Bombardo', 'Lumos', 'Flying', 'GiveMyPower', 'Stop']) assert.equal(hellSpellBlock(n), null, n);
    assert.match(hellSpellBlock('Frozen'), /тают/); assert.match(hellSpellBlock('Waterball'), /испаряется/);
    for (const k of ['me', 'players', 'bodies', 'items', 'gargoyles', 'mounts', 'imperius', 'duel', 'creative', 'death', 'save', 'lava']) assert.ok(HELL_TARGETS[k]?.why, k);
});

test('the gargoyle\'s head: 25 % from a killed one (never from one burnt in the sun\'s beam); an item of the game, dear', () => {
    assert.equal(HEAD.CHANCE, 0.25);
    let n = 0; for (let i = 0; i < 4000; i++) if (headDrops('kill', (i + 0.5) / 4000)) n++;
    assert.equal(n, 1000);
    assert.equal(headDrops('sun', 0), false); assert.equal(headDrops('ritual', 0), false);
    assert.ok(ITEM_INFO.gargoyleHead && ITEM_INFO.gargoyleHead.weight >= 3);
    assert.ok(itemValue({ kind: 'gargoyleHead' }) >= 500);
});

test('the map in hell: only hell\'s marks — the devil (≤ 1 km), the mark back, the Tarons\' camps; never a castle of the Earth', () => {
    const t = stub();
    t.g.terrain.data.hell = true; t.g.terrain.data.hellPlan = hellPlan(5);
    const P = hellPlan(5);
    t.g.character.group.position.set(P.spawn.x, 30, P.spawn.z);
    const marks = t.g.hellGate.mapMarks();
    const devil = marks.find((m) => m.icon === '😈');
    assert.ok(devil && devil.always, 'the devil always on the map');
    assert.ok(Math.hypot(devil.x - P.spawn.x, devil.z - P.spawn.z) <= HELL.DEVIL_DIST_MAX);
    assert.ok(marks.some((m) => m.icon === '⛧'));
    assert.ok(marks.every((m) => ['😈', '⛧', '🪓'].includes(m.icon)), 'nothing of the Earth');
});
