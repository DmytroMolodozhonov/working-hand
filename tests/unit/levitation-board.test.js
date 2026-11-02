// «Вингардиум Левиоса» поднимает водяную доску (сёрф-доску, SurfBoards): жалоба автора «не работает на водяных скейтах».
// Доска — не вещь на земле (`Items.loose`), а своя система: раньше Левиоса её просто не видела среди целей.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Levitation } from '../../src/game/Levitation.js';
import { SurfBoards } from '../../src/game/SurfBoards.js';
import { BoardRegistry } from '../../src/game/BoardRegistry.js';

function setup() {
    const sparks = [];
    const hand = new THREE.Vector3(0, 3, 0), dir = new THREE.Vector3(1, 0, 0);
    const game = {
        weapons: { weapons: [] }, remotes: new Map(), zombies: [], localId: 'me',
        collision: { groundY: () => 0, surfaceY: () => 0, ceilingAt: () => 99, floorAt: () => 0, removeBox() {}, addBox: () => 1 },
        fx: { spark: (...a) => sparks.push(a) },
        character: {
            getHandWorldPosition: (s, o) => o.copy(hand),
            getHandDirection: (s, o) => o.copy(dir),
            getActiveHands: () => ({}),
            getGripObject: () => new THREE.Object3D(),
            group: { position: new THREE.Vector3(0, 0, 0) },
        },
    };
    const boards = Object.create(SurfBoards.prototype);
    Object.assign(boards, { game, reg: new BoardRegistry(), models: new Map(), hold: null, ride: null, fly: null, lev: null, _mineAt: new Map(), remote: new Map(), log: [], simT: 0 });
    game.boards = boards;
    const add = (id, x, st = 'rest') => {
        boards.reg.add({ id, wood: 0, st, p: [x, 1, 0], q: [0, 0, 0, 1] });
        const model = new THREE.Object3D(); model.position.set(x, 1, 0);
        boards.models.set(id, { model, body: null, boxId: null });
    };
    const lev = new Levitation(game);
    return { game, boards, lev, add, hand, dir };
}

test('доска на земле — цель Левиосы; в руках и под ногами — нет', () => {
    const { boards, lev, add } = setup();
    add('b1', 6); add('b2', 8, 'held'); boards.reg.map.get('b2').owner = 'other'; add('b3', 9, 'ridden'); boards.reg.map.get('b3').owner = 'x';
    const ids = lev._candidates().filter((c) => c.kind === 'board').map((c) => c.obj.id);
    assert.deepEqual(ids, ['b1']);
});

test('Левиоса поднимает доску, она идёт за рукой; «стоп» — падает; хозяин — я', () => {
    const { boards, lev, add, hand } = setup();
    add('b1', 6);
    assert.equal(lev.cast(), null);
    assert.equal(lev.state.kind, 'board');
    assert.equal(boards.reg.map.get('b1').owner, 'me');
    assert.ok(boards.netMine(), 'другие игроки видят её в моей позе');
    hand.set(0, 6, 0);
    for (let i = 0; i < 120; i++) lev.update(1 / 60);
    const m = boards.models.get('b1').model;
    assert.ok(m.position.y > 4, 'поднялась за рукой: ' + m.position.y);
    lev.release(false);
    assert.equal(lev.state, null);
    assert.equal(boards.reg.map.get('b1').owner, null);
    assert.equal(boards.reg.map.get('b1').st, 'fall');
    assert.equal(boards.lev, null);
});

test('«Атак»: доска летит вперёд по руке и свободна', () => {
    const { boards, lev, add } = setup();
    add('b1', 6);
    lev.cast();
    assert.equal(lev.attack(), null);
    const b = boards.reg.map.get('b1');
    assert.equal(lev.state, null);
    assert.equal(b.st, 'fall');
    assert.ok(b.v[0] > 10, 'скорость вперёд: ' + b.v);
});

test('доску убрали/забрали, пока она поднята — заклинание заканчивается, ничего не висит', () => {
    const { boards, lev, add } = setup();
    add('b1', 6);
    lev.cast();
    boards.remove('b1');
    lev.update(1 / 60);
    assert.equal(lev.state, null);
    assert.equal(boards.lev, null);
});

test('смерть/полёт (dropAll) отпускает доску', () => {
    const { boards, lev, add } = setup();
    add('b1', 6);
    lev.cast();
    boards.dropAll('dead');
    assert.equal(boards.reg.map.get('b1').owner, null);
    lev.update(1 / 60);
    assert.equal(lev.state, null);
});

test('занятая доска не поднимается второй раз', () => {
    const { boards, lev, add } = setup();
    add('b1', 6);
    lev.cast(); lev.release(true);
    boards.reg.map.get('b1').owner = 'other';
    assert.ok(boards.levStart('b1') === false);
});
