/**
 * 17th-century ships — in a real browser: decks you walk on that carry you,
 * rails, the captain's cabin, sails let down by «Анфёрл» and filled by «Вайнд»,
 * a heavy ship, the wheel turned by hands, the crew, cannons loaded by hand and
 * lit by «Fire», holes, flooding and sinking, saving.
 * Run: node --test tests/e2e/ships.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8171;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 30);
}), n);

/** Wait (in game frames) until fn() is true in the page; returns its last value. */
async function until(page, fn, arg = null, maxFrames = 400) {
    let v = null;
    for (let i = 0; i < maxFrames / 5; i++) {
        v = await page.evaluate(fn, arg);
        if (v) return v;
        await frames(page, 5);
    }
    return v;
}

/** Out to the open sea; a ship there (calm water: no waves, no weather). */
async function shipAtSea(page, cls = 'galleon', id = 'test-ship', yaw = null) {
    return page.evaluate(({ cls, id, yaw }) => {
        const g = window.__zns.game;
        const S = g.terrain.data.seas;
        const sea = S.nearest(0, 0);
        // the deepest water round the sea (no shoal, no island)
        let p = null, best = 0;
        for (let dd = 120; dd < 700 && best > -12; dd += 40) for (let a = 0; a < 6.3 && best > -12; a += 0.25) {
            const q = S.pointAt(sea, a, dd);
            if (S.signedDist(q.x, q.z) < 80) continue;
            const T = (dx, dz) => g.terrain.data.topLayer(Math.round(q.x + dx), Math.round(q.z + dz));
            const top = Math.max(T(0, 0), T(60, 0), T(-60, 0), T(0, 60), T(0, -60)); // (deep all round the hull)
            if (top < best) { best = top; p = q; }
        }
        g.world.terrain.flushAround(p.x, p.z);
        g.seaSurface?.flush?.(p.x, p.z);
        g.ships.calm = true;
        // (bow out to the open sea unless told: a ship sailing off in a test does not run aground)
        const s = g.ships.spawn(cls, p.x, p.z, yaw ?? Math.atan2(-(sea.x - p.x), -(sea.z - p.z)), { id });
        window.__ship = s;
        window.__w = (lx, ly, lz) => s.pose.toWorld(lx, ly, lz, { x: 0, y: 0, z: 0 });
        return { x: p.x, z: p.z, deck: s.layout.deck, B: s.layout.B, L: s.layout.L };
    }, { cls, id, yaw });
}

/** Put the player on the ship's deck at a ship-local point, facing ship-local `face` (0: the bow). */
async function standAt(page, lx, lz, face = 0, deckY = null) {
    await page.evaluate(({ lx, lz, face, deckY }) => {
        const g = window.__zns.game, s = window.__ship;
        const y = deckY ?? s.layout.deck;
        const w = window.__w(lx, y + 2.0, lz);
        const p = g.character.group.position;
        p.set(w.x, w.y, w.z);
        s.collider.forget(p);
        g.cameraBaseRotation = s.st.yaw + face;
        g.smoothBody = g.cameraBaseRotation;
        g.character.group.rotation.y = g.cameraBaseRotation;
    }, { lx, lz, face, deckY });
}

const local = (page) => page.evaluate(() => {
    const g = window.__zns.game, s = window.__ship, p = g.character.group.position;
    const l = s.pose.toLocal(p.x, p.y, p.z, { x: 0, y: 0, z: 0 });
    return { ...l, rider: g.ships.me?.ship.id || null, yawRel: g.character.group.rotation.y - s.st.yaw, swim: g.swim.swimming };
});

