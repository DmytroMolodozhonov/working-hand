/**
 * Multiplayer end-to-end: host + guests in separate browser contexts,
 * connected through a local PeerJS signalling server (the public PeerJS cloud
 * is used in real games; here the sandbox has no internet).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerServer } from 'peer';
import { startServer, launch, sleep, realErrors } from './harness.mjs';

const PORT = 8150;
const PEER_PORT = 9010;
let srv, browser, peerServer;

test.before(async () => {
    srv = await startServer(PORT);
    peerServer = PeerServer({ port: PEER_PORT, path: '/zns', host: '127.0.0.1' });
    browser = await launch();
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
    peerServer?.close?.();
    // PeerServer keeps an http server open
    setTimeout(() => process.exit(0), 500).unref();
});

async function openPlayer(name) {
    const context = await browser.newContext({ viewport: { width: 560, height: 320 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns);
    await page.click('#mp-panel > summary');
    await page.fill('#mp-name', name);
    await page.click('#mp-advanced > summary');
    await page.fill('#mp-server', `127.0.0.1:${PEER_PORT}/zns`);
    return { page, errors, context };
}

const wf = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 250 });
const ev = (page, fn, arg) => page.evaluate(fn, arg);

test('host + 2 guests: lobby, shared world, zombies, hits, explosions, weapons, late join', async () => {
    const host = await openPlayer('Хост');
    await host.page.click('#mp-host-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    assert.match(code, /^[A-Z2-9]{5}$/);

    const guest = await openPlayer('Гость');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(guest.page, () => document.getElementById('mp-status').textContent.includes('Подключено'), null, 30000);
    await wf(host.page, () => document.getElementById('mp-players').textContent.includes('Гость'), null, 15000);

    // Host starts creative → guest starts automatically with the same world
    await host.page.click('#start-btn');
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    const seeds = await Promise.all([host.page, guest.page].map((p) => ev(p, () => window.__zns.game.seed)));
    assert.equal(seeds[0], seeds[1], 'same world seed');

    // Both see each other
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);

    // Guest walks somewhere → host sees the avatar there
    await ev(guest.page, () => { window.__zns.game.character.group.position.set(12, 1.5, 8); });
    await wf(host.page, () => {
        const r = [...window.__zns.game.remotes.values()][0];
        return Math.abs(r.position.x - 12) < 0.5 && Math.abs(r.position.z - 8) < 0.5;
    }, null, 20000);

    // Host spawns a zombie → appears for the guest
    const zid = await ev(host.page, () => {
        const g = window.__zns.game;
        const z = g._createZombie(new window.__zns.THREE.Vector3(12, 0.5, 0));
        z.health = 5;
        return z.id;
    });
    await wf(guest.page, (id) => window.__zns.game.zombieById.has(id), zid, 20000);

    // Guest hits the zombie (sword) → the host applies the damage → everybody sees it die
    await ev(guest.page, (id) => {
        const g = window.__zns.game;
        const z = g.zombieById.get(id);
        g.onLocalHit(z, 5, new window.__zns.THREE.Vector3(1, 0, 0), true);
    }, zid);
    await wf(host.page, (id) => window.__zns.game.zombieById.get(id)?.isDead, zid, 20000);
    await wf(guest.page, (id) => window.__zns.game.zombieById.get(id)?.isDead, zid, 20000);
    await wf(guest.page, () => window.__zns.game.killCount === 1, null, 10000);

    // Guest punches a second zombie with a bare fist (fast wrist movement)
    const zid2 = await ev(host.page, () => {
        const g = window.__zns.game;
        const z = g._createZombie(new window.__zns.THREE.Vector3(14, 0.5, 8));
        z.health = 5;
        z.speed = z.baseSpeed = 0;
        return z.id;
    });
    await wf(guest.page, (id) => window.__zns.game.zombieById.has(id), zid2, 20000);
    await ev(guest.page, () => {
        const g = window.__zns.game;
        g.character.group.position.set(12, 1.5, 8);
        g.playerAttackCooldown = 0;
        g.currentPose = { ...(g.currentPose || {}), isPunching: true, headRotation: { yaw: 0, pitch: 0 } };
    });
    await wf(host.page, (id) => window.__zns.game.zombieById.get(id).health < 5, zid2, 20000);
    await ev(guest.page, () => { window.__zns.game.currentPose.isPunching = false; });

    // Guest casts Бомбардо → host explodes it → craters identical on both machines
    await ev(guest.page, () => {
        const g = window.__zns.game;
        const THREE = window.__zns.THREE;
        const o = new THREE.Vector3(-10, 4, -20), target = new THREE.Vector3(-10, -0.5, -30);
        const d = target.clone().sub(o).normalize();
        g.spells.cast('Bombardo', o, d, 'right', g.localId);
        g.sync.spell('Bombardo', o, d, 'right');
    });
    await wf(host.page, () => window.__zns.game.explosions.length === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.explosions.length === 1, null, 120000);
    const craterOf = (p) => ev(p, () => {
        const t = window.__zns.game.terrain;
        const out = [];
        for (let x = -16; x <= -4; x++) for (let z = -36; z <= -24; z++) out.push(t.topLayer(x, z));
        return out.join(',');
    });
    const [ch, cg] = await Promise.all([craterOf(host.page), craterOf(guest.page)]);
    assert.equal(ch, cg, 'terrain identical after the explosion');
    assert.ok(ch.split(',').some((v) => Number(v) < 0), 'there is a crater');

    // Weapons: guest picks up the sword → host knows who holds it; guest throws it → host simulates
    const guestId = await ev(guest.page, () => window.__zns.game.localId);
    await ev(guest.page, () => {
        const g = window.__zns.game;
        const w = g.weapons.byId.get('tS');
        g.weapons.grab(w, 'right', 0.5);
    });
    await wf(host.page, (gid) => window.__zns.game.sync.weaponOwners.get('tS') === gid, guestId, 15000);
    await ev(guest.page, () => {
        const g = window.__zns.game;
        g.weapons.hands.right.held.velocity.set(4, 3, 0);
        g.weapons.release('right');
    });
    await wf(host.page, () => !window.__zns.game.sync.weaponOwners.has('tS'), null, 15000);
    await wf(host.page, () => window.__zns.game.weapons.byId.get('tS').sleeping, null, 60000);

    // A third player joins mid-game and receives the current world (crater included)
    const late = await openPlayer('Опоздавший');
    await late.page.fill('#mp-code', code);
    await late.page.click('#mp-join-btn');
    await wf(late.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    try {
        await wf(late.page, () => window.__zns.game.explosions.length === 1, null, 120000);
    } catch (e) {
        console.log('late joiner state', JSON.stringify(await ev(late.page, () => ({ ex: window.__zns.game.explosions.length, welcome: !!window.__zns.pendingWelcome, wex: window.__zns.pendingWelcome?.explosions?.length, role: window.__zns.net.role }))));
        console.log('host state', JSON.stringify(await ev(host.page, () => ({ ex: window.__zns.game.explosions.length }))), late.errors.slice(0, 5));
        throw e;
    }
    assert.equal(await craterOf(late.page), ch, 'late joiner has the same crater');
    await wf(late.page, () => window.__zns.game.remotes.size === 2, null, 120000);
    await wf(host.page, () => window.__zns.game.remotes.size === 2, null, 120000);

    // Guest leaves → the host removes their avatar
    await guest.context.close();
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);

    for (const p of [host, late]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    assert.deepEqual(realErrors(guest.errors), []);
    await host.context.close();
    await late.context.close();
});

test('joining a wrong code shows a clear message', async () => {
    const p = await openPlayer('Кто-то');
    await p.page.fill('#mp-code', 'ZZZZZ');
    await p.page.click('#mp-join-btn');
    await wf(p.page, () => document.getElementById('mp-status').textContent.includes('❌'), null, 40000);
    const text = await p.page.textContent('#mp-status');
    assert.match(text, /не найдена|ожидания/);
    await p.context.close();
});

test('Свободный мир: no tables, 20 HP, fatigue, spells hurt players, shields, freezing + shatter, death', async () => {
    const host = await openPlayer('Маг1');
    await host.page.click('#mp-host-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Маг2');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(guest.page, () => document.getElementById('mp-status').textContent.includes('Подключено'), null, 30000);

    // Host picks the free world
    await host.page.locator('.map-card.freeworld').click();
    await host.page.click('#start-btn');
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);

    const st = await Promise.all([host.page, guest.page].map((p) => ev(p, () => {
        const g = window.__zns.game;
        return {
            mode: g.config.mode, pvp: g.combat.enabled, hp: g.combat.hp, fatigue: g.combat.fatigue,
            weapons: g.weapons.weapons.length, tables: g.world.tables.length, zombies: g.zombies.length,
            bar: !document.getElementById('fatigue-container').classList.contains('hidden'),
            hpBar: document.getElementById('hp-text').textContent,
        };
    })));
    for (const s of st) {
        assert.equal(s.mode, 'freeworld');
        assert.ok(s.pvp);
        assert.equal(s.hp, 20);
        assert.equal(s.weapons, 0, 'no tables with weapons');
        assert.equal(s.tables, 0);
        assert.equal(s.zombies, 0);
        assert.ok(s.bar, 'fatigue bar shown');
        assert.match(s.hpBar, /10\/10/);
    }

    // Put the guest 12 m in front of the host's right hand
    const ids = await Promise.all([host.page, guest.page].map((p) => ev(p, () => window.__zns.game.localId)));
    const aim = async () => {
        const target = await ev(host.page, () => {
            const g = window.__zns.game;
            const o = g.character.getHandWorldPosition('right');
            const d = g.character.getHandDirection('right');
            return { o: o.toArray(), d: d.toArray(), t: o.clone().addScaledVector(d, 12).toArray() };
        });
        await ev(guest.page, (t) => {
            const g = window.__zns.game;
            g.character.group.position.set(t[0], t[1] - 0.6, t[2]);
            g.knockback.set(0, 0, 0);
        }, target.t);
        await wf(host.page, (t) => {
            const r = [...window.__zns.game.remotes.values()][0];
            return Math.hypot(r.position.x - t[0], r.position.z - t[2]) < 0.6;
        }, target.t, 20000);
        return target;
    };
    const castAt = (name) => ev(host.page, (n) => {
        const g = window.__zns.game;
        const o = g.character.getHandWorldPosition('right');
        const d = g.character.getHandDirection('right');
        g.spells.cast(n, o, d, 'right', g.localId);
        g.sync.spell(n, o, d, 'right');
    }, name);
    const guestHp = () => ev(guest.page, () => window.__zns.game.combat.hp);

    // Sapira hits the other player: 4 damage, the host sees it too
    await aim();
    await castAt('Sapira');
    await wf(guest.page, () => window.__zns.game.combat.hp === 16, null, 20000);
    await wf(host.page, () => [...window.__zns.game.remotes.values()][0].hp === 16, null, 20000);

    // Fatigue: Sapira costs 20 of 30 — a second one right away is too tiring
    const fat = await ev(host.page, () => {
        const g = window.__zns.game;
        g.lastMagicTime = Date.now(); g.lastSpellCastTime = 0;
        // Arms hanging down (no camera here): the word alone — e.g. the other player's
        // voice reaching this microphone — casts nothing
        g.character.isArmRaised = () => false; // (without a camera the arms stick out forward)
        const hanging = g.castLocalSpell('сапира', true);
        g.character.isArmRaised = () => true; // now the hand is raised and points at the guest
        const a = g.castLocalSpell('сапира', true);
        const f1 = g.combat.fatigue;
        g.lastSpellCastTime = 0;
        const b = g.castLocalSpell('сапира', true);
        return { hanging, a, b, f1 };
    });
    assert.equal(fat.hanging, null, 'no duel spell with the arms down');
    assert.equal(fat.a, 'Sapira');
    assert.ok(fat.f1 <= 10.5, `fatigue spent (${fat.f1})`);
    assert.equal(fat.b, null, 'not enough strength');
    await wf(guest.page, () => window.__zns.game.combat.hp === 12, null, 20000).catch(() => {}); // the real cast may also hit
    await ev(guest.page, () => { window.__zns.game.combat.hp = 20; });

    // Protection Maxima on the guest: the host sees the dome, spells bounce off
    await aim();
    await ev(guest.page, () => { window.__zns.game.combat.shield = { type: 2, side: 'right', left: 3 }; });
    await wf(host.page, () => [...window.__zns.game.remotes.values()][0].combat.shield === 2, null, 20000);
    await castAt('Thunderwave');
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await guestHp(), 10, 'shield stopped Thunderwave');
    const domeSeen = await ev(host.page, () => [...window.__zns.game.remotes.values()][0].visuals.dome.visible);
    assert.ok(domeSeen, 'the dome is visible to the other player');
    await wf(guest.page, () => !window.__zns.game.combat.shield, null, 30000);

    // Bombardo blast next to the guest hurts them (not the caster)
    const hostHp0 = await ev(host.page, () => window.__zns.game.combat.hp);
    await ev(host.page, (id) => {
        const g = window.__zns.game;
        const r = [...g.remotes.values()][0];
        g.explode(r.position.clone(), 3.6, g.localId, 1);
    });
    await wf(guest.page, () => window.__zns.game.combat.hp < 20, null, 20000);
    assert.equal(await ev(host.page, () => window.__zns.game.combat.hp), hostHp0);

    // Frozen guest: everyone sees the ice; any punch shatters them → death screen, back to menu
    await ev(guest.page, (by) => window.__zns.game.combat.freeze(by), ids[0]);
    await wf(host.page, () => [...window.__zns.game.remotes.values()][0].combat.frozen, null, 20000);
    const status = await ev(guest.page, () => document.getElementById('pvp-status').innerText);
    assert.match(status, /заморозили.*20/s);
    await ev(host.page, (to) => window.__zns.game.sync.playerHit(to, 1), ids[1]);
    await wf(guest.page, () => !document.getElementById('death-screen').classList.contains('hidden'), null, 20000);
    const death = await ev(guest.page, () => document.getElementById('death-text').innerText);
    assert.match(death, /Маг1/);
    assert.match(death, /заморож/);
    await wf(host.page, () => [...window.__zns.game.remotes.values()][0]?.dead || window.__zns.game.remotes.size === 0, null, 20000);

    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    await host.context.close();
    await guest.context.close();
});

test('duel magic: Остолбеней flies and stuns, charges meet and push, calm exit, shield, Авада Кедавра', async () => {
    const host = await openPlayer('Гарри');
    await host.page.click('#mp-host-btn');
    await wf(host.page, () => !!document.querySelector('.mp-code-big'), null, 30000);
    const code = await host.page.textContent('.mp-code-big');
    const guest = await openPlayer('Драко');
    await guest.page.fill('#mp-code', code);
    await guest.page.click('#mp-join-btn');
    await wf(guest.page, () => document.getElementById('mp-status').textContent.includes('Подключено'), null, 30000);
    await host.page.locator('.map-card.freeworld').click();
    await host.page.click('#start-btn');
    await wf(host.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(guest.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(host.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    await wf(guest.page, () => window.__zns.game.remotes.size === 1, null, 120000);
    const ids = await Promise.all([host.page, guest.page].map((p) => ev(p, () => window.__zns.game.localId)));

    // Guest stands in front of the host's right hand (far enough to answer a fast charge)
    const aim = async (dist = 25) => {
        const t = await ev(host.page, (dist) => {
            const g = window.__zns.game;
            const o = g.character.getHandWorldPosition('right');
            const d = g.character.getHandDirection('right');
            return o.clone().addScaledVector(d, dist).toArray();
        }, dist);
        await ev(guest.page, (t) => { const g = window.__zns.game; g.character.group.position.set(t[0], t[1] - 0.6, t[2]); g.knockback.set(0, 0, 0); }, t);
        await wf(host.page, (t) => { const r = [...window.__zns.game.remotes.values()][0]; return Math.hypot(r.position.x - t[0], r.position.z - t[2]) < 0.6; }, t, 20000);
    };
    const hostCast = (spell) => ev(host.page, (spell) => {
        const g = window.__zns.game;
        g._lastDuelCast = 0;
        return g._castDuel(spell, spell, true);
    }, spell);
    // In the test browser there is no camera: the guest "keeps the hand on the opponent" by decree
    // (only for this player's own hand — what it hears about the other player stays real)
    const setContact = (page, ok, jerk) => ev(page, ([ok, jerk]) => {
        const d = window.__zns.game.duel;
        const real = d._realContact || (d._realContact = d._contact.bind(d));
        d._contact = (id, ...rest) => (id === d.me ? { ok, jerk } : real(id, ...rest));
    }, [ok, jerk]);

    // 1) Остолбеней: a charge flies (not instant) and stuns on arrival
    await aim();
    assert.equal(await hostCast('Stupefy'), 'Stupefy');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(await ev(guest.page, () => window.__zns.game.combat.stunned), false, 'not instant');
    assert.ok(await ev(guest.page, () => window.__zns.game.duel.bolts.size === 1), 'the guest sees the charge coming');
    await wf(guest.page, () => window.__zns.game.combat.stunned, null, 40000);
    const st = await ev(guest.page, () => document.getElementById('pvp-status').innerText);
    assert.match(st, /Остолбеней/);
    await ev(guest.page, () => { window.__zns.game.combat.stunLeft = 0; });

    // 2) Duel: the guest answers — charges meet and push; the rested wizard wins
    await setContact(host.page, true, false);
    await setContact(guest.page, true, false);
    await ev(host.page, () => { window.__zns.game.combat.fatigue = 30; });
    await ev(guest.page, () => { window.__zns.game.combat.fatigue = 3; window.__zns.game.combat.hp = 4; });
    await aim();
    await hostCast('Stupefy');
    await ev(guest.page, (hostId) => {
        const g = window.__zns.game;
        g.duel.cast('Stupefy', { side: 'right', t: { kind: 'p', id: hostId, dist: 25 } });
    }, ids[0]);
    await wf(host.page, () => window.__zns.game.duel.clashes.length === 1, null, 40000);
    await wf(guest.page, () => window.__zns.game.duel.clashes.length === 1, null, 20000);
    await wf(guest.page, () => window.__zns.game.combat.stunned, null, 90000);
    assert.equal(await ev(host.page, () => window.__zns.game.combat.stunned), false, 'the stronger one wins');
    await ev(guest.page, () => { window.__zns.game.combat.stunLeft = 0; });

    // 3) Calm exit: hand off the opponent, then a flick → the duel just ends
    await ev(host.page, () => { window.__zns.game.combat.fatigue = 30; });
    await ev(guest.page, () => { window.__zns.game.combat.fatigue = 30; window.__zns.game.combat.hp = 20; });
    await aim();
    await hostCast('Stupefy');
    await ev(guest.page, (hostId) => window.__zns.game.duel.cast('Stupefy', { side: 'right', t: { kind: 'p', id: hostId, dist: 25 } }), ids[0]);
    await wf(host.page, () => window.__zns.game.duel.clashes.length === 1, null, 40000);
    // (the guest's hand off the opponent stops pushing — a quick, calm move away then a flick)
    await ev(guest.page, () => {
        const d = window.__zns.game.duel;
        const real = d._realContact || (d._realContact = d._contact.bind(d));
        const t0 = performance.now();
        // hand moved calmly away, then shaken off
        d._contact = (id, ...rest) => (id === d.me ? { ok: false, jerk: performance.now() - t0 > 450 } : real(id, ...rest));
    });
    await wf(host.page, () => window.__zns.game.duel.clashes.length === 0, null, 20000);
    await new Promise((r) => setTimeout(r, 800));
    const exitStunned = await ev(guest.page, () => window.__zns.game.combat.stunned);
    if (exitStunned || await ev(host.page, () => window.__zns.game.combat.stunned)) {
        console.log('host duel log', JSON.stringify(await ev(host.page, () => window.__zns.game.duel.log)));
        console.log('guest duel log', JSON.stringify(await ev(guest.page, () => window.__zns.game.duel.log)));
    }
    assert.equal(exitStunned, false, 'nobody hit after a calm exit');
    assert.equal(await ev(host.page, () => window.__zns.game.combat.stunned), false);
    await setContact(guest.page, true, false);

    // 4) Protection Maxima stops Авада Кедавра
    await aim();
    await ev(guest.page, () => { window.__zns.game.combat.shield = { type: 2, side: 'right', left: 8 }; });
    await ev(host.page, () => { window.__zns.game.combat.fatigue = 30; });
    assert.equal(await hostCast('AvadaKedavra'), 'AvadaKedavra');
    await wf(guest.page, () => window.__zns.game.duel.bolts.size === 0, null, 40000);
    assert.equal(await ev(guest.page, () => window.__zns.game.combat.dead), false, 'shield saved the wizard');

    // 5) Авада Кедавра without a shield: instant death, back to the menu
    await ev(guest.page, () => { window.__zns.game.combat.shield = null; });
    await aim();
    await ev(host.page, () => { window.__zns.game.combat.fatigue = 30; });
    assert.equal(await hostCast('AvadaKedavra'), 'AvadaKedavra');
    await wf(guest.page, () => !document.getElementById('death-screen').classList.contains('hidden'), null, 40000);
    assert.match(await ev(guest.page, () => document.getElementById('death-text').innerText), /Авада Кедавра/);

    for (const p of [host, guest]) assert.deepEqual(realErrors(p.errors), [], 'no errors');
    await host.context.close();
    await guest.context.close();
});

test('«Общий сервер»: one button switches it on, the other player sees «включён» and joins without a code', async () => {
    const a = await openPlayer('Дима');
    const b = await openPlayer('Друг');
    // Off at first
    await wf(b.page, () => /выключен|нет связи/.test(document.getElementById('mp-world-status').textContent), null, 40000);
    await a.page.click('#mp-world-btn');
    await wf(a.page, () => document.getElementById('mp-status').textContent.includes('Общий сервер включён'), null, 30000);
    // The other menu notices by itself (checks every 10 s)
    await wf(b.page, () => document.getElementById('mp-world-status').textContent.includes('включён'), null, 40000);
    assert.match(await b.page.textContent('#mp-world-status'), /Дима/);
    await b.page.click('#mp-world-btn');
    await wf(b.page, () => document.getElementById('mp-status').textContent.includes('Вы на общем сервере'), null, 30000);
    await wf(a.page, () => document.getElementById('mp-players').textContent.includes('Друг'), null, 15000);
    // The host starts: the friend enters the same game
    await a.page.click('#start-btn');
    await wf(a.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(b.page, () => window.__zns.game && window.__zns.game.active, null, 90000);
    await wf(a.page, () => window.__zns.game.remotes.size === 1, null, 60000);
    assert.deepEqual(realErrors(a.errors), []);
    assert.deepEqual(realErrors(b.errors), []);
    await a.context.close();
    await b.context.close();
});
