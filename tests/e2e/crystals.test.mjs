/**
 * Mana crystals deep in caves — in a real browser: they grow there, «Gather» takes the
 * cluster, a crystal broken with both hands grows the mana maximum by 5.
 * Run: node --test tests/e2e/crystals.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8172;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

/** Into the chamber of the nearest cave that has crystals, facing them. */
async function goToCrystals(page) {
    return page.evaluate(async () => {
        const g = window.__zns.game, ch = g.character, t = g.terrain.data;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const { crystalCluster } = await import('/src/game/ManaCrystals.js');
        let best = null;
        for (let r = 1; r <= 14 && !best; r++) for (let gz = -r; gz <= r && !best; gz++) for (let gx = -r; gx <= r && !best; gx++) {
            const cv = t.caveOf(gx, gz);
            const cl = cv && crystalCluster(cv, t.seed, t.heightAt);
            if (cl) best = { cv, cl };
        }
        if (!best) return null;
        const { cv, cl } = best;
        // stand 5 m from the cluster towards the middle of the chamber, facing it
        const dx = cv.kx - cl.x, dz = cv.kz - cl.z, L = Math.hypot(dx, dz);
        const px = cl.x + (dx / L) * 5, pz = cl.z + (dz / L) * 5;
        ch.group.position.set(px, cv.F + 2.5, pz);
        ch.verticalVelocity = 0;
        ch.group.rotation.y = g.smoothBody = g.cameraBaseRotation = Math.atan2(-(cl.x - px), -(cl.z - pz));
        g.crystals._t = 0;
        await frames(40);
        return { cave: cv.id, n: cl.crystals.length, built: g.crystals.growing().filter((c) => c.cluster === cv.id).length, light: g.crystals.light.intensity, floor: g.collision.groundAt ? g.collision.groundAt(px, pz, cv.F + 1.5) : null, y: cl.floor, above: Math.min(...cl.crystals.map((c) => c.y)) - cl.floor, pos: ch.group.position.toArray() };
    });
}

