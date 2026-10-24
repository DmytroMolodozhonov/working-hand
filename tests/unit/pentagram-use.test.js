// The good pentagrams (PentagramUse.js, Pentagranium.js): teleport, life, mend; the figures told apart.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Pentagranium } from '../../src/game/Pentagranium.js';
import { USE, MEND_COST, mendPlan, mendPrice, pairUp, PENTAGRAM_USE_TARGETS } from '../../src/game/PentagramUse.js';
import { recognizeAny, figureLines, figureIds } from '../../src/game/PentagramRules.js';
import { pieceMax } from '../../src/game/ArmorTypes.js';

const piece = (p, magic, hp) => ({ kind: 'armor', piece: p, magic, hp: hp ?? 0 });

function stub({ fatigue = 100, hp = 10, maxHp = 20, worn = {} } = {}) {
    const said = [];
    const g = {
        config: { mode: 'freeworld' }, hud: { setVoice: (t) => said.push(t) },
        combat: { enabled: true, fatigue, hp, maxHp, _hudKey: '' },
        terrain: { data: { topLayer: () => 1, get: () => 1, landMade: () => true } },
        fx: { spark() {}, lightFlash() {} }, character: { group: { position: new THREE.Vector3(0, 2.5, 0) }, verticalVelocity: 0 },
        sync: { pentagram: () => {} }, armor: { worn: { helmet: null, chest: null, legs: null, robe: null, ...worn }, _renderCells() {} },
        bleeding: { stopped: 0, stop() { this.stopped++; } }, playerHP: hp, perf: { note() {} }, death: { bodies: new Map(), falling: new Set() }, dark: { level: 0 },
    };
    const p = new Pentagranium(g);
    p.fx = { trailBegin() {}, trailEnd() {}, trailAdd() {}, trailSmoke() {}, trailPulse() {}, trailRing() {}, trailLine() {}, trailBreak() {}, anchorsShow() {}, anchorsHover() {}, anchorsHide() {}, add() {}, set() {}, remove() {}, ambient() {}, sampleModels: () => [] };
    return { g, p, said };
}
const put = (p, pent, x, z, by = 'me') => { const m = p._place(pent + x, by, pent, x, 0.5, z, 3.5, 0); m.mine = true; m._tp = 1; p._permanent(m); m.t = 5; m.fade = 1; return m; };
const stand = (g, x, z) => g.character.group.position.set(x, 2.5, z);
const run = (p, sec, dt = 0.05) => { for (let t = 0; t < sec; t += dt) p.update(dt); };

test('the prices of mending are the author\'s; the plan: magic first, what the mana does not reach stays as it was, whole pieces cost nothing', () => {
    assert.deepEqual(MEND_COST, { helmet: { plain: 10, magic: 20 }, chest: { plain: 20, magic: 40 }, legs: { plain: 15, magic: 30 } });
    const worn = { helmet: piece('helmet', false, 1), chest: piece('chest', true, 5), legs: piece('legs', false, 2) };
    const all = mendPlan(worn, 1000, pieceMax);
    assert.equal(all.fix.length, 3, 'all three');
    assert.equal(all.cost, 40 + 10 + 15);
    assert.equal(all.fix[0], 'chest', 'the magic one first');
    const some = mendPlan(worn, 45, pieceMax); // the magic chest (40), then 5 left: neither the legs (15) nor the helmet (10)
    assert.deepEqual(some.fix, ['chest']); assert.deepEqual(some.short.sort(), ['helmet', 'legs']);
    const poor = mendPlan(worn, 30, pieceMax); // not the chest (40): the legs (15), then the helmet (10)
    assert.deepEqual(poor.fix, ['legs', 'helmet']); assert.deepEqual(poor.short, ['chest']);
    assert.equal(mendPlan({ helmet: piece('helmet', false, pieceMax({ piece: 'helmet' })) }, 100, pieceMax).cost, 0, 'whole: nothing');
    assert.equal(mendPrice(piece('legs', true)), 30);
});

