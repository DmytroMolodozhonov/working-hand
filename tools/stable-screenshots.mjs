// Creative's riding test ground (Animals.creativeStable): two horses and the Pegasus by an apple tree, left of the start.
// Pictures + a quick check: one apple → on the horse → it carries you; the Pegasus: one apple → on → a slap → he flies.
// Usage: node tools/stable-screenshots.mjs [--out docs/media]
import { startServer, launch, openPage, startFromMenu, waitHudVisible, sleep } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/media'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8831)));
const browser = await launch({ viewport: { width: 1280, height: 720 } });
const kill = setTimeout(() => { console.error('timeout'); process.exit(2); }, 600000);
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 720 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page, 300000);
    await sleep(3000);
    const view = (from, to) => page.evaluate(([f, t]) => {
        const g = window.__zns.game;
        g.debugCam = { from: f, to: t };
        g.camera.position.set(...f); g.camera.lookAt(...t);
    }, [from, to]);
    const info = await page.evaluate(() => {
        const g = window.__zns.game, A = g.animals;
        const ids = ['cH1', 'cH2', 'cPeg'].map((id) => A.byId.get(id));
        return { horses: ids.map((a) => a && [a.id, a.pegasus, Math.round(a.group.position.x), Math.round(a.group.position.y), Math.round(a.group.position.z)]), tree: !!A.trees.get('creative-apple'),
            mirror: !!g.mirror, treesNear: (g.world.trees || []).filter((t) => t.alive && Math.hypot(t.x, t.z) < 48).length };
    });
    console.log('stable', JSON.stringify(info));
    // the stable seen from the start
    await page.evaluate(() => { const g = window.__zns.game; g.character.group.position.set(-14, g.collision.groundY(-14, 22) + 2, 22); g.character.group.rotation.y = Math.PI / 2 + 0.35; });
    await sleep(2500);
    await page.screenshot({ path: path.join(out, 'creative-stable.png') });
    // one apple → on the horse → it carries me
    const ride = await page.evaluate(async () => {
        const g = window.__zns.game, A = g.animals, h = A.byId.get('cH1');
        const said = [];
        const sv = g.hud.setVoice.bind(g.hud); g.hud.setVoice = (t, ...r) => { said.push(String(t)); return sv(t, ...r); };
        g.character.group.position.set(h.group.position.x + 1.5, h.group.position.y + 1.5, h.group.position.z);
        A.tryMount(); const before = !!A.riding; // (no apple yet: not let on)
        h.apples = 1; A.tryMount();            // (one apple: on at once)
        const on = A.riding === h;
        const p0 = h.group.position.clone();
        const run = g.character.setRunning.bind(g.character);
        g.character.setRunning = () => run(true, 0.6);
        g.character.group.rotation.y = -Math.PI / 2;
        await new Promise((r) => setTimeout(r, 2500));
        g.character.setRunning = run;
        const moved = h.group.position.distanceTo(p0);
        const seat = g.character.group.position.y - h.group.position.y;
        g.character.setCrouching(true); A._ride(0.016); g.character.setCrouching(false);
        return { before, on, moved: +moved.toFixed(1), seat: +seat.toFixed(2), off: !A.riding, said };
    });
    console.log('ride', JSON.stringify(ride));
    // the Pegasus: one apple → on → a slap → he flies up
    const fly = await page.evaluate(async () => {
        const g = window.__zns.game, A = g.animals, p = A.byId.get('cPeg');
        p.trustBy = null;
        g.character.group.position.set(p.group.position.x + 1.5, p.group.position.y + 1.5, p.group.position.z);
        A.tryMount(); const before = !!A.riding;
        // (one apple fed: what _feed does for the test Pegasus)
        p.trustBy = g.localId; p.trustUntil = Date.now() + 600000;
        A.tryMount(); const on = A.riding === p;
        const y0 = p.group.position.y;
        A._pegasusToggle(p);
        const cam = g.camera.getWorldDirection.bind(g.camera);
        g.camera.getWorldDirection = (v) => v.set(0, 0.6, -0.8);
        await new Promise((r) => setTimeout(r, 3000));
        const up = p.group.position.y - y0;
        g.camera.getWorldDirection = cam;
        return { before, on, flying: !!p.riderFly, up: +up.toFixed(1) };
    });
    console.log('pegasus', JSON.stringify(fly));
    await sleep(500);
    await page.screenshot({ path: path.join(out, 'creative-pegasus-flight.png') });
} finally {
    clearTimeout(kill);
    await browser.close();
    srv.stop?.(); srv.proc?.kill?.();
}
process.exit(0);
