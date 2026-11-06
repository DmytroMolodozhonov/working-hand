// A picture of the magic cursor: both wands big, and small (as in the game) over the menu. Usage: node tools/cursor-screenshot.mjs [--out docs/media/cursor.png]
import { startServer, launch } from '../tests/e2e/harness.mjs';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const srv = await startServer(Number(arg('--port', 8897)));
const browser = await launch();
const guard = setTimeout(() => process.exit(1), 120000);
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(srv.url);
    await page.waitForSelector('#main-menu .tab-btn.active', { state: 'visible', timeout: 60000 }); await page.waitForTimeout(1500);
    await page.evaluate(() => {
        const add = (src, x, y, size) => { const i = document.createElement('img'); i.src = src; i.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size}px;z-index:99999;pointer-events:none`; document.body.appendChild(i); };
        const box = document.createElement('div'); box.style.cssText = 'position:fixed;right:60px;bottom:30px;z-index:99998;width:330px;justify-content:space-around;background:rgba(10,8,30,.92);border:1px solid #6b4fd0;border-radius:14px;padding:14px 18px;display:flex;gap:26px;pointer-events:none;color:#fff;font:14px sans-serif'; box.innerHTML = '<div style="text-align:center">Обычный<br><br><br><br><br><br><br><br><br><br><br><br><br></div><div style="text-align:center">Над кнопкой<br><br><br><br><br><br><br><br><br><br><br><br><br></div>'; document.body.appendChild(box);
        const r = box.getBoundingClientRect();
        add('assets/cursors/wand.svg', r.left + 28, r.top + 44, 128); add('assets/cursors/wand-hover.svg', r.left + 178, r.top + 44, 128);
        // (small, as in the game: the wand over the first button, the golden one over «Продолжить»)
        const b = document.querySelector('#tab-game button, .tab-btn:nth-child(2)'); const br = b.getBoundingClientRect();
        add('assets/cursors/wand-hover.svg', br.left + br.width * 0.55, br.top + br.height * 0.5, 32);
        add('assets/cursors/wand.svg', 560, 300, 32);
    });
    await page.screenshot({ path: path.resolve(arg('--out', 'docs/media/cursor.png')) });
} finally { clearTimeout(guard); await browser.close(); srv.stop?.(); }
process.exit(0);
