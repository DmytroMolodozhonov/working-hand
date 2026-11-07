// Дождь тушит огонь (RainDouse.js) и кровавый дождь в аду; звонок «Let it rain» — RainSummon.js подключён.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RainDouse, RAIN, RAIN_TARGETS } from '../../src/game/RainDouse.js';
import { HELL } from '../../src/world/HellMap.js';

const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

function fakeGame(over = {}) {
    const calls = [];
    const g = {
        calls, authority: true, localId: 'me', remotes: new Map(), hud: { setVoice() {} },
        character: { group: { position: { x: 0, y: 5, z: 0 } } },
        storm: { raining: true, k: 1 },
        collision: { ceilingAt: () => Infinity }, // (open sky)
        fire: { douseWhere: (reached, out) => { calls.push('fire'); return reached(3, 5, 3) ? 1 : 0; } },
        burning: { douseWhere: (hit) => { calls.push('burn'); return hit({ x: 2, y: 5, z: 2 }, 0.6) ? 1 : 0; } },
        campfires: { list: new Map([[1, { x: 4, y: 5, z: 4 }]]), _out: (cf) => calls.push('campfire' + cf.x) },
        livingTrees: { list: [{ burnT: 3, phase: 'live', model: { position: { x: 5, y: 5, z: 5 } } }] },
        ships: { douse: () => 0 }, carriages: { douse: () => 0 },
        spells: { spells: [{ kind: 'Inferno', life: 3, by: 'x', flame: { len: 12, o: { x: 1, y: 5, z: 1 }, d: { x: 1, y: 0, z: 0 } } }] },
        vortex: { effects: [{ kind: 'fire', bloomed: true, p: { x: 3, y: 5, z: 3 }, o: { x: 0, y: 5, z: 0 }, t: 1, travel: 1 }] },
        hellfire: { douse: (hit, dt) => { calls.push('hellfire'); return hit({ x: 1, y: 5, z: 1 }, 3) && dt > 0; } },
        fireSerpent: { douse: (hit, dt) => { calls.push('serpent'); return hit({ x: 1, y: 5, z: 1 }, 3) && dt > 0; } },
        space: {}, ...over,
    };
    return g;
}

test('под открытым небом дождь тушит всё: деревья/блоки, горящих, костёр, живое дерево, Инферно, Fire Maxima, адский огонь, змея', () => {
    const g = fakeGame(); const R = new RainDouse(g);
    R.players();
    const n = R.pass(0.5);
    assert.ok(n >= 8, 'потушено: ' + n);
    assert.ok(g.calls.includes('campfire4') && g.calls.includes('hellfire') && g.calls.includes('serpent'));
    assert.equal(g.spells.spells[0].life, 0, 'Инферно погасло');
    assert.equal(g.vortex.effects.length, 0, 'Fire Maxima погасла');
    assert.equal(g.livingTrees.list[0].burnT, 0);
});

test('под крышей дождь не достаёт', () => {
    const g = fakeGame({ collision: { ceilingAt: () => 7 } }); // крыша над головой
    const R = new RainDouse(g); R.players();
    assert.equal(R.reaches(2, 5, 2), false);
    assert.equal(R.reaches(2, null, 2), true, 'дерево стоит под открытым небом по своей природе');
});

test('в аду дождь кровавый — не тушит ничего (решает место огня)', () => {
    const g = fakeGame({ character: { group: { position: { x: HELL.X0 ?? 470000, y: 5, z: 0 } } }, hellGate: { inHell: true } });
    const R = new RainDouse(g); R.players();
    const hx = g.character.group.position.x;
    assert.equal(R.reaches(hx, 5, 0), false, 'огонь в аду горит');
    assert.equal(R.reaches(hx + 1, null, 3), false);
});

test('слабая или не идущая гроза не тушит; далеко от игроков — не трогаем', () => {
    const g = fakeGame({ storm: { raining: true, k: RAIN.MIN_K - 0.1 } }); const R = new RainDouse(g);
    R.update(1); assert.equal(g.calls.length, 0, 'тучи только собираются');
    const g2 = fakeGame({ storm: { raining: false, k: 1 } }); const R2 = new RainDouse(g2);
    R2.update(1); assert.equal(g2.calls.length, 0, 'дождя нет');
    const g3 = fakeGame(); const R3 = new RainDouse(g3); R3.players();
    assert.equal(R3.reaches(RAIN.R + 50, 5, 0), false);
});

test('таблица «кто/что» и подключение', () => {
    for (const [k, v] of Object.entries(RAIN_TARGETS)) assert.ok(v.does && v.why.length > 8, k);
    const game = src('src/game/Game.js'), storm = src('src/fx/Storm.js');
    assert.match(game, /this\.rainFx = new RainSummon\(this\)/);
    assert.match(game, /this\.rainDouse = new RainDouse\(this\)/);
    assert.match(game, /this\.rainDouse\?\.update\(dt\)/);
    assert.match(game, /rain: \(o, casterId, side\) =>/);
    assert.match(storm, /blood \? 0xb01418/);
});
