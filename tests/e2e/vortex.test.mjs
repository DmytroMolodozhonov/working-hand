/**
 * «Water Vortex» in a real browser: a wand in the hand by a river, the words, the hand
 * going round (synthetic camera frames) gathers rings of water, pointing sends it all at
 * a creature, «Bubble» wraps it, «Frozen» freezes it (2 HP a second), «Fire Maxima» melts it.
 * Run: ZNS_TEST_PORT=8177 node --test tests/e2e/vortex.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8177;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

/** Both hands forward; the wrists going round a circle (radius `r` in the picture) `turns` times a second. */
const circling = (r, turnsPerSec, fps = 30) => (i) => {
    const a = (i / fps) * turnsPerSec * Math.PI * 2;
    return { arms: 'forward', wristOffset: [Math.cos(a) * r, Math.sin(a) * r] };
};
const still = { arms: 'forward', wristOffset: [0, 0.05] };

test('Water Vortex: a wand at the river, the hand going round gathers water, pointing sends it, Bubble wraps, Frozen freezes (−2 HP/s), Fire Maxima melts', async () => {
    const { page, errors } = await openPage(browser, srv.url, { viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, still, 20, 33);
    // Stand in a river with a wand in the right hand
    const setup = await page.evaluate(async () => {
        const g = window.__zns.game;
        const t = g.terrain.data;
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        let spot = null;
        // (in the middle of wide water: water all round for several metres)
        const wide = (x, z) => { for (let dx = -8; dx <= 8; dx += 2) for (let dz = -8; dz <= 8; dz += 2) if (t.get(x + dx, 0, z + dz) !== 8) return false; return true; };
        for (let x = 140; x < 1400 && !spot; x += 3) for (let z = -400; z < 400; z += 3) if (t.get(x, 0, z) === 8 && wide(x, z)) { spot = { x, z }; break; }
        g.character.group.position.set(spot.x, g.collision.groundY(spot.x, spot.z) + 1.0, spot.z);
        for (let i = 0; i < 80 && g.terrain._queue.length; i++) await sleep(100);
        g.items.takeIntoHand({ kind: 'wand', uid: 'vortex-wand', type: 0 }, 'right');
        await sleep(300);
        return { spot, held: g.items.heldOf('wand')?.side };
    });
    assert.ok(setup.spot, 'a river');
    assert.equal(setup.held, 'right', 'the wand is in the right hand');
    await feed(page, still, 15, 33);
    const said = await page.evaluate(() => {
        const g = window.__zns.game;
        // (the wand points down at the river: the hand pointed at the water)
        const d = g.character.getPointingDirection('right');
        return { name: g.castLocalSpell('вотер вортекс', true), phase: g.vortex.state?.phase, d: [d.x, d.y, d.z], voice: document.getElementById('voice-debug')?.innerText || '' };
    });
    assert.equal(said.name, 'WaterVortex', `cast at the water: ${JSON.stringify(said)}`);
    assert.equal(said.phase, 'call');
    // The hand goes round and round (the synthetic camera): the water gathers
    await feed(page, circling(0.09, 1.2), 75, 33);
    const g1 = await page.evaluate(() => { const s = window.__zns.game.vortex.state; return s && { phase: s.phase, v: s.volume, turns: window.__zns.game.vortex.meter.turns, blobs: window.__zns.game.vortex.blobs.count }; });
    assert.ok(g1 && g1.phase === 'gather', `the vortex has started: ${JSON.stringify(g1)}`);
    await feed(page, circling(0.09, 1.6), 75, 33);
    const g2 = await page.evaluate(() => { const V = window.__zns.game.vortex; return { v: V.state?.volume, blobs: V.blobs.count, visible: V.blobs.visible }; });
    assert.ok(g2.v > g1.v + 2, `more turns, more water (${g1.v.toFixed(1)} → ${g2.v.toFixed(1)} m³)`);
    assert.ok(g2.visible && g2.blobs > 30, `rings of water round the player (${g2.blobs} drops of the rings)`);
    // A zombie where the hand points; the hand stops and points: everything flies at it
    const zid = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const p = g.character.group.position;
        const d = g.character.getPointingDirection('right').setY(0).normalize();
        const zp = new T.Vector3(p.x + d.x * 5, 0, p.z + d.z * 5);
        zp.y = g.collision.groundY(zp.x, zp.z);
        const z = g._createZombie(zp);
        z.setSleeping?.(true);
        return z.id;
    });
    let launched = null;
    for (let k = 0; k < 12 && !launched; k++) {
        await feed(page, still, 5, 33);
        launched = await page.evaluate(() => {
            const V = window.__zns.game.vortex;
            const l = V.log.find((e) => e.ev === 'launch');
            // «Bubble» right as it flies at the zombie
            if (l && !V._saidBubble) { V._saidBubble = true; window.__zns.game.castLocalSpell('bubble', true); }
            return l || null;
        });
    }
    assert.ok(launched && launched.v > 4, `the hand pointed: the whole vortex flies (${JSON.stringify(launched)})`);
    await feed(page, still, 30, 33);
    const hit = await page.evaluate((zid) => {
        const g = window.__zns.game, V = g.vortex;
        const b = [...V.bubbles.values()][0];
        return { hit: V.log.find((e) => e.ev === 'hit'), push: V.log.find((e) => e.ev === 'push'), bubble: b && { tk: b.tk, tid: b.tid, phase: b.phase, r: b.r }, gathering: !!V.state, zid };
    }, zid);
    assert.ok(hit.hit && hit.hit.tk === 'z', `the water hit the zombie: ${JSON.stringify(hit)}`);
    assert.ok(hit.push && hit.push.speed > 6, 'pushed by the water');
    assert.ok(hit.bubble && hit.bubble.tk === 'z' && hit.bubble.tid === zid && hit.bubble.phase === 'liquid', `«Bubble»: the zombie is in a water bubble ${JSON.stringify(hit.bubble)}`);
    assert.equal(hit.gathering, false);
    await feed(page, still, 40, 33);
    const fr = await page.evaluate(async (zid) => {
        const g = window.__zns.game, V = g.vortex;
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const b = [...V.bubbles.values()][0];
        const r = b.r;
        const name = g.castLocalSpell('frozen', true);
        const z = g.zombieById.get(zid);
        const h0 = z.health;
        // (the slow test browser: wait for two game seconds in the ice)
        for (let i = 0; i < 100 && V.log.filter((e) => e.ev === 'iceHurt').length < 2 && !z.isDead; i++) await sleep(100);
        return { name, phase: b.phase, r, lost: h0 - z.health, dead: z.isDead, hurts: V.log.filter((e) => e.ev === 'iceHurt').length };
    }, zid);
    assert.equal(fr.name, 'Frozen');
    assert.ok(fr.r > 1.3, `the bubble grew from the whole vortex (${fr.r.toFixed(2)} m)`);
    assert.ok(fr.dead || fr.phase === 'ice', 'frozen');
    assert.ok(fr.dead || (fr.hurts >= 2 && fr.lost === 2 * fr.hurts), `−1 HP cold, −1 HP air a second: ${JSON.stringify(fr)}`);
    if (!fr.dead) {
        // «Fire Maxima» pointed at the ice: it melts very fast
        const melt = await page.evaluate(async () => {
            const g = window.__zns.game, V = g.vortex;
            const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
            const name = g.castLocalSpell('fire maxima', true);
            for (let i = 0; i < 60 && !V.log.some((e) => e.ev === 'melt'); i++) await sleep(100);
            const melting = V.log.some((e) => e.ev === 'melt' && e.ice);
            for (let i = 0; i < 80 && V.bubbles.size; i++) await sleep(100);
            return { name, melting, left: V.bubbles.size };
        });
        assert.equal(melt.name, 'FireMaxima');
        assert.ok(melt.melting, 'the ice melts in golden fire');
        assert.equal(melt.left, 0, 'melted away');
    }
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
