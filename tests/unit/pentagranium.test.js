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
const frames = (p, sec, dt = 0.05) => { for (let t = 0; t < sec; t += dt) p.update(dt); };

test('«Pentagranium <Name>»: the pentagram is made where the wand points; the mana goes at the word; it draws itself', () => {
    const { g, p, said, sent } = stub({ fatigue: 100 });
    p.learnFigure('teleport');
    assert.equal(p.cast(true, 'пентаграниум телепортис', AIM0()), 'Pentagranium');
    assert.equal(g.combat.fatigue, 50, '50 mana at the word');
    assert.equal(p.marks.size, 1);
    const m = [...p.marks.values()][0];
    assert.equal(m.pent, 'teleport');
    assert.equal(m.r, PENT.R);
    assert.ok(m.anim, 'it draws itself');
    assert.equal(sent.at(-1).k, 'mark');
    frames(p, PENT.DRAW_T + 0.2);
    assert.equal(m.anim, null, 'drawn');
    assert.equal(g._success.length, 1);
    assert.ok(said.some((t) => /рисуется/.test(t)));
});

test('the lone «Pentagranium» is no spell; an unknown pentagram, no mana, no ground — nothing is made, nothing is paid', () => {
    const { g, p } = stub({ fatigue: 100 });
    p.learnFigure('teleport');
    assert.equal(p.cast(true, 'пентаграниум', AIM0()), null);
    assert.equal(p.cast(true, 'пентаграниум вита', AIM0()), null, 'life not learnt');
    g.combat.fatigue = 10;
    assert.equal(p.cast(true, 'пентаграниум телепортис', AIM0()), null, 'no mana');
    g.combat.fatigue = 100;
    assert.equal(p.cast(true, 'пентаграниум телепортис', { origin: new THREE.Vector3(0, 4, -6), dir: new THREE.Vector3(0, 1, 1).normalize() }), null, 'wand in the sky');
    assert.equal(g.combat.fatigue, 100);
    assert.equal(p.marks.size, 0);
});

test('the microphone repeating one phrase makes one pentagram and takes the mana once; Creative is free and knows all', () => {
    const { g, p } = stub({ fatigue: 100 });
    p.learnFigure('life');
    p.cast(false, 'пентаграниум вита', AIM0());
    p.cast(true, 'пентаграниум вита', AIM0());
    assert.equal(p.marks.size, 1);
    assert.equal(g.combat.fatigue, 50);
    const c = stub({ mode: 'creative', fatigue: 0 });
    assert.equal(c.p.cast(true, 'пентаграниум монструм', AIM0()), 'Pentagranium');
    assert.equal(c.g.combat.fatigue, 0);
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

test('«Пентаграниум» и ошибка во втором слове: ничего не создаётся, Vita не подставляется; ждём второе слово', () => {
    const { g, p } = stub({ fatigue: 100 });
    p.learnFigure('life'); p.learnFigure('teleport');
    for (const t of ['пентаграниум', 'пентаграниум ви', 'пентаграниум мита', 'пентаграниум бита', 'пентаграниум витамины', 'пентаграниум хлеб'])
        for (const fin of [false, true]) assert.equal(p.cast(fin, t, AIM0()), null, `${t} final=${fin}`);
    assert.equal(p.marks.size, 0);
    assert.equal(g.combat.fatigue, 100, 'ничего не заплачено');
    // пауза посреди фразы: сперва одно слово (ждём), потом имя целиком — делается ровно то, что сказано, а не Vita
    assert.equal(p.cast(false, 'пентаграниум', AIM0()), null);
    assert.equal(p.cast(false, 'пентаграниум телепортис', AIM0()), null, 'имя должно продержаться PAUSE_MS или фраза кончиться');
    assert.equal(p.cast(true, 'пентаграниум телепортис', AIM0()), 'Pentagranium');
    assert.equal([...p.marks.values()][0].pent, 'teleport');
});
