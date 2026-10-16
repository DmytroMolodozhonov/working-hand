/**
 * The clever owl in the real game: it sits by me and looks at me; I throw meat — it eats and hearts
 * rise over it; I ask for a boss — it flies off ahead, leading. Pictures of the three moments are
 * saved to docs/creatures/owl/ (stare.png, love.png, guide.png).
 * Run: node --test tests/e2e/owl.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
const OUT = path.join(ROOT, 'docs/creatures/owl');
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('owl: curious by me, eats the meat and loves me (hearts), leads me to a boss once', { timeout: 600000 }, async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 960, height: 540 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); };
        const orig = g._updateCamera.bind(g);
        g._updateCamera = (dt) => {
            orig(dt);
            const s = window.__shot;
            if (s?.chase) {
                // (behind it as it flies, a little above: it and the way ahead)
                const o = s.o.model.position, v = s.o.vel.clone().setY(0);
                if (v.lengthSq() < 0.01) v.set(0, 0, 1);
                v.normalize();
                g.camera.position.set(o.x - v.x * 3.2 + v.z * 1.2, o.y + 1.1, o.z - v.z * 3.2 - v.x * 1.2);
                g.camera.lookAt(o.x + v.x * 6, o.y - 0.6, o.z + v.z * 6);
            } else if (s) { const o = s.o.model.position; g.camera.position.set(o.x + s.dx, o.y + s.dy, o.z + s.dz); g.camera.lookAt(o.x + s.lx, o.y + s.ly, o.z + s.lz); }
        };
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.3;
        window.__o = { g, T, frames };
    });
    const shoot = async (name, cam) => {
        await page.evaluate((c) => { const { g } = window.__o; const o = g.owls.list[0]; window.__shot = { o, ...c }; g.character.group.visible = true; }, cam);
        await page.evaluate(() => window.__o.frames(6));
        const url = await page.evaluate(() => { const g = window.__o.g; g._updateCamera(0); g.renderer.render(g.scene, g.camera); return g.renderer.domElement.toDataURL('image/png'); });
        fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    };

    // 1) it sits in front of me and looks at me, its head cocked
    const r1 = await page.evaluate(async () => {
        const { g, T, frames } = window.__o, O = g.owls;
        O.enabled = false;
        for (const o of [...O.list]) O._remove(o);
        const me = g.character.group.position, yaw = g.character.group.rotation.y;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const x = me.x + fx * 4, z = me.z + fz * 4;
        const o = O.spawn(new T.Vector3(x, g.collision.groundY(x, z), z));
        o.yaw = Math.atan2(fx, fz); // (its back to me at first: it turns its head round)
        O._setState(o, 'perch'); o.stay = 999;
        await frames(40);
        return { stare: O.log.find((e) => e.ev === 'stare'), state: o.state, head: o.a.head };
    });
    assert.ok(r1.stare, 'curious: it looks at me');
    assert.equal(r1.state, 'perch', 'not afraid: it stays');
    await shoot('stare', { dx: 2.2, dy: 1.2, dz: 1.2, lx: 0, ly: 0.8, lz: 0 });

    // 2) meat thrown by it: it eats it and loves me — hearts
    const r2 = await page.evaluate(async () => {
        const { g, T, frames } = window.__o, O = g.owls, o = O.list[0];
        const p = o.model.position;
        const L = g.items.spawnLoose({ kind: 'meat', from: 'cow', uid: 'owl-meat', count: 1 }, new T.Vector3(p.x + 0.6, p.y + 0.2, p.z + 0.3));
        L.thrower = g.localId;
        const t0 = performance.now();
        while (o.state !== 'adore' && performance.now() - t0 < 60000) await frames(5);
        await frames(30);
        return { state: o.state, love: o.love?.by === g.localId, ate: !g.items.loose.has('owl-meat'), hearts: O.hearts.filter((h) => h.life > 0).length };
    });
    assert.ok(r2.ate, 'the meat is eaten');
    assert.ok(r2.love && r2.state === 'adore', 'it loves me');
    assert.ok(r2.hearts > 0, 'hearts over it');
    await shoot('love', { dx: 1.6, dy: 1.0, dz: 1.8, lx: 0, ly: 1.0, lz: 0 });

    // 3) I ask: it thinks, then flies ahead to the nearest living boss (a king — creative has castles)
    const r3 = await page.evaluate(async () => {
        const { g, frames } = window.__o, O = g.owls, o = O.list[0];
        o.t = 99; O._think(o, 0.05); // (the hearts done: it keeps by me)
        const claimed = O.claims('я хочу найти короля') && !O.claims('привет, как дела');
        O.hear('я хочу найти короля');
        const t0 = performance.now();
        while (o.state !== 'guide' && o.state !== 'shake' && performance.now() - t0 < 90000) await frames(5);
        const second = O.ask(o, 'dragon', g.localId);
        await frames(60);
        const me = g.character.group.position;
        return { claimed, state: o.state, boss: o.guide?.boss, second, up: o.model.position.y - g.collision.groundY(o.model.position.x, o.model.position.z), away: Math.hypot(o.model.position.x - me.x, o.model.position.z - me.z), log: O.log.slice(-6) };
    });
    assert.ok(r3.claimed, 'the words are the owl\'s only with a loving owl near');
    assert.equal(r3.state, 'guide', 'it leads: ' + JSON.stringify(r3.log));
    assert.equal(r3.boss, 'king');
    assert.equal(r3.second, false, 'a second request is not heard');
    assert.ok(r3.up > 3, 'up in the air');
    await shoot('guide', { chase: true });
    assert.deepEqual(realErrors(errors), []);
});
