// Screenshots of the chests (docs/items/chests): each look (Chest.js styles) shut and open, side by side,
// and one open chest from above — its inside.
// Usage: node tools/chest-screenshots.mjs [--prefix new-] [--out docs/items/chests] [--port 8792]
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/items/chests'));
const prefix = arg('--prefix', '');
const port = Number(arg('--port', 8792));
const W = 1000, H = 640;
fs.mkdirSync(out, { recursive: true });

const srv = await startServer(port);
const browser = await launch();
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: W, height: H } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(async () => {
        const g = window.__zns.game, THREE = window.__zns.THREE;
        const { Chest } = await import('/src/entities/Chest.js');
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); };
        const orig = g._updateCamera.bind(g);
        g._updateCamera = (dt) => {
            orig(dt);
            const s = window.__shotCam;
            if (s) { g.camera.position.set(...s.cam); g.camera.lookAt(new THREE.Vector3(...s.at)); }
        };
        const cv = g.renderer.domElement;
        for (let el = cv; el && el !== document.body; el = el.parentElement) for (const sib of el.parentElement.children) if (sib !== el) sib.style.visibility = 'hidden';
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.3;
        // a flat stage high over the world, lit by the day
        const G = g.character.group, base = G.position.clone().add(new THREE.Vector3(0, 60, 0));
        const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 0.2, 30), new THREE.MeshPhongMaterial({ color: 0x8a7a66 }));
        floor.position.copy(base).y -= 0.1; floor.receiveShadow = true;
        g.scene.add(floor);
        const styles = ['plain', 'rich', 'pirate', 'ice'];
        const made = [];
        styles.forEach((st, i) => {
            for (const open of [false, true]) {
                const p = base.clone().add(new THREE.Vector3((i - 1.5) * 4.6 + (open ? 1.05 : -1.05), 0, open ? 1.6 : -1.6));
                const c = new Chest(g.scene, p, 'loot', 0, 'shot' + st + open, { style: st, scale: 1.6 });
                if (open) c.setOpenInstant();
                made.push(c);
            }
        });
        window.__h = { g, THREE, frames, base: base.toArray() };
    });
    const shot = async (name, cam, at) => {
        await page.evaluate(([c, a]) => { window.__shotCam = { cam: c, at: a }; }, [cam, at]);
        await page.evaluate(() => window.__h.frames(20));
        const url = await page.evaluate(() => {
            const g = window.__h.g;
            g._updateCamera(0);
            g.renderer.render(g.scene, g.camera);
            return g.renderer.domElement.toDataURL('image/png');
        });
        const file = path.join(out, prefix + name + '.png');
        fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
        console.log('→', file);
    };
    const b = await page.evaluate(() => window.__h.base);
    const at = (x, y, z) => [b[0] + x, b[1] + y, b[2] + z];
    await shot('all', at(0, 5.5, 13), at(0, 0.6, 0));
    await shot('plain', at(-6.9, 3.4, 7.2), at(-6.9, 0.7, 0));
    await shot('rich', at(-2.3, 3.4, 7.2), at(-2.3, 0.7, 0));
    await shot('pirate', at(2.3, 3.4, 7.2), at(2.3, 0.7, 0));
    await shot('ice', at(6.9, 3.4, 7.2), at(6.9, 0.7, 0));
    await shot('inside', at(-5.85, 3.6, 4.6), at(-5.85, 0.5, 1.6));
    console.log('page errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
} finally {
    await browser.close();
    srv.stop();
}
