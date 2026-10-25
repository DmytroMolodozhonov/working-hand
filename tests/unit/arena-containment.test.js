import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaDuels } from '../../src/game/ArenaDuels.js';
import { onArenaFloor } from '../../src/world/DuelArenas.js';

function setup() {
    const position = { x: 30, y: -5, z: 0 };
    const grounded = [];
    const game = {
        character: { group: { position }, verticalVelocity: -8, airTop: 20, landing: {} },
        castleLife: { _ground(v) { grounded.push(v); v.y = 5; } },
        knockback: { set() {} }, knock: { reset() {} },
    };
    const A = { id: 'arena', def: { axis: { a: { x: 0, z: -13 }, b: { x: 0, z: 13 }, r: 13 } } };
    const d = Object.assign(Object.create(ArenaDuels.prototype), { game, _last: { x: 0, y: 7, z: 0 }, list: new Map([['arena', A]]) });
    return { position, grounded, game, A, d };
}

test('удержание NPC на арене не перемещает игрока с низкой земли под арену', () => {
    const { d, A, position, grounded } = setup();
    const npc = { x: 30, y: 20, z: 0, path: ['old'] };
    d._keepNpcOnFloor(A, npc);
    assert.deepEqual(position, { x: 30, y: -5, z: 0 });
    assert.ok(onArenaFloor(A.def, npc.x, npc.z, 1));
    assert.equal(npc.path, null);
    assert.equal(npc.y, 5);
    assert.deepEqual(grounded, [npc]);
});

test('граница арены возвращает игрока на последнюю высоту, без накопленного падения', () => {
    const { d, A, position, game } = setup();
    d._keepPlayerOnFloor(A);
    assert.deepEqual(position, { x: 0, y: 7, z: 0 });
    assert.equal(game.character.verticalVelocity, 0);
    assert.equal(game.character.airTop, null);
    assert.equal(game.character.landing, null);
});

test('гость в мультиплеере возвращается на последнюю высоту внутри арены', () => {
    const { d, position } = setup();
    d.mode = { arenaId: 'arena', said: true };
    d.my = { role: 'friend' };
    d._friendClient(0.05);
    assert.deepEqual(position, { x: 0, y: 7, z: 0 });
});

test('разрушенный пол внутри арены не заменяется невидимой фиксированной высотой', () => {
    const { d, A, position, game } = setup();
    position.x = 1; position.y = -3;
    d._keepPlayerOnFloor(A);
    assert.equal(position.y, -3);
    assert.equal(game.character.verticalVelocity, -8);
    position.x = 30; position.y = -20;
    d._keepPlayerOnFloor(A);
    assert.deepEqual(position, { x: 1, y: -3, z: 0 });
});