test('mana crystals: a cluster grows deep in a cave (glowing); «Gather» takes it into the slots; a crystal broken with both hands → mana max +5', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 12, 40);
    const at = await goToCrystals(page);
    assert.ok(at, 'a cave with crystals');
    assert.equal(at.built, at.n, 'its crystals are there');
    assert.ok(at.light > 0.5, `a soft blue light (${at.light})`);
    if (at.floor != null) assert.ok(Math.abs(at.floor - at.y) < 0.6, `the chamber's floor where it should be (${at.floor}, ${at.y})`);
    assert.ok(at.above > 1, `out of the wall at hand height (${at.above.toFixed(2)} m above the floor)`);
    // «Gather»: the hand pointed at the cluster (a little down: they grow lower than the shoulder)
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0, wristOffset: [0, 0.06] }, 10, 40);
    const g1 = await page.evaluate(async (cave) => {
        const g = window.__zns.game, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.inventory.slots = g.inventory.slots.map(() => null);
        g.inventory._render?.();
        const c = g.crystals.growing().find((x) => x.cluster === cave);
        // aim the hand straight at it (the body turns to it)
        const T = window.__zns.THREE;
        for (let i = 0; i < 6; i++) {
            ch.group.updateMatrixWorld(true);
            const o = g.castOrigin('right', new T.Vector3());
            const d = ch.getHandDirection('right', new T.Vector3());
            const want = c.center.clone().sub(o);
            const err = Math.atan2(-want.x, -want.z) - Math.atan2(-d.x, -d.z);
            ch.group.rotation.y = g.smoothBody = g.cameraBaseRotation = ch.group.rotation.y + Math.atan2(Math.sin(err), Math.cos(err));
            await frames(3);
        }
        ch.group.updateMatrixWorld(true);
        g._lastBuild = 0;
        const o = g.castOrigin('right', new window.__zns.THREE.Vector3()), d = ch.getHandDirection('right');
        const angle = d.angleTo(c.center.clone().sub(o).normalize()); window.__dbg = { d: d.toArray(), want: c.center.clone().sub(o).toArray(), ry: ch.group.rotation.y };
        const said = g.castLocalSpell('gather', true);
        await frames(3);
        const slot = g.inventory.slots.findIndex((s) => s && s.kind === 'crystal');
        return { said, angle, dbg: window.__dbg, voice: document.getElementById('voice-status')?.textContent, slot, count: slot >= 0 ? g.inventory.slots[slot].count : 0, left: g.crystals.growing().filter((x) => x.cluster === cave).length, max0: g.mana.max };
    }, at.cave);
    assert.equal(g1.said, 'Gather');
    assert.ok(g1.slot >= 0, `crystals in a slot (the hand ${g1.angle.toFixed(2)} rad off; ${JSON.stringify(g1.dbg)})`);
    assert.equal(g1.count, at.n, 'the whole cluster');
    assert.equal(g1.left, 0, 'none left growing');
    // one into the right hand (choose its slot)
    const held = await page.evaluate(async (slot) => {
        const g = window.__zns.game;
        g.inventory.select(slot);
        await new Promise((r) => setTimeout(r, 100));
        return g.items.held.right?.item.kind || null;
    }, g1.slot);
    assert.equal(held, 'crystal');
    // both hands on it (the left hand comes to it and closes on it), then they pull apart
    await feed(page, { arms: 'forward', rightCurl: 0.85, leftCurl: 0, wristOffset: [-0.1, 0] }, 15, 40);
    await feed(page, { arms: 'forward', rightCurl: 0.85, leftCurl: 0.85, wristOffset: [-0.1, 0] }, 15, 40);
    const mid = await page.evaluate(() => {
        const g = window.__zns.game, ch = g.character;
        const crystal = g.items.held.right?.model.position;
        const l = ch.getGripObject('left').getWorldPosition(new window.__zns.THREE.Vector3());
        return { gap: crystal ? l.distanceTo(crystal) : null, max: g.mana.max, break: !!g.crystals._break, count: g.items.held.right?.item.count };
    });
    assert.ok(mid.break, `both hands on the crystal (left hand ${mid.gap?.toFixed(2)} m from it)`);
    assert.equal(mid.max, g1.max0, 'not broken just by holding it');
    await feed(page, { arms: 'forward', rightCurl: 0.85, leftCurl: 0.85, wristOffset: [0.12, 0] }, 15, 40);
    const r = await page.evaluate(() => {
        const g = window.__zns.game;
        return { max: g.mana.max, count: g.items.held.right?.item.count ?? 0, log: g.crystals.log.map((e) => e.ev) };
    });
    assert.equal(r.max, g1.max0 + 5, 'the mana maximum +5');
    assert.equal(r.count, mid.count - 1, 'one crystal used up');
    assert.ok(r.log.includes('shatter'));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('mana crystals: an open hand touching one, then the fingers closing on it — it breaks off into the hand', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 12, 40);
    const at = await goToCrystals(page);
    assert.ok(at);
    // the hand reaches down to it (they grow below the shoulder): lower and lower until the palm is at it
    let LOW = null, placed = null;
    for (const dy of [0.12, 0.18, 0.24, 0.3, 0.36]) {
        LOW = { arms: 'forward', leftCurl: 0, wristOffset: [0, dy] };
        await feed(page, { ...LOW, rightCurl: 0 }, 10, 40);
        placed = await page.evaluate(async (cave) => {
            const g = window.__zns.game, ch = g.character, T = window.__zns.THREE;
            const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
            for (const s of ['left', 'right']) g.items.releaseHand(s);
            const c = g.crystals.growing().filter((x) => x.cluster === cave).sort((a, b) => b.tip.y - a.tip.y)[0];
            for (let i = 0; i < 6; i++) {
                const hand = ch.getGripObject('right').getWorldPosition(new T.Vector3());
                const off = c.tip.clone().lerp(c.center, 0.4).sub(hand);
                ch.group.position.x += off.x; ch.group.position.z += off.z;
                await frames(4);
            }
            const hand = ch.getGripObject('right').getWorldPosition(new T.Vector3());
            return { id: c.id, dist: hand.distanceTo(c.center), dy: hand.y - c.center.y };
        }, at.cave);
        if (placed.dy < 0.15) break;
    }
    await feed(page, { ...LOW, rightCurl: 0 }, 6, 40);
    const touch = await page.evaluate(() => !!window.__zns.game.crystals._touch.right);
    await feed(page, { ...LOW, rightCurl: 0.9 }, 10, 40);
    const r = await page.evaluate((id) => {
        const g = window.__zns.game;
        return { held: g.items.held.right?.item.kind || null, gone: g.crystals.taken.has(id) };
    }, placed.id);
    assert.ok(touch, `the open hand touches it (${placed.dist.toFixed(2)} m from its middle, ${placed.dy.toFixed(2)} m above)`);
    assert.equal(r.held, 'crystal', 'in the hand');
    assert.ok(r.gone, 'broken off the rock');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
