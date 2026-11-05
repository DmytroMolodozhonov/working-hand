// «Логово зельевара» (PotionLairPlan.js): закрытый зал в небе — котёл, ручей, полки. План — чистый, проверяется по блокам.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAIR, layout, racks, inHall, ceilingAt, inRiver } from '../../src/world/PotionLairPlan.js';
import { BLOCK } from '../../src/world/Terrain.js';

const P = layout();
const at = new Map(P.blocks.map((b) => [b[0] + ',' + b[1] + ',' + b[2], b[3]]));
const get = (x, y, z) => at.get(x + ',' + y + ',' + z);
const F = LAIR.F;

test('зал целиком в границах мира, над землёй, оболочка закрыта: над воздухом всегда твёрдое', () => {
    for (const b of P.blocks) assert.ok(b[1] >= -17 && b[1] <= 120, `слой ${b[1]}`);
    let air = 0;
    for (const b of P.blocks) {
        if (b[3] !== BLOCK.AIR) continue;
        air++;
        // луч во все стороны упирается в твёрдое: сосед воздуха — воздух, свой блок или твёрдый, не «пусто»
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
            const n = get(b[0] + dx, b[1] + dy, b[2] + dz);
            assert.ok(n !== undefined, `зал открыт наружу в ${b[0]},${b[1]},${b[2]}`);
        }
    }
    assert.ok(air > 6000, `воздуха ${air}`);
});

test('свод выше роста героя везде, где можно ходить; проход от входа к очагу свободен', () => {
    for (let z = -17; z <= 17; z++) for (let x = -22; x <= 22; x++) if (inHall(x, z, -1)) assert.ok(ceilingAt(x, z) >= 6, `низкий свод ${x},${z}`);
    for (let z = LAIR.HERO.z; z >= LAIR.CAULDRON.z + 4; z--) for (let y = F + 1; y <= F + 6; y++) assert.equal(get(0, y, z), BLOCK.AIR, `проход закрыт ${z},${y}`);
    assert.equal(get(LAIR.MARKER.x, F, LAIR.MARKER.z), BLOCK.COBBLE, 'метка очага');
    for (let y = F + 1; y <= F + 6; y++) assert.equal(get(LAIR.CAULDRON.x, y, LAIR.CAULDRON.z), BLOCK.AIR, 'над очагом пусто (котёл + огонь)');
});

test('ручей: вода в русле на блок ниже пола; берега не залиты, полки не в воде', () => {
    let water = 0;
    for (const b of P.blocks) if (b[3] === BLOCK.WATER) { water++; assert.equal(b[1], F - 1); assert.ok(inRiver(b[0], b[2])); assert.equal(get(b[0], F, b[2]), BLOCK.AIR, 'над водой воздух'); assert.ok(get(b[0], F - 2, b[2]) >= 1, 'под водой дно'); }
    assert.ok(water >= 80, `воды ${water}`);
    for (const r of racks()) for (let x = r.x0; x <= r.x1; x++) assert.ok(!inRiver(x, r.zFront) && !inRiver(x, r.zBack), 'полка в ручье');
});

test('полки: места под вещи — на досках, не в воздухе и не в стене; хватает на все ингредиенты, зелья и колбы; рука достаёт', () => {
    assert.ok(P.slots.ing.length >= 40, `ингредиентов места ${P.slots.ing.length}`);
    assert.ok(P.slots.potion.length >= 24 && P.slots.flask.length >= 12);
    for (const k of ['ing', 'potion', 'flask']) for (const s of P.slots[k]) {
        const board = get(s.x, Math.round(s.y + 0.5 - 0.02), s.z);
        assert.equal(board, BLOCK.PLANKS_DARK, `нет доски под вещью ${s.x},${s.y},${s.z}`);
        assert.equal(get(s.x, Math.round(s.y + 1.5 - 0.02), s.z), BLOCK.AIR, 'над вещью свободно');
        assert.ok(s.y - (F - 0.5) <= 6.1, 'выше досягаемости');
    }
    const key = (s) => s.x + ',' + s.y + ',' + s.z;
    const all = [...P.slots.ing, ...P.slots.potion, ...P.slots.flask];
    assert.equal(new Set(all.map(key)).size, all.length, 'два места в одной точке');
});

test('свет и герой: факелы на каменных стойках (чаша внизу пламени); весь зал из тёмного камня; герой стоит внутри на полу', () => {
    assert.ok(P.torches.length >= 24, `факелов ${P.torches.length}`);
    for (const t of P.torches) { assert.equal(get(t.x, Math.floor(t.y - 0.35 - 0.5 + 0.0), t.z), BLOCK.HELL_OBSIDIAN, 'чаша под пламенем'); assert.equal(get(t.x, F + 3, t.z), BLOCK.HELL_BASALT, 'стойка'); }
    const light = new Set([BLOCK.STONE, BLOCK.SNOW, BLOCK.SAND, BLOCK.COBBLE, BLOCK.CS_WHITE, BLOCK.CS_GREY, BLOCK.CS_SAND, BLOCK.GRAVEL]);
    for (const b of P.blocks) if (!(b[0] === LAIR.MARKER.x && b[2] === LAIR.MARKER.z && b[1] === F)) assert.ok(!light.has(b[3]), `светлый камень ${b[3]} в ${b[0]},${b[1]},${b[2]}`);
    for (let y = F + 1; y <= F + 12; y++) assert.ok(get(0, y, 0) !== undefined);
    assert.ok(inHall(P.hero.x, P.hero.z, -3));
    // купол: гладкий — выше посередине, ниже к краю, без выбоин (соседние столбцы отличаются не больше чем на 1 слой)
    for (let x = -24; x < 24; x++) for (let z = -24; z < 24; z++) if (inHall(x, z, -1) && inHall(x + 1, z, -1)) assert.ok(Math.abs(ceilingAt(x, z) - ceilingAt(x + 1, z)) <= 1, `ступенька свода ${x},${z}`);
    for (let y = F + 1; y <= F + 6; y++) assert.equal(get(P.hero.x, y, P.hero.z), BLOCK.AIR);
    assert.ok(P.rect.x1 > LAIR.A && P.rect.z1 > LAIR.B);
});
