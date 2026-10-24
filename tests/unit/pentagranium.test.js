// «Пентаграниум» (Pentagranium.js) with a stub game: the cost, the figure, the scrolls seen, the rite.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Pentagranium } from '../../src/game/Pentagranium.js';
import { PENT, RITE } from '../../src/game/PentagramRules.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { knows } from '../../src/game/SpellBook.js';
import { isDark } from '../../src/game/DarkMagic.js';

const GRASS = 1;
function stub({ mode = 'freeworld', fatigue = 100 } = {}) {
    const said = [], sent = [], spark = [];
    const bodies = new Map();
    const g = {
        config: { mode },
        hud: { setVoice: (t) => said.push(t) },
        combat: { enabled: mode !== 'creative', fatigue, paid: [], check: () => null, pay(n) { this.paid.push(n); this.fatigue -= SPELL_COST[n]; }, drain(a) { if (this.fatigue <= 0) return false; this.fatigue -= a; return true; } },
        terrain: { data: { topLayer: () => 1, get: () => GRASS, raycast(o, d) { const t = (0.5 - o.y) / d.y; return t > 0 ? { x: o.x + d.x * t, y: 0.5, z: o.z + d.z * t } : null; } } },
        fx: { spark: (...a) => spark.push(a), lightFlash() {} },
        character: { group: { position: new THREE.Vector3(0, 0, 0) } },
        sync: { pentagram: (m) => sent.push(m) },
        mana: { success: (n) => g._success.push(n), duelsWon: new Map(), grow: (n) => { g._grown += n; }, powerFlow() {}, _say() {} },
        _success: [], _grown: 0,
        death: { bodies, falling: new Set(), removeBody: (id) => bodies.delete(id) },
        dark: { level: 0, onGrow() {} },
        perf: { note() {} },
    };
    const p = new Pentagranium(g);
    p.fx = { trailBegin() {}, trailEnd() {}, trailAdd() {}, trailSmoke() {}, trailPulse() {}, trailRing() {}, trailLine() {}, trailBreak() {}, anchorsShow() {}, anchorsHover() {}, anchorsHide() {}, add() {}, set() {}, remove() {}, ambient() {}, sampleModels: () => [] };
    return { g, p, said, sent, spark };
}

