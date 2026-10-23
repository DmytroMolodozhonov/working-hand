// Pictures of «Пентаграниум»: the wand's trail on the ground, the lit pentagram (a hero-sized post of 3.5 m for scale) and the rite's hellfire.
// Usage: node tools/pentagram-screenshots.mjs [--out docs/spells/pentagranium] [--port 8298]
import { startServer, launch, openPage, startFromMenu, waitHudVisible, sleep } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/spells/pentagranium'));
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(Number(arg('--port', 8298)));
const browser = await launch({});
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 960, height: 560 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await sleep(4000);
    // a free camera over the place: from 9 m up and 13 m back, looking at the centre; the game's own camera is swapped at the render
    await page.evaluate(async () => {
        const THREE = await import('three');
        const g = window.__zns.game, me = g.character.group.position;
        const cx = me.x + 14, cz = me.z, y = g.collision.groundY(cx, cz);
        const cam = new THREE.PerspectiveCamera(60, 960 / 560, 0.1, 600);
        window.__pg = { cx, cz, y, cam, THREE };
        const orig = g.renderer.render.bind(g.renderer);
        g.renderer.render = (scene, camera) => orig(scene, window.__pg.on && scene === g.scene ? window.__pg.cam : camera);
        // a 3.5 m post for scale
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.5, 8), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
        post.position.set(cx + 6.5, y + 1.75, cz); g.scene.add(post);
        window.__pg.post = post;
        g.pentagranium.seen.add('devil');
        g.pentagranium.fx.trailBegin();
        window.__pg.look = (dx, dy, dz) => { cam.position.set(cx + dx, y + dy, cz + dz); cam.lookAt(cx, y, cz); cam.updateMatrixWorld(true); };
        window.__pg.look(-4, 11, 13);
        window.__pg.on = true;
    });
    const snap = async (name) => {
        await sleep(600);
        const url = await page.evaluate(() => { const g = window.__zns.game, r = g.renderer; r.render(g.scene, g.camera); return r.domElement.toDataURL('image/png'); });
        fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
        console.log('saved', name);
    };
    // 1. the trail: the circle half drawn
    await page.evaluate(() => {
        const { cx, cz, y } = window.__pg, g = window.__zns.game, F = g.pentagranium.fx;
        let last = null;
        for (let i = 0; i <= 60; i++) { const a = (i / 70) * Math.PI * 2, x = cx + Math.cos(a) * 3.6, z = cz + Math.sin(a) * 3.6; F.trailAdd(x, g.collision.groundY(x, z), z, !!last); last = 1; F.trailSmoke(x, y, z); }
    });
    await snap('1-trail');
    // 2. the lit pentagram
    await page.evaluate(() => {
        const { cx, cz, y } = window.__pg, g = window.__zns.game, P = g.pentagranium;
        P.fx.trailEnd();
        const m = P._place('shot', 'me', 'devil', cx, y, cz, 3.6, 0.2);
        m.mine = false; window.__pg.m = m;
    });
    await sleep(2200);
    await snap('2-lit');
    // 3. the rite: hellfire over a body
    await page.evaluate(() => {
        const g = window.__zns.game, m = window.__pg.m;
        g.death.addBody({ id: 'shot1', k: 'v', who: 'w', role: 'adept', wz: 1, mm: 200, x: m.x, y: m.y, z: m.z, yaw: 0.5, age: 0, look: null });
        const b = g.death.bodies.get('shot1');
        g.pentagranium._riteBegin(m, b, false);
        window.__pg.look(-6, 8, 9);
    });
    await sleep(1500);
    await snap('3-rite-start');
    await sleep(3500);
    await snap('3-rite-late');
    // the drawing-scrolls' parchments (what the hero sees when he unrolls one)
    for (const id of ['devil', 'sigil', 'ward']) {
        const url = await page.evaluate(async (id) => { const { drawParchment } = await import('/src/game/ScrollReading.js'); return drawParchment({ kind: 'scroll', stat: 'pentagram', pent: id }).image.toDataURL('image/png'); }, id);
        fs.writeFileSync(path.join(out, 'scroll-' + id + '.png'), Buffer.from(url.split(',')[1], 'base64'));
        console.log('saved scroll', id);
    }
    const info = await page.evaluate(async () => {
        const THREE = window.__pg.THREE, g = window.__zns.game;
        const b = g.pentagranium.fx.figs.get('shot');
        const bb = new THREE.Box3().setFromObject(b.fig);
        const s = bb.getSize(new THREE.Vector3());
        return { figure: [s.x.toFixed(1), s.z.toFixed(1)], post: window.__pg.post.position.y };
    });
    console.log('figure size (Box3), m:', info.figure.join(' × '));
} finally { await browser.close(); srv.close?.(); }
