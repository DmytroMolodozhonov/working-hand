/**
 * Настройки → «Журнал» → пункт «Общие логи» (одна вкладка, тот же список): галочки и поиск видны только у этого пункта.
 * Run: node --test tests/e2e/journal-all-logs.test.mjs   (снимок: ZNS_SHOT=1)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8193;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('журнал: один пункт «Общие логи» — настоящий файл zns-all.log, он первый (автор 19.11: пустой «живой» пункт убран)', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await page.click('.tab-btn[data-tab="tab-settings"]');
    await page.click('.sub-tab[data-sub="set-log"]');
    await page.waitForFunction(() => document.querySelectorAll('#log-file option').length > 0);
    const opts = await page.$$eval('#log-file option', (o) => o.map((x) => ({ v: x.value, t: x.textContent })));
    assert.ok(!opts.some((o) => o.v === '__all'), 'пустого «живого» пункта нет');
    assert.equal(opts.filter((o) => /Общие логи/.test(o.t)).length, 1, 'пункт «Общие логи» один');
    assert.equal(opts[0].v, 'zns-all.log', 'и он первый');
    await page.click('.sub-tab[data-sub="set-view"]');
    assert.deepEqual(realErrors(errors), []);
});