test('ships: walk on the deck, carried as the ship moves and turns, the rails hold, the captain\'s cabin', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const info = await shipAtSea(page, 'galleon');
    await standAt(page, 3, -0.5, 0);
    await feed(page, { arms: 'hang' }, 20, 40);
    let me = await local(page);
    assert.equal(me.rider, 'test-ship', 'standing on the deck: the ship carries me');
    assert.ok(Math.abs(me.y - (info.deck + 2.0)) < 0.35, `feet on the deck (y ${me.y.toFixed(2)})`);
    assert.ok(!me.swim, 'not swimming on a deck');

    // the ship goes ahead and turns: I stay on the same spot of its deck, turned with it
    const before = me;
    const yaw0 = await page.evaluate(() => window.__ship.st.yaw);
    await page.evaluate(() => { window.__ship.st.forced = { u: 3, r: 0.05 }; });
    await feed(page, { arms: 'hang' }, 40, 50);
    const moved = await page.evaluate(() => window.__ship.st.yaw);
    me = await local(page);
    assert.ok(moved - yaw0 > 0.05, `the ship turned (${(moved - yaw0).toFixed(3)})`);
    assert.ok(Math.hypot(me.x - before.x, me.z - before.z) < 0.25, `carried: still at the same place on deck (moved ${Math.hypot(me.x - before.x, me.z - before.z).toFixed(3)})`);
    assert.ok(Math.abs(me.yawRel - before.yawRel) < 0.03, 'turned with the ship');
    await page.evaluate(() => { window.__ship.st.forced = { u: 0, r: 0 }; });

    // walk to the starboard rail and on: the rail holds
    await page.evaluate(() => { const g = window.__zns.game, s = window.__ship; g.cameraBaseRotation = s.st.yaw - Math.PI / 2; g.character.group.rotation.y = g.cameraBaseRotation; });
    await feed(page, (k) => ({ arms: 'hang', bob: k % 2 ? 0.02 : -0.02 }), 70, 40);
    const start = me;
    me = await local(page);
    assert.ok(me.x - start.x > 2, `walked towards the side (${start.x.toFixed(2)} → ${me.x.toFixed(2)})`);
    assert.equal(me.rider, 'test-ship', 'still aboard');
    assert.ok(Math.abs(me.x) < info.B / 2 - 0.3, `the rail stopped me (x ${me.x.toFixed(2)} of ${info.B / 2})`);

    // beside the quarterdeck stair, walking at it from its outer side and along it aft: never in under it
    const r = await page.evaluate(() => window.__ship.layout.ramps.find((x) => x.id === 'quarter:s'));
    const inStair = (m) => {
        const t = (m.z - r.az) / (r.bz - r.az);
        if (t < 0 || t > 1 || Math.abs(m.x - r.ax) > r.half - 0.1) return false;
        return m.y - 2.0 < r.ay + (r.by - r.ay) * t - 0.5; // (feet well below the steps right there)
    };
    for (const [lx, lz, face] of [[r.ax + r.half + 0.5, r.az + (r.bz - r.az) * 0.3, Math.PI], [r.ax + r.half + 0.5, r.az + (r.bz - r.az) * 0.6, Math.PI / 2]]) {
        await standAt(page, lx, lz, face);
        await feed(page, { arms: 'hang' }, 8, 40);
        for (let k = 0; k < 6; k++) {
            await feed(page, (i) => ({ arms: 'hang', bob: i % 2 ? 0.02 : -0.02 }), 10, 40);
            me = await local(page);
            assert.ok(!inStair(me), `walked in under the stair ${JSON.stringify(me)}`);
        }
    }

    // the captain's cabin: through the door under the quarterdeck
    const q = await page.evaluate(() => window.__ship.layout.floors.find((f) => f.id === 'quarter'));
    await standAt(page, 0.3, q.z0 - 3, Math.PI);
    await feed(page, (k) => ({ arms: 'hang', bob: k % 2 ? 0.02 : -0.02 }), 50, 40);
    const room = await page.evaluate(() => {
        const g = window.__zns.game, p = g.character.group.position;
        const r = g.ships.roomAt(p.x, p.y - 1.9, p.z);
        const chest = window.__ship.chests.find((c) => c.local.room === 'captain' && c.lockedBy === 'captain');
        const l = window.__ship.pose.toLocal(p.x, p.y, p.z, { x: 0, y: 0, z: 0 });
        return { room: r?.room.name || null, locked: chest?.locked, l, run: g.character.isRunning };
    });
    assert.equal(room.room, 'Каюта капитана', 'walked into the captain\'s cabin ' + JSON.stringify(room));
    assert.equal(room.locked, true, 'the captain\'s chest is locked while he lives');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('ships: «Анфёрл» lets the sails down, «Вайнд» fills them, the heavy ship gathers way slowly, coasts, «Фёрл» rolls them up', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await shipAtSea(page, 'galleon');
    const sails0 = await page.evaluate(() => window.__ship.sails.map((s) => s.target));
    assert.ok(sails0.every((t) => t === 0), 'sails are furled at first');
    // on the quarterdeck, facing the main mast, the right arm raised
    const q = await page.evaluate(() => window.__ship.layout.floors.find((f) => f.id === 'quarter'));
    await standAt(page, 2, q.z0 + 6, 0, q.y);
    await feed(page, { arms: 'up' }, 20, 40);
    const r = await page.evaluate(() => window.__zns.game.castLocalSpell('анфёрл', true));
    assert.equal(r, 'Unfurl');
    await until(page, () => window.__ship.sails.filter((x) => x.target === 1).every((x) => x.open > 0.99));
    const st = await page.evaluate(() => {
        const s = window.__ship;
        const open = s.sails.filter((x) => x.target === 1).map((x) => x.mast);
        const m = s.model.sails.get(open.length ? s.sails.find((x) => x.target === 1).id : 'main:course');
        const sp = s.sails.find((x) => x.target === 1);
        return { masts: [...new Set(open)], opened: s.sails.filter((x) => x.target === 1).map((x) => x.open), h: m.clothHeight(), spec: sp ? sp.h : 0, all: s.sails.length };
    });
    assert.equal(st.masts.length, 1, `one mast's sails (${st.masts})`);
    assert.ok(st.opened.every((o) => o > 0.99), 'they are down');
    assert.ok(st.h > 0.85 * st.spec, `the cloth hangs its full height (${st.h.toFixed(1)} of ${st.spec.toFixed(1)})`);
    // «Анфёрл Максима»: all of them
    assert.equal(await page.evaluate(() => window.__zns.game.castLocalSpell('анфёрл максима', true)), 'UnfurlMaxima');
    await until(page, () => window.__ship.sails.every((s) => s.open > 0.99));
    assert.ok(await page.evaluate(() => window.__ship.sails.every((s) => s.open > 0.99)), 'all the sails are down');

    // «Вайнд Максима» into the sails: they bulge, the ship moves — slowly
    await page.evaluate(() => { const g = window.__zns.game, s = window.__ship; g.cameraBaseRotation = s.st.yaw; g.character.group.rotation.y = s.st.yaw; g._lastWind = 0; });
    await feed(page, { arms: 'up' }, 10, 40);
    // (aim the gust: from behind the sails along the ship)
    const gust = await page.evaluate(() => {
        const g = window.__zns.game, s = window.__ship;
        const o = window.__w(0, s.layout.deck + 20, 30), d = s.pose.dirToWorld(0, -1, { x: 0, z: 0 });
        g.spells.cast('WindMaxima', new window.__zns.THREE.Vector3(o.x, o.y, o.z), new window.__zns.THREE.Vector3(d.x, 0, d.z), 'right', g.localId);
        const sw = s.st.spellWind;
        const main = s.sails.find((x) => x.id === 'main:course');
        return { sw: Math.hypot(sw.x, sw.z), fill: main.fill, gust: main.gust, blow: s.blow ? Math.round(s.blow.gain) : 0 };
    });
    assert.ok(gust.blow > 30, `the wind blows into the sails (${gust.blow} m/s)`);
    await frames(page, 10);
    const bulge = await page.evaluate(() => { const s = window.__ship; const m = s.model.sails.get('main:course'); return { b: m.maxBulge, fill: s.sails.find((x) => x.id === 'main:course').fill }; });
    assert.ok(bulge.fill > 0.5 && Math.abs(bulge.b) > 1, `the main course bulges (${bulge.b.toFixed(2)} m, fill ${bulge.fill.toFixed(2)})`);
    // heavy: after ~5 s of ship time it barely moves; later it goes
    const speeds = await page.evaluate(async () => {
        const g = window.__zns.game, s = window.__ship;
        const out = [];
        window.__home = { x: s.st.x, z: s.st.z, yaw: s.st.yaw };
        const t0 = performance.now();
        // simulate in fixed steps through the game's own physics (the frame rate of the test browser is low)
        for (let i = 0; i < 250; i++) { if (s.blow) s.blow.at = performance.now(); g.ships._simulate(s, 0.1); if (i === 49) out.push(s.st.u); }
        out.push(s.st.u);
        // it keeps blowing while the caster's spell lasts…
        const w5 = Math.hypot(s.st.spellWind.x, s.st.spellWind.z);
        for (let i = 0; i < 60; i++) { if (s.blow) s.blow.at = performance.now(); g.ships._simulate(s, 0.1); }
        const held = Math.hypot(s.st.spellWind.x, s.st.spellWind.z) / w5;
        // …until «стоп»: then it dies down
        const stopped = g.stopSpells();
        for (let i = 0; i < 60; i++) g.ships._simulate(s, 0.1);
        const w11 = Math.hypot(s.st.spellWind.x, s.st.spellWind.z);
        void t0;
        return { u5: out[0], u25: out[1], held, stopped, decay: w11 / w5, w: w5 };
    });
    assert.ok(speeds.u5 > 0.2 && speeds.u5 < 4, `slow to gather way: ${speeds.u5.toFixed(2)} m/s after 5 s`);
    assert.ok(speeds.u25 > 5, `but it goes: ${speeds.u25.toFixed(2)} m/s after 25 s`);
    assert.ok(speeds.w > 30, `«Вайнд Максима» blows hard into the sails (${speeds.w.toFixed(1)} m/s)`);
    assert.ok(speeds.held > 0.97, 'the wind keeps blowing while the spell lasts');
    assert.ok(speeds.stopped, '«стоп» stops it');
    assert.ok(speeds.decay > 0.5 && speeds.decay < 0.95, `then the wind dies down (${speeds.decay.toFixed(2)} in 6 s)`);
    // coasting: no wind — it keeps going for a long time
    const coast = await page.evaluate(() => {
        const g = window.__zns.game, s = window.__ship;
        s.st.spellWind.x = s.st.spellWind.z = 0;
        const u0 = s.st.u;
        for (let i = 0; i < 100; i++) g.ships._simulate(s, 0.1);
        return { u0, u: s.st.u };
    });
    assert.ok(coast.u > 0.6 * coast.u0, `a heavy ship coasts (${coast.u0.toFixed(2)} → ${coast.u.toFixed(2)} in 10 s)`);
    // «Фёрл»: rolled up again (the ship back where I stand: the fast simulation above sailed it away without me)
    await page.evaluate(() => { const s = window.__ship, h = window.__home; s.st.x = h.x; s.st.z = h.z; s.st.yaw = h.yaw; s.st.u = s.st.v = s.st.r = 0; window.__zns.game.ships._place(s); });
    await standAt(page, 2, q.z0 + 6, 0, q.y);
    await feed(page, { arms: 'up' }, 15, 40);
    const furl = await page.evaluate(() => { const g = window.__zns.game; let said = null; const sv = g.hud.setVoice.bind(g.hud); g.hud.setVoice = (t, f) => { said = t; return sv(t, f); }; const r = g.castLocalSpell('фёрл', true); g.hud.setVoice = sv; return { r, said, me: g.ships.me?.ship.id, raised: g.character.isArmRaised('right') }; });
    assert.equal(furl.r, 'Furl', JSON.stringify(furl));
    await until(page, () => window.__ship.sails.filter((s) => s.target === 0).every((s) => s.open < 0.02));
    const furled = await page.evaluate(() => window.__ship.sails.filter((s) => s.target === 0).map((s) => s.open));
    assert.ok(furled.length >= 1 && furled.every((o) => o < 0.02), 'a mast\'s sails are rolled up');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('ships: hands on the wheel turn it and the moving ship turns; the crew fights for its wheel; the ship is captured', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await shipAtSea(page, 'pinnace');
    const H = await page.evaluate(() => window.__ship.layout.helm);
    await standAt(page, H.stand.x, H.stand.z + 0.4, 0, H.stand.y);
    await feed(page, { arms: 'forward' }, 10, 40);
    // the hands (the test hook gives the grip points): open on the rim, then closed
    await page.evaluate(() => {
        const s = window.__ship, h = window.__zns.game.ships.helm, H = s.layout.helm;
        for (const sd of ['left', 'right']) window.__zns.game.items.releaseHand(sd); // (empty hands)
        window.__hand = { left: { a: -0.5, curl: 0 }, right: { a: 0.5, curl: 0 } };
        h.input = (side) => {
            const k = window.__hand[side];
            const w = s.pose.toWorld(H.x + Math.sin(k.a) * H.rimR, H.y + Math.cos(k.a) * H.rimR, H.z + 0.05, { x: 0, y: 0, z: 0 });
            return { G: new window.__zns.THREE.Vector3(w.x, w.y, w.z), curl: k.curl };
        };
    });
    await frames(page, 4);
    await page.evaluate(() => { window.__hand.left.curl = 1; window.__hand.right.curl = 1; });
    for (let k = 0; k < 4; k++) {
        if (await until(page, () => { const h = window.__zns.game.ships.helm; return !!(h.held.left && h.held.right); }, null, 20)) break;
        // (a slow test browser: open and close the fingers again)
        await page.evaluate(() => { window.__hand.left.curl = 0; window.__hand.right.curl = 0; });
        await frames(page, 2);
        await page.evaluate(() => { window.__hand.left.curl = 1; window.__hand.right.curl = 1; });
    }
    const grab = await page.evaluate(() => { const g = window.__zns.game, s = window.__ship, h = g.ships.helm; return { l: !!h.held.left, r: !!h.held.right, by: s.helmBy, me: g.localId, reach: h.reach('left'), rr: h.reach('right'), free: h._free('right'), open: [performance.now() - h._open.left, performance.now() - h._open.right], hand: window.__hand, items: [g.items.held.left?.item.kind, g.items.held.right?.item.kind, g.weapons.hands.left.held?.type, g.weapons.hands.right.held?.type], pose: !!g.currentPose, dead: g.isDeadLocal || g.combat?.dead, fl: g.flight?.active, lev: g.levitation?.lifted }; });
    assert.ok(grab.l && grab.r, 'both hands hold the wheel ' + JSON.stringify(grab));
    assert.equal(grab.by, grab.me, 'I am at the helm');
    // the crew noticed
    const hostile = await page.evaluate(() => window.__ship.hostile.has(window.__zns.game.localId));
    assert.ok(hostile, 'the crew is angry: their wheel is taken');
    // hands go round clockwise: the wheel follows
    for (let i = 1; i <= 15; i++) {
        await page.evaluate((i) => { window.__hand.left.a = -0.5 + 0.08 * i; window.__hand.right.a = 0.5 + 0.08 * i; }, i);
        await frames(page, 1);
    }
    await frames(page, 6);
    const wh = await page.evaluate(() => { const s = window.__ship; return { w: s.wheel, rz: s.model.wheel.rotation.z }; });
    assert.ok(wh.w > 0.6, `the wheel turned (${wh.w.toFixed(2)} rad)`);
    assert.ok(Math.abs(wh.rz + wh.w) < 0.02, 'the drawn wheel turns with it');
    // under way, the bow goes to starboard (yaw decreases)
    const turn = await page.evaluate(() => {
        const g = window.__zns.game, s = window.__ship;
        s.st.forced = { u: 4 };
        const y0 = s.st.yaw;
        for (let i = 0; i < 100; i++) g.ships._simulate(s, 0.1);
        return s.st.yaw - y0;
    });
    assert.ok(turn < -0.05, `the ship turns to starboard (${turn.toFixed(3)})`);
    // let go: open the fingers
    await page.evaluate(() => { window.__hand.left.curl = 0; window.__hand.right.curl = 0; });
    await frames(page, 6);
    const rel = await page.evaluate(() => { const g = window.__zns.game; return { l: g.ships.helm.held.left, r: g.ships.helm.held.right, by: window.__ship.helmBy }; });
    assert.ok(!rel.l && !rel.r && rel.by === null, 'let go of the wheel');
    // the crew comes and strikes
    await page.evaluate(() => { const s = window.__ship; s.st.forced = { u: 0, r: 0 }; });
    await standAt(page, H.stand.x + 1.5, H.stand.z + 2, 0, H.stand.y); // (the test moved the ship without me: back aboard)
    // (a slow test browser: the crew's anger may have cooled meanwhile — the wheel taken again)
    await page.evaluate(() => { const g = window.__zns.game; g.ships.crew.provoke(window.__ship, g.localId); });
    let hit = false;
    for (let i = 0; i < 30 && !hit; i++) {
        await feed(page, { arms: 'forward' }, 6, 40);
        hit = await page.evaluate(() => window.__zns.game.combat.hp < window.__zns.game.combat.maxHp);
    }
    const modes = await page.evaluate(() => { const g = window.__zns.game, s = window.__ship; return [...g.ships.crew.byId.values()].map((v) => v.mode).concat([String(g.ships.me?.ship.id), String([...s.hostile.keys()]), String(g.localId)]); });
    assert.ok(hit || modes.some((m) => m === 'run' || m === 'attack' || m === 'block'), `sailors fight (${modes})`); // (block: on guard, waiting their turn)
    // kill the crew: the ship is mine, its chests open
    await page.evaluate(() => {
        const g = window.__zns.game;
        for (const v of [...g.ships.crew.byId.values()]) for (let k = 0; k < 20 && !v.dead; k++) { v.damageCooldown = 0; g.onLocalHit(v, 12, new window.__zns.THREE.Vector3(1, 0, 0), true); }
    });
    const cap = await page.evaluate(() => { const g = window.__zns.game, s = window.__ship; return { owner: s.owner, me: g.localId, hostile: s.hostile.size, locked: s.chests.map((c) => c.locked) }; });
    assert.equal(cap.owner, cap.me, 'the ship is mine');
    assert.equal(cap.hostile, 0);
    assert.ok(cap.locked.every((l) => !l), 'its chests are not locked any more');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('ships: a cannonball taken by hand, put in the muzzle, «Fire» lights the fuse, the shot holes a ship; Bombardo floods; the ship sinks; saved', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await shipAtSea(page, 'galleon', 'gunship', 0);
    // a target: a pinnace 45 m off the galleon's starboard side, broadside on
    const tgt = await page.evaluate(() => {
        const g = window.__zns.game, s = window.__ship;
        const gun = s.layout.cannons.find((c) => c.side > 0);
        const w = window.__w(45, 0, gun.z);
        const t = g.ships.spawn('galleon', w.x, w.z, 0, { id: 'target' });
        return { gun: gun.id, rack: s.layout.racks.find((r) => r.cannon === gun.id).id, hp: t.hp };
    });
    // stand by the gun
    await page.evaluate((gid) => {
        const g = window.__zns.game, s = window.__ship, gun = s.layout.cannons.find((c) => c.id === gid);
        const w = window.__w(gun.x - 2.5, s.layout.deck + 2, gun.z + 1);
        g.character.group.position.set(w.x, w.y, w.z);
    }, tgt.gun);
    await feed(page, { arms: 'forward' }, 6, 40);
    // the hand: open at a ball on the rack, closes → the ball is in the hand
    await page.evaluate(({ rack }) => {
        const g = window.__zns.game, s = window.__ship, C = g.ships.cannons;
        const R = s.layout.racks.find((r) => r.id === rack);
        for (const sd of ['left', 'right']) g.items.releaseHand(sd); // (empty hands)
        window.__ch = { at: window.__w(R.x, R.y + 0.25, R.z), curl: 0 };
        C.input = (side) => side === 'right' ? { G: new window.__zns.THREE.Vector3(window.__ch.at.x, window.__ch.at.y, window.__ch.at.z), curl: window.__ch.curl } : null;
    }, tgt);
    await frames(page, 3);
    await page.evaluate(() => { window.__ch.curl = 1; });
    await frames(page, 3);
    const took = await page.evaluate(({ rack }) => { const g = window.__zns.game; return { held: g.items.held.right?.item.kind || null, left: window.__ship.racks.get(rack) }; }, tgt);
    assert.equal(took.held, 'cannonball', 'a cannonball in the hand');
    assert.equal(took.left, 5, 'one ball less on the rack');
    // into the muzzle
    await page.evaluate(({ gun }) => { const s = window.__ship, c = s.layout.cannons.find((x) => x.id === gun); window.__ch.at = window.__w(c.muzzle.x, c.muzzle.y, c.muzzle.z); }, tgt);
    await frames(page, 3);
    const loaded = await page.evaluate(({ gun }) => ({ loaded: window.__ship.guns.get(gun).loaded, held: window.__zns.game.items.held.right }), tgt);
    assert.ok(loaded.loaded && !loaded.held, 'the ball went into the barrel');
    // «Fire» with the hand at the gun: the fuse burns, then it fires
    await page.evaluate(({ gun }) => {
        const g = window.__zns.game, s = window.__ship, c = s.layout.cannons.find((x) => x.id === gun);
        const fp = window.__w(c.x - c.side * 1.1, c.y + 1.85, c.z);
        const ch = g.character, T = window.__zns.THREE;
        const o = ch.group.position.clone().add(new T.Vector3(0, 1, 0));
        ch.getHandWorldPosition = (side, out = new T.Vector3()) => out.copy(o);
        ch.getHandDirection = (side, out = new T.Vector3()) => out.set(fp.x - o.x, fp.y - o.y, fp.z - o.z).normalize();
        ch.isArmRaised = () => true;
        g.campfires._lastCast = 0;
    }, tgt);
    const fire = await page.evaluate(() => window.__zns.game.castLocalSpell('fire', true));
    assert.equal(fire, 'Fire');
    assert.ok(await page.evaluate(({ gun }) => window.__ship.guns.get(gun).fuse > 0, tgt), 'the fuse is lit (no campfire)');
    let shot = null;
    for (let i = 0; i < 40 && !shot; i++) {
        await frames(page, 3);
        shot = await page.evaluate(() => { const t = window.__zns.game.ships.list.get('target'); return t.holes.length || t.hp < 420 ? { holes: t.holes.length, hp: t.hp } : null; });
    }
    assert.ok(shot, 'the ball hit the other ship');
    assert.ok(shot.hp < tgt.hp, `it is damaged (${shot.hp})`);
    assert.ok(await page.evaluate(({ gun }) => !window.__ship.guns.get(gun).loaded, tgt), 'the gun is empty after the shot');

    // Bombardo at the target's waterline: a hole, the sea comes in
    const flood = await page.evaluate(async () => {
        const g = window.__zns.game, t = g.ships.list.get('target');
        const T = window.__zns.THREE;
        const w = t.pose.toWorld(-t.layout.B / 2 - 0.5, 0, 2, { x: 0, y: 0, z: 0 });
        const n0 = t.holes.length;
        g.explode(new T.Vector3(w.x, w.y, w.z), 3.6, 'local', 1);
        for (let i = 0; i < 30; i++) g.ships._simulate(t, 0.1);
        return { holes: t.holes.length - n0, flood: t.flood };
    });
    assert.ok(flood.holes >= 1, 'Bombardo knocked a hole');
    assert.ok(flood.flood > 0, `water comes in (${flood.flood.toFixed(3)})`);

    // full of water: it sinks and comes to rest on the bottom
    const sink = await page.evaluate(async () => {
        const g = window.__zns.game, t = g.ships.list.get('target');
        t.flood = 0.999;
        const ys = [];
        for (let i = 0; i < 1200 && t.state !== 'wreck'; i++) { g.ships._simulate(t, 0.1); g.ships._place(t); if (i % 50 === 0) ys.push(t.pose.y); }
        return { state: t.state, flooded: t.flooded, ys, y: t.pose.y };
    });
    assert.equal(sink.state, 'wreck', 'the ship went down to the bottom');
    assert.ok(sink.flooded);
    for (let i = 1; i < sink.ys.length; i++) assert.ok(sink.ys[i] <= sink.ys[i - 1] + 1e-6, 'going down all the time');

    // saved: everything about the ships is in the world's save and comes back
    const saved = await page.evaluate(() => {
        const g = window.__zns.game;
        const snap = JSON.parse(JSON.stringify(g.ships.snapshot()));
        const t = snap.find((x) => x.id === 'target');
        // forget the ships, then load them back
        for (const id of ['target', 'gunship']) { const s = g.ships.list.get(id); g.ships.sleep(s); g.ships.list.delete(id); }
        g.ships.restore(snap);
        const back = g.ships.list.get('target');
        g.ships.wake(back);
        return { inSave: !!t, holes: t?.holes.length, state: back?.state, holesBack: back?.holes.length, gun: g.ships.list.get('gunship')?.racks.get(snap.find((x) => x.id === 'gunship').racks[0]?.[0]) };
    });
    assert.ok(saved.inSave, 'the sunk ship is in the save');
    assert.equal(saved.state, 'wreck');
    assert.equal(saved.holesBack, saved.holes, 'its holes come back');
    assert.equal(saved.gun, 5, 'the gun ship\'s rack has one ball less');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('ships: a sea castle\'s port has its ships moored at the piers, guns on the walls; walk up the gangplank aboard', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const port = await page.evaluate(() => {
        const g = window.__zns.game, idx = g.terrain.data.castles, S = g.terrain.data.seas;
        const sea = S.nearest(0, 0);
        let def = null;
        const C = 480;
        for (let r = 0; r < 8 && !def; r++) for (let gx = Math.floor(sea.x / C) - r; gx <= Math.floor(sea.x / C) + r && !def; gx++) for (let gz = Math.floor(sea.z / C) - r; gz <= Math.floor(sea.z / C) + r && !def; gz++) {
            const c = idx.cellOf(gx, gz);
            if (c && c.variant === 'sea' && c.port?.berths?.length) def = c;
        }
        if (!def) return null;
        const b = def.port.berths[0];
        window.__def = def;
        g.character.group.position.set(b.plankA.x, b.plankA.y + 3, b.plankA.z);
        g.world.terrain.flushAround(b.plankA.x, b.plankA.z);
        g.ships.calm = true;
        return { id: def.id, n: def.port.berths.length, guns: def.port.cannons.length };
    });
    assert.ok(port, 'a sea castle with a port');
    const ships = await until(page, (id) => {
        const g = window.__zns.game;
        const l = [...g.ships.list.values()].filter((s) => s.castleId === id);
        return l.length ? l.map((s) => ({ id: s.id, state: s.state, plank: s.plank?.state, sails: s.sails.every((x) => x.target === 0), crew: g.ships.crew.alive(s) })) : null;
    }, port.id, 100);
    assert.equal(ships.length, port.n, 'a ship at every berth');
    for (const s of ships) {
        assert.equal(s.state, 'moored');
        assert.equal(s.plank, 'laid', 'the gangplank to the pier');
        assert.ok(s.sails, 'sails furled');
        assert.ok(s.crew > 0, 'a crew aboard');
    }
    assert.ok(await page.evaluate(() => window.__zns.game.ships.cannons.port.size > 0), 'the port has its guns');
    // the gangplank goes straight across from the pier to the gangway (not slanting along the ship)
    const plank = await page.evaluate((sid) => {
        const s = window.__zns.game.ships.list.get(sid), c = s.plank.collider;
        const la = s.pose.toLocal(c.a.x, c.a.y, c.a.z, {}), lb = s.pose.toLocal(c.b.x, c.b.y, c.b.z, {});
        return { dz: Math.abs(la.z - lb.z), len: Math.hypot(c.b.x - c.a.x, c.b.z - c.a.z) };
    }, ships[0].id);
    assert.ok(plank.dz < 0.3, `a straight plank (askew by ${plank.dz.toFixed(2)} m over ${plank.len.toFixed(1)} m)`);
    // sailors talk like the people of the castles, and never stand inside each other
    const talk = await page.evaluate((sid) => {
        const g = window.__zns.game, s = g.ships.list.get(sid);
        const v = [...g.ships.crew.byId.values()].find((x) => x.ship === s && !x.dead);
        const w = s.pose.toWorld(v.l.x + 2, v.l.y + 2, v.l.z, { x: 0, y: 0, z: 0 });
        g.character.group.position.set(w.x, w.y, w.z);
        s.collider.forget(g.character.group.position);
        const claims = g.ships.crew.claims('привет, как тебя зовут?');
        const heard = g.ships.crew.hear('привет, как тебя зовут?');
        return { claims, heard, bubble: !!v.bubble, talking: v.talking > 0 };
    }, ships[0].id);
    assert.ok(talk.claims && talk.heard && talk.bubble && talk.talking, `a sailor answers ${JSON.stringify(talk)}`);
    await frames(page, 60);
    const apart = await page.evaluate(() => {
        const g = window.__zns.game;
        let min = Infinity;
        const l = [...g.ships.crew.byId.values()].filter((v) => !v.dead && !v.overboard);
        for (const a of l) for (const b of l) if (a !== b && a.ship === b.ship && Math.abs(a.l.y - b.l.y) < 2) min = Math.min(min, Math.hypot(a.l.x - b.l.x, a.l.z - b.l.z));
        return min;
    });
    assert.ok(apart > 0.85, `sailors keep apart (closest ${apart.toFixed(2)} m)`);

    // the gangplank: from the pier, 5 m before it, walk along it aboard
    await page.evaluate((sid) => {
        const g = window.__zns.game, s = g.ships.list.get(sid), A = s.plank.collider.a;
        window.__ship = s;
        const gw = s.plank.collider.b;
        const dx = gw.x - A.x, dz = gw.z - A.z, d = Math.hypot(dx, dz);
        const p = g.character.group.position;
        p.set(A.x - dx / d * 5, A.y + 2.2, A.z - dz / d * 5);
        g.cameraBaseRotation = Math.atan2(-dx, -dz);
        g.character.group.rotation.y = g.cameraBaseRotation;
    }, ships[0].id);
    let aboard = null;
    for (let i = 0; i < 12 && !aboard; i++) {
        await feed(page, (k) => ({ arms: 'hang', bob: k % 2 ? 0.02 : -0.02 }), 12, 40);
        aboard = await page.evaluate(() => window.__zns.game.ships.me?.ship.id || null);
    }
    const dbg = await page.evaluate(() => { const g = window.__zns.game, s = window.__ship, p = g.character.group.position; const l = s.pose.toLocal(p.x, p.y, p.z, {}); return { l, A: s.berth.plankA, b: s.plank.collider.b, p: [p.x, p.y, p.z], side: s.plank.side, B: s.layout.B, deck: s.layout.deck, pose: [s.pose.x, s.pose.y, s.pose.z, s.pose.yaw], berth: [s.berth.x, s.berth.z, s.berth.yaw, s.berth.side], swim: g.swim.swimming }; });
    assert.equal(aboard, ships[0].id, 'walked up the gangplank onto the deck ' + JSON.stringify(dbg));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('ships: hand over hand up the rope ladder out of the sea onto the deck; a mooring loop lifted off its bollard by hand', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await shipAtSea(page, 'pinnace', 'climb-ship', 0.2);
    // in the water beside the starboard ladder
    await page.evaluate(() => {
        const g = window.__zns.game, s = window.__ship, ld = s.layout.ladders.find((l) => l.side > 0);
        const w = window.__w(ld.x + 0.8, -1.6 + 2.0, ld.z);
        g.character.group.position.set(w.x, w.y, w.z);
        s.collider.forget(g.character.group.position);
        for (const sd of ['left', 'right']) g.items.releaseHand(sd);
        // the hands: on the ladder's line, `h` metres above the feet
        window.__rh = { left: { h: 3, curl: 0 }, right: { h: 3, curl: 0 } };
        g.ships.rigging.input = (side) => {
            const p = g.character.group.position, k = window.__rh[side];
            const L = s.pose.toLocal(p.x, p.y - 2.0, p.z, { x: 0, y: 0, z: 0 });
            const lx = ld.side * (s.layout.hullHalfWidth(ld.z, s.layout.deck) + 0.35);
            const q = s.pose.toWorld(lx, L.y + k.h, ld.z, { x: 0, y: 0, z: 0 });
            return { G: new window.__zns.THREE.Vector3(q.x, q.y, q.z), curl: k.curl };
        };
    });
    await feed(page, { arms: 'forward' }, 10, 40);
    const y0 = await page.evaluate(() => { const s = window.__ship, p = window.__zns.game.character.group.position; return s.pose.toLocal(p.x, p.y, p.z, {}).y - 2; });
    let onDeck = false;
    const log = [];
    const set = (side, h, curl) => page.evaluate(({ side, h, curl }) => { Object.assign(window.__rh[side], { h, curl }); }, { side, h, curl });
    for (let cycle = 0; cycle < 8 && !onDeck; cycle++) {
        const a = cycle % 2 ? 'right' : 'left', b = cycle % 2 ? 'left' : 'right';
        // reach up to the highest rung within the arm's reach (the bulwark's top last), open, close on it
        const reach = await page.evaluate(() => {
            const g = window.__zns.game, s = window.__ship, R = g.ships.rigging, p = g.character.group.position;
            const feet = R.climb ? R.climb.ly : s.pose.toLocal(p.x, p.y - 2, p.z, {}).y;
            const ld = s.layout.ladders.find((l) => l.side > 0);
            const ys = [];
            for (let y = ld.bottom + 0.4; y <= ld.top + 0.01; y += ld.rung) ys.push(y);
            ys.push(ld.top + s.layout.rail);
            const up = ys.filter((y) => y <= feet + 4.3).pop();
            return up - feet;
        });
        await set(a, reach, 0); await frames(page, 2);
        await set(a, reach, 1); await frames(page, 3);
        await set(b, 3, 0); await frames(page, 3);           // the other hand lets go
        for (let k = 0; k < 6; k++) { await set(a, reach - 0.3 * (k + 1), 1); await frames(page, 3); } // pull down: the body goes up
        onDeck = await page.evaluate(() => window.__zns.game.ships.me?.ship.id === 'climb-ship' && !window.__zns.game.ships.rigging.climbing);
        log.push(await page.evaluate(() => { const R = window.__zns.game.ships.rigging; return R.climb ? { ly: +R.climb.ly.toFixed(2), holds: JSON.stringify(R.climb.holds) } : 'none'; }));
    }
    const top = await page.evaluate(() => { const g = window.__zns.game, s = window.__ship, p = g.character.group.position; return { y: s.pose.toLocal(p.x, p.y, p.z, {}).y - 2, deck: s.layout.deck, rider: g.ships.me?.ship.id || null }; });
    assert.ok(onDeck, `climbed up onto the deck (feet from ${y0.toFixed(1)} to ${top.y.toFixed(1)}, deck ${top.deck}) ${JSON.stringify(log)}`);

    // a mooring loop: close the fingers on it and lift the hand
    const line = await page.evaluate(() => {
        const g = window.__zns.game, s = window.__ship, R = g.ships.rigging;
        g.ships.rigging.input = null;
        s.lines = [{ id: 'bow', bitt: { ...s.layout.bitts[0] }, bollard: (() => { const w = window.__w(12, 0, s.layout.bitts[0].z); return { x: w.x, y: 2.5, z: w.z }; })(), L0: 13, state: 'tied', strain: 0 }];
        const eye = R.eyeAt(s.lines[0], new window.__zns.THREE.Vector3());
        window.__eye = { x: eye.x, y: eye.y, z: eye.z, dy: 0, curl: 0 };
        R.input = (side) => side === 'right' ? { G: new window.__zns.THREE.Vector3(window.__eye.x, window.__eye.y + window.__eye.dy, window.__eye.z), curl: window.__eye.curl } : null;
        return true;
    });
    assert.ok(line);
    await frames(page, 2);
    await page.evaluate(() => { window.__eye.curl = 1; });
    await frames(page, 3);
    await page.evaluate(() => { window.__eye.dy = 0.9; });
    await frames(page, 3);
    assert.equal(await page.evaluate(() => window.__ship.lines[0].state), 'free', 'the loop came off the bollard');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('ships: a Bombardo cast at the deck breaks through it, the sea pours in, that end goes down first and the ship sinks', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await shipAtSea(page, 'pinnace', 'boom-ship', 0);
    // the spell itself: the orb flies down onto the foredeck and bursts there
    await page.evaluate(() => {
        const g = window.__zns.game, s = window.__ship, T = window.__zns.THREE;
        const o = window.__w(0, s.layout.deck + 14, -12), t = window.__w(0, s.layout.deck, -12);
        const d = new T.Vector3(t.x - o.x, t.y - o.y, t.z - o.z).normalize();
        g.character.group.position.set(o.x + 30, o.y, o.z);
        g.spells.cast('Bombardo', new T.Vector3(o.x, o.y, o.z), d, 'right', g.localId);
    });
    const hit = await until(page, () => { const s = window.__ship; return s.holes.length ? { holes: s.holes.map((h) => ({ deck: !!h.deck, ly: h.ly, r: h.r })), hp: s.hp } : null; }, null, 200);
    assert.ok(hit, 'the orb hit the ship');
    assert.ok(hit.holes.some((h) => h.deck), 'the deck is broken through');
    assert.ok(hit.holes.some((h) => !h.deck && h.ly < 0.3), `the hull is torn open down to the water ${JSON.stringify(hit.holes)}`);
    const sink = await page.evaluate(() => {
        const g = window.__zns.game, s = window.__ship;
        let t = 0, pitchAt = null;
        while (s.state !== 'wreck' && t < 300) { g.ships._simulate(s, 0.1); g.ships._place(s); t += 0.1; if (pitchAt === null && s.flood > 0.5) pitchAt = s.sinkPitch; }
        return { t, state: s.state, pitchAt };
    });
    assert.equal(sink.state, 'wreck', 'one Bombardo sinks a pinnace');
    assert.ok(sink.t < 120, `in ${sink.t.toFixed(0)} s`);
    assert.ok(sink.pitchAt < 0, 'the holed bow goes down first');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
