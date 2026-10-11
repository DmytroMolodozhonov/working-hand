// Screenshots of every screen (menu tabs, HUD, pause, death) at a desktop size and a small window.
// Usage: node tools/ui-screenshots.mjs <out dir> [port]   (run from the repo root)
import { startServer, launch, openPage, startFromMenu, waitHudVisible, sleep } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] || 'screens');
const port = Number(process.argv[3] || 8765);
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(port);
const browser = await launch();
const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });
try {
    for (const [tag, viewport] of [['desk', { width: 1366, height: 768 }], ['small', { width: 800, height: 560 }]]) {
        const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport });
        await page.waitForSelector('.map-card');
        await sleep(400);
        await shot(page, `${tag}-01-menu`);
        for (const [tab, n] of [['tab-mp', '02-mp'], ['tab-character', '03-character'], ['tab-spells', '04-spells'], ['tab-items', '05-items'], ['tab-settings', '06-settings'], ['tab-editor', '07-editor']]) {
            await page.click(`[data-tab="${tab}"]`);
            await sleep(500);
            await shot(page, `${tag}-${n}`);
        }
        await page.click('[data-tab="tab-mp"]');
        await page.click('#mp-create-open');
        await page.evaluate(() => {
            document.getElementById('mp-server-list').innerHTML = '<div class="mp-server-row sel"><span class="mp-srv-name">Замок Димы</span><span>🌍 Выживание</span><span>3/10</span></div><div class="mp-server-row"><span class="mp-srv-name">Башня магов</span><span>💀 Хардкор</span><span class="mp-full">10/10</span></div>';
        });
        await shot(page, `${tag}-08-mp-list`);
        if (tag === 'desk') {
            await page.click('[data-tab="tab-game"]');
            await startFromMenu(page, 'freeworld');
            await waitHudVisible(page);
            await sleep(1500);
            await page.evaluate(() => { const g = window.__zns.game; g.hud.notify?.('🔑 Код игры: ABCD'); });
            await shot(page, `${tag}-10-hud-freeworld`);
            await page.keyboard.press('Escape');
            await sleep(300);
            await shot(page, `${tag}-11-pause`);
            await page.click('[data-pause-tab="pause-audio"]');
            await sleep(200);
            await shot(page, `${tag}-11b-pause-audio`);
            await page.evaluate(() => { document.getElementById('pause-menu').classList.add('hidden'); document.getElementById('death-screen').classList.remove('hidden'); });
            await shot(page, `${tag}-12-death`);
            await page.evaluate(() => { document.getElementById('death-screen').classList.add('hidden'); document.getElementById('game-over').classList.remove('hidden'); });
            await shot(page, `${tag}-13-game-over`);
            await page.evaluate(() => { document.getElementById('game-over').classList.add('hidden'); const l = document.getElementById('loading'); l.classList.remove('hidden'); l.style.display = 'flex'; document.getElementById('loading-bar-fill').style.width = '62%'; });
            await shot(page, `${tag}-14-loading`);
        }
        console.log(tag, 'errors:', errors.length ? errors.join('\n') : 'none');
        await page.close();
    }
} finally {
    await browser.close();
    srv.stop();
}
