/**
 * Новая одежда героя в настоящей игре: все верхи, низы, обувь, шапки и причёски надеваются без ошибок и без утечки (формы общие, материалы чистятся).
 * Run: node --test tests/e2e/hero-wardrobe.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('every top, bottom, shoe, hat and hairstyle dresses the hero without errors or leaks', { timeout: 1700000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
    await startFromMenu(page, 'creative', { smooth: true }).catch(async (e) => {
        if (!/Timeout/.test(e.message)) throw e;
        await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 420000 });
    });
    await waitHudVisible(page, 120000);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, ch = g.character;
        const A = await import('/src/entities/Appearance.js');
        const base = A.defaultLook();
        const geo0 = g.renderer.info.memory.geometries, tex0 = g.renderer.info.memory.textures;
        const out = { n: 0, parts: 0, maxParts: 0 };
        const dress = (o) => { ch.setLook ? ch.setLook({ ...base, ...o }) : null; out.n++; out.parts = ch._lookParts.length; out.maxParts = Math.max(out.maxParts, out.parts); };
        for (let t = 0; t < A.TOPS.length; t++) if (!A.LOOK_HIDDEN.top.has(t)) dress({ top: t });
        for (let b = 0; b < A.BOTTOMS.length; b++) if (!A.LOOK_HIDDEN.bottom.has(b)) dress({ bottom: b });
        for (let s = 0; s < A.SHOES.length; s++) if (!A.LOOK_HIDDEN.shoes.has(s)) dress({ shoes: s });
        for (let h = 0; h < A.HATS.length; h++) if (!A.LOOK_HIDDEN.hat.has(h)) dress({ hat: h });
        for (let h = 0; h < A.HAIR_STYLES.length; h++) dress({ hair: h });
        for (let i = 0; i < 40; i++) dress(A.randomLook());
        dress({});
        // the knight's armour (all codes, the curse bits) and the dark mage's outfit, worn and taken off
        const AL = await import('/src/entities/ArmorLook.js');
        for (const c of [{ h: 1, c: 1, l: 1 }, { h: 2, c: 2, l: 2 }, { h: 3, c: 3, l: 3 }, { h: 1, c: 1, l: 1, dk: 7 }, { r: 1, rc: 0x2c3e7a }, { r: 5 }, {}]) { AL.dressArmor(ch, c); out.n++; }
        ch.setFirstPerson?.(true); AL.dressArmor(ch, { h: 3, c: 3, l: 3 }); AL.dressArmor(ch, { r: 5 }); ch.setFirstPerson?.(false); AL.dressArmor(ch, {});
        out.geoGrowth = g.renderer.info.memory.geometries - geo0;
        out.texGrowth = g.renderer.info.memory.textures - tex0;
        out.hasLook = !!ch.look;
        return out;
    });
    console.log(JSON.stringify(r), errs.length ? errs : '');
    assert.equal(errs.length, 0, 'no page errors');
    assert.ok(r.n > 60 && r.hasLook, 'dressed many looks');
    assert.ok(r.maxParts < 140, `a hero is not too many parts: ${r.maxParts}`);
});
