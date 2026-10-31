/**
 * Ад в настоящей игре (браузер, воркеры): «Pentagranium Infernum» (150 маны, +10 тьмы) → тело на круге сгорает → врата открыты → постоял в круге →
 * герой в аду на твёрдом у метки (свет и туман ада) → голова горгульи на метке → врата → назад на Землю у той пентаграммы.
 * Run: node --test tests/e2e/hell.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8191;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the hell: the pentagram, the offering, the passage down, the head of a gargoyle, the way back', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld', { smooth: true }).catch(async (e) => {
        if (!/Timeout/.test(e.message)) throw e;
        await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 420000 });
    });
    await waitHudVisible(page, 120000);
    const r = await page.evaluate(async () => {
        const THREE = await import('three');
        const g = window.__zns.game, d = g.terrain.data, P = g.pentagranium, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const out = { said: [] };
        const sv = g.hud.setVoice.bind(g.hud); g.hud.setVoice = (t, ...a) => { out.said.push(String(t).slice(0, 120)); return sv(t, ...a); };
        const me = g.character.group.position;
        const aimAt = (x, z) => { const o = new THREE.Vector3(me.x, me.y + 1, me.z); const t = new THREE.Vector3(x, d.surfaceY(x, z), z); return { origin: o, dir: t.sub(o).normalize() }; };
        // 1) the pentagram: known from its scroll, 150 mana, +10 to the darkness at the word
        P.seen.add('infernum');
        g.combat.maxFatigue = Math.max(g.combat.maxFatigue || 0, 400); g.combat.fatigue = 400;
        const dark0 = g.dark?.level || 0;
        await sleep(500); const f0 = g.combat.fatigue;
        const gx = me.x + 8, gz = me.z;
        out.cast = P.cast(true, 'пентаграниум инфернум', aimAt(gx, gz));
        out.paid = Math.round(f0 - g.combat.fatigue);
        out.dark = (g.dark?.level || 0) - dark0;
        const m = [...P.marks.values()].find((k) => k.pent === 'infernum');
        out.offer = m?.offer;
        if (!m) return out;
        for (let i = 0; i < 900 && m.fade < 0.95; i++) await sleep(100);
        // 2) the offering: one body of a killed creature on the circle → it burns, the gates open
        g.death.creatureDied({ kind: 'p', who: 'test', x: m.x + 0.6, y: m.y + 1, z: m.z });
        for (let i = 0; i < 1800 && !(m.gateOpen > 0); i++) await sleep(100);
        out.open = m.gateOpen > 0;
        if (!out.open) { out.bodies = [...g.death.bodies.values()].map((b) => [b.k, Math.round(b.x - m.x), Math.round(b.y - m.y), Math.round(b.z - m.z), b.off || 0, b.lev || 0]); out.run = !!g.offerings.run; return out; }
        // 3) step into the circle and stand: down into hell, set on firm ground
        me.set(m.x, m.y + 2.1, m.z); g.character.verticalVelocity = 0;
        for (let i = 0; i < 4000 && !(g.hellGate.inHell && !g.heroApply.pending && !g.hellGate.trans); i++) await sleep(100);
        out.inHell = g.hellGate.inHell;
        const sp = d.hellPlan.spawn;
        out.dist = Math.hypot(me.x - sp.x, me.z - sp.z);
        out.feet = me.y - 2 - (d.heightAt(Math.round(me.x), Math.round(me.z)) - 0.5);
        for (let i = 0; i < 100 && g.world.hell < 1; i++) await sleep(100);
        out.hellLight = g.world.hell;
        out.from = g.hellGate.from;
        // 4) the mark there; a gargoyle's head laid on it → the gates open → back on the Earth by the pentagram
        for (let i = 0; i < 1200 && !P.marks.get('hell:back'); i++) await sleep(100);
        const bm = P.marks.get('hell:back');
        out.backMark = !!bm && bm.offer === 'hellBack';
        out.pos = [Math.round(me.x), Math.round(me.y), Math.round(me.z)]; out.pending = g.heroApply.pending?.id || null; out.trans = !!g.hellGate.trans;
        if (!bm) return out;
        for (let i = 0; i < 900 && bm.fade < 0.95; i++) await sleep(100);
        const L = g.items.spawnLoose({ kind: 'gargoyleHead', uid: 'head-test' }, new THREE.Vector3(bm.x + 0.5, bm.y + 1.5, bm.z), {});
        for (let i = 0; i < 1800 && !(bm.gateOpen > 0); i++) await sleep(100);
        out.backOpen = bm.gateOpen > 0;
        out.headGone = !g.items.loose.has('head-test');
        void L;
        me.set(bm.x, bm.y + 2.1, bm.z); g.character.verticalVelocity = 0;
        for (let i = 0; i < 4000 && (g.hellGate.inHell || g.heroApply.pending || g.hellGate.trans); i++) await sleep(100);
        out.back = !g.hellGate.inHell;
        out.backDist = Math.hypot(me.x - m.x, me.z - m.z);
        out.earthLight = g.world.hell;
        return out;
    });
    console.log(JSON.stringify(r));
    assert.equal(r.cast, 'Pentagranium');
    assert.ok(r.paid >= 140 && r.paid <= 150, '150 mana at the word (the first success\'s own little gift aside): ' + r.paid);
    assert.equal(r.dark, 10, '+10 to the darkness');
    assert.equal(r.offer, 'infernum');
    assert.ok(r.open, 'the gates opened after the body burnt');
    assert.ok(r.inHell, 'in hell');
    assert.ok(r.dist < 30, 'by the mark: ' + r.dist);
    assert.ok(Math.abs(r.feet) < 1.5, 'standing on the floor: ' + r.feet);
    assert.ok(r.hellLight > 0.9, 'hell\'s light');
    assert.ok(r.from, 'the way back remembered');
    assert.ok(r.backMark, 'the mark in hell waits for a head');
    assert.ok(r.backOpen && r.headGone, 'the head burnt, the gates open');
    assert.ok(r.back, 'back on the Earth');
    assert.ok(r.backDist < 30, 'by the pentagram: ' + r.backDist);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
}, { timeout: 3000000 });
