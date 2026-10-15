// Screenshots of the coin pouches (docs/items): a pouch close up, a pouch held in the hand (by its
// neck), the pouches on the belt — the plain one and the magic one (CoinBelt.js, ItemTypes.pouchModel).
// Usage: node tools/pouch-screenshots.mjs [--prefix new-] [--only plain,magic] [--out docs/items] [--port 8791]
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from '../tests/e2e/harness.mjs';
import { frame } from '../tests/e2e/poses.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/items'));
const prefix = arg('--prefix', '');
const only = arg('--only', 'plain,magic').split(',').filter(Boolean);
const port = Number(arg('--port', 8791));
const W = 800, H = 600;
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const browser = await launch();
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: W, height: H } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const feed = async (opts, n = 12) => {
        for (let i = 0; i < n; i++) {
            const f = frame(opts);
            await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, f);
            await new Promise((r) => setTimeout(r, 40));
        }
    };
    await page.evaluate(() => {
        const g = window.__zns.game, THREE = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); };
        const orig = g._updateCamera.bind(g);
        g._updateCamera = (dt) => {
            orig(dt);
            const s = window.__shotCam;
            if (s) {
                // (in the hero's own space: +X its right, −Z ahead)
                const G = g.character.group;
                G.updateMatrixWorld(true);
                g.camera.position.copy(new THREE.Vector3(...s.cam).applyMatrix4(G.matrixWorld));
                g.camera.lookAt(new THREE.Vector3(...s.at).applyMatrix4(G.matrixWorld));
            }
        };
        const cv = g.renderer.domElement;
        for (let el = cv; el && el !== document.body; el = el.parentElement) for (const sib of el.parentElement.children) if (sib !== el) sib.style.visibility = 'hidden';
        window.__h = { g, THREE, frames };
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.3;
    });
    const shot = async (name, cam, at) => {
        await page.evaluate(([c, a]) => { window.__shotCam = { cam: c, at: a }; }, [cam, at]);
        await page.evaluate(() => window.__h.frames(20));
        const url = await page.evaluate(() => {
            const g = window.__h.g;
            g.character.group.visible = true;
            g._updateCamera(0);
            g.renderer.render(g.scene, g.camera);
            return g.renderer.domElement.toDataURL('image/png');
        });
        const file = path.join(out, prefix + name + '.png');
        fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
        console.log('→', file);
    };
    for (const kind of only) {
        const magic = kind === 'magic';
        // close up: one pouch hovering in front of the hero
        await page.evaluate((m) => {
            const g = window.__h.g, THREE = window.__h.THREE;
            for (const s of ['left', 'right']) g.items.releaseHand(s);
            const p = g.inventory.purse;
            p.count = 0; if ('magic' in p) p.magic = false;
            if (window.__shown) { g.items.pickUp?.(window.__shown, '#gone', 'right'); }
            const G = g.character.group;
            G.updateMatrixWorld(true);
            const at = new THREE.Vector3(0, 2.6, -2.2).applyMatrix4(G.matrixWorld);
            const L = g.items.spawnLoose({ kind: 'coins', uid: 'shot-' + (m ? 'm' : 'p'), count: 60, magic: m || undefined }, at, { hover: true, broadcast: false });
            window.__shown = L.item.uid;
        }, magic);
        await shot(kind + '-pouch', [0.4, 2.9, -0.9], [0, 2.4, -2.2]);
        await page.evaluate(() => { const g = window.__h.g; if (window.__shown) g.items.pickUp?.(window.__shown, '#gone', 'right'); window.__shown = null; });
        // on the belt (the right hip): the plain one with 250 coins — three pouches; the magic one — one
        await page.evaluate((m) => {
            const p = window.__h.g.inventory.purse;
            p.count = 250; if (m) p.magic = true;
        }, magic);
        await feed({ arms: 'up', rightCurl: 0, leftCurl: 0 }, 10); // (the arms out of the way)
        await shot(kind + '-belt', [2.3, 0.1, -0.9], [0.6, -0.3, 0.05]);
        // in the left hand, by its neck
        await page.evaluate((m) => {
            const g = window.__h.g, p = g.inventory.purse;
            p.count = 0; if ('magic' in p) p.magic = false;
            g.items.takeIntoHand({ kind: 'coins', uid: 'shot-h' + (m ? 'm' : 'p'), count: 80, magic: m || undefined }, 'left');
        }, magic);
        await feed({ arms: 'forward', rightCurl: 0, leftCurl: 0.9 }, 14);
        const hp = await page.evaluate(() => {
            const g = window.__h.g, THREE = window.__h.THREE, G = g.character.group;
            G.updateMatrixWorld(true);
            const w = g.character.getHandWorldPosition('left', new THREE.Vector3());
            return G.worldToLocal(w.clone()).toArray();
        });
        await shot(kind + '-hand', [hp[0] - 1.6, hp[1] + 0.5, hp[2] - 1.9], [hp[0], hp[1] - 0.35, hp[2]]);
        if (process.argv.includes('--close')) {
            await shot(kind + '-hand-close', [hp[0] - 0.9, hp[1] + 0.1, hp[2] - 0.6], [hp[0], hp[1] - 0.25, hp[2]]);
            await shot(kind + '-hand-side', [hp[0] + 0.1, hp[1] + 0.05, hp[2] - 1.1], [hp[0], hp[1] - 0.25, hp[2]]);
            await feed({ arms: 'hang', rightCurl: 0, leftCurl: 0.9 }, 14);
            const hq = await page.evaluate(() => {
                const g = window.__h.g, THREE = window.__h.THREE, G = g.character.group;
                G.updateMatrixWorld(true);
                return G.worldToLocal(g.character.getHandWorldPosition('left', new THREE.Vector3())).toArray();
            });
            await shot(kind + '-hand-hang', [hq[0] - 1.3, hq[1] + 0.1, hq[2] - 0.9], [hq[0], hq[1] - 0.25, hq[2]]);
        }
        await page.evaluate(() => { const g = window.__h.g; for (const s of ['left', 'right']) g.items.releaseHand(s); });
    }
    console.log('page errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
} finally {
    await browser.close();
    srv.stop();
}
