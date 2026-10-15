import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, bedColorHex, BED_COLORS, checkRecipe, planConsumption, countMaterials, everyoneAsleep, bedSpawnSpot, bedSpawnCandidates, bedStandSpot, homeBed } from '../../src/game/BedRules.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('beds: colour words in Russian and English', () => {
    assert.equal(parseColor('поменяй цвет на синий'), 'blue');
    assert.equal(parseColor('Change a color red'), 'red');
    assert.equal(parseColor('Чейндж э колор красный'), 'red');
    assert.equal(parseColor('поменяй цвет на зелёный'), 'green');
    assert.equal(parseColor('change a color yellow'), 'yellow');
    assert.equal(parseColor('цвет жёлтый'), 'yellow');
    assert.equal(parseColor('поменяй цвет на голубой'), 'cyan');
    assert.equal(parseColor('change a color light blue'), 'cyan');
    assert.equal(parseColor('цвет фиолетовый'), 'purple');
    assert.equal(parseColor('розовый'), 'pink');
    assert.equal(parseColor('оранжевую'), 'orange');
    assert.equal(parseColor('сделай чёрной'), 'black');
    assert.equal(parseColor('white'), 'white');
    assert.equal(parseColor('белую'), 'white');
    assert.equal(parseColor('поменяй цвет'), null);
    assert.equal(parseColor('Change a color'), null);
    assert.equal(parseColor(''), null);
    // «синий» is not found inside other words
    assert.equal(parseColor('косинус'), null);
    assert.equal(bedColorHex('blue'), BED_COLORS.blue.hex);
    assert.equal(bedColorHex('nonsense'), BED_COLORS.white.hex);
    assert.equal(bedColorHex(0x123456), 0x123456);
});

test('beds: the spell words', () => {
    for (const t of ['Create a Bed', 'create a bed', 'Крейт э бед', 'крейт э бэд', 'создай кровать', 'Сделай кровать', 'кровать']) assert.equal(matchSpell(t), 'CreateBed', t);
    for (const t of ['Change a color blue', 'Change a colour red', 'поменяй цвет на красный', 'Чейндж э колор синий', 'перекрась в зелёный', 'чейндж э колор']) assert.equal(matchSpell(t), 'ChangeColor', t);
    // the old spells are still themselves
    assert.equal(matchSpell('Create a Door'), 'CreateDoor');
    assert.equal(matchSpell('Create a Floor'), 'CreateFloor');
    assert.equal(matchSpell('Бомбардо'), 'Bombardo');
    assert.equal(matchSpell('Инферно'), 'Inferno');
    // «обед» / «победа» alone are not a bed
    assert.notEqual(matchSpell('обед'), 'CreateBed');
    assert.notEqual(matchSpell('победа'), 'CreateBed');
});

