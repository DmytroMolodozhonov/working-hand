// Быстрая загрузка (кеш между запусками): записи, ключи, контрольная сумма, битые записи, предел, «а если…».
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOT, BootCache, encodeRecord, decodeRecord, packTree, unpackTree, cacheKey, stableText, fnv1a, hashText, bootCacheWanted } from '../../src/core/BootCache.js';
import { BootTimer } from '../../src/core/BootTimer.js';

/** A store in memory (as Cache Storage: a record is there whole or not at all). */
function memStore({ failPut = false } = {}) {
    const m = new Map();
    return {
        m,
        async get(n) { const e = m.get(n); return e ? e.buf.slice(0) : null; },
        async put(n, buf, at) { if (failPut) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } m.set(n, { buf, at }); },
        async delete(n) { m.delete(n); },
        async list() { return [...m].map(([name, e]) => ({ name, size: e.buf.byteLength, at: e.at })); },
    };
}

test('запись читается назад бит в бит (типы массивов, мета, порядок)', () => {
    const f = new Float32Array([1.5, -2.25, Math.PI, NaN, Infinity]);
    const u = new Uint16Array([0, 65535, 7]);
    const i8 = new Int8Array([-128, 127, 3]); // (длина не кратна 8: выравнивание)
    const buf = encodeRecord('sound', 'sound/x', { sr: 48000, n: 'a' }, [f, u, i8]);
    const r = decodeRecord(buf, 'sound', 'sound/x');
    assert.ok(r);
    assert.deepEqual(r.meta, { sr: 48000, n: 'a' });
    assert.equal(r.arrays.length, 3);
    assert.ok(r.arrays[0] instanceof Float32Array && r.arrays[1] instanceof Uint16Array && r.arrays[2] instanceof Int8Array);
    assert.deepEqual(new Uint8Array(r.arrays[0].buffer, r.arrays[0].byteOffset, r.arrays[0].byteLength), new Uint8Array(f.buffer));
    assert.deepEqual([...r.arrays[1]], [...u]);
    assert.deepEqual([...r.arrays[2]], [...i8]);
});

test('битая запись не читается: любой байт, обрезка, чужой вид/ключ, чужой формат', () => {
    const buf = encodeRecord('icon', 'icon/a', { k: 1 }, [new Uint8Array(1003).map((_, i) => i * 7)]); // (1003: the record ends in padding)
    for (const at of [3, 9, 12, 20, 40, buf.byteLength - 1, buf.byteLength - 3, buf.byteLength >> 1]) {
        const b = buf.slice(0);
        new Uint8Array(b)[at] ^= 0x10;
        assert.equal(decodeRecord(b, 'icon', 'icon/a'), null, 'испорчен байт ' + at);
    }
    assert.equal(decodeRecord(buf.slice(0, buf.byteLength - 8), 'icon', 'icon/a'), null, 'обрезана');
    assert.equal(decodeRecord(buf.slice(0, 10), 'icon', 'icon/a'), null);
    assert.equal(decodeRecord(new ArrayBuffer(0), 'icon', 'icon/a'), null);
    assert.equal(decodeRecord(buf, 'sound', 'icon/a'), null, 'чужой вид');
    assert.equal(decodeRecord(buf, 'icon', 'icon/b'), null, 'чужой ключ');
    const old = buf.slice(0); new DataView(old).setUint32(4, BOOT.FORMAT + 1, true);
    assert.equal(decodeRecord(old, 'icon', 'icon/a'), null, 'другой формат записи');
    assert.equal(decodeRecord('строка', 'icon', 'icon/a'), null);
    assert.ok(decodeRecord(buf, 'icon', 'icon/a'));
});

test('дерево с массивами: туда и обратно', () => {
    const t = { lods: [{ body: { pos: new Float32Array([1, 2, 3]), idx: new Uint32Array([0, 1, 2]) }, head: null }], rest: [new Float32Array(16).fill(1)], n: 3, s: 'x' };
    const p = packTree(t);
    const buf = encodeRecord('icon', 'icon/v1', p.json, p.arrays);
    const r = decodeRecord(buf, 'icon', 'icon/v1');
    const back = unpackTree(r.meta, r.arrays);
    assert.deepEqual([...back.lods[0].body.pos], [1, 2, 3]);
    assert.ok(back.lods[0].body.idx instanceof Uint32Array);
    assert.equal(back.lods[0].head, null);
    assert.equal(back.rest[0].length, 16);
    assert.equal(back.n, 3);
    assert.equal(unpackTree({ a: { $ta: 5, t: 'Float32Array' } }, []), null, 'нет массива — не читать');
    assert.equal(unpackTree({ a: { $ta: 0, t: 'Uint8Array' } }, [new Float32Array(1)]), null, 'другой тип — не читать');
});

test('ключ: одни входы — один ключ, порядок полей не важен, другое число — другой ключ', () => {
    assert.equal(cacheKey('sound', { a: 1, b: [2, 3] }), cacheKey('sound', { b: [2, 3], a: 1 }));
    assert.notEqual(cacheKey('sound', { a: 1 }), cacheKey('sound', { a: 2 }));
    assert.notEqual(cacheKey('sound', { a: 1 }), cacheKey('icon', { a: 1 }));
    assert.equal(stableText({ z: 1, a: { y: 2, b: 3 } }), '{"a":{"b":3,"y":2},"z":1}');
    assert.equal(hashText('abc').length, 16);
    assert.equal(fnv1a(new Uint8Array([])), 0x811c9dc5);
});

