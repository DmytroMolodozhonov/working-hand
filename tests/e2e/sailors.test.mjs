/**
 * Sailors in a real browser: the crew fights by turns (two at a time, the rest in a ring), «Авада
 * Кедавра» kills a sailor point-blank, «Вайнд» blows sailors along the deck and over the side,
 * a Bombardo leaves a real hole the sea pours in through, a sailor answers when spoken to.
 * Run: node --test tests/e2e/sailors.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8173;
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

async function until(page, fn, arg = null, maxFrames = 400) {
    let v = null;
    for (let i = 0; i < maxFrames / 5; i++) {
        v = await page.evaluate(fn, arg);
        if (v) return v;
        await frames(page, 5);
    }
    return v;
}

/** Out to the open sea; a ship there (calm water). */
async function shipAtSea(page, cls = 'galleon', id = 'crew-ship', yaw = 0.4) {
    return page.evaluate(({ cls, id, yaw }) => {
        const g = window.__zns.game;
        const S = g.terrain.data.seas;
        const sea = S.nearest(0, 0);
        let a = 0.7;
        for (; a < 7; a += 0.3) { const q = S.pointAt(sea, a, 220); if (S.signedDist(q.x, q.z) > 160) break; }
        const p = S.pointAt(sea, a, 220);
        g.world.terrain.flushAround(p.x, p.z);
        g.seaSurface?.flush?.(p.x, p.z);
        g.ships.calm = true;
        const s = g.ships.spawn(cls, p.x, p.z, yaw, { id });
        window.__ship = s;
        window.__w = (lx, ly, lz) => s.pose.toWorld(lx, ly, lz, { x: 0, y: 0, z: 0 });
        return { deck: s.layout.deck };
    }, { cls, id, yaw });
}

/** The player on the deck at a ship-local point, facing ship-local `face` (0: the bow). */
async function standAt(page, lx, lz, face = 0) {
    await page.evaluate(({ lx, lz, face }) => {
        const g = window.__zns.game, s = window.__ship;
        const w = window.__w(lx, s.layout.deck + 2.0, lz);
        const p = g.character.group.position;
        p.set(w.x, w.y, w.z);
        s.collider.forget(p);
        g.cameraBaseRotation = s.st.yaw + face;
        g.smoothBody = g.cameraBaseRotation;
        g.character.group.rotation.y = g.cameraBaseRotation;
    }, { lx, lz, face });
}

/** One sailor (not the captain) put at a ship-local point on the main deck, standing still (talking). */
const placeSailor = (page, lx, lz) => page.evaluate(({ lx, lz }) => {
    const g = window.__zns.game, s = window.__ship;
    const v = [...g.ships.crew.byId.values()].find((x) => x.ship === s && x.role === 'sailor' && !x.dead);
    v.l.x = lx; v.l.z = lz; v.l.y = s.layout.deck; v.path = null; v.talking = 999; v.talkTo = null;
    g.ships.crew._place(s);
    return v.id;
}, { lx, lz });

