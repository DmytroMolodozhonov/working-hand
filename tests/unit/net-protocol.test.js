// Multiplayer QA (docs/qa/multiplayer-report.md, MP-03): the game's network protocol keeps its shape.
// Found so: NetSync had two methods `ice` (the ice of «Water forming» and the Ice Castle's) — the second took the
// first's place, and the ice built from water was never seen by the other players. Two `case 'ice'` in the
// receiving switch: the second one was never reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../../', import.meta.url);
const src = fs.readFileSync(new URL('src/net/NetSync.js', ROOT), 'utf8');
const cls = src.slice(src.indexOf('export class NetSync'), src.indexOf('function sanitizeConfig'));
const recv = cls.slice(cls.indexOf('_onMessage(m) {'));
const senders = cls.slice(0, cls.indexOf('_onMessage(m) {'));
const cases = [...recv.matchAll(/case '(\w+)'/g)].map((m) => m[1]);

test('NetSync: ни один метод не объявлен дважды (второй молча заменяет первый)', () => {
    const names = [...cls.matchAll(/^ {4}(?:get |async )?([a-zA-Z_]\w*)\s*\([^)]*\)\s*\{/gm)].map((m) => m[1]);
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepEqual(dup, [], `методы объявлены дважды: ${dup.join(', ')}`);
});

test('NetSync: у каждого типа сообщения один обработчик', () => {
    const dup = cases.filter((n, i) => cases.indexOf(n) !== i);
    assert.deepEqual(dup, [], `case объявлен дважды (второй не срабатывает): ${dup.join(', ')}`);
});

test('каждое сообщение, которое игра отправляет, кто-то принимает', () => {
    const known = new Set(cases);
    const sent = new Set([...senders.matchAll(/\bt: '(\w+)'/g)].map((m) => m[1]));
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
    for (const f of walk(new URL('src', ROOT).pathname)) {
        if (f.endsWith('NetSync.js')) continue;
        const t = fs.readFileSync(f, 'utf8');
        for (const m of t.matchAll(/(?:sync\??\.\w+\??\.?\(|net\??\.(?:send|broadcast|sendTo)\([^{]*)\{\s*t:\s*'(\w+)'/g)) sent.add(m[1]);
    }
    // (the network's own: Network.js answers them itself)
    for (const own of ['ping', 'bye', 'players', 'host-left', 'full', 'version', 'info', 'welcome', '_pc', 'pstate']) sent.delete(own);
    const lost = [...sent].filter((t) => !known.has(t));
    assert.deepEqual(lost, [], `сообщения без обработчика: ${lost.join(', ')}`);
});
