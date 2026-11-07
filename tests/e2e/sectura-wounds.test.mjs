/**
 * «Sectura» on animals and the marks it leaves (the author 07.11): a horse is cut like any creature, from 14 m, with the wand a little high;
 * a scar lies along the blade's line on the real model, blood runs.
 * Run: node --test tests/e2e/sectura-wounds.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8198;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('Sectura cuts a horse from 14 m with the wand 1 m high, leaves a scar and the horse bleeds', { timeout: 900000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    await startFromMenu(page, 'creative', { smooth: true }).catch(async (e) => {
        if (!/Timeout/.test(e.message)) throw e;
        await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 420000 });
    });
    await waitHudVisible(page, 120000);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const THREE = await import('three');
        const { packDir } = await import('/src/game/SlashRules.js');
        const out = {};
        const p = g.character.group.position;
        const x = p.x + 4, z = p.z + 20;
        const horse = g.animals._spawn('horse', new THREE.Vector3(x, g.collision.groundY(x, z) + 0.5, z), { id: 'wound-horse', bonus: 30 });
        horse.state = 'graze'; horse.hp = 400; horse.maxHp = 400; // (it must not die: we want to see the wound)
        await sleep(600);
        const gp = horse.group.position;
        const body = g.duel._animalBody(horse);
        // 14 m away, the wand a metre above the middle of its body, a level swing
        const o = new THREE.Vector3(gp.x, gp.y + body.y + 1.0, gp.z - 14);
        const hp0 = horse.hp;
        g.slash.fire(o, packDir(new THREE.Vector3(0, 0, 1), 0.5), 'remote1', 'right');
        await sleep(300);
        out.hit = hp0 - horse.hp;
        out.scars = g.scars.list.filter((e) => e.owner === horse).length;
        out.bleed = horse.bleed || 0;
        out.scarOnHorse = g.scars.list.some((e) => e.owner === horse && e.mesh.parent === horse.group);
        // a second slash from 16 m: out of reach — nothing
        const hp1 = horse.hp;
        g.slash.fire(new THREE.Vector3(gp.x, gp.y + body.y, gp.z - 24), packDir(new THREE.Vector3(0, 0, 1), 0.5), 'remote1', 'right');
        out.farHit = hp1 - horse.hp;
        // the camera at the horse's flank for a picture
        const cam = g.camera; out.cam = !!cam;
        if (cam) { p.set(gp.x - 6, gp.y, gp.z - 6); g.character.group.rotation.y = Math.PI * 0.75; }
        await sleep(1500);
        return out;
    });
    console.log(JSON.stringify(r));
    await page.screenshot({ path: process.env.ZNS_SHOT || '/tmp/sectura-horse.png' }).catch(() => {});
    assert.ok(r.hit >= 10 && r.hit <= 15, `the horse took 10–15: ${r.hit}`);
    assert.ok(r.scars >= 1, 'a scar lies on it');
    assert.equal(r.scarOnHorse, true, 'it goes with the horse');
    assert.ok(r.bleed > 0, 'it bleeds');
    assert.equal(r.farHit, 0, 'beyond 15 m — nothing');
});
