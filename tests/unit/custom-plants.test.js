// Plants of one's own («Да пусть создастся дерево / цветок …»): they sprout, grow, spread into their habitat
// within the limits, fire and blasts take them, charges don't; saved and sent over the net (CustomPlants.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomPlants, PLANT_TARGETS } from '../../src/game/CustomPlants.js';
import { sanitizeRecipe, CREATION } from '../../src/game/CreationRules.js';
import { plantShape } from '../../src/fx/CustomPlantModel.js';

function fakeGame() {
    const boxes = new Map(); let id = 0;
    const sent = [];
    return {
        authority: true, scene: { add() {}, remove() {} }, sent,
        collision: { groundAt: () => 10, addBox: (b) => { boxes.set(++id, b); return id; }, removeBox: (i) => boxes.delete(i), boxes },
        sync: { net: { send: (m) => sent.push(m) } },
    };
}

test('every form makes a shape: a body, a height, a glow when it glows', () => {
    for (const desc of ['дерево с синими листьями и светящимися плодами', 'маленький красный цветок', 'огромный гриб', 'кактус', 'кристаллическое растение', 'лиана', 'куст с ягодами', 'тростник у воды', 'трава']) {
        const r = sanitizeRecipe(null, desc, 7);
        assert.equal(r.type, 'plant', desc);
        const s = plantShape(r, 3);
        assert.ok(s.body.attributes.position.count > 30, desc);
        if (r.glow != null) assert.ok(s.glow, desc + ': glow');
    }
});

test('sprouting, growing, a trunk to bump into; fire and blasts take them, charges don\'t', () => {
    const g = fakeGame(), P = new CustomPlants(g);
    const r = sanitizeRecipe(null, 'пять высоких деревьев, быстро растут', 3);
    assert.equal(P.create(r, { x: 0, y: 10, z: 0 }, 'me'), true);
    const first = [...P.list];
    assert.ok(first.length >= 1);
    for (let i = 0; i < 400; i++) P.update(0.25);
    assert.ok(first.every((p) => p.age === 1 && p.born === 1), 'grown');
    assert.ok(g.collision.boxes.size >= 1, 'a tree is an obstacle');
    const n = P.list.length;
    P.hitAt({ x: 0, y: 10, z: 0 }, 3, 5, 'Sapira');
    assert.equal(P.list.length, n, 'a charge does nothing');
    P.hitAt({ x: 0, y: 10, z: 0 }, 300, 5, 'Bombardo');
    assert.equal(P.list.length, 0);
    assert.equal(g.collision.boxes.size, 0, 'no box left');
    assert.ok(PLANT_TARGETS.fire && PLANT_TARGETS.charges);
});

test('they spread, never past their limits; saved and sent the same', () => {
    const g = fakeGame(), P = new CustomPlants(g);
    const r = sanitizeRecipe(null, 'цветок, который очень часто размножается везде', 5);
    P.create(r, { x: 0, y: 10, z: 0 }, 'me');
    for (const p of P.list) p.age = 1;
    for (let i = 0; i < 3000; i++) P.update(0.5);
    assert.ok(P.list.length > 1, 'spread');
    assert.ok(P.list.length <= CREATION.PLANTS_PER_SPECIES);
    const snap = JSON.parse(JSON.stringify(P.snapshot()));
    const Q = new CustomPlants(fakeGame());
    Q.restore(snap);
    assert.equal(Q.list.length, P.list.length);
    assert.equal(Q.species.size, 1);
    const guest = new CustomPlants({ ...fakeGame(), authority: false });
    guest.applyNet(P.netList());
    guest.onNet({ op: 'del', l: [P.list[0].id] }, false);
    assert.equal(guest.list.length, P.list.length - 1);
});
