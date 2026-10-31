// Вход игрока: аватар появляется только после ready + look + настоящая поза, сразу на своём месте — при любом порядке и потерях пакетов.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PlayerPresence } from '../../src/net/PlayerPresence.js';

const POSE = { t: 'p', id: 'g1', s: { p: [120, 30, -45] } };
const STEPS = {
    list: (pr) => pr.setList([{ id: 'g1', name: 'Аня', color: 2 }], 'H', 0),
    look: (pr) => pr.gotLook('g1'),
    pose: (pr) => pr.gotPose('g1', POSE),
    ready: (pr) => pr.markReady('g1'),
};
const perms = (a) => (a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));

test('любой порядок list/look/pose/ready: аватар можно делать только после всех четырёх, и тогда — на месте позы', () => {
    for (const order of perms(Object.keys(STEPS))) {
        const pr = new PlayerPresence();
        let madeAt = -1;
        order.forEach((k, i) => {
            STEPS[k](pr);
            if (pr.canShow('g1') && madeAt < 0) madeAt = i;
        });
        // pose до ready пропадает — тогда нужна ещё одна поза (они идут 20 раз в секунду)
        if (madeAt < 0) { STEPS.pose(pr); madeAt = order.length; }
        assert.ok(pr.canShow('g1'), order.join('>'));
        assert.deepEqual(pr.byId.get('g1').pose.s.p, [120, 30, -45], order.join('>'));
        const before = order.slice(0, madeAt);
        assert.ok(!(before.length < 3), `${order} слишком рано: ${before}`);
    }
});

test('поза без ready не принимается (гость ещё на экране загрузки, стоит на точке спавна)', () => {
    const pr = new PlayerPresence();
    STEPS.list(pr); STEPS.look(pr);
    pr.gotPose('g1', { s: { p: [0, 0, 0] } });
    assert.equal(pr.byId.get('g1').pose, null);
    assert.ok(!pr.canShow('g1'));
    STEPS.ready(pr);
    assert.ok(!pr.canShow('g1'), 'ready есть, а настоящей позы ещё нет — рисовать нельзя');
    STEPS.pose(pr);
    assert.ok(pr.canShow('g1'));
});

test('битая поза (NaN, мало чисел) аватар не создаёт', () => {
    const pr = new PlayerPresence();
    STEPS.list(pr); STEPS.look(pr); STEPS.ready(pr);
    pr.gotPose('g1', { s: { p: [NaN, 0, 0] } });
    pr.gotPose('g1', { s: { p: [1, 2] } });
    assert.ok(!pr.canShow('g1'));
});

test('сообщения раньше списка игроков не теряются', () => {
    const pr = new PlayerPresence();
    pr.gotLook('g1'); pr.markReady('g1'); pr.gotPose('g1', POSE);
    STEPS.list(pr);
    assert.ok(pr.canShow('g1'));
});

test('ровно один раз: shown() второй раз ничего не даёт', () => {
    const pr = new PlayerPresence();
    for (const k of Object.keys(STEPS)) STEPS[k](pr);
    assert.equal(pr.shown('g1', 0).notice.kind, 'join');
    assert.equal(pr.shown('g1', 0), null);
    assert.ok(!pr.canShow('g1'));
});

test('вышел во время загрузки: ни «подключился», ни «отключился»', () => {
    const pr = new PlayerPresence();
    STEPS.list(pr);
    assert.deepEqual(pr.rows().map((r) => r.loading), [true]);
    pr.setList([], 'H', 10);
    assert.deepEqual(pr.due(99999), []);
});

test('NetSync: аватар из списка игроков не создаётся, поза не уходит до ready (чтение исходника)', () => {
    const src = fs.readFileSync(new URL('../../src/net/NetSync.js', import.meta.url), 'utf8');
    const list = src.slice(src.indexOf('_syncPlayerList(list) {'), src.indexOf('_tryShow(id) {'));
    assert.ok(!/new RemoteAvatar/.test(list), 'список игроков не должен делать аватар');
    const joinFn = src.slice(src.indexOf('    _onJoin('), src.indexOf('    _onLeave('));
    assert.ok(!/new RemoteAvatar/.test(joinFn), 'peer-join не должен делать аватар');
    assert.equal((src.match(/new RemoteAvatar/g) || []).length, 1, 'аватар делается в одном месте — _tryShow');
    assert.match(src, /\$\{?[^]*?\|\| this\._ready\b|&& this\._ready\)/, 'поза уходит только после ready');
});
