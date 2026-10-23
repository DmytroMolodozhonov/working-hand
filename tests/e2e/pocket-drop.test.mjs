/**
 * A thing taken out of the right pocket by the LEFT hand (across the body), then the hand opened: it is
 * always somewhere — in the hand, or fallen in the world (and off its cell) — never «gone from the hand,
 * still in the cell, nowhere in the world».
 * Run: node --test tests/e2e/pocket-drop.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8191;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

const BLOCK = { SAND: 9, STONE: 3, LOG: 6 }; // (Terrain.js)
const CASES = [
    { name: 'песок', res: BLOCK.SAND, count: 30 },
    { name: 'камень', res: BLOCK.STONE, count: 30 },
    { name: 'брёвна', res: BLOCK.LOG, count: 12 },
    { name: 'палочка', item: { kind: 'wand', uid: 'pdw', type: 0 } },
    { name: 'меч', item: { kind: 'weapon', type: 'sword', id: 'pds' } },
    { name: 'свиток', item: { kind: 'scroll', uid: 'pdsc', spell: 'lumos' } },
];

test('the left hand takes a thing out of the right pocket and opens, held out or close to the body: it is in the hand or in the world, never gone', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'freeworld'); // (not Creative: there the blocks are endless — nothing is taken off the cell)
    await waitHudVisible(page);
    const look = async (p) => { await page.evaluate((x) => { window.__zns.poseService.interpreter.lastHead.pitch = x; }, p); };
    // what the game holds of the case's thing: hand (seen), cell count, loose in the world
    const state = (c) => page.evaluate((c) => {
        const g = window.__zns.game, inv = g.inventory, block = c.res;
        let cell = 0, world = 0, hand = 0;
        for (const s of inv.slots) {
            if (!s) continue;
            if (c.res && s.kind === 'res' && s.block === block) cell += s.count;
            if (c.item && (s.kind === c.item.kind)) cell += 1;
        }
        for (const L of g.items.loose.values()) {
            if (c.res && (L.item.kind === 'blocks' || L.item.kind === 'logs') && L.item.block === block) world += L.item.count;
            if (c.item && L.item.kind === c.item.kind) world += 1;
        }
        if (c.res && inv.resSide?.() === 'left') hand = 1; // (the stack's handful in the hand: drawn, still counted in the cell)
        if (c.item && (g.items.held.left?.item.kind === c.item.kind || g.weapons.hands.left.held)) hand = 1;
        return { cell, world, hand, sel: inv.selected, cyc: !!inv._cyc, ih: inv.inHand?.kind || null };
    }, c);
    const results = [];
    const only = process.env.ZNS_CASES ? process.env.ZNS_CASES.split(',') : null;
    const t0 = Date.now();
    for (const c of CASES) for (const how of ['out', 'close']) {
        if (only && !only.includes(c.name)) continue;
        console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s: ${c.name} ${how}`);
        await look(0);
        await page.evaluate((c) => {
            const g = window.__zns.game, inv = g.inventory;
            for (const s of ['left', 'right']) { g.items.releaseHand(s); const w = g.weapons.hands[s].held; if (w) { g.weapons._forget(s, g.character.getActiveHands()[s]); g.weapons.remove(w); } }
            for (const L of [...g.items.loose.values()]) g.items.removeLoose?.(L.item.uid);
            inv.select(-1);
            inv.slots.fill(null);
            inv.purse.takeAll?.();
            inv._cyc = null; inv._next = -1;
            inv.slots[0] = c.res ? { kind: 'res', block: c.res, count: c.count } : { ...c.item };
            inv._render();
        }, c);
        await feed(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 20, 40);
        await look(-0.8);
        await feed(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 10, 40);
        await page.waitForFunction(() => window.__zns.game.inventory.headDown, null, { timeout: 30000 });
        await feed(page, { arms: 'hang', pocket: 'cross', rightCurl: 0 }, 20, 40); // into the pocket: taken
        const took = await state(c);
        await look(0);
        await feed(page, { arms: 'hang', rightCurl: 0, leftCurl: 0.9 }, 40, 40); // out of the pocket, the fist (1.6 s)
        const out = await state(c);
        if (how === 'out') await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 40, 40); // held out, opened
        else await feed(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 40, 40); // opened by the body
        await feed(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 30, 40); // (it falls)
        const end = await state(c);
        results.push({ name: c.name, how, took, out, end });
        console.error(JSON.stringify(results.at(-1)));
    }
    console.log(JSON.stringify(results, null, 1));
    for (const r of results) {
        const c = CASES.find((x) => x.name === r.name);
        const n0 = c.res ? c.count : 1;
        assert.ok(r.took.hand, `${r.name}: taken into the left hand ${JSON.stringify(r.took)}`);
        assert.ok(r.out.hand, `${r.name}: still in the hand out of the pocket ${JSON.stringify(r.out)}`);
        // never a ghost: in the hand, or (some of) it in the world and that much off the cell
        if (c.res) assert.equal(r.end.cell + r.end.world, n0, `${r.name} (${r.how}): nothing lost ${JSON.stringify(r.end)}`);
        else assert.equal(r.end.hand + r.end.cell + r.end.world, 1, `${r.name} (${r.how}): one, somewhere ${JSON.stringify(r.end)}`);
        assert.ok(r.end.hand || r.end.world > 0, `${r.name} (${r.how}): not gone from the hand into nowhere ${JSON.stringify(r.end)}`);
        // (the wand — and a staff — never falls out of an opened hand, only thrown: HandRelease, the author's rule; it stays in the hand)
        if (r.how === 'out' && c.item?.kind !== 'wand') assert.ok(r.end.world > 0, `${r.name}: the held-out hand opened — it fell ${JSON.stringify(r.end)}`);
    }
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