const AIM0 = () => ({ origin: new THREE.Vector3(0, 4, -6), dir: new THREE.Vector3(0, -1, 1).normalize() });
/** Feed the wand's ground points one a frame: the ray from the fixed wand to each (x, z). */
function run(p, pts, dt = 0.05, until = null) {
    p.aim = AIM0();
    for (const [x, z] of pts) {
        if (until && p.draw?.phase === until) break; // (the circle closed: the rest of the lap is not fed)
        p.aim.dir.set(x - p.aim.origin.x, 0.5 - p.aim.origin.y, z - p.aim.origin.z).normalize();
        p.update(dt);
        if (!p.on) break;
    }
}
let _s = 3;
const rnd = () => ((_s = (_s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
/** A hand going round a circle (centre (0, 8), radius R) a turn and a bit, trembling by `tremble` m. */
const roundHand = (R = 4, tremble = 0.4, turns = 1.12) => Array.from({ length: Math.round(turns * 2 * Math.PI * R / 0.2) + 1 }, (_, i) => { const a = (i / (turns * 2 * Math.PI * R / 0.2)) * turns * 2 * Math.PI; return [Math.cos(a) * R + rnd() * tremble, 8 + Math.sin(a) * R + rnd() * tremble]; });
/** The hand leading between the points `idx` of the line assist, trembling around each. */
const leadTo = (p, idx, tremble = 0.3) => { const w = p.draw.line.world; run(p, idx.flatMap((i) => [0, 1, 2].map(() => [w[i][0] + rnd() * tremble, w[i][1] + rnd() * tremble]))); };
const chordsOf = (p) => p.draw.line.graph.chords.filter((c) => c.ids.includes('devil'));

test('the spell: black magic? no — an ordinary spell; 20 mana at once, 1 a second while drawing, only from its scroll (own key)', () => {
    assert.equal(SPELL_COST.Pentagranium, 20);
    assert.equal(PENT.DRAIN, 1);
    assert.ok(!isDark('Pentagranium'), 'drawing a pentagram is no black magic: there are good pentagrams too');
    assert.ok(!knows('Pentagranium', { mode: 'freeworld', spells: {}, learned: new Set() }));
    assert.ok(knows('Pentagranium', { mode: 'freeworld', spells: { Pentagranium: true }, learned: new Set() }));
    assert.ok(knows('Pentagranium', { mode: 'creative' }));
});

test('nothing learnt: it does not start, nothing is paid, no guiding points', () => {
    const { p, g, said } = stub();
    p.aim = AIM0();
    assert.equal(p.cast(true), null);
    assert.deepEqual(g.combat.paid, []);
    assert.match(said.at(-1), /не знаете/);
});

test('with help: a trembling hand (±0.4 m) makes a perfect circle; then the hand led point to point lays straight lines; the full star counts', () => {
    const { p, g, sent } = stub();
    p.learnFigure('devil');
    p.aim = AIM0();
    assert.equal(p.cast(true), 'Pentagranium');
    assert.deepEqual(g.combat.paid, ['Pentagranium']);
    const before = g.combat.fatigue;
    run(p, roundHand(4, 0.4), 0.05, 'lines');
    assert.equal(p.draw.phase, 'lines', 'the circle closed by itself');
    const c = p.draw.line.circle;
    assert.ok(Math.abs(c.cx) < 0.3 && Math.abs(c.cz - 8) < 0.3 && Math.abs(c.r - 4) < 0.35, `the fit: ${JSON.stringify(c)}`);
    assert.ok(c.r >= 3 && c.r <= 8);
    assert.equal(p.draw.line.world.length, 10, 'five corners and five crossings of the star');
    assert.ok(sent.some((m) => m.k === 'ring'), 'the others see the circle');
    // the star, chord by chord, from corner to corner (over the crossings)
    for (const ch of chordsOf(p)) leadTo(p, [ch.nodes[0], ch.nodes.at(-1)]);
    assert.ok(!p.on, 'the figure is whole: it counts and the drawing ends');
    assert.equal(p.marks.size, 1);
    const m = [...p.marks.values()][0];
    assert.equal(m.pent, 'devil');
    assert.ok(Math.abs(m.x) < 0.4 && Math.abs(m.z - 8) < 0.4 && m.r >= 3 && m.r <= 8);
    assert.deepEqual(g._success, ['Pentagranium']);
    assert.equal(sent.at(-1).k, 'mark');
    assert.ok(sent.filter((x) => x.k === 'seg').length >= 5, 'the lines are shown to the others');
    assert.ok(g.combat.fatigue < before && before - g.combat.fatigue < 30, 'drawing drained mana by the second');
    assert.equal(g.dark.level, 0, 'drawing a pentagram does not darken the hero');
});

test('a connection no learnt figure has is not drawn (a hint), a point with no line to it too; the circle must be drawn first', () => {
    const { p, said } = stub();
    p.learnFigure('devil');
    p.aim = AIM0(); p.cast(true);
    run(p, [[0, 7], [1, 7], [-1, 8]]); // (the hand moves inside the circle before it exists: nothing happens)
    assert.equal(p.draw.phase, 'circle');
    run(p, roundHand(4, 0.2), 0.05, 'lines');
    const L = p.draw.line, ch = chordsOf(p)[0];
    // two corners that are next to each other round the circle are not joined by any line of the star
    const corners = L.graph.nodes.map((n, i) => [i, Math.atan2(n.u[1], n.u[0]), Math.hypot(n.u[0], n.u[1])]).filter((x) => x[2] > 0.95);
    corners.sort((a, b) => a[1] - b[1]);
    leadTo(p, [corners[0][0], corners[1][0]]);
    assert.equal(L.drawn.size, 0, 'nothing drawn');
    assert.match(said.join('|'), /линию не провести/);
    // led to a point of the right chord: drawn
    leadTo(p, [ch.nodes[0], ch.nodes.at(-1)]);
    assert.ok(L.drawn.size >= 3, 'a chord of the star is three lines (over two crossings)');
    // the same again draws nothing new
    const n = L.drawn.size;
    leadTo(p, [ch.nodes.at(-1), ch.nodes[0]]);
    assert.equal(L.drawn.size, n);
});

test('a hand that goes wide (too small / too big a circle) is told, and the circle begins again; the mana ends the drawing', () => {
    const a = stub(); a.p.learnFigure('devil'); a.p.aim = AIM0(); a.p.cast(true);
    run(a.p, roundHand(1.6, 0.1));
    assert.equal(a.p.draw.phase, 'circle'); assert.match(a.said.join('|'), /слишком мал/);
    const t = stub({ fatigue: 20.4 }); t.p.learnFigure('devil'); t.p.aim = AIM0(); t.p.cast(true);
    assert.ok(t.p.on);
    t.p.update(1); t.p.update(1);
    assert.ok(!t.p.on, 'no mana: the drawing is gone');
});

test('another figure learnt: its points are shown together with the others (their union); the one the hero has not learnt has no points', () => {
    const { p } = stub();
    p.learnFigure('devil'); p.learnFigure('teleport');
    p.aim = AIM0(); p.cast(true);
    run(p, roundHand(4, 0.2), 0.05, 'lines');
    const ids = new Set(p.draw.line.graph.nodes.flatMap((n) => n.ids));
    assert.ok(ids.has('devil') && ids.has('teleport') && !ids.has('life'));
    assert.ok(p.draw.line.world.length > 10);
});

test('the seen figures are saved and come back', () => {
    const a = stub().p, b = stub().p;
    a.learnFigure('devil');
    b.restore(a.snapshot());
    assert.deepEqual(b.known(), ['devil']);
    assert.equal(stub().p.snapshot(), null);
});

test('Creative knows every figure', () => {
    const { p } = stub({ mode: 'creative' });
    assert.ok(p.known().length >= 3);
});

function lit(over = {}) {
    const t = stub(over);
    const { p, g } = t;
    p.learnFigure('devil');
    const m = p._place('m1', 'me', 'devil', 0, 0.5, 8, 3.5, 0);
    m.mine = true; m.t = 5; m.fade = 1;
    const body = { id: 'b1', k: 'v', who: 'w1', role: 'adept', wz: 1, mm: 230, x: 0.5, y: 0.5, z: 8.5, age: 0, model: new THREE.Group() };
    g.death.bodies.set('b1', body);
    return { ...t, m, body };
}

test('the rite: a wizard\'s body with his power taken, laid on the lit pentagram — burns, gives once more 25 % of (his maximum − 30), +1 to the black level', () => {
    const { p, g, m, body } = lit();
    g.mana.duelsWon.set('w1', 'kill');
    p._findRites();
    assert.equal(m.rites.length, 1, 'the rite began');
    assert.equal(body.rit, 1);
    for (let i = 0; i < 140; i++) p.update(0.05);
    assert.equal(g._grown, 50, '25 % of (230 − 30)');
    assert.equal(g.dark.level, RITE.DARK);
    assert.ok(!g.death.bodies.has('b1'), 'the body is gone');
    // …and not a second time
    assert.equal(RITE.K, 0.25);
});

test('the rite does not work on: bones, a body whose power is not taken, people, another player, a body that is held, a second time', () => {
    const cases = [
        ['bones', (b) => { b.bones = new THREE.Group(); delete b.model; }, true],
        ['not taken', () => {}, false],
        ['a person', (b) => { delete b.wz; b.mm = 0; }, true],
        ['a player', (b) => { b.k = 'p'; }, true],
        ['held by Levitation', (b) => { b.lev = true; }, true],
        ['done', (b) => { b.rit = 1; }, true],
    ];
    for (const [name, mod, took] of cases) {
        const { p, g, m, body } = lit();
        if (took) g.mana.duelsWon.set('w1', 'kill');
        mod(body);
        p._findRites();
        assert.equal(m.rites.length, 0, name);
    }
});

test('the rite needs the body INSIDE the circle and the pentagram lit; only the pentagram\'s own caster makes it', () => {
    const a = lit(); a.g.mana.duelsWon.set('w1', 'kill'); a.body.x = 9; a.p._findRites();
    assert.equal(a.m.rites.length, 0, 'outside the circle');
    const b = lit(); b.g.mana.duelsWon.set('w1', 'kill'); b.m.t = 0; b.m.fade = 0; b.p._findRites();
    assert.equal(b.m.rites.length, 0, 'not lit yet');
    const c = lit(); c.g.mana.duelsWon.set('w1', 'kill'); c.m.mine = false; c.p._findRites();
    assert.equal(c.m.rites.length, 0, 'another\'s pentagram');
});

test('the rite of another computer is shown from the net message and gives nothing here', () => {
    const { p, g, m, body } = lit();
    m.mine = false;
    p.onNet('other', { k: 'rite', id: 'm1', body: 'b1' });
    assert.equal(m.rites.length, 1);
    for (let i = 0; i < 140; i++) p.update(0.05);
    assert.equal(g._grown, 0);
    assert.equal(g.dark.level, 0);
    assert.ok(!g.death.bodies.has('b1'));
});

test('a pentagram goes out with time, and when the ground under it changes; the oldest goes when there are too many', () => {
    const { p, g } = lit();
    const m = p.marks.get('m1');
    m.life = 0.1; p.update(0.2);
    assert.equal(p.marks.size, 0, 'time');
    const t = lit();
    t.p.update(0.1); assert.equal(t.p.marks.size, 1);
    t.g.terrain.data.topLayer = (x, z) => (Math.hypot(x, z - 8) < 2 ? 3 : 1); // (a crater / a wall at the middle)
    t.p.update(1.1);
    assert.equal(t.p.marks.size, 0, 'ground changed');
    const u = stub();
    for (let i = 0; i < PENT.MAX_ALIVE + 2; i++) u.p._place('k' + i, 'me', 'devil', i * 20, 0.5, 0, 3.5, 0);
    assert.equal(u.p.marks.size, PENT.MAX_ALIVE);
    assert.ok(!u.p.marks.has('k0'));
});

test('a pentagram from another player is shown (mark message)', () => {
    const { p } = stub();
    p.onNet('o', { k: 'mark', id: 'x1', by: 'o', pent: 'devil', x: 10, y: 0.5, z: 10, r: 3.6, rot: 0.3 });
    assert.equal(p.marks.size, 1);
    assert.equal(p.marks.get('x1').mine, false);
    p.onNet('o', { k: 'mark', id: 'x2', by: 'o', pent: 'nope', x: 10, y: 0.5, z: 10, r: 3.6 });
    assert.equal(p.marks.size, 1, 'an unknown figure is ignored');
});
