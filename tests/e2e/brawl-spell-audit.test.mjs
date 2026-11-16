/**
 * Проверка заклинаний NPC-магов против существ (автор 17.11: «драки НПС недоработаны — всё писалось под игрока»):
 * каждым заклинанием, которое колдуют маги, стреляем (настоящий WizardFight._cast) по каждому виду существ и смотрим,
 * что вышло: урон, оглушение, заморозка, толчок, потеря оружия. Таблица — в журнале; пустая строка = заклинание НИЧЕГО не сделало.
 * Run: node --test tests/e2e/brawl-spell-audit.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8200;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('what every NPC wizard spell does to every kind of creature', { timeout: 1750000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    await startFromMenu(page, 'brawl');
    await waitHudVisible(page, 120000).catch(() => {});
    const table = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        for (let i = 0; i < 300 && !g.terrain?.data?.landMade?.(0, 0); i++) await sleep(100);
        const B = g.brawl, L = g.castleLife, F = L.wizards.fight;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await sleep(20); };
        const SPELLS = ['Stupefy', 'SapiraDuel', 'IceDuel', 'LevitateDuel', 'Jolt', 'JoltMaxima', 'Expelliarmus', 'LiquidationDuel', 'AvadaKedavra', 'SandsDuel', 'FireDuel', 'GustDuel', 'ShardDuel', 'Disarmor'];
        const KINDS = [['zombie', 'z'], ['cow', 'a'], ['knight', 'v'], ['novice', 'v']];
        const caster = B.spawn('archmage', 'A', -14, 0);
        const cv = L.byId.get(caster.id);
        const snap = (k, c) => k === 'z' ? { hp: c.health, stun: c.stunTimer > 0, frozen: !!c.isFrozen, slow: c.slowT > 0 || c.slowTimer > 0, dead: !!(c.isDead || c.isDying) }
            : k === 'a' ? { hp: c.hp, stun: c.stunT > 0 || c.stunTimer > 0, frozen: !!c.frozen, slow: c.slowT > 0, dead: !!c.dead }
            : { hp: c.hp, stun: c.stunT > 0, frozen: !!c.frozenT || c.frozen > 0, slow: c.slowT > 0, dead: !!c.dead, noWand: !!(c.noWand || c.lostWand), vy: c.vy || 0, lev: !!c.lev };
        const out = {};
        for (const [kind, k] of KINDS) {
            for (const spell of SPELLS) {
                const e = B.spawn(kind, 'B', 0 + 6, 0); // (the other side of the strip; stands still: the fight is not started)
                if (!e) { out[`${kind}|${spell}`] = 'не поставился'; continue; }
                const c = k === 'z' ? g.zombieById.get(e.id) : k === 'a' ? g.animals.byId.get(e.id) : L.byId.get(e.id);
                const p = g.servants.pos(e.k, e.id, new window.__zns.THREE.Vector3());
                const from0 = { x: p.x, z: p.z };
                cv.x = -4; cv.z = p.z; cv.y = p.y; cv.mana = 9999; cv.noWand = false; cv.castCd = 0; cv.prep = null; cv.dead = false;
                cv.yaw = Math.atan2(-(p.x - cv.x), -(p.z - cv.z)); cv.group.position.set(cv.x, cv.y, cv.z); cv.group.rotation.y = cv.yaw;
                await frames(4);
                const before = snap(k, c);
                const fp = { x: p.x, y: p.y + 1.6, z: p.z };
                let fired = false;
                try { fired = F._cast(cv, spell, null, fp, null, { k: e.k, id: e.id }); } catch (err) { fired = 'ERR ' + String(err).slice(0, 60); }
                await sleep(100);
                for (let i = 0; i < 25; i++) { await frames(3); const s = snap(k, c); if (s.dead) break; }
                const after = snap(k, c);
                const p2 = g.servants.pos(e.k, e.id, new window.__zns.THREE.Vector3());
                const moved = p2 ? Math.round(Math.hypot(p2.x - from0.x, p2.z - from0.z) * 10) / 10 : 'gone';
                const fx = [];
                if (after.hp != null && before.hp != null && after.hp < before.hp) fx.push('урон ' + Math.round((before.hp - after.hp) * 10) / 10);
                if (after.dead) fx.push('убит');
                for (const f of ['stun', 'frozen', 'slow', 'noWand', 'lev']) if (after[f] && !before[f]) fx.push(f);
                if (typeof moved === 'number' && moved > 1.2) fx.push('толчок ' + moved + ' м');
                out[`${kind}|${spell}`] = (fired === true ? '' : 'не выстрелило(' + fired + ') ') + (fx.join(', ') || '— ничего');
                B.removeFighter(e.k, e.id);
                await frames(2);
            }
        }
        // ---- the elemental mages' own attacks, forced (not left to chance in a fight)
        const T = window.__zns.THREE, EM = g.elementalMages;
        const mageAt = (el, x, z) => { const e = B.spawn(el, 'A', x, z); return { e, v: L.byId.get(e.id) }; };
        const foeAt = (kind, x, z) => { const e = B.spawn(kind, 'B', x, z); const c = e.k === 'z' ? g.zombieById.get(e.id) : e.k === 'a' ? g.animals.byId.get(e.id) : L.byId.get(e.id); return { e, c }; };
        const posOf = (e) => g.servants.pos(e.k, e.id, new T.Vector3());
        // water: a volley of six shards straight at a zombie 10 m away
        {
            const w = mageAt('water', -6, 0), f = foeAt('zombie', 6, 0), p = posOf(f.e);
            B.start = B.start; B.state = 'fight'; // (the shards look for targets only in a fight; nobody moves by himself: the minds are off — foes are not fed)
            let hits = 0; const orig = B.shardHit.bind(B); B.shardHit = (sh, b) => { const ok = orig(sh, b); if (ok) hits++; return ok; };
            const hp0 = f.c.health, list = [];
            for (let i = 0; i < 6; i++) { const from = { x: w.v.x, y: w.v.y + 2.6 + i * 0.05, z: w.v.z }; const d = new T.Vector3(p.x - from.x, p.y + 1.4 - from.y, p.z - from.z).normalize(); list.push({ p: [from.x, from.y, from.z], v: [d.x * 26, d.y * 26, d.z * 26], d: i * 0.07 }); }
            g.iceShards.volley(w.v.id, list);
            await frames(90);
            out['ВОДА: залп осколков по зомби'] = `попаданий ${hits} из 6, урон ${hp0 - f.c.health}`;
            B.shardHit = orig; B.state = 'setup';
            B.removeFighter(f.e.k, f.e.id); B.removeFighter(w.e.k, w.e.id);
        }
        // air: the lift and the throw of a zombie / a cow / a knight
        for (const kind of ['zombie', 'cow', 'knight']) {
            const m = mageAt('air', -6, 0), f = foeAt(kind, 4, 0);
            m.v.foe = `bf|${f.e.k}|${f.e.id}`;
            m.v.mana = 400; m.v.maxMana = 400;
            const foe = g.castleLife._playerPos(m.v.foe);
            const ok = EM.airLift(m.v, foe);
            let peak = 0, t = 0; const y0 = posOf(f.e)?.y ?? 0;
            for (let i = 0; i < 160; i++) {
                await frames(3);
                m.v.elemental.liftHeld && (m.v.elemental.liftAck = true);
                if (m.v.elemental.liftT > 0 && !m.v.elemental.carry) break;
                const q = posOf(f.e); if (q) peak = Math.max(peak, q.y - y0);
                EM.think(m.v, 0.05); // (the mind runs the hold: liftT counts down, the throw at the end)
                if (!m.v.elemental.carry && i > 20) break;
            }
            await frames(60);
            const q = posOf(f.e);
            out['ВОЗДУХ: подъём и бросок — ' + kind] = `поднято: ${ok}, высота ${Math.round(peak * 10) / 10} м, улетело на ${q ? Math.round(Math.hypot(q.x - 4, q.z) * 10) / 10 : '?'} м`;
            B.removeFighter(f.e.k, f.e.id); B.removeFighter(m.e.k, m.e.id);
        }
        // air: the pushes — a ring of wind and a wind blast at a zombie, a cow, a knight
        for (const kind of ['zombie', 'cow', 'knight']) {
            for (const name of ['WindImpulseMaxima', 'WindMaxima']) {
                const m = mageAt('air', -3, 0), f = foeAt(kind, 3, 0);
                m.v.foe = `bf|${f.e.k}|${f.e.id}`; m.v.mana = 400;
                const foe = g.castleLife._playerPos(m.v.foe), p0 = posOf(f.e);
                const imp = {}; const ci = g.creatureImpact, oa = ci.apply.bind(ci);
                ci.apply = (c, o) => { const r = oa(c, o); imp[o.spell + ':' + r] = (imp[o.spell + ':' + r] || 0) + 1; return r; };
                const fired = EM.cast(m.v, name, foe);
                await frames(60);
                ci.apply = oa;
                const q = posOf(f.e);
                out['ВОЗДУХ: ' + name + ' — ' + kind] = `колдуется: ${fired}, толчок ${q ? Math.round(Math.hypot(q.x - p0.x, q.z - p0.z) * 10) / 10 : '?'} м, итог ${JSON.stringify(imp)}`;
                B.removeFighter(f.e.k, f.e.id); B.removeFighter(m.e.k, m.e.id);
            }
        }
        return out;
    });
    console.log('SPELL AUDIT');
    for (const [k, v] of Object.entries(table)) console.log('  ' + k.padEnd(24) + v);
    assert.ok(Object.keys(table).length > 10);
});
