/**
 * The wizards' city: a gust of «Вайнд» throws a door open all the way (the library's one too) and a man walks in;
 * «Вайнд» at a wizard alarms nobody (no hostile mark, no town after the player); Coprus's statue is a model with a box.
 * Run alone: node --test tests/e2e/wizard-city-fixes.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8199;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch(); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('library door opens wide by a gust and lets a man in; Wind alarms nobody; the statue is a model', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const s = g.world.terrain.data.villages.spawnVillage();
        const lib = s.houses.find((c) => c.kind === 'library');
        const d = lib.doorRec;
        g.character.group.position.set(lib.door.x, d.y + 3, lib.door.z);
        g.world.terrain.flushAround(d.x, d.z);
        await frames(150);
        const out = {};
        const door = [...g.doors.list.values()].find((x) => Math.hypot(x.x - d.x, x.z - d.z) < 3);
        g.locks.doorLocks?.delete?.(door.id); // (daytime: open for anybody)
        const L = Math.hypot(lib.inside.x - d.x, lib.inside.z - d.z), dx = (lib.inside.x - d.x) / L, dz = (lib.inside.z - d.z) / L;
        // a gust from outside, 6 m from the door, along the way in
        const from = { x: d.x - dx * 6, y: d.y + 1.5, z: d.z - dz * 6 };
        g.doors.blow((p) => ({ x: dx * 8, y: 0, z: dz * 8, dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; } }), from);
        await frames(240);
        out.angle = Math.abs(door.a);
        const pos = new g.character.group.position.constructor(d.x - dx * 5, d.y + 0.02, d.z - dz * 5);
        for (let i = 0; i < 140; i++) { pos.x += dx * 0.1; pos.z += dz * 0.1; g.collision.resolveCylinder(pos, 0.4, pos.y, 1.8, 1.05); }
        out.along = (pos.x - d.x) * dx + (pos.z - d.z) * dz;
        // the statue
        const st = g.wizVillages.statues.get(s.id);
        out.statue = !!st?.mesh && st.box != null;
        return out;
    });
    assert.ok(r.angle >= 0.5, 'the leaf stands wide open: ' + r.angle);
    assert.ok(r.along > 3, 'a man walks in through the doorway: ' + r.along);
    assert.ok(r.statue, 'the statue is a model with a box');
    const wind = await page.evaluate(async () => {
        const g = window.__zns.game, L = g.castleLife;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const s = g.world.terrain.data.villages.spawnVillage();
        const cs = L.castles.get(s.id) || [...L.castles.values()].find((c) => c.def.kind === 'wizvillage');
        const f = s.stalls[0].front;
        g.character.group.position.set(f.x, f.y + 3, f.z);
        g.world.terrain.flushAround(f.x, f.z);
        await frames(200);
        const w = [...cs.active.values()].find((p) => p.wizard && !p.dead);
        if (!w) return { none: true };
        const o = g.character.group.position.clone();
        const dir = new o.constructor(w.x - o.x, (w.y + 2) - o.y, w.z - o.z).normalize();
        for (let i = 0; i < 4; i++) { g.spells.cast('Wind', o.clone().addScaledVector(dir, 0.5), dir, 'right', g.localId); await frames(60); }
        const foes = [...cs.active.values()].filter((p) => p.foe === g.localId).length;
        return { hostile: cs.hostile.size, foes, hp: w.hp };
    });
    assert.ok(!wind.none, 'a wizard around');
    assert.equal(wind.hostile, 0, 'no alarm in the city: ' + JSON.stringify(wind));
    assert.ok(wind.foes <= 1, 'at most one wizard takes the challenge: ' + JSON.stringify(wind));
    assert.deepEqual(realErrors(errors), []);
});