test('beds: the recipe — 4 logs and 3 wool lying together', () => {
    const logs = (n, uid = 'l' + n) => ({ kind: 'logs', count: n, uid });
    const wool = (uid) => ({ kind: 'wool', count: 1, uid });
    assert.deepEqual(countMaterials([logs(4), wool('a'), wool('b'), { kind: 'apple', count: 3 }]), { logs: 4, wool: 2 });
    const ok = checkRecipe([logs(4), wool('a'), wool('b'), wool('c')]);
    assert.equal(ok.ok, true);
    assert.equal(ok.message, null);
    const noWool = checkRecipe([logs(4), wool('a')]);
    assert.equal(noWool.ok, false);
    assert.match(noWool.message, /Нужно ещё: 2 клубка шерсти \(/);
    const noLogs = checkRecipe([logs(2, 'x'), wool('a'), wool('b'), wool('c')]);
    assert.equal(noLogs.ok, false);
    assert.match(noLogs.message, /Нужно ещё: 2 бревна \(/);
    assert.match(checkRecipe([logs(3), wool('a')]).message, /1 бревно и 2 клубка шерсти/);
    const nothing = checkRecipe([]);
    assert.equal(nothing.ok, false);
    assert.match(nothing.message, /нет материалов/);
    // using up: whole piles first; a bigger pile is used partly, the rest stays
    const plan = planConsumption([logs(3, 'p'), logs(4, 'q'), wool('a'), wool('b'), wool('c'), wool('d')]);
    assert.deepEqual(plan.filter((s) => s.kind === 'logs'), [{ uid: 'q', kind: 'logs', take: 4, left: 0 }]);
    assert.equal(plan.filter((s) => s.kind === 'wool').length, 3);
    const part = planConsumption([logs(6, 'big'), wool('a'), wool('b'), wool('c')]);
    assert.deepEqual(part[0], { uid: 'big', kind: 'logs', take: 4, left: 2 });
    assert.equal(planConsumption([logs(3), wool('a'), wool('b'), wool('c')]), null);
});

test('beds: the night passes only when every living player sleeps', () => {
    assert.equal(everyoneAsleep([{ lying: true, still: 3.2 }]), true);
    assert.equal(everyoneAsleep([{ lying: true, still: 1 }]), false);
    assert.equal(everyoneAsleep([{ lying: false, still: 9 }]), false);
    assert.equal(everyoneAsleep([{ lying: true, still: 5 }, { lying: false, still: 0 }]), false);
    assert.equal(everyoneAsleep([{ lying: true, still: 5 }, { dead: true, lying: false }]), true);
    assert.equal(everyoneAsleep([{ dead: true }]), false);
    assert.equal(everyoneAsleep([]), false);
});

test('beds: the respawn point — my bed, a free place beside it facing away, a destroyed bed → the usual place', () => {
    const dims = { W: 2.5, L: 5.5 };
    const bed = { id: 'b1', x: 10, y: 0, z: -4, ry: 0.7 };
    const beds = new Map([['b1', bed]]);
    // the bed chosen
    assert.deepEqual(homeBed({ id: 'b1' }, beds), { bed });
    assert.equal(homeBed(null, beds), null);
    // the bed is gone → the usual place; a house bed far away (unloaded) still stands while its floor does
    assert.deepEqual(homeBed({ id: 'gone' }, beds), { gone: true });
    const far = { id: 'h3b0', x: 300, y: 5, z: 20, ry: 0, gen: 1 };
    assert.deepEqual(homeBed(far, beds, () => true), { bed: far });
    assert.deepEqual(homeBed(far, beds, () => false), { gone: true });
    // open ground: beside the long side, outside the bed, looking away from it
    const flat = () => 0;
    const s = bedSpawnSpot(bed, dims, flat);
    const dx = s.x - bed.x, dz = s.z - bed.z;
    const lx = dx * Math.cos(bed.ry) - dz * Math.sin(bed.ry), lz = dx * Math.sin(bed.ry) + dz * Math.cos(bed.ry);
    assert.ok(Math.abs(lx) > dims.W / 2 + 0.5 && Math.abs(lz) < dims.L / 2, 'beside the long side, not in the bed');
    const look = { x: -Math.sin(s.ry), z: -Math.cos(s.ry) };
    assert.ok((look.x * dx + look.z * dz) / Math.hypot(dx, dz) > 0.99, 'facing away from the bed');
    assert.equal(s.y, 0);
    // a wall on that side (and no floor anywhere near) → the other side; nowhere → null
    const first = bedSpawnCandidates(bed, dims)[0];
    const s2 = bedSpawnSpot(bed, dims, (x, z) => (Math.hypot(x - first.x, z - first.z) < 0.5 ? null : 0));
    assert.ok(Math.hypot(s2.x - first.x, s2.z - first.z) > 2, 'not into the wall');
    assert.equal(bedSpawnSpot(bed, dims, () => null), null);
});

test('getting up from a bed against a wall: in the bed\'s own room, never in the wall or behind it in the next room', () => {
    const dims = { W: 2.5, L: 5.5, top: 1 };
    // a room x −4…1.9 (z −5…5), a wall of blocks x 2…3 (the bed's side 0.75 from it), the next room beyond;
    // the room's other walls at x −4.5 and z ±5.5
    const wall = (x, z) => (x >= 1.9 && x <= 3.1) || x <= -4.5 || Math.abs(z) >= 5.5;
    const bedBox = (x, y, z) => Math.abs(x) <= 1.25 && Math.abs(z) <= 2.75 && y <= 1;
    const blocked = (x, y, z) => wall(x, z) || bedBox(x, y, z);
    const floorAt = (x, z) => (wall(x, z) ? 7 : 0); // (a wall's top: no floor there)
    const bed = { x: 0, y: 0, z: 0, ry: 0 };
    const s = bedStandSpot(bed, dims, floorAt, blocked);
    assert.ok(s, 'a place');
    assert.ok(s.x < 1.9 && s.x > -4.5 && Math.abs(s.z) < 5.5, `in the bed's room: ${JSON.stringify(s)}`);
    for (const [a, c] of [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) assert.equal(blocked(s.x + a, s.y + 1.5, s.z + c), false, 'not in the wall');
    // the next room is free floor right behind the wall: still never chosen
    const thin = (x, z) => (x >= 1.6 && x <= 1.95) || Math.abs(z) >= 5.5 || x <= -1.3; // (a thin partition; this side too narrow)
    const s2 = bedStandSpot(bed, dims, (x, z) => (thin(x, z) ? 7 : 0), (x, y, z) => thin(x, z) || bedBox(x, y, z));
    assert.ok(!s2 || (s2.x < 1.6 && s2.x > -1.3), `never behind the partition: ${JSON.stringify(s2)}`);
    // the ends of the bed are free: it stands there (in the room) when its sides are not
    assert.ok(s2 && Math.abs(s2.z) > 2.75, `at an end of the bed: ${JSON.stringify(s2)}`);
});
