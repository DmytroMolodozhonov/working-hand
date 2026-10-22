/**
 * Castles and their people — in a real browser.
 * Run: node --test tests/e2e/castles.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8156;
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
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
}), n);

test('castles: people, knights at their posts, the king on his throne; seen violence → the guard; armour; kill the king → the castle is yours', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    // «Свободный мир»: no flying until a scroll of flight is burnt
    const fly = await page.evaluate(() => {
        const g = window.__zns.game;
        const before = g.knowsFlight(), started = g.startFlight();
        g.items.applyScroll({ kind: 'scroll', stat: 'flight' });
        return { before, started, after: g.knowsFlight() };
    });
    assert.deepEqual(fly, { before: false, started: false, after: true });
    const info = await page.evaluate(() => {
        const g = window.__zns.game;
        const idx = g.world.terrain.data.castles;
        const c = idx.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        const p = c.gate;
        g.character.group.position.set(p.x, p.y + 2.2, p.z);
        g.world.terrain.flushAround(p.x, p.z);
        return { id: c.id, name: c.name, stalls: c.stalls.length, knights: c.knights, chests: c.chests.length };
    });
    await frames(page, 40);
    const people = await page.evaluate(() => {
        const g = window.__zns.game, L = g.castleLife;
        const list = [...L.byId.values()];
        const king = list.find((v) => v.role === 'king');
        return {
            n: list.length, king: !!king, seated: king?.seated, kingMode: king?.mode,
            guards: list.filter((v) => v.job === 'guard').length, merchants: list.filter((v) => v.job === 'stall').length,
            wander: list.filter((v) => v.job === 'wander').length, patrol: list.filter((v) => v.job === 'patrol').length,
            chests: g.chests.filter((c) => c.castle && c.castle.id === window.__castle.id).map((c) => c.locked),
            map: g.hud.minimapCastles,
        };
    });
    assert.ok(people.n >= 8, `people: ${people.n}`);
    assert.ok(people.king && people.seated, 'the king sits on his throne');
    assert.ok(people.guards >= 4, `guards ${people.guards}`);
    assert.equal(people.merchants, info.stalls);
    assert.ok(people.chests.length === info.chests && people.chests.every((l) => l === true), 'chests locked while the king lives');
    assert.ok(people.map.includes(info.name), 'on the minimap');
    // a crowd comes out of the houses
    await frames(page, 60);
    assert.ok(await page.evaluate(() => [...window.__zns.game.castleLife.byId.values()].filter((v) => v.job === 'wander').length) >= 2, 'townsfolk walk about');

    // hit a gate guard in front of the others: armour first, the hearts go down slowly; that guard turns on me
    const fight = await page.evaluate(() => {
        const g = window.__zns.game, L = g.castleLife;
        const me = g.character.group.position;
        const guard = [...L.byId.values()].filter((v) => v.job === 'guard' && v.role === 'knight').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
        for (let i = 0; i < 3; i++) { guard.damageCooldown = 0; g.onLocalHit(guard, 6, null, true); }
        const cs = guard.cs;
        return { hp: guard.hp, armor: guard.armor, hostile: cs.hostile.has(g.localId), foes: [...cs.active.values()].filter((v) => v.foe === g.localId).length };
    });
    assert.equal(fight.armor, 50 - 18, 'armour took the blows');
    assert.ok(fight.hp > 16 && fight.hp < 20, `hearts go down slowly (${fight.hp})`);
    // (a fight with one knight is between the two of us: he fights me himself, the castle is not called)
    assert.ok(!fight.hostile && fight.foes === 1, `that guard fights me, alone (${fight.foes} knights)`);
    // they run at me and strike (or I am already down)
    let seenRun = false, hp = 20;
    for (let i = 0; i < 12; i++) {
        await frames(page, 5);
        const s = await page.evaluate(() => { const g = window.__zns.game; return { run: [...g.castleLife.byId.values()].some((v) => v.foe && (v.mode === 'run' || v.mode === 'attack')), hp: g.combat.hp, dead: g.combat.dead }; });
        seenRun = seenRun || s.run;
        hp = Math.min(hp, s.dead ? 0 : s.hp);
        if (seenRun && hp < 20) break;
    }
    assert.ok(seenRun, 'knights run at me');
    assert.ok(hp < 20, `the knights' swords hurt (${hp} HP)`);
    // (back on my feet for the king)
    await page.evaluate(() => { const g = window.__zns.game; if (g.combat.dead) g.respawn(); g.combat.hp = 20; });

    // the king: hit him → every knight comes; kill him → the castle is mine
    const end = await page.evaluate(() => {
        const g = window.__zns.game, L = g.castleLife;
        const king = [...L.byId.values()].find((v) => v.role === 'king');
        const before = [...king.cs.active.values()].filter((v) => v.role === 'knight').length;
        king.damageCooldown = 0;
        g.onLocalHit(king, 10, null, true);
        const after = [...king.cs.active.values()].filter((v) => v.role === 'knight').length;
        const kingArmorHit = { hp: king.hp, armor: king.armor };
        for (let i = 0; i < 60 && !king.dead; i++) { king.damageCooldown = 0; g.onLocalHit(king, 12, null, true); }
        const st = L.state(king.cs.def.id);
        return {
            before, after, kingArmorHit, dead: king.dead, owner: st.owner === g.localId, kingDead: st.kingDead,
            hostile: king.cs.hostile.size, foes: [...king.cs.active.values()].filter((v) => v.foe).length,
            chests: king.cs.chests.map((c) => c.locked), snap: L.snapshot()[king.cs.def.id],
        };
    });
    assert.ok(end.after > end.before, `knights come running (${end.before} → ${end.after})`);
    assert.deepEqual(end.kingArmorHit, { hp: 28, armor: 90 }, 'the king\'s armour (100)');
    assert.ok(end.dead && end.kingDead && end.owner, 'the castle is mine');
    assert.equal(end.hostile, 0);
    assert.equal(end.foes, 0, 'the knights stop');
    assert.ok(end.chests.every((l) => l === false), 'chests open');
    assert.ok(end.snap && end.snap.kingDead, 'saved');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('a blow is between two: a light knock — told off; a hard punch — that one fights me, no guards; hurting people one after another — the guard comes', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        g.character.group.position.set(c.gate.x, c.gate.y + 2.2, c.gate.z);
        g.world.terrain.flushAround(c.gate.x, c.gate.z);
        g.combat.damage = () => {}; g.damageLocalPlayer = () => {};
    });
    for (let i = 0; i < 60; i++) {
        await frames(page, 10);
        if (await page.evaluate(() => [...window.__zns.game.castleLife.byId.values()].filter((v) => !v.dead && v.role !== 'knight' && v.role !== 'king').length >= 4)) break;
    }
    const r = await page.evaluate(() => {
        const g = window.__zns.game, L = g.castleLife;
        const cs = L.castles.get(window.__castle.id);
        const folk = [...cs.active.values()].filter((v) => !v.dead && v.role !== 'knight' && v.role !== 'king' && !v.wizard);
        const knightsOnMe = () => [...cs.active.values()].filter((v) => v.role === 'knight' && v.foe === g.localId).length;
        const punch = (v, hard) => { v.damageCooldown = 0; g.onLocalHit(v, 1, null, false, { hard }); };
        const [a, b, c, d] = folk;
        punch(a, false);
        const light = { foe: a.foe === g.localId, said: a.bubble?.text || '', hostile: cs.hostile.has(g.localId), knights: knightsOnMe() };
        punch(b, true);
        const hard = { foe: b.foe === g.localId, grudge: b.grudge?.id === g.localId, hostile: cs.hostile.has(g.localId), knights: knightsOnMe() };
        punch(c, true);
        const two = { hostile: cs.hostile.has(g.localId), knights: knightsOnMe() };
        punch(d, true); // (the third person hurt within two minutes: a rampage)
        const rampage = { hostile: cs.hostile.has(g.localId), knights: knightsOnMe() };
        return { n: folk.length, light, hard, two, rampage };
    });
    assert.ok(r.n >= 4, `townsfolk: ${r.n}`);
    assert.ok(!r.light.foe && !r.light.hostile && r.light.knights === 0 && r.light.said, `a light knock: told off (${JSON.stringify(r.light)})`);
    assert.ok(r.hard.foe && r.hard.grudge && !r.hard.hostile && r.hard.knights === 0, `a hard punch: that one fights me, no guards (${JSON.stringify(r.hard)})`);
    assert.ok(!r.two.hostile && r.two.knights === 0, 'two scuffles are still no war');
    assert.ok(r.rampage.hostile, `a rampage: the castle turns on me (${JSON.stringify(r.rampage)})`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('market and talk: coins on the counter + the good named = bought (the rest stays in the pouch), an unpaid good can\'t be taken, sell a wand for a pouch of coins; only near villagers hear you', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        const s = c.stalls[0];
        g.character.group.position.set(s.front.x, s.front.y + 2.2, s.front.z);
        g.world.terrain.flushAround(s.front.x, s.front.z);
        g.inventory.storeItem({ kind: 'coins', uid: 'test-coins', count: 100 });
    });
    // goods appear on the counters
    let goods = [];
    for (let i = 0; i < 20 && goods.length < 1; i++) {
        await frames(page, 10);
        goods = await page.evaluate(() => { const T = window.__zns.game.castleLife.talk; const s = T.stalls.get(window.__castle.id + ':s0'); return s ? s.goods : []; });
    }
    assert.ok(goods.length >= 1, 'goods on the counter');
    // buy: an unpaid good stays on the counter; coins put on the counter, the good named — paid, the rest left in the pouch
    const pre = await page.evaluate((uid) => {
        const g = window.__zns.game;
        g.items.pickUp(uid, g.localId, 'right');
        const c = window.__castle.stalls[0].counter;
        g.items.spawnLoose({ kind: 'coins', uid: 'test-pouch', count: 100 }, { x: (c.x0 + c.x1) / 2, y: c.top + 0.4, z: (c.z0 + c.z1) / 2, clone() { return { ...this }; } });
        return { held: !!g.items.held.right, onCounter: g.items.loose.has(uid) };
    }, goods[0]);
    assert.deepEqual(pre, { held: false, onCounter: true }, 'not taken before it is paid');
    let asked = false;
    for (let i = 0; i < 20 && !asked; i++) { await frames(page, 8); asked = await page.evaluate(() => window.__zns.game.castleLife.talk.purse?.uid === 'test-pouch'); }
    assert.ok(asked, 'the merchant sees the coins');
    const buy = await page.evaluate((uid) => {
        const g = window.__zns.game, T = g.castleLife.talk;
        const L = g.items.loose.get(uid);
        const price = L.item.shop.price, name = { bread: 'хлеб', cheese: 'сыр', pie: 'пирог', steak: 'стейк', apple: 'яблоко', arrows: 'стрелы', shield: 'щит', bow: 'лук' }[L.item.kind];
        const heard = T.hear(name);
        const rest = [...g.items.loose.values()].find((x) => x.item.kind === 'coins')?.item.count ?? 0;
        g.items.pickUp(uid, g.localId, 'right');
        const item = g.items.held.right?.item;
        return { price, heard, rest, paid: !!item && !item.shop };
    }, goods[0]);
    assert.ok(buy.heard && buy.paid, JSON.stringify(buy));
    assert.equal(buy.rest, 100 - buy.price);
    // a market merchant only sells: a wand put on his counter — no offer
    await page.evaluate(() => {
        const g = window.__zns.game;
        g.items.releaseHand('right');
        const c = window.__castle.stalls[0].counter;
        g.items.spawnLoose({ kind: 'wand', uid: 'test-wand', model: 1, color: 0x8844ff, dir: 'duel', fav: 'Inferno', power: 20 }, { x: (c.x0 + c.x1) / 2, y: c.top + 0.6, z: (c.z0 + c.z1) / 2, clone() { return { ...this }; } });
    });
    await frames(page, 80);
    assert.equal(await page.evaluate(() => window.__zns.game.castleLife.talk.offer?.kind === 'sell'), false, 'a market merchant buys nothing');
    // the shady buyer out of the way: a plain bow — 60 % of its price; «да» — a pouch to take
    await page.evaluate(() => {
        const g = window.__zns.game, f = window.__castle.stalls.find((t) => t.fence);
        g.items.removeLoose('test-wand');
        g.character.group.position.set(f.front.x, f.front.y + 1.95, f.front.z);
        g.world.terrain.flushAround(f.front.x, f.front.z);
    });
    await page.waitForFunction(() => [...window.__zns.game.castleLife.byId.values()].some((v) => v.cs.def === window.__castle && v.role === 'merchant' && window.__castle.stalls[v.entry.stall]?.fence), null, { timeout: 30000, polling: 300 });
    await page.evaluate(() => {
        const g = window.__zns.game, c = window.__castle.stalls.find((t) => t.fence).counter;
        g.items.spawnLoose({ kind: 'bow', uid: 'test-bow', type: 0, magic: false, bonus: 0, arrows: 5 }, { x: (c.x0 + c.x1) / 2, y: c.top + 0.3, z: (c.z0 + c.z1) / 2, clone() { return { ...this }; } });
    });
    let sellOffer = null;
    for (let i = 0; i < 20 && !sellOffer; i++) {
        await frames(page, 8);
        sellOffer = await page.evaluate(() => { const o = window.__zns.game.castleLife.talk.offer; return o && o.kind === 'sell' ? { price: o.price, uid: o.uid } : null; });
    }
    assert.deepEqual(sellOffer, { price: 15, uid: 'test-bow' }, 'the shady buyer pays 60 % of 25');
    const sold = await page.evaluate(() => {
        const g = window.__zns.game, T = g.castleLife.talk;
        const before = g.inventory.coins();
        T.hear('да');
        const gone = !g.items.loose.has('test-bow');
        const f = window.__castle.stalls.find((t) => t.fence).front;
        const pouch = [...g.items.loose.values()].find((L) => L.item.kind === 'coins' && !L.item.shop && Math.hypot(L.model.position.x - f.x, L.model.position.z - f.z) < 8);
        if (pouch) g.items.pickUp(pouch.item.uid, g.localId, 'right');
        return { gone, pouch: !!pouch, gained: g.inventory.coins() - before };
    });
    assert.ok(sold.gone && sold.pouch, JSON.stringify(sold));
    assert.equal(sold.gained, sellOffer.price);
    await page.evaluate(() => { const g = window.__zns.game, p = window.__castle.stalls[0].front; g.character.group.position.set(p.x, p.y + 1.95, p.z); });
    // only villagers near me hear me
    const ear = await page.evaluate(() => {
        const g = window.__zns.game, T = g.castleLife.talk;
        const near = T.hear('привет как тебя зовут');
        const p = g.character.group.position.clone();
        // far from everybody
        const all = [...g.castleLife.byId.values()];
        let spot = null;
        for (let r = 30; r < 90 && !spot; r += 5) for (let a = 0; a < 12 && !spot; a++) {
            const x = p.x + Math.cos(a / 2) * r, z = p.z + Math.sin(a / 2) * r;
            if (all.every((v) => Math.hypot(v.x - x, v.z - z) > 12)) spot = { x, z };
        }
        g.character.group.position.x = spot.x; g.character.group.position.z = spot.z;
        const far = T.hear('привет');
        g.character.group.position.copy(p);
        return { near, far };
    });
    assert.deepEqual(ear, { near: true, far: false });
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('wrecking a castle wall with Bombardo: the guards hear it, come to look and go for the one who did it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        const p = c.gate;
        g.character.group.position.set(p.x, p.y + 2.2, p.z);
        g.world.terrain.flushAround(p.x, p.z);
    });
    await frames(page, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, L = g.castleLife, c = window.__castle;
        const T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        // a fire nobody is blamed for: the guards come to look, nobody is hunted
        L.damaged({ x: c.gate.x, y: c.gate.y, z: c.gate.z }, null, 3, false);
        const looking = [...L.byId.values()].filter((v) => v.investigate).length;
        const hostile0 = [...L.castles.values()].some((cs) => cs.hostile.size);
        for (const v of L.byId.values()) v.investigate = null;
        // the wall to the side of the gate, me 22 m outside in the open
        const inward = new T.Vector3(c.x - c.gate.x, 0, c.z - c.gate.z).normalize();
        const along = new T.Vector3(-inward.z, 0, inward.x);
        const wall = new T.Vector3(c.gate.x, c.gate.y + 3, c.gate.z).addScaledVector(inward, 5).addScaledVector(along, 16);
        const me = wall.clone().addScaledVector(inward, -22);
        g.character.group.position.set(me.x, g.collision.groundY(me.x, me.z) + 2.2, me.z);
        const before = g.world.terrain.data.get(Math.round(wall.x), Math.floor(wall.y + 1.5), Math.round(wall.z));
        g.explode(wall, 4, g.localId, 3);
        const after = g.world.terrain.data.get(Math.round(wall.x), Math.floor(wall.y + 1.5), Math.round(wall.z));
        const comeNow = [...L.byId.values()].filter((v) => v.role === 'knight' && (v.investigate || v.foe === g.localId)).length;
        let foes = 0;
        for (let i = 0; i < 60 && !foes; i++) { await frames(5); foes = [...L.byId.values()].filter((v) => v.foe === g.localId).length; }
        const cs = L.castles.get(c.id);
        return { looking, hostile0, before, after, comeNow, foes, hostile: cs.hostile.has(g.localId), wrecked: L.state(c.id).wrecked || 0, voice: g.hud.lastVoice || '' };
    });
    assert.ok(r.looking >= 1, `the guards come to look at a fire (${r.looking})`);
    assert.equal(r.hostile0, false, 'nobody is blamed for a fire of nobody');
    assert.ok(r.wrecked > 0, `the wall was wrecked (${r.before} → ${r.after}, ${r.wrecked} blocks)`);
    assert.ok(r.comeNow >= 2, `knights come at once (${r.comeNow})`);
    assert.ok(r.foes >= 1 && r.hostile, `the guard goes for me (${r.foes})`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('knights fight smart: climb out of a shallow crater (not a deep one), keep apart, surround the enemy from different sides', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        g.character.group.position.set(c.gate.x, c.gate.y + 2.2, c.gate.z);
        g.world.terrain.flushAround(c.gate.x, c.gate.z);
    });
    await frames(page, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, L = g.castleLife, c = window.__castle, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const t = g.world.terrain.data;
        const cs = L.castles.get(c.id);
        const knights = [...cs.active.values()].filter((v) => v.role === 'knight' && !v.dead).sort((a, b) => Math.hypot(a.x - c.gate.x, a.z - c.gate.z) - Math.hypot(b.x - c.gate.x, b.z - c.gate.z)).slice(0, 4);
        // (the hero can't die in this test: we watch how they fight)
        g.combat.damage = () => {}; g.damageLocalPlayer = () => {}; if (g.knockback) g.knockback.add = () => {};
        // out on the open field in front of the gate, 30 m out
        const out = new T.Vector3(c.gate.x - c.x, 0, c.gate.z - c.z).normalize();
        const at = (k) => ({ x: Math.round(c.gate.x + out.x * k), z: Math.round(c.gate.z + out.z * k) });
        const dig = (p, r, depth) => {
            const top = t.topLayer(p.x, p.z);
            for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let k = 0; k < depth; k++) t.set(p.x + dx, top - k, p.z + dz, 0);
            g.world.terrain.flushAround(p.x, p.z);
            return top;
        };
        // a shallow pit (2) and a deep one (5)
        const A = at(26), B = at(40);
        const topA = dig(A, 2, 2), topB = dig(B, 2, 5);
        const k1 = knights[0], k2 = knights[1];
        k1.x = A.x; k1.z = A.z; k1.y = topA - 2 - 0.5; k1.job = 'yard'; k1.path = null; k1.post = null;
        k2.x = B.x; k2.z = B.z; k2.y = topB - 5 - 0.5; k2.job = 'yard'; k2.path = null; k2.post = null;
        const me = at(32);
        g.character.group.position.set(me.x, g.collision.groundY(me.x, me.z) + 2.2, me.z);
        cs.hostile.set(g.localId, Date.now() + 120000);
        for (const k of knights) { k.foe = g.localId; k.investigate = null; }
        let climbed = false;
        const t0 = performance.now();
        while (performance.now() - t0 < 20000) {
            if (k1.mode === 'climb') climbed = true;
            if (k1.y > topA - 1) break;
            g.character.group.position.set(me.x, g.collision.groundY(me.x, me.z) + 2.2, me.z);
            await frames(2);
        }
        const outA = k1.y > topA - 1;
        // two more come from the gate side
        for (const [k, side] of [[knights[2], 1], [knights[3], -1]]) {
            if (!k) continue;
            const p = at(18);
            k.x = p.x + side * 6; k.z = p.z; k.y = g.collision.groundY(k.x, k.z); k.path = null; k.post = null; k.job = 'yard';
        }
        const stillB = k2.y < topB - 3;
        // the four come round me: wait, then look at their places
        const t1 = performance.now();
        while (performance.now() - t1 < 15000) {
            g.character.group.position.set(me.x, g.collision.groundY(me.x, me.z) + 2.2, me.z);
            const near = knights.filter((k) => k !== k2 && Math.hypot(k.x - me.x, k.z - me.z) < 8).length;
            if (near >= 3) { await frames(80); break; }
            await frames(3);
        }
        const near = knights.filter((k) => k !== k2 && Math.hypot(k.x - me.x, k.z - me.z) < 8);
        // (those striking: within reach — from different sides)
        const close = near.filter((k) => Math.hypot(k.x - me.x, k.z - me.z) < 4.5);
        const angles = close.map((k) => Math.atan2(k.z - me.z, k.x - me.x));
        let minGap = Infinity;
        for (let i = 0; i < angles.length; i++) for (let j = i + 1; j < angles.length; j++) { let d = Math.abs(angles[i] - angles[j]); if (d > Math.PI) d = 2 * Math.PI - d; minGap = Math.min(minGap, d); }
        let minDist = Infinity;
        for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) minDist = Math.min(minDist, Math.hypot(near[i].x - near[j].x, near[i].z - near[j].z));
        // «Авада Кедавра» not aimed right at him (at his knees, no lock): it still hits him as it passes
        const victim = close[0] || knights[0];
        const T3 = window.__zns.THREE, ch = g.character;
        const hand = ch.getHandWorldPosition('right', new T3.Vector3());
        const od = ch.getHandDirection.bind(ch);
        ch.getHandDirection = (side, out = new T3.Vector3()) => out.set(victim.x, victim.y + 0.9, victim.z).sub(hand).normalize();
        g.duel.cast('AvadaKedavra', null, 'right');
        const t2 = performance.now();
        while (!victim.dead && performance.now() - t2 < 6000) await frames(2);
        ch.getHandDirection = od;
        const avada = victim.dead;
        const info = knights.map((k) => [Math.round(Math.hypot(k.x - me.x, k.z - me.z) * 10) / 10, k.mode, k.foe ? 1 : 0, k.slotI, k.slotN, Math.round(k.y)]);
        return { avada, climbed, outA, stillB, near: near.length, close: close.length, minGap, minDist, bubbleShout: knights.some((k) => k.bubble?.shout), info: JSON.stringify(info) };
    });
    assert.ok(r.climbed && r.outA, `climbed out of the shallow pit (climb seen: ${r.climbed})`);
    assert.ok(r.stillB, 'a deep pit holds them');
    assert.ok(r.near >= 3, `they came round me (${r.near}): ${r.info}`);
    assert.ok(r.close >= 2 && r.minGap > 1.0, `from different sides (${r.close} close, min angle ${r.minGap.toFixed(2)} rad): ${r.info}`);
    assert.ok(r.minDist > 1.3, `not inside each other (${r.minDist.toFixed(2)} m)`);
    assert.ok(r.bubbleShout, 'battle cries are shouted');
    assert.ok(r.avada, '«Авада Кедавра» passing through a knight kills him (no exact lock needed)');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
