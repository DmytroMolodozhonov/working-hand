import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionLog } from '../../src/game/ActionLog.js';

function world() {
    const lines = [];
    const v = { id: 'c:1', name: 'Демьян', title: 'Рыцарь', role: 'knight', x: 10, y: 0, z: 10, yaw: 0, speed: 1.5, mode: 'walk', cmd: { id: 'go_there', kind: 'walk', tx: 30, tz: 10, t: 40, walkT: 3 }, talking: 0, model: { _gest: { id: 'wave_r_soft' }, _lookYaw: 0.3 } };
    const life = { byId: new Map([[v.id, v]]), game: { localId: 'me' }, _playerPos: () => ({ x: 12, z: 10 }), rel: { eff: () => ({ sub: 80, fr: 5, lv: 0 }) } };
    return { lines, v, life, log: new ActionLog(life, (l) => lines.push(l)) };
}

test('a person in dealings is written down: what, where the body and head look, the feeling, the bars', () => {
    const { lines, log } = world();
    log.update(0.6);
    assert.equal(lines.length, 1);
    const l = lines[0];
    assert.match(l, /^действие: Рыцарь Демьян/);
    assert.match(l, /приказ=go_there\/walk/);
    assert.match(l, /цель=\(30, 10\) осталось 20 м/);
    assert.match(l, /голова 17°/);
    assert.match(l, /жест=wave_r_soft/);
    assert.match(l, /подчинение 80/);
});

test('only changes and a heartbeat; the quiet are not written; decisions go at once', () => {
    const { lines, v, log } = world();
    log.update(0.6); log.update(0.6); log.update(0.6);
    assert.equal(lines.length, 1, 'nothing changed');
    v.mode = 'idle';
    log.update(0.6);
    assert.equal(lines.length, 2);
    log.decision(v, 'иду в точку');
    assert.match(lines.at(-1), /^решение: Рыцарь Демьян .* иду в точку/);
    v.cmd = null; v.alogUntil = 0; v.model._gest = null; v.mode = 'idle';
    const n = lines.length;
    for (let i = 0; i < 5; i++) log.update(0.6);
    assert.ok(lines.length <= n + 1, 'a person out of dealings is quiet');
});

test('no more than ten lines a second', () => {
    const { lines, life, log } = world();
    for (let i = 0; i < 40; i++) life.byId.set('x' + i, { id: 'x' + i, name: 'N' + i, role: 'knight', x: 1, z: 1, yaw: 0, mode: 'walk', cmd: { kind: 'walk', t: 9, walkT: 0 }, talking: 0 });
    log.update(0.6);
    assert.ok(lines.length <= 10);
});

test('a person who runs on the spot is written down as «застрял» with the walls and bodies round him', () => {
    const { lines, v, life, log } = world();
    v.cmd = null; v.mode = 'run'; v.speed = 4.4; v.order = { kind: 'leave', dest: { x: 50, z: 10 }, direct: true };
    life._walkable = (x) => x < 10.5; // a wall to the east
    life.byId.set('n1', { id: 'n1', name: 'Ульяна', x: 10.8, z: 10.5, y: 0, dead: false, speed: 0, talking: 0 });
    let clock = 1000; log.now = () => clock;
    for (let i = 0; i < 12; i++) { clock += 600; log.update(0.6); }
    const l = lines.find((x) => x.startsWith('застрял:'));
    assert.ok(l, lines.join('\n'));
    assert.match(l, /Демьян/);
    assert.match(l, /цель приказа «leave» \(50, 10\)/);
    assert.match(l, /непроходимо в 0,9 м: .*В/);
    assert.match(l, /Ульяна 0.9 м \(стоит\)/);
    const n = lines.filter((x) => x.startsWith('застрял:')).length;
    for (let i = 0; i < 6; i++) { clock += 600; log.update(0.6); }
    assert.equal(lines.filter((x) => x.startsWith('застрял:')).length, n, 'not again at once');
});
