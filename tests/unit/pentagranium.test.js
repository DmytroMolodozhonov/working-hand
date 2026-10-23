// «Пентаграниум» (Pentagranium.js) with a stub game: the cost, the figure, the scrolls seen, the rite.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Pentagranium } from '../../src/game/Pentagranium.js';
import { PENT, RITE, starPoints, figureLines } from '../../src/game/PentagramRules.js';
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
    p.fx = { trailBegin() {}, trailEnd() {}, trailAdd() {}, trailSmoke() {}, trailPulse() {}, add() {}, set() {}, remove() {}, ambient() {}, sampleModels: () => [] };
    return { g, p, said, sent, spark };
}

/** The wand held over the ground at (0, 4, -6) aimed at the next stitch of a hand-drawn figure. */
function drawing({ R = 3.5, wob = 0, order = 'circle-first' } = {}) {
    let s = 3;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    const pts = [];
    for (let i = 0; i <= 74; i++) { const a = (i / 74) * Math.PI * 2; pts.push([Math.cos(a) * R + rnd() * wob * R, 8 + Math.sin(a) * R + rnd() * wob * R]); }
    const circle = pts.slice(), star = [];
    for (const poly of figureLines('devil')) for (let k = 0; k <= poly.length; k++) {
        const a = poly[k % poly.length], b = poly[(k + 1) % poly.length], m = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * R / 0.3);
        for (let i = 0; i < m; i++) star.push([(a[0] + (b[0] - a[0]) * i / m) * R + rnd() * wob * R, 8 + (a[1] + (b[1] - a[1]) * i / m) * R + rnd() * wob * R]);
    }
    return order === 'circle-first' ? [...circle, ...star] : [...star, ...circle];
}
function run(p, pts, dt = 0.05) {
    p.aim = { origin: new THREE.Vector3(0, 4, -6), dir: new THREE.Vector3(0, -1, 1) };
    for (const [x, z] of pts) {
        p.aim.dir.set(x - p.aim.origin.x, 0.5 - p.aim.origin.y, z - p.aim.origin.z).normalize();
        p.update(dt);
        if (!p.on) break;
    }
}

test('the spell: black magic, 20 mana at once, 1 a second while drawing, only from its scroll (own key)', () => {
    assert.equal(SPELL_COST.Pentagranium, 20);
    assert.equal(PENT.DRAIN, 1);
    assert.ok(isDark('Pentagranium'));
    assert.ok(!knows('Pentagranium', { mode: 'freeworld', spells: {}, learned: new Set() }));
    assert.ok(knows('Pentagranium', { mode: 'freeworld', spells: { Pentagranium: true }, learned: new Set() }));
    assert.ok(knows('Pentagranium', { mode: 'creative' }));
});

test('without a figure seen nothing starts and nothing is paid', () => {
    const { p, g, said } = stub();
    p.aim = { origin: new THREE.Vector3(0, 4, -6), dir: new THREE.Vector3(0, -1, 1).normalize() };
    assert.equal(p.cast(true), null);
    assert.deepEqual(g.combat.paid, []);
    assert.match(said.at(-1), /не знаете/);
});

test('with the figure seen: 20 mana, a drawing of a circle and a star inside is counted — the pentagram is lit, the black level grows, the spell ends', () => {
    const { p, g, sent } = stub();
    p.seeFigure('devil');
    p.aim = { origin: new THREE.Vector3(0, 4, -6), dir: new THREE.Vector3(0, -1, 1).normalize() };
    assert.equal(p.cast(true), 'Pentagranium');
    assert.deepEqual(g.combat.paid, ['Pentagranium']);
    assert.ok(p.on);
    const before = g.combat.fatigue;
    run(p, drawing({ wob: 0.05 }));
    assert.ok(!p.on, 'counted: the drawing ends');
    assert.equal(p.marks.size, 1);
    const m = [...p.marks.values()][0];
    assert.ok(Math.abs(m.x) < 0.8 && Math.abs(m.z - 8) < 0.8 && m.r > 2.5 && m.r < 5);
    assert.deepEqual(g._success, ['Pentagranium'], 'the first success (and the +1 of the black mage: Mana.success → DarkMagic)');
    assert.equal(sent.at(-1).k, 'mark');
    assert.ok(g.combat.fatigue < before, 'drawing drained mana by the second');
    assert.ok(before - g.combat.fatigue < 10);
});

test('a scribble, one circle, or a figure drawn star-first is not counted; the drawing goes on draining until «стоп» / the mana ends', () => {
    for (const o of [{ order: 'star-first' }]) {
        const { p } = stub(); p.seeFigure('devil'); p.aim = { origin: new THREE.Vector3(0, 4, -6), dir: new THREE.Vector3(0, -1, 1).normalize() };
        p.cast(true); run(p, drawing(o));
        assert.equal(p.marks.size, 0, JSON.stringify(o));
    }
    const { p, g } = stub(); p.seeFigure('devil'); p.aim = { origin: new THREE.Vector3(0, 4, -6), dir: new THREE.Vector3(0, -1, 1).normalize() };
    p.cast(true);
    let s = 7; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    run(p, Array.from({ length: 160 }, () => [(rnd() - 0.5) * 7, 8 + (rnd() - 0.5) * 7]));
    assert.equal(p.marks.size, 0);
    assert.ok(p.on, 'still drawing');
    assert.ok(p.stop('stop'));
    assert.ok(!p.on);
    // the mana ends
    const t = stub({ fatigue: 20.4 }); t.p.seeFigure('devil'); t.p.aim = p.aim;
    t.p.cast(true);
    assert.ok(t.p.on);
    t.p.update(1); t.p.update(1);
    assert.ok(!t.p.on, 'no mana: the drawing is gone');
});

test('an unseen figure is never counted: the hero has seen only another drawing', () => {
    const { p } = stub();
    p.seeFigure('sigil'); // (the hexagram)
    p.aim = { origin: new THREE.Vector3(0, 4, -6), dir: new THREE.Vector3(0, -1, 1).normalize() };
    p.cast(true);
    run(p, drawing());
    assert.equal(p.marks.size, 0, 'a pentagram drawn, only the hexagram seen');
});

test('the seen figures are saved and come back', () => {
    const a = stub().p, b = stub().p;
    a.seeFigure('devil');
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
    p.seeFigure('devil');
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
