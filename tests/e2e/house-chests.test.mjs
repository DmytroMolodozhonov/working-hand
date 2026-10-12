/**
 * House chests in a real browser: every chest of a village stands inside its house on the floor
 * (no wall in the box of its mesh, its lid opens up to the wall and no further), and pictures of
 * a few houses from inside and from outside (test-results/house-chest-*.png).
 * Run: node --test tests/e2e/house-chests.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('house chests: inside the walls, on the floor; pictures from inside and outside', async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const dir = path.join(ROOT, 'test-results');
    fs.mkdirSync(dir, { recursive: true });
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, t = g.world.terrain.data;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const c = t.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        const picks = [];
        for (const kind of ['hut', 'cottage', 'longhouse', 'manor', 'stone', 'brick', 'towerhouse']) {
            const h = c.houses.find((x) => x.kind === kind && x.chests.length);
            if (h) picks.push(h);
        }
        const out = { shots: [], bad: [] };
        for (const h of picks.slice(0, 4)) {
            g.character.group.position.set(h.inside.x, h.inside.y + 2.2, h.inside.z);
            g.world.terrain.flushAround(h.inside.x, h.inside.z);
            await frames(30);
            h.chests.forEach((_, k) => {
                const ch = g.chests.find((x) => x.id === h.id + 'c' + k);
                if (!ch) { out.bad.push(h.kind + ': no chest ' + k); return; }
                // the mesh — shut and opened as far as it goes — touches no block, and stands on the floor
                for (const open of [0, 1]) {
                    ch.lidGroup.rotation.x = open ? -ch.openMax : 0;
                    ch.mesh.updateMatrixWorld(true);
                    const b = new T.Box3();
                    ch.mesh.traverse((m) => { if (m.isMesh) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); } });
                    if (!open) out.floorGap = Math.max(out.floorGap ?? -9, Math.abs(b.min.y - (h.chests[k].y)));
                    // (the mesh's own corner pieces stick out a little: 0.05 of the chest)
                    for (let x = Math.round(b.min.x + 0.2); x <= Math.round(b.max.x - 0.2); x++) for (let z = Math.round(b.min.z + 0.2); z <= Math.round(b.max.z - 0.2); z++) {
                        for (let L = Math.round(b.min.y + 1.5 + 0.2); L <= Math.round(b.max.y + 1.5 - 0.2); L++) {
                            if (t.get(x, L, z)) out.bad.push(`${h.kind} chest ${k} ${open ? 'open' : 'shut'}: block ${t.get(x, L, z)} at ${x - Math.round(ch.mesh.position.x)},${L},${z - Math.round(ch.mesh.position.z)}`);
                        }
                    }
                }
                ch.lidGroup.rotation.x = -ch.openMax;
            });
            // the pictures: from inside towards the first chest, from outside over the roof's edge
            const ch = g.chests.find((x) => x.id === h.id + 'c0');
            const cp = ch.mesh.position.clone();
            const cam = new T.PerspectiveCamera(70, g.renderer.domElement.width / g.renderer.domElement.height, 0.1, 400);
            const shoot = (from, name) => {
                cam.position.copy(from); cam.lookAt(cp.x, cp.y + 1, cp.z); cam.updateMatrixWorld(true);
                g.renderer.render(g.scene, cam);
                out.shots.push([name, g.renderer.domElement.toDataURL('image/png')]);
            };
            const fwd = new T.Vector3(Math.sin(ch.mesh.rotation.y), 0, Math.cos(ch.mesh.rotation.y));
            g.character.group.visible = false; // (my own arms in front of the camera)
            shoot(cp.clone().addScaledVector(fwd, 4.5).add(new T.Vector3(0, 3.2, 0)), h.kind + '-inside');
            shoot(cp.clone().addScaledVector(fwd, -13).add(new T.Vector3(0, 3, 0)), h.kind + '-outside'); // (the wall behind it: nothing sticks out)
            g.character.group.visible = true;
        }
        return out;
    });
    for (const [name, url] of r.shots) fs.writeFileSync(path.join(dir, `house-chest-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
    assert.deepEqual(r.bad, [], 'every chest inside its house');
    assert.ok(r.floorGap < 0.05, `the chests stand on the floor (gap ${r.floorGap})`);
});
