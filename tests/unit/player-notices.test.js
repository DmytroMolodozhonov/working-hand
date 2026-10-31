// Уведомления слева внизу: подключился / отключился (с задержкой) / умер; список игроков не рисуется в живой игре.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PlayerPresence, NoticeQueue, noticeText, PRESENCE } from '../../src/net/PlayerPresence.js';
import { playersHtml, linkOf } from '../../src/ui/PlayersTab.js';

const enter = (pr, id, name, t = 0) => {
    pr.setList([...pr.byId.values(), { id, name }].map((e) => ({ id: e.id ?? id, name: e.name })), 'H', t);
    pr.gotLook(id); pr.markReady(id); pr.gotPose(id, { s: { p: [1, 2, 3] } });
    return pr.shown(id, t);
};

test('тексты уведомлений', () => {
    assert.equal(noticeText({ kind: 'join', name: 'Аня' }), 'Игрок Аня подключился');
    assert.equal(noticeText({ kind: 'leave', name: 'Аня' }), 'Игрок Аня отключился');
    assert.equal(noticeText({ kind: 'death', name: 'Аня' }), 'Аня умер');
});

test('«отключился» приходит не раньше задержки; ушёл и вернулся с тем же ником — тишина', () => {
    const pr = new PlayerPresence();
    assert.equal(enter(pr, 'a', 'Аня', 0).notice.kind, 'join');
    pr.setList([], 'H', 1000);
    assert.deepEqual(pr.due(1000 + PRESENCE.LEAVE_HOLD - 1), []);
    // вернулся (новый id, тот же ник) до конца ожидания
    const r = enter(pr, 'b', 'Аня', 3000);
    assert.equal(r.notice, null);
    assert.deepEqual(pr.due(99999), []);
});

test('«отключился» приходит один раз', () => {
    const pr = new PlayerPresence();
    enter(pr, 'a', 'Аня', 0);
    pr.setList([], 'H', 1000);
    const d = pr.due(1000 + PRESENCE.LEAVE_HOLD);
    assert.deepEqual(d.map((n) => n.kind), ['leave']);
    assert.deepEqual(pr.due(99999), []);
});

test('двое заходят одновременно, десять игроков: каждому свой «подключился»', () => {
    const pr = new PlayerPresence();
    const ids = Array.from({ length: 9 }, (_, i) => ({ id: 'g' + i, name: 'И' + i }));
    pr.setList(ids, 'H', 0);
    let n = 0;
    for (const p of ids) { pr.gotLook(p.id); pr.markReady(p.id); pr.gotPose(p.id, { s: { p: [0, 1, 2] } }); if (pr.shown(p.id, 0)?.notice) n++; }
    assert.equal(n, 9);
});

test('хост вышел: все игроки исчезают из списка и получают «отключился» по одному разу', () => {
    const pr = new PlayerPresence();
    pr.setList([{ id: 'H', name: 'Хост' }], 'g1', 0);
    pr.gotLook('H'); pr.markReady('H'); pr.gotPose('H', { s: { p: [1, 2, 3] } }); pr.shown('H', 0);
    pr.setList([], 'g1', 100);
    assert.deepEqual(pr.due(100 + PRESENCE.LEAVE_HOLD).map((x) => x.name), ['Хост']);
});

test('смена имени обновляет запись, не создаёт нового игрока', () => {
    const pr = new PlayerPresence();
    pr.setList([{ id: 'a', name: 'Аня' }], 'H', 0);
    pr.setList([{ id: 'a', name: 'Аня 2' }], 'H', 1);
    assert.equal(pr.byId.size, 1);
    assert.equal(pr.byId.get('a').name, 'Аня 2');
});

test('очередь: не больше 4, старые уходят, через 5 с гаснут', () => {
    const q = new NoticeQueue();
    for (let i = 0; i < 6; i++) q.add({ kind: 'join', name: 'И' + i }, i);
    assert.equal(q.live(6).length, 4);
    assert.equal(q.items[0].name, 'И2');
    assert.equal(q.live(PRESENCE.SHOW_MS + 2).length, 3); // (the one added at 2 is gone; 3,4,5 stay)
    assert.equal(q.live(1e9).length, 0);
});

test('вкладка «Игроки»: заходит… и значки голоса', () => {
    const html = playersHtml({ voice: 'Весь мир', rows: [
        { id: 'H', me: true, name: 'Я', color: 0xe67e22, role: 'хост', link: null, loading: false, voice: { kind: 'me', speaking: true } },
        { id: 'a', me: false, name: 'Аня', color: 0x9b59b6, role: 'гость', link: { text: 'хорошая (40 мс)', cls: 'ok' }, loading: false, voice: { kind: 'peer', hears: true, speaking: true } },
        { id: 'b', me: false, name: 'Боря', color: 0x1abc9c, role: 'гость', link: null, loading: true, voice: { kind: 'peer', hears: false, speaking: false } },
    ] });
    assert.match(html, /заходит…/);
    assert.match(html, /🔊/);
    assert.match(html, /🔇/);
    assert.match(html, /Я<\/span>|Я \(вы\)/);
    assert.equal(playersHtml({ rows: [], voice: null }).includes('один'), true);
    assert.equal(linkOf({ age: 9000, maxGap: 0 }).cls, 'bad');
    assert.equal(linkOf({ age: 50, maxGap: 100 }).cls, 'ok');
});

test('имена игроков в списке экранируются', () => {
    const html = playersHtml({ voice: null, rows: [{ id: 'a', me: false, name: '<img src=x>', color: 1, role: 'гость', link: null, loading: false, voice: null }] });
    assert.ok(!html.includes('<img'));
});

test('в живой игре список игроков и голосовая плашка не рисуются', () => {
    const hud = fs.readFileSync(new URL('../../src/ui/Hud.js', import.meta.url), 'utf8');
    const sm = hud.slice(hud.indexOf('    setMultiplayer(html) {'), hud.indexOf('/** Terrain for the minimap'));
    assert.ok(!/classList\.remove\('hidden'\)/.test(sm));
    const vc = hud.slice(hud.indexOf('    voiceChat(st) {'), hud.indexOf('    notify('));
    assert.ok(!/createElement/.test(vc));
});
