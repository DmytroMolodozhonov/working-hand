// Быстрая загрузка: кеш на диске в настоящем браузере (Cache Storage профиля, который живёт между запусками).
// Запись → новый запуск браузера с тем же профилем → чтение; битая запись → промах; чужая сборка удаляется; ?nocache — выключен.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, launch, openPage } from './harness.mjs';

test('кеш загрузки живёт между запусками браузера и не отдаёт битое', { timeout: 240000 }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zns-bootcache-'));
    const srv = await startServer(8700 + Math.floor(Math.random() * 100));
    const open = async (query = '') => {
        const browser = await launch({ userDataDir: dir, viewport: { width: 640, height: 360 } });
        const { page } = await openPage(browser, srv.url + query, { noCamera: true, viewport: { width: 640, height: 360 } });
        return { browser, page };
    };
    try {
        // 1) первый запуск: пишем запись (и чужую сборку — её должно удалить)
        let { browser, page } = await open();
        const first = await page.evaluate(async () => {
            const m = await import('/src/core/BootCache.js');
            await caches.open('zns-boot-0000000000000000'); // (кеш другой сборки)
            const c = await m.initBootCache();
            const ok = await c.putTree('sound', 'sound/test', { sr: 48000, list: [{ k: 'a', ch: [new Float32Array([0.25, -1, 3.5])] }] });
            await new Promise((r) => setTimeout(r, 300));
            return { enabled: c.enabled, ok, caches: await caches.keys(), line: c.line() };
        });
        assert.equal(first.enabled, true, first.line);
        assert.equal(first.ok, true);
        assert.ok(!first.caches.includes('zns-boot-0000000000000000'), 'кеш чужой сборки удалён: ' + first.caches);
        await browser.close();

        // 2) второй запуск: запись на месте, байты те же
        ({ browser, page } = await open());
        const second = await page.evaluate(async () => {
            const m = await import('/src/core/BootCache.js');
            const c = await m.initBootCache();
            const t = await c.getTree('sound', 'sound/test');
            // (испортим запись на диске: должна не прочитаться и удалиться)
            const name = (await caches.keys()).find((k) => k.startsWith('zns-boot-'));
            const cc = await caches.open(name);
            const r = await cc.match('/__zns-boot/sound/test');
            const buf = await r.arrayBuffer();
            new Uint8Array(buf)[buf.byteLength - 3] ^= 0xff;
            await cc.put('/__zns-boot/sound/test', new Response(buf));
            const bad = await c.getTree('sound', 'sound/test');
            await new Promise((r2) => setTimeout(r2, 200));
            const gone = !(await cc.match('/__zns-boot/sound/test'));
            return { got: t && Array.from(t.list[0].ch[0]), bad, gone, line: c.line() };
        });
        assert.deepEqual(second.got, [0.25, -1, 3.5]);
        assert.equal(second.bad, null, 'битая запись не отдана');
        assert.equal(second.gone, true, 'битая запись удалена');
        await browser.close();

        // 3) запуск с --no-cache: кеш выключен
        ({ browser, page } = await open('?nocache=1'));
        const off = await page.evaluate(async () => { const m = await import('/src/core/BootCache.js'); const c = await m.initBootCache(); return { enabled: c.enabled, line: c.line() }; });
        assert.equal(off.enabled, false);
        assert.match(off.line, /выключен/);
        await browser.close();
    } finally {
        srv.stop();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
