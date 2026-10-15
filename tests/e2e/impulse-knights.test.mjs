/**
 * «Wind Impulse» on knights in ordinary armour (and the other castle people): everybody within
 * 3 m (Maxima 9 m) is really thrown away from the caster and falls. Run: node --test tests/e2e/impulse-knights.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8195;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('«Wind Impulse»: knights round me fly off and fall (plain and Maxima)', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        g.character.group.position.set(c.gate.x, c.gate.y + 2.2, c.gate.z);
        g.world.terrain.flushAround(c.gate.x, c.gate.z);
    });
    await page.waitForFunction(() => { const g = window.__zns.game, cs = g.castleLife.castles.get(window.__castle.id); return cs && [...cs.active.values()].filter((v) => v.role === 'knight' && !v.dead).length >= 3; }, null, { timeout: 60000 });
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, c = window.__castle;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const cs = g.castleLife.castles.get(c.id);
        const out = {};
        for (const [name, dists] of [['WindImpulse', [1.6, 2.4]], ['WindImpulseMaxima', [3, 5.5, 7.5]]]) {
            const knights = [...cs.active.values()].filter((v) => v.role === 'knight' && !v.dead && !v.seated).slice(0, dists.length);
            const me = g.character.group.position;
            // the knights stand round me, at these distances (between my body's middle and theirs)
            // (on the ground at my level — not up on the gate's wall)
            const feet = g.collision.groundY(me.x, me.z);
            knights.forEach((k, i) => {
                for (let a = i * 2.1, n = 0; n < 24; n++, a += 0.26) {
                    const x = me.x + Math.cos(a) * dists[i], z = me.z + Math.sin(a) * dists[i];
                    if (Math.abs(g.collision.groundY(x, z) - feet) < 0.6) { k.x = x; k.z = z; break; }
                }
                k.y = g.collision.groundY(k.x, k.z); k.path = null;
            });
            await frames(3);
            const p0 = knights.map((k) => ({ x: k.x, z: k.z, d: Math.hypot(k.x - me.x, k.z - me.z) }));
            const log0 = g.creatureImpact.log.length;
            g.spells.cast(name, g.combat.center(new T.Vector3()), new T.Vector3(0, 1, 0), 'right', g.localId);
            await frames(40);
            const log = g.creatureImpact.log.slice(log0);
            out[name] = knights.map((k, j) => ({ d0: +p0[j].d.toFixed(2), d1: +Math.hypot(k.x - me.x, k.z - me.z).toFixed(2), fell: log.some((e) => e.ck === 'v' && e.id === k.id && e.res === 'knockdown') }));
            out[name + 'Log'] = log.map((e) => `${e.ck}${e.id}:${e.res}:${e.v}`);
            await frames(150);
        }
        return out;
    });
    const s = JSON.stringify(r);
    // (everybody who stood in the ring when it burst: 3 m, Maxima 9 m — a knight that had walked out is not)
    const inRing = [...r.WindImpulse.filter((k) => k.d0 <= 3), ...r.WindImpulseMaxima.filter((k) => k.d0 <= 9)];
    assert.ok(inRing.length >= 4, s);
    for (const k of inRing) {
        assert.ok(k.d1 > k.d0 + 1, 'thrown away ' + s);
        assert.ok(k.fell, 'fell ' + s);
    }
    assert.deepEqual(realErrors(errors), []);
});
