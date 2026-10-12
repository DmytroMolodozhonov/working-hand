/**
 * The night in a real browser: the family asleep in their beds, the streets empty but for the
 * watch with torches, a word mumbled through sleep, a blow wakes, morning gets them up.
 * Run: node --test tests/e2e/night.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8193;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('night: people asleep in their beds, only the watch out; a word mumbled, a blow wakes, morning gets them up', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative'); // (no zombies, no spider: nothing else wakes them)
    await waitHudVisible(page);
    const frames = (n) => page.evaluate((n) => new Promise((res) => {
        const g = window.__zns.game, end = g.frameCount + n;
        const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
    }), n);
    // midnight, at a poor house of the nearest castle's village
    await page.evaluate(() => {
        const g = window.__zns.game;
        if (g.spiders) g.spiders.enabled = false;
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.85;
        g.world.setDayPhase(g.dayPhase());
        // (a castle far from the start: it comes to life at night — only the watch out)
        const c = g.world.terrain.data.castles.near(0, 0, 2500).filter((k) => Math.hypot(k.x, k.z) > 600).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        window.__hi = c.houses.findIndex((h) => !h.rich && h.doorRec && h.bedSpots.length);
        const h = c.houses[window.__hi];
        g.character.group.position.set(h.inside.x, h.inside.y + 2.2, h.inside.z);
        g.world.terrain.flushAround(h.inside.x, h.inside.z);
    });
    await frames(40);
    const r = await page.evaluate(() => {
        const g = window.__zns.game, L = g.castleLife;
        const all = [...L.byId.values()].filter((v) => v.cs.def === window.__castle && !v.dead);
        const fam = all.filter((v) => v.house === window.__hi);
        return {
            part: L.night.part(),
            asleep: fam.filter((v) => v.mode === 'sleep' || v.mode === 'sleepMat').length,
            fam: fam.length,
            out: all.filter((v) => v.job === 'wander' && !v.goingHome).length,
            watch: all.filter((v) => v.watch).length,
            torches: all.filter((v) => v.watch && v.model.torch).length,
            blanket: fam.some((v) => v.model.blanket?.visible),
            inBed: fam.filter((v) => v.mode === 'sleep').length,
        };
    });
    assert.equal(r.part, 'night');
    assert.ok(r.fam >= 1 && r.asleep === r.fam, `the family asleep in bed (${r.asleep}/${r.fam})`);
    assert.ok(r.blanket, 'under a blanket');
    assert.ok(r.inBed >= 1, 'in the bed (not only on the floor)');
    assert.equal(r.out, 0, 'nobody walks the streets');
    assert.ok(r.watch >= 1 && r.watch <= 3 && r.torches === r.watch, `the watch with torches (${r.watch})`);

    // a word: a mumble, still asleep; a second word: up
    const talk = await page.evaluate(async () => {
        const g = window.__zns.game, L = g.castleLife;
        const v = [...L.byId.values()].find((x) => x.house === window.__hi && x.sleep?.phase === 'lie');
        window.__v = v;
        L.night.rouse(v, g.localId);
        const after1 = v.sleep?.phase;
        L.night.rouse(v, g.localId);
        const f0 = g.frameCount;
        while (v.sleep && g.frameCount < f0 + 120) await new Promise((res) => setTimeout(res, 50));
        return { after1, up: !v.sleep, mode: v.mode };
    });
    assert.equal(talk.after1, 'lie', 'one word: a mumble through sleep');
    assert.ok(talk.up && talk.mode !== 'sleep', `the second wakes him (${talk.mode})`);

    // a blow wakes another sleeper at once; morning gets the rest up
    const day = await page.evaluate(async () => {
        const g = window.__zns.game, L = g.castleLife;
        const w = [...L.byId.values()].find((x) => x.sleep?.phase === 'lie');
        if (w) L.hit(w, 0.1, null, null, { spell: true });
        const hitUp = !w || w.sleep?.phase !== 'lie';
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.1;
        g.world.setDayPhase(g.dayPhase());
        const until = async (n) => { const f0 = g.frameCount; while (g.frameCount < f0 + n) await new Promise((res) => setTimeout(res, 50)); };
        await until(4);
        for (const x of L.byId.values()) if (x.sleep) x.sleep.wakeAt = 0; // (the morning's half-minute of getting up, at once)
        const f0 = g.frameCount;
        while ([...L.byId.values()].some((x) => x.sleep) && g.frameCount < f0 + 120) await new Promise((res) => setTimeout(res, 50));
        return { hitUp, still: [...L.byId.values()].filter((x) => x.sleep?.phase === 'lie').length, part: L.night.part() };
    });
    assert.ok(day.hitUp, 'a blow wakes a sleeper');
    assert.equal(day.part, 'day');
    assert.equal(day.still, 0, 'in the morning everybody is up');
    assert.deepEqual(realErrors(errors), []);
});
