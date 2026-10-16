// Screenshots of the book and the scroll in the hands (docs/items/books), driven by synthetic camera
// poses: the closed book in a fist, opened by both hands, open in one hand with a page lifted by the
// free fingertip, and a scroll unrolled between the hands (BookReading.js, ScrollReading.js).
// Usage: node tools/book-screenshots.mjs [--out docs/items/books] [--port 8792]
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from '../tests/e2e/harness.mjs';
import { frame } from '../tests/e2e/poses.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/items/books'));
const port = Number(arg('--port', 8792));
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const browser = await launch();
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 800, height: 600 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const feed = async (o, n = 20) => {
        for (let i = 0; i < n; i++) {
            const f = frame({ arms: 'forward', palmsIn: true, ...o });
            await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, f);
            await new Promise((r) => setTimeout(r, 40));
        }
    };
    const shot = async (name) => {
        const url = await page.evaluate(() => {
            const g = window.__zns.game;
            g.renderer.render(g.scene, g.camera);
            return g.renderer.domElement.toDataURL('image/png');
        });
        const file = path.join(out, name + '.png');
        fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
        console.log('→', file);
    };
    const state = () => page.evaluate(() => { const R = window.__zns.game.books.reading; return { mode: R.s?.mode || null, phi: R.s?.phi, sheet: R.s?.sheet?.beta ?? null, scroll: !!window.__zns.game.scrolls.r }; });
    await page.evaluate(() => { const g = window.__zns.game; g.dayStart = Date.now() - 24 * 60 * 1000 * 0.3; });

    // 1) the closed book in the right fist; the left hand open beside it
    await feed({ rightCurl: 0.9, leftCurl: 0, wristOffset: [-0.1, 0] }, 10);
    await page.evaluate(() => window.__zns.game.items._gotItem({ kind: 'book', uid: 'shot-bk', id: 4243, spells: ['CreateWall', 'Gather'] }, 'right'));
    await feed({ rightCurl: 0.9, leftCurl: 0, wristOffset: [-0.1, 0] });
    await shot('1-closed-in-fist');
    // 2) the left hand closes on the edge, the hands apart: open as far as they are apart
    await feed({ rightCurl: 0.9, leftCurl: 0.9, wristOffset: [-0.1, 0] });
    await feed({ rightCurl: 0.9, leftCurl: 0.9, wristOffset: [-0.05, 0] });
    console.log('two hands:', await state());
    await shot('2-two-hands-half-open');
    await feed({ rightCurl: 0.9, leftCurl: 0.9, wristOffset: [0.02, 0] });
    console.log('two hands wider:', await state());
    await shot('3-two-hands-open');
    // 3) the right hand opens: the book stays open in the left; the right fingertip lifts a page by its edge
    await feed({ rightCurl: 0, leftCurl: 0.9, wristOffset: [0.02, 0] });
    console.log('one hand:', await state());
    await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, R = g.books.reading, s = R.s;
        if (!s) return;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); };
        const real = (side) => { const i = R.input; R.input = null; const h = R._hand(side); R.input = i; return h; };
        let tip = null;
        R.input = (side) => { const h = real(side); if (side !== s.owner) h.tip = tip; return h; };
        const m = s.model, W = 0.42, Tt = 0.06;
        const round = (a) => m.localToWorld(new T.Vector3(Math.cos(a) * W * 0.9, 0, Tt + Math.sin(a) * W * 0.9));
        const a0 = Math.PI / 2 - s.phi / 2 + 0.02;
        tip = round(a0);
        await frames(10);
        for (let i = 0; i <= 25; i++) { tip = round(a0 + (i / 25) * (Math.PI / 2 - 0.15 - a0)); await frames(1); }
    });
    console.log('page lifted:', await state());
    await shot('4-page-lifted-by-finger');
    await page.evaluate(() => { const R = window.__zns.game.books.reading; R.input = null; });
    await feed({ rightCurl: 0, leftCurl: 0.9, wristOffset: [0.02, 0] }, 30);
    // 4) a scroll: the book away, a scroll in the right fist; the left hand comes open to its end, closes, pulls
    await page.evaluate(() => { const g = window.__zns.game; g.items.releaseHand('left'); g.items.releaseHand('right'); });
    await feed({ rightCurl: 0.9, leftCurl: 0, wristOffset: [-0.1, 0] }, 10);
    await page.evaluate(() => window.__zns.game.items._gotItem({ kind: 'scroll', uid: 'shot-sc', stat: 'hp', amount: 2 }, 'right'));
    await feed({ rightCurl: 0.9, leftCurl: 0, wristOffset: [-0.1, 0] });
    await feed({ rightCurl: 0.9, leftCurl: 0.9, wristOffset: [-0.1, 0] });
    for (const [wo, name] of [[-0.04, '5-scroll-half-unrolled'], [0.02, '6-scroll-unrolled']]) {
        await feed({ rightCurl: 0.9, leftCurl: 0.9, wristOffset: [wo, 0] });
        console.log(name, await page.evaluate(() => { const r = window.__zns.game.scrolls.r; return r ? { w: +r.parch.scale.x.toFixed(2), open: +r.open.toFixed(2) } : null; }));
        await shot(name);
    }
} finally {
    await browser.close();
    srv.stop();
}
