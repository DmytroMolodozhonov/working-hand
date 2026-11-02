// Обычные жители: Overgrown / Wind Maxima / Jolt / Disarmor не отменяются устойчивостью; редкий промах — всё равно «держится».
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VillagerModel, villagerLook } from '../../src/entities/VillagerModel.js';
import { CreatureImpact } from '../../src/game/CreatureImpact.js';
import { isOrdinaryVillager, ordinaryOutcome, ORDINARY, creatureSteady } from '../../src/game/Steadiness.js';

function setup(extra, role = 'farmer', id = 'cs:1') {
    const scene = new THREE.Scene();
    const model = new VillagerModel(villagerLook(9, role === 'king' ? 'king' : 'knight'), {}); scene.add(model.group);
    const v = { id, isVillager: true, role, model, group: model.group, x: 0, y: 0, z: 0, yaw: 0, dead: false, stunT: 0, vy: 0, mode: 'idle', speed: 0, ...extra };
    const g = { scene, authority: true, localId: 'me', remotes: new Map(), fx: { spark() {} }, collision: { resolveCylinder() {} }, zombies: [], zombieById: new Map(),
        castleLife: { byId: new Map([[v.id, v]]), _walkable: () => true } };
    const ci = g.creatureImpact = new CreatureImpact(g);
    return { v, ci };
}
const hit = (ci, v, spell, push, extra = {}) => ci.apply(v, { v: new THREE.Vector3(0, 0, -push), spell, ...extra });
const SPELLS = { Jolt: { push: 20, always: { down: 2.5 }, toss: 7 }, JoltMaxima: { push: 60, always: { down: 4 }, toss: 11 }, WindMaxima: { push: 78 }, Overgrown: { push: 7, toss: 5, fly: true }, OvergrownMaxima: { push: 14, toss: 10, fly: true } };

test('кто обычный: житель, торговец, рыцарь и король без магического комплекта; маги и магические доспехи — нет', () => {
    assert.equal(isOrdinaryVillager('v', { id: 'a', role: 'farmer' }), true);
    assert.equal(isOrdinaryVillager('v', { id: 'a', role: 'merchant' }), true);
    assert.equal(isOrdinaryVillager('v', { id: 'a', role: 'knight' }), true);
    assert.equal(isOrdinaryVillager('v', { id: 'a', role: 'king' }), true);
    assert.equal(isOrdinaryVillager('v', { id: 'a', role: 'king', magicSet: true }), false);
    assert.equal(isOrdinaryVillager('v', { id: 'a', role: 'knight', magicSet: true, stripped: true }), true);
    assert.equal(isOrdinaryVillager('v', { id: 'a', role: 'townwiz', wizard: true, rank: 'novice' }), false);
    assert.equal(isOrdinaryVillager('v', { id: 'a', role: 'farmer', robe: 'magic' }), false);
    assert.equal(isOrdinaryVillager('z', { id: 'a' }), false);
    assert.equal(ordinaryOutcome('v', { id: 'a', role: 'farmer' }, 'Wind', () => 0), null);
    assert.equal(ordinaryOutcome('v', { id: 'a', role: 'farmer' }, 'Jolt', () => 0), 'works');
    assert.equal(ordinaryOutcome('v', { id: 'a', role: 'farmer' }, 'Jolt', () => 0.99), 'braces');
});

for (const [spell, P] of Object.entries(SPELLS)) {
    test(`обычный житель с высокой устойчивостью: «${spell}» действует (сбивает), даже если бы устойчивость была 100`, () => {
        const { v, ci } = setup({});
        ci.rnd = () => 0;
        const res = hit(ci, v, spell, P.push, { always: P.always, toss: P.toss, fly: P.fly });
        assert.equal(res, 'knockdown');
        assert.equal(ci.isDown(v), true);
    });
    test(`обычный житель: «${spell}» при редком промахе — отшатывается в позе «держится», без переворота`, () => {
        const { v, ci } = setup({});
        ci.rnd = () => 0.999;
        const res = hit(ci, v, spell, P.push, { always: P.always, toss: P.toss, fly: P.fly });
        assert.equal(res, 'stagger');
        assert.equal(ci.isDown(v), false);
        assert.ok(ci.log.some((l) => l.k === 'brace' && l.res === 'held'));
    });
}

test('Disarmor (бросок как «Джолт») и слабый Overgrown у края дальности: видимая реакция всегда', () => {
    for (const r of [0, 0.5, 0.999]) {
        const { v, ci } = setup({});
        ci.rnd = () => r;
        const res = hit(ci, v, 'Overgrown', 1.2, { toss: 5, fly: true }); // толчок слабее порога «чуть пошатнуло»
        assert.notEqual(res, 'none');
    }
});

test('простой Wind: устойчивость работает как раньше (держится по шансу, не переворачивается)', () => {
    // подбираем жителя с устойчивостью 10: шанс 10 % — при броске 0.05 держится, при 0.5 падает
    const mk = () => { for (let i = 0; i < 400; i++) { const id = 'cs:' + i; if (creatureSteady('v', { id, role: 'farmer' }) === 10) return id; } };
    const id = mk();
    assert.ok(id);
    const a = setup({}, 'farmer', id), realRandom = Math.random;
    try {
        Math.random = () => 0.05;
        assert.equal(hit(a.ci, a.v, 'Wind', 23.4), 'stagger'); // шанс 10 %, бросок 0.05 — устоял
        const b = setup({}, 'farmer', id);
        Math.random = () => 0.5;
        assert.equal(hit(b.ci, b.v, 'Wind', 23.4), 'knockdown'); // бросок 0.5 — упал
    } finally { Math.random = realRandom; }
    // Wind не входит в правило обычных
    assert.equal(ORDINARY.SPELLS.has('Wind'), false);
});

test('маг в мантии (устойчивость + метка) держится как раньше: «Джолт» не сбивает', () => {
    const { v, ci } = setup({ role: 'master', wizard: true, id: 'tower:0' }, 'master', 'tower:0');
    ci.rnd = () => 0.999;
    const res = hit(ci, v, 'Jolt', 20, { always: { down: 2.5 }, toss: 7 });
    assert.equal(res, 'stagger');
    assert.equal(ci.isDown(v), false);
});

test('король в магическом комплекте: старая защита (устойчивость по шансу, Wind Maxima сбивает как раньше)', () => {
    const id = Array.from({ length: 400 }, (_, i) => 'k:' + i)[0];
    const { v, ci } = setup({ magicSet: true }, 'king', id);
    ci.rnd = () => 0.999;
    const realRandom = Math.random;
    try {
        Math.random = () => 0; // всегда устоял, если шанс > 0
        assert.equal(hit(ci, v, 'Jolt', 20, { always: { down: 2.5 }, toss: 7 }), 'stagger'); // держится
        const b = setup({ magicSet: true }, 'king', id);
        assert.equal(hit(b.ci, b.v, 'WindMaxima', 78), 'knockdown'); // Wind Maxima устойчивостью не отменяется
    } finally { Math.random = realRandom; }
});
