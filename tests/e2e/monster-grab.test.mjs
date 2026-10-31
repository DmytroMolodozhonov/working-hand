/**
 * Монстр берёт существо в лапу — настоящая игра в браузере, синтетические кадры камеры (poses.mjs):
 *   - стал монстром (Pentagranium Monstrum, без маны), у кисти — свинья: пальцы сомкнулись — свинья в лапе, у ладони, не ходит;
 *   - кулак сжат до конца — свинья раздавлена (умерла, сплющена), лапа пуста;
 *   - вторая свинья: взял, раскрыл кисть — выпала из лапы и упала на землю (не висит в воздухе).
 * Run: node --test tests/e2e/monster-grab.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

/** Свинья у ладони той кисти, что держится пальцами; → сторона. */
const pigAtPalm = (page, id) => page.evaluate((id) => {
    const g = window.__zns.game, ch = g.character;
    const side = 'right';
    const p = ch.getHandWorldPosition(side, new window.__zns.THREE.Vector3());
    const pig = g.animals._spawn('pig', p.clone().setY(p.y - 0.8), { id });
    pig.vel?.set?.(0, 0, 0);
    return { side, palm: p.toArray(), pig: !!pig };
}, id);

test('лапа монстра: схватить свинью, раздавить кулаком; другую — взять и отпустить (падает на землю)', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0 }, 10, 40);
    await page.evaluate(() => window.__zns.game.monster.begin({ free: true }));
    // превращение 5 с (камера видит руки вперёд, пальцы раскрыты)
    for (let i = 0; i < 80 && !(await page.evaluate(() => window.__zns.game.monster.phase === 'on')); i++) await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0 }, 3, 33);
    assert.equal(await page.evaluate(() => window.__zns.game.monster.phase), 'on');
    await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0 }, 10, 33);
    // какой кадр камеры даёт «держу, не давлю» (кривая пальцев кадра → getGripCurl у каждой кисти своя): 0,66…0,72
    let LIGHT = 0.72;
    const seenCurls = [];
    for (const c of [0.55, 0.6, 0.65, 0.7, 0.72, 0.75, 0.8]) {
        await feed(page, { arms: 'forward', leftCurl: c, rightCurl: c }, 8, 33);
        const v = await page.evaluate(() => window.__zns.game.character.getGripCurl('right'));
        seenCurls.push([c, +v.toFixed(2)]);
        if (v >= 0.66 && v <= 0.72) { LIGHT = c; break; }
    }
    await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0 }, 15, 33);

    // хват
    await pigAtPalm(page, 'mg-pig1');
    let held = null;
    for (let i = 0; i < 20 && !held; i++) {
        await feed(page, { arms: 'forward', leftCurl: LIGHT, rightCurl: LIGHT }, 1, 33);
        held = await page.evaluate(() => { const g = window.__zns.game, M = g.monsterGrab.mine; return M.right?.id || M.left?.id || null; });
    }
    assert.equal(held, 'mg-pig1', 'свинья в лапе ' + await page.evaluate(() => window.__zns.game.hud.voiceText?.()));
    await feed(page, { arms: 'forward', leftCurl: LIGHT, rightCurl: LIGHT }, 20, 33);
    const near = await page.evaluate(() => {
        const g = window.__zns.game, pig = g.animals.byId.get('mg-pig1'), side = g.monsterGrab.mine.right ? 'right' : 'left';
        const palm = g.character.getHandWorldPosition(side, new window.__zns.THREE.Vector3());
        return { d: pig.group.position.distanceTo(palm), lev: !!pig.lev?.paw, hp: pig.hp, dead: pig.dead };
    });
    assert.ok(near.lev && near.d < 5, 'у ладони ' + JSON.stringify({ near, seenCurls, LIGHT }));
    assert.ok(!near.dead, 'лёгкий кулак не убивает');

    // раздавить
    let dead = false;
    for (let i = 0; i < 60 && !dead; i++) {
        await feed(page, { arms: 'forward', leftCurl: 1, rightCurl: 1 }, 1, 33);
        dead = await page.evaluate(() => !!window.__zns.game.animals.byId.get('mg-pig1')?.dead);
    }
    const r = await page.evaluate(() => { const g = window.__zns.game, pig = g.animals.byId.get('mg-pig1'); return { dead: pig?.dead, crushed: pig?.crushed, empty: !g.monsterGrab.mine.left && !g.monsterGrab.mine.right }; });
    assert.ok(r.dead && r.crushed && r.empty, 'раздавлена ' + JSON.stringify(r));

    // взять и отпустить
    await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0 }, 20, 33);
    await pigAtPalm(page, 'mg-pig2');
    held = null;
    for (let i = 0; i < 20 && !held; i++) {
        await feed(page, { arms: 'forward', leftCurl: LIGHT, rightCurl: LIGHT }, 1, 33);
        held = await page.evaluate(() => { const M = window.__zns.game.monsterGrab.mine; return M.right?.id || M.left?.id || null; });
    }
    assert.equal(held, 'mg-pig2');
    await feed(page, { arms: 'forward', leftCurl: LIGHT, rightCurl: LIGHT }, 20, 33);
    await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0 }, 30, 33);
    await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0 }, 60, 33);
    const f = await page.evaluate(() => {
        const g = window.__zns.game, pig = g.animals.byId.get('mg-pig2'), p = pig.group.position;
        return { lev: !!pig.lev, h: p.y - g.collision.groundY(p.x, p.z), empty: !g.monsterGrab.mine.left && !g.monsterGrab.mine.right };
    });
    assert.ok(f.empty && !f.lev, 'отпустил ' + JSON.stringify(f));
    assert.ok(f.h < 2.5, 'лежит на земле, не висит ' + JSON.stringify(f));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