test('кеш: промах → запись → попадание; битая запись удаляется и считается заново', async () => {
    const st = memStore();
    const c = new BootCache({ store: st });
    assert.equal(await c.getTree('sound', 'sound/k'), null);
    assert.equal(await c.putTree('sound', 'sound/k', { sr: 44100, list: [{ k: 'a', ch: [new Float32Array([0.5, -0.5])] }] }), true);
    const t = await c.getTree('sound', 'sound/k');
    assert.deepEqual([...t.list[0].ch[0]], [0.5, -0.5]);
    // (повреждённый файл на диске)
    const e = st.m.get('sound/k@0'); new Uint8Array(e.buf)[e.buf.byteLength - 2] ^= 1;
    assert.equal(await c.getTree('sound', 'sound/k'), null);
    assert.equal(st.m.has('sound/k@0'), false, 'битая запись удалена');
    assert.equal(c.stats.sound.bad, 1);
    assert.match(c.line(), /звуки 1 из кеша \/ 2 заново \(1 битых\)/);
});

test('а если диск полный / только чтение: запись не удалась — дальше без записи, игра идёт', async () => {
    const logs = [];
    const c = new BootCache({ store: memStore({ failPut: true }), log: (s) => logs.push(s) });
    assert.equal(await c.put('icon', 'icon/a', null, [new Uint8Array(4)]), false);
    assert.equal(c.writable, false);
    assert.equal(await c.put('icon', 'icon/b', null, [new Uint8Array(4)]), false);
    assert.equal(logs.length, 1, 'сказано один раз');
    assert.match(c.line(), /запись не удалась/);
});

test('а если хранилища нет / кеш выключен: ничего не читает и не пишет', async () => {
    const off = new BootCache({ store: memStore(), enabled: false });
    assert.equal(off.enabled, false);
    assert.equal(await off.put('icon', 'icon/a', null, []), false);
    assert.equal(await off.get('icon', 'icon/a'), null);
    const none = new BootCache({ store: null });
    assert.equal(none.enabled, false);
    assert.match(none.line(), /нет хранилища/);
    // (хранилище бросает при чтении — промах, не падение)
    const bad = new BootCache({ store: { get: async () => { throw new Error('io'); }, put: async () => {}, delete: async () => {}, list: async () => [] } });
    assert.equal(await bad.get('sound', 'sound/x'), null);
});

test('предел размера: старые записи уходят первыми', async () => {
    let now = 0;
    const st = memStore();
    const c = new BootCache({ store: st, maxBytes: 3000, now: () => ++now });
    for (const k of ['a', 'b', 'c', 'd']) await c.put('icon', 'icon/' + k, null, [new Uint8Array(1000)]);
    await c.trim();
    const left = [...st.m.keys()];
    assert.ok(!left.includes('icon/a@0') && !left.includes('icon/b@0'), 'старые удалены: ' + left);
    assert.ok(left.includes('icon/d@0'));
    const total = (await st.list()).reduce((a, r) => a + r.size, 0);
    assert.ok(total <= 3000);
});

test('выключатель: настройка «0» и параметр запуска --no-cache', () => {
    assert.equal(bootCacheWanted(null, ''), true);
    assert.equal(bootCacheWanted('1', '?x=1'), true);
    assert.equal(bootCacheWanted('0', ''), false);
    assert.equal(bootCacheWanted(null, '?nocache'), false);
    assert.equal(bootCacheWanted(null, '?app=1&no-cache=1'), false);
    assert.equal(bootCacheWanted(null, '?nocacheX=1'), true);
});

test('таймер этапов загрузки: строка в журнал', () => {
    let t = 0;
    const B = new BootTimer(() => t);
    B.begin('звуки'); t = 1500; B.end('звуки');
    B.begin('мир'); B.begin('камера (параллельно)'); B.begin('· мелочь'); t = 1600; B.end('· мелочь'); t = 4000; B.end('мир'); B.end('камера (параллельно)');
    B.begin('крошка'); t = 4100; B.end('крошка');
    B.note('готово');
    assert.equal(B.line(), '⏱ загрузка 4,1 с: звуки 1,5 · мир 2,5 · камера∥ 2,5 | готово');
    assert.equal(B.end('нет такого'), 0);
    B.reset();
    assert.equal(B.rows.length, 0);
});

test('обновление игры: стирается только тот вид, чей код изменился; старая версия записи удаляется', async () => {
    const st = memStore();
    const v1 = new BootCache({ store: st, build: 'b1', kinds: { sound: 's1', icon: 'r1' } });
    await v1.put('sound', 'sound/w', null, [new Uint8Array(8)]);
    await v1.put('icon', 'icon/v1', null, [new Uint8Array(8)]);
    // (обновление: изменились файлы звуков и что-то ещё в игре, этот вид — нет)
    const v2 = new BootCache({ store: st, build: 'b2', kinds: { sound: 's2', icon: 'r1' } });
    assert.equal(await v2.get('sound', 'sound/w'), null, 'код звуков другой — заново');
    assert.ok(await v2.get('icon', 'icon/v1'), 'код вида тот же — из кеша');
    await v2.put('sound', 'sound/w', null, [new Uint8Array(8)]);
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(st.m.has('sound/w@s2') && !st.m.has('sound/w@s1'), 'старая версия записи удалена: ' + [...st.m.keys()]);
});
