/**
 * The swamp Canaries and the Brightflower in the real game: a camp stands on flat ground, a hero walks into its territory, a boulder comes; a group of
 * Brightflowers breathes open and shut, one is angered and breathes fire at the hero. Pictures: test-results/canaries-*.png, test-results/brightflower-*.png
 * Run: ZNS_TEST_PORT=8261 node --test tests/e2e/canaries.test.mjs  (ZNS_CHROME=/opt/pw-browsers/chromium for another Chromium build)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8261;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('a camp of canaries: peaceful outside, boulders inside; a Brightflower group: opens, shuts, burns the one who angers it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const dir = path.join(ROOT, 'test-results');
    fs.mkdirSync(dir, { recursive: true });
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
        g.gen = 11;
        ch.group.position.x += 70; ch.group.position.z += 40;
        await frame();
        const fw = g.camera.getWorldDirection(new T.Vector3()).setY(0).normalize();
        const base = ch.group.position.clone();
        // ---- the camp, 40 m ahead of me (the fire at the ground there)
        const def = { gx: 90, gz: 90, x: base.x + fw.x * 40, z: base.z + fw.z * 40, top: 0, seed: 3 };
        const camp = g.canaries._loadCamp(def);
        g.canaries.camps.set('90,90', camp);
        g.canaries._aroundT = 1e9;
        for (let i = 0; i < 5; i++) await frame();
        const out = { members: camp.members.length, rocks: camp.rocks.length };
        out.calm = camp.members.every((c) => c.st === 'idle' || c.st === 'sit');
        out.draws = g.renderer?.info?.render?.calls;
        // a picture of the camp from where I stand
        await frame();
        window.__shot = 'camp';
        return out;
    });
    assert.ok(r.members >= 3 && r.rocks >= 9 && r.calm, JSON.stringify(r));
    await page.screenshot({ path: path.join(dir, 'canaries-camp.png') });
    const r2 = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
        const camp = g.canaries.camps.get('90,90');
        // walk into the territory: 14 m from the fire, looking at it
        const at = new T.Vector3(camp.x, 0, camp.z);
        const dir = new T.Vector3(camp.x - ch.group.position.x, 0, camp.z - ch.group.position.z).normalize();
        ch.group.position.x = camp.x - dir.x * 15; ch.group.position.z = camp.z - dir.z * 15;
        ch.group.position.y = g.collision.groundY(ch.group.position.x, ch.group.position.z) + 2.1;
        let hp0 = g.combat?.hp ?? g.playerHP, thrown = 0, sts = new Set();
        for (let i = 0; i < 360; i++) { await frame(); thrown = Math.max(thrown, g.canaries.shots.length); for (const c of camp.members) sts.add(c.st); if (g.canaries.shots.length && !window.__pic) { window.__pic = 1; } }
        return { thrown, sts: [...sts], hp0, hp: g.combat?.hp ?? g.playerHP, alert: camp.alert };
    });
    assert.ok(r2.thrown >= 1 && r2.sts.includes('throw') && r2.sts.includes('lift'), JSON.stringify(r2));
    await page.screenshot({ path: path.join(dir, 'canaries-fight.png') });
    // ---- the Brightflowers
    const r3 = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, P = g.plants;
        const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
        const camp = g.canaries.camps.get('90,90'); g.canaries._unloadCamp(camp); g.canaries.camps.clear(); g.canaries.cells.clear(); g.canaries.enabled = false;
        g.gen = 11; P._aroundT = 1e9;
        ch.group.position.x += 200; ch.group.position.z += 200; await frame(); await frame();
        const fw = g.camera.getWorldDirection(new T.Vector3()).setY(0).normalize(), side = new T.Vector3(-fw.z, 0, fw.x), p0 = ch.group.position.clone();
        const members = [];
        for (let i = 0; i < 5; i++) { const x = Math.round(p0.x + fw.x * 12 + side.x * (i - 2) * 3.2), z = Math.round(p0.z + fw.z * 12 + side.z * (i - 2) * 3.2); members.push({ i, x, z, y: g.collision.groundY(x, z), yaw: i, h: 0.2 + 0.15 * i, id: 'btest.' + i }); }
        const grp = P._load('brightflower', 99, 99, members); P.groups.set(grp.key, grp);
        const out = { n: grp.plants.length };
        // let it breathe: sample the openness over a full cycle (the wall clock: set the phase of each)
        const seen = new Set();
        for (let i = 0; i < 40; i++) { await frame(); seen.add(Math.round(grp.plants[0].bf.open * 4)); }
        out.states = [...seen].sort();
        out.draw = P.bright.fx.n;
        // force it open, take a picture
        for (const p of grp.plants) p.bf.open = 1;
        window.__open = grp.plants.map((p) => { p.bf.angryT = 0; return 1; });
        return out;
    });
    assert.equal(r3.n, 5);
    assert.ok(r3.draw >= 1, JSON.stringify(r3));
    await page.screenshot({ path: path.join(dir, 'brightflower-calm.png') });
    const r4 = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, P = g.plants;
        const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
        const grp = [...P.groups.values()].find((x) => x && x.kind === 'brightflower');
        const p = grp.plants[2];
        const hp0 = g.combat?.hp ?? g.playerHP;
        P.hit(p, 2, 'melee', g.localId);
        // it turns on me and breathes: stand in the cone
        ch.group.position.set(p.x + (p.x > ch.group.position.x ? -1 : 1) * 6, p.y + 3.6, p.z + 2);
        let angry = 0, breathing = 0;
        for (let i = 0; i < 150; i++) { await frame(); if (p.bf.angryT > 0) angry++; if (p.bf.breathing) breathing++; }
        const out = { angry, breathing, hp0, hp: g.combat?.hp ?? g.playerHP, dirY: p.bf.dir.y, burning: !!g.burning?.me };
        // fire does nothing; water puts it to sleep
        P.hit(p, 50, 'Inferno', g.localId); out.fireHp = p.hp;
        P.hit(p, 0, 'Water', g.localId); out.sleep = p.bf.sleepT;
        for (let i = 0; i < 30; i++) await frame();
        out.closed = p.bf.open;
        return out;
    });
    assert.ok(r4.angry > 30 && r4.breathing > 5, JSON.stringify(r4));
    assert.ok(r4.hp < r4.hp0 || r4.burning, 'burned: ' + JSON.stringify(r4));
    assert.ok(r4.sleep > 0 && r4.closed < 0.9, JSON.stringify(r4));
    await page.screenshot({ path: path.join(dir, 'brightflower-angry.png') });
    assert.deepEqual(realErrors(errors), []);
});
