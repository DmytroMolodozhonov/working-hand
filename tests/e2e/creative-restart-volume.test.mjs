/** Real selected Creative places: fresh mana, independent sound controls and pristine attempts after death. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8299;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

async function startAt(page, id) {
    await page.waitForFunction(() => document.querySelector('.mode-card[data-mode="creative"]'));
    if (await page.isHidden('#create-world')) await page.click('#create-world-btn');
    await page.click('.mode-card[data-mode="creative"]');
    await page.selectOption('#hero-sp-spawn', id);
    await page.uncheck('#hero-sp-inf'); await page.fill('#hero-sp-cells', '800');
    await page.check('input[name="hero-sp-health"][value="normal"]');
    await page.evaluate(() => {
        for (const [id, value] of [['graphics-quality', '0'], ['view-distance', 'low'], ['villager-ai', 'off'], ['villager-voice', '0']]) {
            const el = document.getElementById(id); if (el) { el.value = value; el.dispatchEvent(new Event('change')); }
        }
    });
    // Fix only the generation seed, retaining the user's actual menu choices.
    await page.evaluate(() => { const old = Math.random; let first = true; Math.random = () => { if (first) { first = false; return 12345 / 1e9; } return old(); }; });
    await page.click('#start-btn'); await ready(page);
}

async function ready(page) {
    await page.waitForFunction(() => window.__zns?.game?.active && window.__zns.game.revealed && !window.__zns.game.heroApply.pending, null, { timeout: 180000 });
    // Software-rendered test browser only: preserve viewport/UI dimensions, reduce GPU pixel work.
    await page.evaluate(() => window.__zns.game.renderer.setPixelRatio(0.3));
}

test('city, small settlement and lone wizard are playable separate choices; selected cells start full', async () => {
    for (const [id, kind, type] of [['village', 'wizvillage', null], ['magevillage', 'hamlet', 'magevillage'], ['magehut', 'hamlet', 'magehut']]) {
        const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 1800 } });
        await startAt(page, id);
        const result = await page.evaluate(() => {
            const g = window.__zns.game, p = g.character.group.position, d = g.terrain.data;
            const site = d.sites.near(p.x, p.z, 100).find(h => h.kind === 'wizvillage' || h.type === g.hero.spawn);
            const foot = d.surfaceY(p.x, p.z);
            return { spawn: g.hero.spawn, cells: g.combat.maxFatigue, mana: g.combat.fatigue, kind: site?.kind, type: site?.type,
                supported: Number.isFinite(foot) && Math.abs(p.y - foot) < 4,
                clear: !g.collision.pointBlocked(p.x, foot + 1, p.z) && !g.collision.pointBlocked(p.x, foot + 3, p.z) };
        });
        assert.equal(result.spawn, id); assert.equal(result.cells, 800); assert.equal(result.mana, 800);
        assert.equal(result.kind, kind); if (type) assert.equal(result.type, type);
        assert.equal(result.supported, true); assert.equal(result.clear, true);
        assert.deepEqual(realErrors(errors), []); await page.close();
    }
});

async function damageAndRemember(page) {
    await page.waitForFunction(() => [...window.__zns.game.castleLife.byId.values()].some(v => v.W));
    return page.evaluate(() => {
        const g = window.__zns.game, d = g.terrain.data, p = g.character.group.position;
        const site = d.sites.near(p.x, p.z, 160).find(h => h.type === g.hero.spawn || h.kind === 'tower');
        const v = [...g.castleLife.byId.values()].find(v => v.W);
        v.grudge = { id: g.localId, until: Date.now() + 100000 }; v.cs.hostile.set(g.localId, Date.now() + 100000);
        const house = site?.houses?.[0], center = house?.c || { x: site.x, z: site.z, y: site.F };
        let cell = null;
        for (let y = Math.floor(center.y + 8); y >= Math.floor(center.y + 3) && !cell; y--) {
            for (let z = Math.round(center.z) - 6; z <= Math.round(center.z) + 6 && !cell; z++) {
                for (let x = Math.round(center.x) - 6; x <= Math.round(center.x) + 6; x++) {
                    const was = d.get(x, y, z); if (was && was !== 5) { cell = { x, y, z, was }; break; }
                }
            }
        }
        if (!cell) throw new Error('No generated building block found');
        const at = new window.__zns.THREE.Vector3(cell.x, cell.y - 1, cell.z);
        g.applyExplosion(at, 2, true, 1, 'local', []);
        g.explosions.push({ p: at.toArray(), r: 2 });
        return { cell, removed: d.get(cell.x, cell.y, cell.z) === 0, worldId: g.keeper.id, seed: g.seed, gen: g.gen };
    });
}

async function assertPristine(page, before) {
    await ready(page);
    const result = await page.evaluate(({ cell }) => {
        const g = window.__zns.game;
        return { block: g.terrain.data.get(cell.x, cell.y, cell.z), worldId: g.keeper.id, seed: g.seed, gen: g.gen,
            explosions: g.explosions.length, bodies: g.death.bodies.size, mana: g.combat.fatigue, cells: g.combat.maxFatigue,
            hostile: [...g.castleLife.castles.values()].some(cs => cs.hostile.has(g.localId)),
            grudge: [...g.castleLife.byId.values()].some(v => v.grudge?.id === g.localId),
            handoff: sessionStorage.getItem('zns-creative-restart') };
    }, before);
    assert.equal(result.block, before.cell.was); assert.equal(result.worldId, before.worldId);
    assert.equal(result.seed, before.seed); assert.equal(result.gen, before.gen);
    assert.equal(result.explosions, 0); assert.equal(result.bodies, 0); assert.equal(result.hostile, false); assert.equal(result.grudge, false);
    assert.equal(result.mana, 800); assert.equal(result.cells, 800); assert.equal(result.handoff, null);
    await page.waitForTimeout(3000);
    assert.equal(await page.evaluate(c => window.__zns.game.terrain.data.get(c.x, c.y, c.z), before.cell), before.cell.was, 'old explosions and collapse never replay');
}

test('death in the wizard settlement fully restarts twice with intact buildings, no hostility and the same saved world', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 1800 } });
    await startAt(page, 'magevillage');
    for (let n = 0; n < 2; n++) {
        const before = await damageAndRemember(page); assert.equal(before.removed, true);
        await page.evaluate(() => window.__zns.game.combat.die(null, 'test'));
        await page.waitForFunction(() => !document.getElementById('death-respawn-btn').disabled);
        await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#death-respawn-btn')]);
        await assertPristine(page, before);
    }
    const persisted = await page.evaluate(async () => {
        const g = window.__zns.game; await g.keeper.save();
        const { loadWorld } = await import('/src/game/WorldSave.js'); const w = await loadWorld(g.keeper.id);
        return { explosions: w.explosions.length, players: Object.values(w.players).map(p => p.mp) };
    });
    assert.equal(persisted.explosions, 0); assert.deepEqual(persisted.players, [800]);
    assert.deepEqual(realErrors(errors), []); await page.close();
});

test('boss defeat uses the same whole-world reset rather than only teleporting the hero', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 1800 } });
    await startAt(page, 'tower'); const before = await damageAndRemember(page); assert.equal(before.removed, true);
    await page.evaluate(() => window.__zns.game.combat.die(null, 'test'));
    await page.getByRole('button', { name: 'Начать бой заново', exact: true }).waitFor();
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.getByRole('button', { name: 'Начать бой заново', exact: true }).click()]);
    await assertPristine(page, before); assert.deepEqual(realErrors(errors), []); await page.close();
});

test('actual sound settings mute already-playing local/positional spell effects, themes and loops, not music or speech', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 1800 } });
    await startAt(page, 'magehut');
    const set = (id, v) => page.evaluate(({ id, v }) => { const el = document.getElementById(id); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, { id, v });
    await set('spell-vol', 100); await set('music-vol', 70); await set('talk-vol', 60); await set('zombie-vol', 100);
    await page.evaluate(() => {
        const g = window.__zns.game, s = g.sound, p = g.character.group.position;
        s._spell(s.sounds.inferno); s._spellAt(s.sounds.sapira, p); s.spellCast('Boom', p); s._loop('test', 'loopFlight', 0.4); g.hud._ringing(0.9);
    });
    // Music can have an independent fade in progress: compare its existing gain across the effects change.
    await set('zombie-vol', 0);
    await page.waitForFunction(() => window.__zns.game.sound.effectsGain.gain.value === 0);
    const muted = await page.evaluate(() => {
        const g = window.__zns.game, s = g.sound;
        return { effects: s.effectsGain.gain.value, musicIndependent: s.music.current.listener === s.audioListener, musicSetting: s.music.volume, talk: s.talkVolume,
            theme: s._spellTheme.listener === s.effectsListener, loop: s._loops.test.listener === s.effectsListener,
            pooled: s.voices.every(v => v.listener === s.effectsListener) && s.posVoices.every(v => v.listener === s.effectsListener),
            ringingContext: g.hud._ring.ac === s.context };
    });
    assert.deepEqual(muted, { effects: 0, musicIndependent: true, musicSetting: 0.7, talk: 0.6, theme: true, loop: true, pooled: true, ringingContext: true });
    await set('zombie-vol', 50); await page.waitForFunction(() => window.__zns.game.sound.effectsGain.gain.value === 0.5);
    assert.deepEqual(realErrors(errors), []); await page.close();
});