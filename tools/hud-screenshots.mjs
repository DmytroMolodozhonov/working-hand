// Pictures of the game's own interface over the world (the HUD: health, mana, the hotbar, the minimap, the coins, notices).
// Usage: node tools/hud-screenshots.mjs [--out docs/media] [--mode freeworld|creative] [--name hud]
import { startServer, launch, openPage, startFromMenu, waitHudVisible, sleep } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
const name = arg('--name', 'hud');
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8799)));
const browser = await launch({ viewport: { width: 1440, height: 860 } });
const kill = setTimeout(() => { console.error('timeout'); process.exit(2); }, 420000);
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1440, height: 860 } });
    await startFromMenu(page, arg('--mode', 'freeworld'));
    await waitHudVisible(page, 240000);
    await sleep(6000);
    await page.evaluate(() => {
        const g = window.__zns.game;
        try { g.hud?.notify?.('Вы нашли свиток «Люмос»'); } catch (e) { /* */ }
        try { if (g.player) { g.player.health = Math.max(1, (g.player.maxHealth || 20) * 0.7); } } catch (e) { /* */ }
    });
    await sleep(1200);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    console.log('saved', name);
} finally {
    clearTimeout(kill);
    await browser.close();
    srv.stop?.(); srv.proc?.kill?.();
}
process.exit(0);