test('pairing: the second teleport pentagram takes the first; a third begins a new pair', () => {
    const a = { id: 'a', pent: 'teleport', by: 'me' }, b = { id: 'b', pent: 'teleport', by: 'me' }, c = { id: 'c', pent: 'teleport', by: 'me' }, o = { id: 'o', pent: 'teleport', by: 'x' };
    assert.equal(pairUp([a], a), null);
    assert.equal(pairUp([a, b], b), a); assert.equal(a.pair, 'b'); assert.equal(b.pair, 'a');
    assert.equal(pairUp([a, b, c], c), null, 'the first two are a pair already');
    assert.equal(pairUp([a, b, c, o], o), null, 'another owner\'s');
});

test('the four drawings are told apart: the star, the square with a small circle, the sprout, the shield', () => {
    const draw = (id, rot = 0.3) => {
        const R = 3.5, pts = [];
        for (let i = 0; i <= 74; i++) { const a = (i / 74) * Math.PI * 2; pts.push([Math.cos(a) * R, 8 + Math.sin(a) * R]); }
        for (const poly of figureLines(id, rot)) for (let k = 0; k <= poly.length; k++) {
            const a = poly[k % poly.length], b = poly[(k + 1) % poly.length], m = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * R / 0.3));
            for (let i = 0; i < m; i++) pts.push([(a[0] + (b[0] - a[0]) * i / m) * R, 8 + (a[1] + (b[1] - a[1]) * i / m) * R]);
        }
        return pts;
    };
    for (const id of ['devil', 'teleport', 'life', 'mend', 'enchant']) {
        assert.ok(figureIds().includes(id), id);
        const r = recognizeAny(draw(id), new Set([id]));
        assert.ok(r.ok && r.id === id, `${id}: ${JSON.stringify(r)}`);
    }
});

test('teleport: two pentagrams; 3 s standing still, 50 mana; no pair, no mana, stepping off — nothing', () => {
    const { g, p, said } = stub();
    const a = put(p, 'teleport', 0, 0), b = put(p, 'teleport', 100, 0);
    assert.equal(a.pair, b.id);
    stand(g, 0, 0);
    run(p, 2.5);
    assert.ok(Math.abs(g.character.group.position.x) < 0.1, 'not yet: 3 s');
    assert.equal(g.combat.fatigue, 100);
    run(p, 1);
    assert.ok(Math.abs(g.character.group.position.x - 100) < 0.1, 'arrived on the pair');
    assert.equal(g.combat.fatigue, 50, '50 mana');
    run(p, 5);
    assert.ok(Math.abs(g.character.group.position.x - 100) < 0.1, 'does not jump back while standing on the arrival');
    // stepping off cancels
    const t = stub(); const a2 = put(t.p, 'teleport', 0, 0); put(t.p, 'teleport', 100, 0);
    stand(t.g, 0, 0); run(t.p, 2); stand(t.g, 20, 0); run(t.p, 2); stand(t.g, 0, 0); run(t.p, 1);
    assert.ok(Math.abs(t.g.character.group.position.x) < 0.1);
    assert.equal(t.g.combat.fatigue, 100);
    // no pair
    const n = stub(); put(n.p, 'teleport', 0, 0); stand(n.g, 0, 0); run(n.p, 4);
    assert.match(n.said.join('|'), /вторую пентаграмму телепортации/);
    assert.equal(n.g.combat.fatigue, 100);
    // no mana
    const m = stub({ fatigue: 49 }); put(m.p, 'teleport', 0, 0); put(m.p, 'teleport', 100, 0); stand(m.g, 0, 0); run(m.p, 4);
    assert.ok(Math.abs(m.g.character.group.position.x) < 0.1);
    assert.equal(m.g.combat.fatigue, 49);
    assert.match(m.said.join('|'), /Не хватает маны: нужно 50/);
});

