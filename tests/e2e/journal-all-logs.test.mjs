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

test('«Общие логи» — пункт списка журнала; дополнительные элементы только у него', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await page.click('.tab-btn[data-tab="tab-settings"]');
    assert.equal(await page.locator('[data-sub="set-alllog"]').count(), 0, 'отдельной подвкладки нет');
    await page.click('.sub-tab[data-sub="set-log"]');
    await page.waitForFunction(() => document.querySelectorAll('#log-file option').length > 0);
    const opts = await page.$$eval('#log-file option', (o) => o.map((x) => x.textContent));
    assert.equal(opts[0], 'Общие логи');
    // пустой журнал не ломает
    await page.selectOption('#log-file', '__all');
    assert.ok(await page.isVisible('#alllog-tools'));
    // записи видны, галочки тегов появились
    await page.evaluate(async () => {
        const m = await import('/src/core/AllLog.js');
        m.allLog('Руки', 'правая: поднята'); m.allLog('Ошибки', 'TypeError: x', 'error');
    });
    await page.click('#log-refresh');
    assert.match(await page.textContent('#log-text'), /правая: поднята/);
    assert.ok((await page.$$('#alllog-tags input')).length >= 2);
    await page.fill('#alllog-search', 'TypeError');
    assert.doesNotMatch(await page.textContent('#log-text'), /правая: поднята/);
    if (process.env.ZNS_SHOT) await page.screenshot({ path: 'docs/media/journal-all-logs.png', clip: { x: 0, y: 0, width: 1280, height: 720 } });
    // смена пункта скрывает
    const other = opts.length > 1 ? await page.$eval('#log-file option:nth-child(2)', (o) => o.value) : null;
    if (other) {
        await page.selectOption('#log-file', other);
        assert.ok(!(await page.isVisible('#alllog-tools')));
        assert.doesNotMatch(await page.textContent('#log-text'), /правая: поднята/);
    }
    // и обратно, и уход на другую подвкладку
    await page.selectOption('#log-file', '__all');
    assert.ok(await page.isVisible('#alllog-tools'));
    await page.click('.sub-tab[data-sub="set-view"]');
    assert.deepEqual(realErrors(errors), []);
});
