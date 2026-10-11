/**
 * Death: the body stays (then bones), everything drops at it and can be
 * taken back (by hand, «Gather»), respawn with only the wooden wand; a
 * knight's sword drops — in a real browser.
 * Run: node --test tests/e2e/death.test.mjs
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
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
}), n);

test('death in the free world: the body stays, everything drops at it, respawn with only the wooden wand, one thing back by hand, «Gather» the rest; then bones', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await frames(page, 20);
    // carrying a lot: a magic sword, coins, stones, a magic wand; a shield in the hand; a backpack with a scroll in its slot
    const setup = await page.evaluate(() => {
        const g = window.__zns.game, inv = g.inventory;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        inv.slots.fill(null);
        inv.slots[0] = { kind: 'weapon', type: 'sword', id: 'dsw1', magic: true, bonus: 30 };
        inv.slots[1] = { kind: 'coins', uid: 'dc1', count: 77 };
        inv.slots[2] = { kind: 'res', block: 1, count: 12 };
        inv.slots[3] = { kind: 'wand', uid: 'dw1', plain: false, model: 2, color: 0xff33aa, dir: null, fav: null, power: 12 };
        g.items.wear({ kind: 'backpack', uid: 'dbp', slots: 3, color: 0x7a4a24 });
        inv.slots[5] = { kind: 'scroll', uid: 'dsc', stat: 'hp', amount: 2 };
        g.items.takeIntoHand({ kind: 'shield', uid: 'dsh', type: 1, magic: false, max: 0 }, 'right');
        inv._render();
        return { slots: inv.slots.length };
    });
    assert.equal(setup.slots, 8, 'the backpack adds slots');

    // killed
    await page.evaluate(() => window.__zns.game.combat.die(null, 'test'));
    await frames(page, 90); // the things fall and settle
    const dead = await page.evaluate(() => {
        const g = window.__zns.game;
        const b = [...g.death.bodies.values()][0];
        const near = (p) => Math.hypot(p.x - b.x, p.z - b.z);
        const loose = [...g.items.loose.values()].filter((L) => near(L.model.position) < 3);
        const weapons = g.weapons.weapons.filter((w) => near(w.position) < 3 && !w.holder);
        return {
            bodies: g.death.bodies.size, bodyInScene: !!b?.model?.parent, lying: b ? b.model.position.y : null, ground: b ? g.collision.groundAt(b.x, b.z, b.y + 1) : null,
            slots: g.inventory.slots.length, filled: g.inventory.slots.filter(Boolean).length, held: !!(g.items.held.right || g.items.held.left), back: !!g.items.worn.backpack,
            loose: loose.map((L) => L.item.kind).sort(), onGround: loose.every((L) => L.rest && Math.abs(L.model.position.y - g.collision.groundAt(L.model.position.x, L.model.position.z, L.model.position.y + 1)) < 0.4),
            weapons: weapons.map((w) => ({ type: w.type, magic: !!w.magic })),
            saved: g.keeper ? g.keeper.snapshot().bodies.length : 1,
        };
    });
    assert.equal(dead.bodies, 1, 'a body stays');
    assert.ok(dead.bodyInScene, 'the body is seen');
    assert.ok(Math.abs(dead.lying - dead.ground) < 0.3, `it lies on the ground (${dead.lying} / ${dead.ground})`);
    assert.equal(dead.filled, 0, 'nothing left in the slots');
    assert.equal(dead.slots, 5, 'the backpack is off');
    assert.ok(!dead.held && !dead.back, 'nothing in the hands, nothing on the back');
    assert.deepEqual(dead.loose, ['backpack', 'blocks', 'coins', 'scroll', 'shield', 'wand'], 'everything lies at the body');
    assert.ok(dead.onGround, 'on the ground');
    assert.deepEqual(dead.weapons, [{ type: 'sword', magic: true }], 'the sword lies there');
    assert.equal(dead.saved, 1, 'the body is in the world save');

    // back to life: only the plain wooden wand
    const alive = await page.evaluate(() => {
        const g = window.__zns.game;
        g.respawn();
        const got = g.inventory.slots.filter(Boolean);
        return { n: got.length, kind: got[0]?.kind, plain: !!got[0]?.plain, held: !!(g.items.held.right || g.items.held.left) };
    });
    assert.deepEqual(alive, { n: 1, kind: 'wand', plain: true, held: false });

    // back at the body: the hand touches the backpack — it is in the hand; put on
    await page.evaluate(() => {
        const g = window.__zns.game;
        const b = [...g.death.bodies.values()][0];
        g.character.group.position.set(b.x, b.y + 2.4, b.z + 3);
        g.inventory.select(-1);
    });
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 20, 40);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const L = [...g.items.loose.values()].find((x) => x.item.kind === 'backpack');
        L.noPick = 0;
        window.__follow = setInterval(() => { if (g.items.loose.has(L.item.uid)) { g.character.getHandWorldPosition('right', L.model.position); L.rest = true; } }, 16);
    });
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 30, 40);
    const byHand = await page.evaluate(() => {
        const g = window.__zns.game;
        clearInterval(window.__follow);
        const h = g.items.held.right || g.items.held.left;
        const kind = h?.item.kind;
        if (h) g.items.wear(g.items.releaseHand(g.items.held.right ? 'right' : 'left'));
        return { kind, slots: g.inventory.slots.length };
    });
    assert.equal(byHand.kind, 'backpack', 'taken back by hand');
    assert.equal(byHand.slots, 8, 'worn again');

    // «Gather» pointed at the body: all the rest goes into the slots
    const gathered = await page.evaluate(() => {
        const g = window.__zns.game;
        g.books?.learned?.add('Gather');
        g.combat.fatigue = 100;
        const b = [...g.death.bodies.values()][0];
        const ch = g.character;
        const THREE = window.__zns.THREE;
        const raised = ch.isArmRaised, dirOf = ch.getHandDirection;
        ch.isArmRaised = (s) => s === 'right';
        ch.getHandDirection = (s, out = new THREE.Vector3()) => out.set(b.x, b.y + 0.4, b.z).sub(ch.getHandWorldPosition(s)).normalize();
        g._lastBuild = 0;
        const res = g._castBuild('Gather', true);
        ch.isArmRaised = raised; ch.getHandDirection = dirOf;
        const near = (p) => Math.hypot(p.x - b.x, p.z - b.z);
        return {
            res, voice: g.hud.voiceText?.() || '',
            left: [...g.items.loose.values()].filter((L) => near(L.model.position) < 3).length + g.weapons.weapons.filter((w) => near(w.position) < 3).length,
            slots: g.inventory.slots.filter(Boolean).map((s) => (s.kind === 'res' ? 'res' + s.count : s.kind)).sort(),
            coins: g.inventory.coins(),
        };
    });
    assert.equal(gathered.res, 'Gather');
    assert.equal(gathered.left, 0, 'nothing left at the body');
    assert.deepEqual(gathered.slots, ['coins', 'res12', 'scroll', 'shield', 'wand', 'wand', 'weapon'], JSON.stringify(gathered));
    assert.equal(gathered.coins, 77);

    // later: the bones; much later: dust
    const bones = await page.evaluate(async () => {
        const g = window.__zns.game;
        const b = [...g.death.bodies.values()][0];
        b.age = 301;
        await new Promise((r) => setTimeout(r, 300));
        const st = { body: !!b.model, bones: !!b.bones?.parent };
        b.age = 301 + 1200;
        await new Promise((r) => setTimeout(r, 300));
        st.gone = g.death.bodies.size === 0 && !b.bones.parent;
        return st;
    });
    assert.deepEqual(bones, { body: false, bones: true, gone: true });
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('a knight killed: his sword, shield and coins drop at his body, the body stays', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        g.character.group.position.set(c.gate.x, c.gate.y + 2.2, c.gate.z);
        g.world.terrain.flushAround(c.gate.x, c.gate.z);
    });
    await frames(page, 40);
    const k = await page.evaluate(() => {
        const g = window.__zns.game;
        const me = g.character.group.position;
        const knight = [...g.castleLife.byId.values()].filter((v) => v.role === 'knight' && !v.dead).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
        window.__k = knight;
        const before = { bodies: g.death.bodies.size, swords: g.weapons.weapons.length, shield: !!knight.model.shield };
        knight.damageCooldown = 0;
        g.castleLife.hit(knight, 999, null, null, { pierce: true });
        return { ...before, dead: knight.dead, tool: knight.model.toolKind };
    });
    assert.ok(k.dead);
    assert.equal(k.tool, 'none', 'the sword left his hand');
    await frames(page, 60);
    const after = await page.evaluate(() => {
        const g = window.__zns.game, v = window.__k;
        const near = (p) => Math.hypot(p.x - v.x, p.z - v.z);
        return {
            bodies: g.death.bodies.size,
            swords: g.weapons.weapons.filter((w) => w.type === 'sword' && near(w.position) < 3).length,
            loose: [...g.items.loose.values()].filter((L) => near(L.model.position) < 3).map((L) => L.item.kind).sort(),
            copyHidden: [...g.death.bodies.values()].some((b) => b.k === 'v' && b.model && !b.model.visible),
        };
    });
    assert.equal(after.bodies, 1, 'his body stays');
    assert.equal(after.swords, 1, 'his sword lies by him');
    assert.ok(after.loose.includes('coins'), 'coins too: ' + after.loose);
    if (k.shield) assert.ok(after.loose.includes('shield'), 'and the shield');
    assert.ok(after.copyHidden, 'while he lies there himself, the copy waits');
    // when the castle people go away (far / later) the body is still there
    await page.evaluate(() => { const g = window.__zns.game; g.castleLife._deactivate(window.__k); });
    await frames(page, 5);
    assert.ok(await page.evaluate(() => [...window.__zns.game.death.bodies.values()].some((b) => b.k === 'v' && b.model?.visible && b.model.parent)), 'the body is seen');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