test('life: 50 mana, full health, the bleeding stops; full health or no mana — nothing paid; not more often than every 10 s', () => {
    const { g, p } = stub();
    put(p, 'life', 0, 0); stand(g, 0, 0);
    run(p, 0.5);
    assert.equal(g.combat.hp, 20); assert.equal(g.combat.fatigue, 50); assert.equal(g.bleeding.stopped, 1);
    g.combat.hp = 5; run(p, 5);
    assert.equal(g.combat.hp, 5, 'the 10 s are not over');
    run(p, 6);
    assert.equal(g.combat.hp, 20); assert.equal(g.combat.fatigue, 0);
    const f = stub({ hp: 20 }); put(f.p, 'life', 0, 0); stand(f.g, 0, 0); run(f.p, 1);
    assert.equal(f.g.combat.fatigue, 100, 'full health: nothing paid'); assert.match(f.said.join('|'), /Здоровье и так полное/);
    const m = stub({ fatigue: 49 }); put(m.p, 'life', 0, 0); stand(m.g, 0, 0); run(m.p, 1);
    assert.equal(m.g.combat.hp, 10); assert.match(m.said.join('|'), /Не хватает маны: нужно 50/);
});

test('mend: the worn armour is mended piece by piece for its own price; a whole one costs nothing', () => {
    const worn = { helmet: piece('helmet', false, 1), chest: piece('chest', true, 3), legs: piece('legs', false, pieceMax({ piece: 'legs' })) };
    const { g, p } = stub({ worn, fatigue: 100 });
    put(p, 'mend', 0, 0); stand(g, 0, 0); run(p, 0.5);
    assert.equal(worn.helmet.hp, pieceMax(worn.helmet)); assert.equal(worn.chest.hp, pieceMax(worn.chest));
    assert.equal(g.combat.fatigue, 100 - 40 - 10, 'the magic chest 40 + the plain helmet 10; the whole legs nothing');
    const poor = { helmet: piece('helmet', false, 1), chest: piece('chest', true, 3) };
    const q = stub({ worn: poor, fatigue: 45 }); put(q.p, 'mend', 0, 0); stand(q.g, 0, 0); run(q.p, 0.5);
    assert.equal(poor.chest.hp, pieceMax(poor.chest), 'magic first'); assert.equal(poor.helmet.hp, 1, 'no mana left for the helmet: as it was');
    assert.match(q.said.join('|'), /Не хватило маны на: шлем/);
});

test('the permanent pentagrams are saved, come back when their land is there, and there are at most 24', () => {
    const { p, g } = stub();
    const a = put(p, 'teleport', 0, 0), b = put(p, 'life', 30, 0);
    const snap = p.marksSnapshot();
    assert.equal(snap.length, 2);
    const q = stub().p;
    q.marksRestore(JSON.parse(JSON.stringify(snap)));
    q.update(1.1);
    assert.ok(q.marks.size >= 1, 'one a second');
    q.update(1.1);
    assert.equal(q.marks.size, 2);
    assert.ok([...q.marks.values()].every((m) => m.perm));
    const many = stub().p;
    for (let i = 0; i < USE.PERM_MAX + 5; i++) put(many, 'life', i * 20, 0);
    assert.equal([...many.marks.values()].filter((m) => m.perm).length, USE.PERM_MAX);
});

test('the rite takes 50 mana: laid with less, the body waits and nothing is paid', () => {
    const { g, p } = stub({ fatigue: 49 });
    p.learnFigure('devil');
    const m = p._place('d1', 'me', 'devil', 0, 0.5, 8, 3.5, 0); m.mine = true; m.t = 5; m.fade = 1;
    g.death.bodies.set('b1', { id: 'b1', k: 'v', who: 'w1', wz: 1, mm: 230, x: 0.5, y: 0.5, z: 8.5, age: 0, model: new THREE.Group() });
    g.mana = { duelsWon: new Map([['w1', 'kill']]), grow() {}, powerFlow() {}, _say() {}, success() {} };
    p._findRites();
    assert.equal(m.rites.length, 0); assert.equal(g.combat.fatigue, 49);
    g.combat.fatigue = 80; p._findRites();
    assert.equal(m.rites.length, 1); assert.equal(g.combat.fatigue, 30);
});

test('the table «who/what» of the use has every creature', () => {
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'iceCastle', 'dragon', 'phoenix', 'owl', 'items', 'ground']) assert.ok(PENTAGRAM_USE_TARGETS[k]?.why, k);
});
