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
/** The hand led along the guiding ring (centre (cx, cz) = where the wand pointed at the cast), trembling by `tremble` m, a point at a frame. */
const ringHand = (p, tremble = 0.4) => { const R = p.draw.ring; return [...R.world, R.world[0], R.world[1]].map((w) => [w[0] + rnd() * tremble, w[1] + rnd() * tremble]); };
/** The hand leading to the points `idx` of the line assist: away for a moment, then staying on each. */
const leadTo = (p, idx, tremble = 0.2) => { const w = p.draw.line.world; run(p, [[0.05, 0.05], [0.05, 0.05], [0.05, 0.05], [0.05, 0.05], [0.05, 0.05], [0.05, 0.05], [0.05, 0.05]]); run(p, idx.flatMap((i) => Array.from({ length: 9 }, () => [w[i][0] + rnd() * tremble, w[i][1] + rnd() * tremble]))); };
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

test('with help: the ring is shown at once, led along it (trembling ±0.4 m) the circle lies perfectly round and always the same size; then the hand led point to point lays straight lines; the full star counts', () => {
    const { p, g, sent } = stub();
    p.learnFigure('devil');
    p.aim = AIM0();
    assert.equal(p.cast(true), 'Pentagranium');
    assert.deepEqual(g.combat.paid, ['Pentagranium']);
    assert.equal(p.draw.phase, 'ring', 'the guide is there from the first moment');
    assert.equal(p.draw.ring.world.length, 16);
    assert.ok(Math.abs(p.draw.ring.r - 3.5) < 1e-9, 'one size');
    const before = g.combat.fatigue;
    run(p, ringHand(p, 0.4), 0.05, 'lines');
    assert.equal(p.draw.phase, 'lines', 'the ring is whole');
    assert.equal(p.draw.line.circle.r, 3.5);
    assert.equal(p.draw.line.world.length, 10, 'five corners and five crossings of the star');
    assert.ok(sent.some((m) => m.k === 'ring'), 'the others see the circle');
    // the star, chord by chord, from corner to corner (over the crossings), staying on each point
    for (const ch of chordsOf(p)) leadTo(p, [ch.nodes[0], ch.nodes.at(-1)]);
    assert.ok(!p.on, 'the figure is whole: it counts and the drawing ends');
    assert.equal(p.marks.size, 1);
    const m = [...p.marks.values()][0];
    assert.equal(m.pent, 'devil');
    assert.equal(m.r, 3.5, 'every pentagram the same size');
    assert.deepEqual(g._success, ['Pentagranium']);
    assert.equal(sent.at(-1).k, 'mark');
    assert.ok(sent.filter((x) => x.k === 'seg').length >= 16 + 5, 'the arcs and the lines are shown to the others');
    assert.ok(g.combat.fatigue < before && before - g.combat.fatigue < 40, 'drawing drained mana by the second');
    assert.equal(g.dark.level, 0, 'drawing a pentagram does not darken the hero');
});

test('the figure is not drawn by itself: a hand going round the circle, or sweeping across the points, draws no lines — even when every figure is known (Creative)', () => {
    const { p } = stub({ mode: 'creative' });
    assert.ok(p.known().length >= 4);
    p.aim = AIM0(); p.cast(true);
    run(p, ringHand(p, 0.3), 0.05, 'lines');
    assert.equal(p.draw.phase, 'lines');
    // the hand has just gone round the ring and still goes on round it, a point every frame (0.05 s)
    const w = p.draw.line.world.filter((x) => Math.hypot(x[0] - p.draw.ring.cx, x[1] - p.draw.ring.cz) > 3.3);
    run(p, [...w, ...w, ...w]);
    assert.equal(p.draw.line.drawn.size, 0, 'nothing drawn by sweeping');
    assert.ok(p.on);
});

test('a crooked go: points skipped, the other way round, nothing near the ring — the circle only closes when it has been led round; the mana ends the drawing', () => {
    const a = stub(); a.p.learnFigure('devil'); a.p.aim = AIM0(); a.p.cast(true);
    run(a.p, [[500, 500], [501, 500]]); // (the wand far from the ring: nothing)
    assert.equal(a.p.draw.phase, 'ring');
    const half = a.p.draw.ring.world.slice(0, 8).map((w) => [w[0], w[1]]);
    run(a.p, half);
    assert.equal(a.p.draw.phase, 'ring', 'half a circle is no circle');
    const t = stub({ fatigue: 20.4 }); t.p.learnFigure('devil'); t.p.aim = AIM0(); t.p.cast(true);
    assert.ok(t.p.on);
    t.p.update(1); t.p.update(1);
    assert.ok(!t.p.on, 'no mana: the drawing is gone');
});

test('a connection no learnt figure has is not drawn (a hint)', () => {
    const { p, said } = stub();
    p.learnFigure('devil');
    p.aim = AIM0(); p.cast(true);
    run(p, ringHand(p, 0.1), 0.05, 'lines');
    const L = p.draw.line;
    const corners = L.graph.nodes.map((n, i) => [i, Math.atan2(n.u[1], n.u[0]), Math.hypot(...n.u)]).filter((x) => x[2] > 0.95).sort((a, b) => a[1] - b[1]);
    leadTo(p, [corners[0][0], corners[1][0]]);
    assert.equal(L.drawn.size, 0, 'nothing drawn');
    assert.match(said.join('|'), /линию не провести/);
    const ch = chordsOf(p)[0];
    leadTo(p, [ch.nodes[0], ch.nodes.at(-1)]);
    assert.ok(L.drawn.size >= 3, 'a chord of the star is three lines (over two crossings)');
});

test('another figure learnt: its points are shown together with the others (their union); the one the hero has not learnt has no points', () => {
    const { p } = stub();
    p.learnFigure('devil'); p.learnFigure('teleport');
    p.aim = AIM0(); p.cast(true);
    run(p, ringHand(p, 0.2), 0.05, 'lines');
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