test('sailors: the crew fights by turns — never more than two at you, never two swings at once, the rest in a ring', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await shipAtSea(page, 'galleon');
    await standAt(page, 0, -6, 0);
    await feed(page, { arms: 'down' }, 4, 40);
    await frames(page, 10);
    await page.evaluate(() => {
        const g = window.__zns.game;
        g.ships.crew.provoke(window.__ship, g.localId, null);
        // (count the blows that reach me)
        window.__cuts = 0;
        const st = g.castleLife.struck.bind(g.castleLife);
        g.castleLife.struck = (...a) => { window.__cuts++; return st(...a); };
    });
    const seen = { maxClose: 0, maxSwing: 0, maxEngage: 0, minApart: Infinity, ring: 0, hits: 0, roles: new Set() };
    for (let i = 0; i < 70; i++) {
        await frames(page, 5);
        if (i % 10 === 9) await standAt(page, 0, -6, 0); // (the blows shove me back: to my place again)
        const st = await page.evaluate(() => {
            const g = window.__zns.game, s = window.__ship;
            // (stand there and take it: the hearts are topped up so the test can watch the fight)
            const hp0 = window.__cuts > 0 ? 0 : 1;
            if (g.combat.hp < g.combat.maxHp * 0.5) g.combat.hp = g.combat.maxHp;
            g.playerHP = g.maxHP;
            const me = s.pose.toLocal(g.character.group.position.x, g.character.group.position.y - 2, g.character.group.position.z, {});
            const l = [...g.ships.crew.byId.values()].filter((v) => v.ship === s && !v.dead && !v.overboard);
            let apart = Infinity;
            for (const a of l) for (const b of l) if (a !== b && Math.abs(a.l.y - b.l.y) < 2) apart = Math.min(apart, Math.hypot(a.l.x - b.l.x, a.l.z - b.l.z));
            const d = (v) => Math.hypot(v.l.x - me.x, v.l.z - me.z);
            return {
                aboard: g.ships.me?.ship === s,
                close: l.filter((v) => d(v) < 2.4).length,
                who: l.filter((v) => d(v) < 2.4).map((v) => `${v.role}/${v.tac?.role}/${v.mode}/${v.fs?.st}/${d(v).toFixed(1)}/r${v.tac?.r?.toFixed(1)}`).join(' '),
                swing: l.filter((v) => v.mode === 'attack').length,
                engage: l.filter((v) => v.tac?.role === 'engage').length,
                ring: l.filter((v) => v.tac?.role === 'wait' && d(v) > 3.2 && v.mode !== 'run').length,
                apart, hp0, hpMax: 1, modes: l.map((v) => v.mode),
            };
        });
        // (just put back on my place among them: they need a moment to step aside)
        if ((i % 10 > 1 || i < 10) && st.aboard && st.close > seen.maxClose) { seen.maxClose = st.close; seen.who = st.who; }
        seen.maxSwing = Math.max(seen.maxSwing, st.swing);
        seen.maxEngage = Math.max(seen.maxEngage, st.engage);
        if (i > 20) seen.minApart = Math.min(seen.minApart, st.apart);
        seen.ring = Math.max(seen.ring, st.ring);
        if (st.hp0 < st.hpMax) seen.hits++;
        for (const m of st.modes) seen.roles.add(m);
    }
    assert.ok(seen.maxEngage <= 2, `at most two go at me (${seen.maxEngage})`);
    assert.ok(seen.maxClose <= 2, `at most two within a blade's reach (${seen.maxClose}: ${seen.who})`);
    assert.ok(seen.maxSwing <= 1, `they take turns to swing (${seen.maxSwing} at once)`);
    assert.ok(seen.ring >= 3, `the others wait in a ring (${seen.ring})`);
    assert.ok(seen.minApart > 0.7, `never inside each other (${seen.minApart.toFixed(2)} m)`);
    assert.ok(seen.hits > 0, 'the blades reach me');
    assert.ok(seen.roles.has('block'), `blades up on guard (${[...seen.roles]})`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('sailors: «Авада Кедавра» point-blank kills a sailor; «Вайнд» blows them along the deck and over the side', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await shipAtSea(page, 'galleon', 'spell-ship');
    // Avada from 2 m: the hand points at him, the charge flies, he is dead
    const id = await placeSailor(page, 0, -10);
    await standAt(page, 0, -8, 0);
    await feed(page, { arms: 'forward' }, 10, 40);
    const aim = await page.evaluate(() => { const t = window.__zns.game.duel.pickSide(false); return t ? t.t : null; });
    assert.ok(aim && aim.kind === 'c', `the hand points at the sailor ${JSON.stringify(aim)}`);
    await page.evaluate(() => { const g = window.__zns.game; g.duel.cast('AvadaKedavra', g.duel.pickSide(false)); });
    const dead = await until(page, (id) => window.__zns.game.ships.crew.byId.get(id)?.dead, id, 120);
    assert.ok(dead, 'Avada Kedavra killed him point-blank');

    // Wind: a sailor 3 m in front reels back along the deck
    const id2 = await placeSailor(page, 0, -12);
    await page.evaluate((id) => { const v = window.__zns.game.ships.crew.byId.get(id); v.talking = 0; }, id2);
    await standAt(page, 0, -9, 0);
    const before = await page.evaluate((id) => ({ ...window.__zns.game.ships.crew.byId.get(id).l }), id2);
    await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, s = window.__ship;
        const o = window.__w(0, s.layout.deck + 2.6, -9.6), t = window.__w(0, s.layout.deck + 2.6, -12);
        g.spells.cast('Wind', new T.Vector3(o.x, o.y, o.z), new T.Vector3(t.x - o.x, 0, t.z - o.z), 'right', g.localId);
    });
    await frames(page, 30);
    const blown = await page.evaluate(({ id, b }) => {
        const g = window.__zns.game, v = g.ships.crew.byId.get(id);
        return { moved: Math.hypot(v.l.x - b.x, v.l.z - b.z), log: g.creatureImpact.log.filter((e) => e.ck === 'c').map((e) => e.res), angry: window.__ship.hostile.has(g.localId) };
    }, { id: id2, b: before });
    assert.ok(blown.log.length > 0, 'the gust reached the sailor');
    assert.ok(blown.moved > 1.2, `blown along the deck (${blown.moved.toFixed(2)} m, ${blown.log})`);
    assert.ok(blown.angry, 'the crew takes offence');

    // Wind Maxima at one by the rail: over the side into the sea
    const id3 = await page.evaluate(() => {
        const g = window.__zns.game, s = window.__ship;
        s.hostile.clear();
        const v = [...g.ships.crew.byId.values()].find((x) => x.ship === s && x.role !== 'captain' && !x.dead && !x.overboard);
        v.l.x = s.layout.B / 2 - 2.6; v.l.z = -4; v.l.y = s.layout.deck; v.path = null; v.talking = 999; v.stunT = 0;
        g.ships.crew._place(s);
        return v.id;
    });
    await standAt(page, -2, -4, -Math.PI / 2);
    await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, s = window.__ship;
        const o = window.__w(-1.4, s.layout.deck + 2.6, -4), t = window.__w(4, s.layout.deck + 2.6, -4);
        g.spells.cast('WindMaxima', new T.Vector3(o.x, o.y, o.z), new T.Vector3(t.x - o.x, 0, t.z - o.z), 'right', g.localId);
    });
    const over = await until(page, (id) => !!window.__zns.game.ships.crew.byId.get(id)?.overboard, id3, 120);
    assert.ok(over, 'blown over the side into the sea');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('sailors: a sailor answers when spoken to (his mates\' chatter never cuts the answer)', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await shipAtSea(page, 'fluyt', 'talk-ship');
    const id = await placeSailor(page, 0, -8);
    await standAt(page, 0, -5.5, 0);
    const r = await page.evaluate((id) => {
        const g = window.__zns.game, crew = g.ships.crew, v = crew.byId.get(id);
        v.talking = 0;
        const said = [];
        const orig = crew._say.bind(crew);
        crew._say = (who, text, ...a) => { said.push([who.id, text]); return orig(who, text, ...a); };
        const first = crew.heardFirst(g.castleLife?.talk);
        const claims = crew.claims('куда плывём?');
        const heard = crew.hear('куда плывём?');
        return { first, claims, heard, said, partner: g.castleLife?.talk?._partner?.id };
    }, id);
    assert.ok(r.first && r.claims && r.heard, `a sailor hears me ${JSON.stringify(r)}`);
    assert.ok(r.said.some(([w, t]) => w === id && /плыв|курс|море/i.test(t)), `he answers about the voyage ${JSON.stringify(r.said)}`);
    assert.equal(r.partner, id, 'my talk partner: only he is heard while we talk');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('sailors: a Bombardo at the side leaves a real hole — torn wood, the sea pours in, the hold fills', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await shipAtSea(page, 'pinnace', 'hole-ship', 0);
    await page.evaluate(() => {
        const g = window.__zns.game, s = window.__ship, T = window.__zns.THREE;
        const o = window.__w(14, 2.4, -6), t = window.__w(5, 2.0, -6);
        g.character.group.position.set(o.x + 10, o.y + 6, o.z);
        g.spells.cast('Bombardo', new T.Vector3(o.x, o.y, o.z), new T.Vector3(t.x - o.x, t.y - o.y, t.z - o.z), 'right', g.localId);
    });
    const hit = await until(page, () => { const s = window.__ship; return s.holes.length ? s.holes.map((h) => ({ deck: !!h.deck, ly: h.ly, r: h.r })) : null; }, null, 200);
    assert.ok(hit && hit.some((h) => !h.deck), `a hole in the side ${JSON.stringify(hit)}`);
    const look = await page.evaluate(() => {
        const s = window.__ship;
        return s.model.holes.children.map((h) => {
            let verts = 0, pale = 0;
            h.traverse((o) => {
                if (!o.isMesh || !o.geometry.attributes.color) return;
                const c = o.geometry.attributes.color;
                verts += c.count;
                for (let i = 0; i < c.count; i++) if (c.getX(i) > 0.65 && c.getY(i) > 0.45) pale++;
            });
            return { verts, pale, kids: h.children.length };
        });
    });
    assert.ok(look.length && look.every((h) => h.verts > 200 && h.pale > 20), `torn planks and pale splinters round every hole ${JSON.stringify(look)}`);
    // the sea pours in: the hold fills, the water shows in the holes
    const fill = await page.evaluate(() => {
        const g = window.__zns.game, s = window.__ship;
        for (let i = 0; i < 60 && s.state !== 'sinking'; i++) g.ships._simulate(s, 0.1);
        return { flood: s.flood, y: g.ships.holdWaterY(s) };
    });
    assert.ok(fill.flood > 0.02 && fill.y !== null, `water comes in ${JSON.stringify(fill)}`);
    await frames(page, 20);
    const water = await page.evaluate(() => {
        const s = window.__ship;
        return { hold: !!s.model.holdWater?.visible, inHole: s.model.holes.children.some((h) => h.userData.water.visible), y: window.__zns.game.ships.holdWaterY(s), state: s.state, flood: s.flood, flooded: s.flooded, has: !!s.model.holdWater, holes: s.model.holes.children.length, detail: s.model.detail };
    });
    assert.ok(water.hold, `water stands in the hold ${JSON.stringify(water)}`);
    assert.ok(water.inHole, 'the water shows in the hole');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('sailors: «привет, моряки» — several answer, each his own line; a sailor walking my way goes round me', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await shipAtSea(page, 'galleon', 'hello-ship');
    await standAt(page, 0, -2, 0);
    // the crew round me on the main deck
    await page.evaluate(() => {
        const g = window.__zns.game, s = window.__ship;
        const l = [...g.ships.crew.byId.values()].filter((x) => x.ship === s && x.role !== 'captain');
        l.slice(0, 4).forEach((v, i) => { v.l.x = -3 + i * 2; v.l.z = -7; v.l.y = s.layout.deck; v.path = null; v.talking = 0; v.waitT = 99; });
        g.ships.crew._place(s);
    });
    const r = await page.evaluate(() => {
        const g = window.__zns.game, crew = g.ships.crew;
        window.__said = [];
        const orig = crew._say.bind(crew);
        crew._say = (who, text, ...a) => { window.__said.push([who.id, text]); return orig(who, text, ...a); };
        return { claims: crew.claims('привет, моряки'), heard: crew.hear('привет, моряки') };
    });
    assert.ok(r.claims && r.heard, JSON.stringify(r));
    await page.waitForTimeout(6500); // (one after another, ~1.3 s apart)
    const said = await page.evaluate(() => window.__said);
    const who = new Set(said.map((x) => x[0]));
    assert.ok(who.size >= 3, `several answer ${JSON.stringify(said)}`);
    assert.equal(new Set(said.map((x) => x[1])).size, said.length, 'each his own line');

    // a sailor sent along the deck straight through where I stand: he goes round me
    // (off the middle line: the masts stand there)
    await standAt(page, 3, -8, 0);
    await frames(page, 4);
    const pass = await page.evaluate(async () => {
        const g = window.__zns.game, s = window.__ship, crew = g.ships.crew;
        const v = [...crew.byId.values()].find((x) => x.ship === s && x.role === 'sailor' && !x.dead);
        for (const o of crew.byId.values()) if (o !== v && o.ship === s) { o.l.x = 6; o.l.z = 20 + o.idx; } // (the others out of the way)
        v.l.x = 3.2; v.l.z = 4; v.l.y = s.layout.deck; v.talking = 0; v.waitT = 0;
        const me = g.ships.me.l;
        let min = Infinity;
        for (let i = 0; i < 360; i++) {
            crew._steer(v, s, 3, -18, 2.2, 1 / 30);
            min = Math.min(min, Math.hypot(v.l.x - me.x, v.l.z - me.z));
        }
        return { min, z: v.l.z, mez: me.z };
    });
    assert.ok(pass.min > 1.0, `he went round me (closest ${pass.min.toFixed(2)} m)`);
    assert.ok(pass.z < pass.mez - 1, `and on his way (${pass.z.toFixed(1)})`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
