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

// The author tried it: «красными и очень большими» came out neither red nor big. The colour and the size of the words must
// reach the recipe, the model (its leaves' colour, its height in metres — the hero is 3.5 m) and the plant in the world.
test('«красное и очень большое дерево», «синий мелкий цветок», «золотой огромный куст»: the colour and the size made', () => {
    const THREE_ = globalThis.__T;
    const lazy = { type: 'plant', plant: { form: 'flower', height: 0.5, leafColor: '#00ff00' } }; // (a network's careless answer)
    const red = sanitizeRecipe(lazy, 'красное и очень большое дерево', 1);
    assert.equal(red.form, 'tree', 'a tree, as said');
    assert.equal(red.leafColor, 0xc8312b, 'red leaves');
    assert.ok(red.height >= 25, `very big: ${red.height} m`);
    const blue = sanitizeRecipe(lazy, 'синий мелкий цветок', 1);
    assert.equal(blue.flowers.color, 0x2d58c8, 'blue flowers');
    assert.ok(blue.height < 2 && blue.height > 0.5, `small: ${blue.height}`);
    const gold = sanitizeRecipe(lazy, 'золотой огромный куст', 1);
    assert.equal(gold.form, 'bush'); assert.equal(gold.leafColor, 0xe6b422);
    assert.ok(gold.height >= 15, `huge: ${gold.height}`);
    assert.equal(sanitizeRecipe(lazy, 'дерево высотой 30 метров', 1).height, 30);
    assert.equal(sanitizeRecipe(lazy, 'дерево в 2 раза выше человека', 1).height, 7);
    assert.equal(sanitizeRecipe(lazy, 'кроваво-красный цветок', 1).flowers.color, 0x9a0a12);
    // the model: as tall as its recipe once the instance is scaled; its leaves really red
    const sh = plantShape(red, 3);
    sh.body.computeBoundingBox();
    const hb = sh.body.boundingBox.max.y - sh.body.boundingBox.min.y;
    assert.ok(Math.abs(hb * red.height - red.height) / red.height < 0.25, `model height ${(hb * red.height).toFixed(1)} m`);
    const col = sh.body.attributes.color.array;
    let reds = 0; for (let i = 0; i < col.length; i += 3) if (col[i] > col[i + 1] * 2 && col[i] > 0.3) reds++;
    assert.ok(reds > col.length / 3 * 0.3, 'most of it red');
    // in the world: whole at once (the gods made it), not a seedling
    const g = fakeGame(), P = new CustomPlants(g);
    P.create(red, { x: 0, y: 10, z: 0 }, 'me');
    assert.ok(P.list.every((p) => p.age === 1), 'grown at once');
    void THREE_;
});

test('one or many: «пара», «несколько», «стая», «много», «лес», numbers in words', async () => {
    const { groupCount } = await import('../../src/game/CreationRules.js');
    const plants = /растени|дерев|куст|цвет|гриб|ромаш/;
    assert.equal(groupCount('дерево', plants), null);
    assert.equal(groupCount('пара деревьев', plants), 2);
    assert.equal(groupCount('несколько кустов', plants), 4);
    assert.equal(groupCount('рощица берёз', plants), 9);
    assert.equal(groupCount('много цветов', plants), 20);
    assert.equal(groupCount('лес из дубов', plants), 50);
    assert.equal(groupCount('десять ромашек', plants), 10);
    assert.equal(groupCount('двадцать тюльпанов', plants), 20);
    assert.equal(groupCount('дерево с 5 ветвями', plants), null, 'a part counted is no group');
    assert.equal(sanitizeRecipe(null, 'лес красных деревьев', 1).count, 50);
    const wolves = sanitizeRecipe(null, 'стая волков', 1);
    assert.equal(wolves.species, 'wolf'); assert.ok(wolves.count >= 6 && wolves.count <= 12);
    assert.equal(sanitizeRecipe(null, 'пара коней', 1).count, 2);
    assert.equal(sanitizeRecipe(null, 'существо с крыльями', 1).count, 1);
});
