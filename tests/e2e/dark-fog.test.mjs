/**
 * «Caligo» в настоящей игре: туман вырастает за 10 с, внутри картинка чёрная (мировой туман подменён и возвращён), с ночным зрением — видно; жители теряют игрока (aiPos); «стоп» убирает.
 * Run: node --test tests/e2e/dark-fog.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8198;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('Caligo: the dome grows, the picture inside is black, the minds lose a player in it, «стоп» takes it down', { timeout: 900000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    const errors = [];
    page.on('pageerror', (e) => { errors.push(String(e).slice(0, 300)); console.log('PAGEERROR', String(e).slice(0, 300)); });
    await startFromMenu(page, 'creative', { smooth: true }).catch(async (e) => {
        if (!/Timeout/.test(e.message)) throw e;
        await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 420000 });
    });
    await waitHudVisible(page, 120000);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const THREE = await import('three');
        const out = { has: !!g.darkFog };
        const p = g.character.group.position;
        const wandAt = new THREE.Vector3(p.x, p.y + 1.5, p.z);
        // the fog as the others' computers draw it: the middle at my feet, the wand a little in front
        g.spells.cast('Caligo', new THREE.Vector3(p.x, p.y - 2, p.z), new THREE.Vector3(0, 3, -2), 'right', 'remote1');
        out.fogs = g.darkFog.fogs.length;
        for (let i = 0; i < 44; i++) g.darkFog.update(0.25); // (game time by hand: the software renderer draws a frame a second)
        out.R = g.darkFog.fogs[0] && g.darkFog.fogs[0].mesh.scale.x;
        // the picture: a few frames inside
        const fog = g.scene.fog; const near0 = fog.near, far0 = fog.far;
        let farIn = null;
        for (let i = 0; i < 200; i++) { g.darkFog.begin(); farIn = g.scene.fog.far; g.darkFog.end(); }
        out.farIn = farIn; out.farBack = g.scene.fog.far === far0 && g.scene.fog.near === near0;
        // the minds: a player of mine standing outside, then inside
        const here = { x: p.x, y: p.y, z: p.z };
        out.aiInside = g.invis.aiPos('someone', here);
        const far = { x: p.x + 200, y: p.y, z: p.z };
        out.aiOutside = !!g.invis.aiPos('someone2', far);
        // the dome is drawn (a frame renders without an error)
        await sleep(500);
        out.drawn = g.darkFog.fogs[0].mesh.visible;
        // «стоп»
        out.stop = g.darkFog.stopMine();
        out.stopNotMine = out.stop === false; // (the fog is another player's: mine untouched)
        g.darkFog.fogs[0].by = g.localId;
        out.stopMine = g.darkFog.stopMine();
        for (let i = 0; i < 40; i++) g.darkFog.update(0.25);
        out.left = g.darkFog.fogs.length;
        return out;
    });
    console.log(JSON.stringify(r));
    assert.equal(r.has, true);
    assert.equal(r.fogs, 1);
    assert.ok(r.R > 50, `the dome grew to ${r.R}`);
    assert.ok(r.farIn < 10, `black inside: ${r.farIn}`);
    assert.equal(r.farBack, true, 'the world fog is given back');
    assert.equal(r.aiInside, null, 'a player never seen outside is nowhere in the fog');
    assert.equal(r.aiOutside, true);
    assert.ok(r.drawn);
    assert.equal(r.stopNotMine, true);
    assert.equal(r.stopMine, true);
    assert.equal(r.left, 0, 'the fog thinned away');
    assert.deepEqual(errors, []);
});
