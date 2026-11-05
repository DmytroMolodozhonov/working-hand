/**
 * Вещи и котёл в настоящей игре: что упало сверху — растворилось/легло на дно (золотое яблоко тоже), что брошено в бок — упёрлось в стенку, а не прошло насквозь.
 * Run: node --test tests/e2e/cauldron-items.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8193;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('items dropped over the cauldron fall in; items thrown at its side do not pass through', { timeout: 1700000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    await startFromMenu(page, 'creative', { smooth: true }).catch(async (e) => {
        if (!/Timeout/.test(e.message)) throw e;
        await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 420000 });
    });
    await waitHudVisible(page, 120000);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const THREE = await import('three');
        const { newUid } = await import('/src/game/ItemTypes.js');
        g.potionLair.start();
        for (let i = 0; i < 1800 && (g.potionLair.state || !g.potionLair.plan); i++) await sleep(100);
        await sleep(4000);
        const c = g.cauldrons.list.get('potion_lair_cauldron');
        const base = g.cauldrons.fy(c), H = 3;
        const kinds = [
            { kind: 'apple' }, { kind: 'redApple' }, { kind: 'bread' }, { kind: 'weapon', type: 'sword' }, { kind: 'weapon', type: 'axe' }, { kind: 'wand', model: 2, color: 0x8b5a2b },
            { kind: 'shield', type: 0 }, { kind: 'bow', type: 0 }, { kind: 'flask', count: 1 }, { kind: 'arrows', count: 5 }, { kind: 'crystal' }, { kind: 'cheese' }, { kind: 'pie' },
            { kind: 'backpack', slots: 3, color: 0x7a4a24 }, { kind: 'swanWings' }, { kind: 'coins', count: 3 }, { kind: 'logs', count: 4 },
        ];
        const top = [], side = [];
        const out = { water: c.st.water };
        // from above: dropped over the opening at three spots
        kinds.forEach((k, i) => {
            const item = { ...k, uid: newUid() };
            const a = (i / kinds.length) * 6.283, rr = 0.6;
            const L = g.items.spawnLoose(item, new THREE.Vector3(c.x + Math.cos(a) * rr, base + H + 1.2, c.z + Math.sin(a) * rr), { vel: new THREE.Vector3(0, -0.5, 0), broadcast: false });
            top.push({ k: k.kind + (k.type !== undefined ? ':' + k.type : ''), uid: item.uid, L });
        });
        await sleep(9000);
        out.top = top.map((t) => ({ k: t.k, gone: !g.items.loose.has(t.uid), inCaul: !!t.L.inCaul, y: Math.round((t.L.model.position.y - base) * 10) / 10, rest: !!t.L.rest }));
        // from the side: thrown at the belly height at 9 m/s from 4 m away, in a ring
        kinds.forEach((k, i) => {
            const item = { ...k, uid: newUid() };
            const a = (i / kinds.length) * 6.283;
            const dx = Math.cos(a), dz = Math.sin(a);
            const L = g.items.spawnLoose(item, new THREE.Vector3(c.x + dx * 4.5, base + 2.0, c.z + dz * 4.5), { vel: new THREE.Vector3(-dx * 9, 0.3, -dz * 9), broadcast: false });
            side.push({ k: k.kind + (k.type !== undefined ? ':' + k.type : ''), uid: item.uid, L, dx, dz });
        });
        await sleep(9000);
        out.side = side.map((t) => {
            const p = t.L.model.position, along = (p.x - c.x) * t.dx + (p.z - c.z) * t.dz; // >0: still on the thrower's side; <−1: passed through to the far side
            return { k: t.k, gone: !g.items.loose.has(t.uid), along: Math.round(along * 10) / 10, y: Math.round((p.y - base) * 10) / 10 };
        });
        return out;
    });
    console.log(JSON.stringify(r));
    const bad = (r.top || []).filter((t) => !t.gone && !t.inCaul);
    const through = (r.side || []).filter((t) => !t.gone && t.along < -1.2);
    console.log('NOT IN:', JSON.stringify(bad));
    console.log('THROUGH:', JSON.stringify(through));
    assert.equal(bad.length, 0, 'everything dropped over the opening went in (dissolved or lay on the bottom)');
    assert.equal(through.length, 0, 'nothing thrown at the side passed through');
});
