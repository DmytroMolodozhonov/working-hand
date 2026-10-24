/**
 * Plant creatures in the real game: groups grow by the seed, a telewilpin pricks 1 HP (not a full steel set), a carnivorous head grabs,
 * bites and swallows (animals; a man without armour), spits out a breastplate / a magic robe, and what they leave stacks.
 * Run: node --test tests/e2e/plants.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8176;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('plants: groups grow, thorns prick, the head eats — and armour decides', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld', { smooth: true });
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, out = {};
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        out.gen = g.gen; out.active = g.plants.active;
        // fly along until both kinds are loaded around me
        const want = { telewilpin: null, carnivore: null };
        for (let step = 0; step < 40 && (!want.telewilpin || !want.carnivore); step++) {
            const a = step * 2.1, R = 60 + step * 55;
            const x = Math.cos(a) * R, z = Math.sin(a) * R;
            g.character.group.position.set(x, g.terrain.surfaceY(x, z) + 30, z);
            for (let w = 0; w < 14; w++) { await sleep(150); g.plants._aroundT = 0; }
            for (const grp of g.plants.groups.values()) if (grp && !want[grp.kind] && grp.plants.some((p) => !p.dead)) want[grp.kind] = grp;
        }
        out.found = { tele: !!want.telewilpin, head: !!want.carnivore };
        out.sizes = { tele: want.telewilpin?.plants.length, head: want.carnivore?.plants.length };
        if (!want.telewilpin || !want.carnivore) return out;
        const { makePiece, makeRobe } = await import('/src/game/ArmorTypes.js');
        const { crowdOf } = await import('/src/game/CrowdSources.js');
        // (headless frames are slow: the plants are stepped by hand, 0.1 s a step, with the crowd of this moment)
        let fr = 1e6;
        const run = async (n, centre = null, each = null) => { for (let i = 0; i < n; i++) { crowdOf(g).update(++fr, fr * 0.1); g.plants._rebuildNear(centre || g.character.group.position); g.plants.update(0.1); each?.(); await sleep(4); } };
        const stand = async (p, dx, dz) => { g.character.group.position.set(p.x + dx, p.y + 2.1, p.z + dz); g.character.verticalVelocity = 0; await sleep(120); };
        const hp = () => (g.combat.enabled ? g.combat.hp : g.playerHP);
        // ---- thorns
        const f = want.telewilpin.plants.find((p) => !p.dead);
        g.armor.worn.helmet = g.armor.worn.chest = g.armor.worn.legs = g.armor.worn.robe = null; g.armor._changed?.();
        const h0 = hp();
        for (let i = 0; i < 25; i++) { await stand(f, 0.9, 0); await run(4); }
        out.pricked = h0 - hp();
        const full = [makePiece('helmet'), makePiece('chest', { magic: true }), makePiece('legs')];
        for (const it of full) g.armor.wear(it, { quiet: true });
        const h1 = hp(); f.pT = 0;
        for (let i = 0; i < 25; i++) { await stand(f, 0.9, 0); await run(4); }
        out.steelLoss = h1 - hp();
        for (const k of ['helmet', 'chest', 'legs']) g.armor.worn[k] = null;
        // ---- a flower broken: a leaf
        const before = g.items.loose?.length ?? 0;
        g.plants.die(f, 'melee', null);
        out.leaf = [...g.items.loose.values()].some((l) => l.item?.kind === 'telewilpinLeaf');
        // ---- the head: an animal near it is eaten
        const head = want.carnivore.plants.find((p) => !p.dead);
        out.headBox = !!head.boxId;
        g.character.group.position.set(head.x + 80, g.terrain.surfaceY(head.x + 80, head.z) + 5, head.z); // (away)
        await sleep(300);
        const THREE = await import('three');
        const cow = g.animals._spawn('cow', new THREE.Vector3(head.x + 4, head.y + 0.5, head.z)) || null;
        out.spawnedCow = !!cow;
        const states = new Set();
        if (cow) {
            g.plants._rebuildNear(g.character.group.position); head.cool = 0;
            for (let i = 0; i < 150 && g.animals.byId.has(cow.id); i++) { await run(1, head, () => states.add(head.st)); }
            out.cowEaten = !g.animals.byId.has(cow.id);
        }
        out.states = [...states];
        // ---- me, without armour: swallowed, hurt inside, spat out
        head.cool = 0; head.st = 0; head.prey = null;
        const h2 = hp();
        g.character.group.position.set(head.x + 3, head.y + 2.1, head.z); g.plants._rebuildNear(g.character.group.position);
        let was = new Set(), eatenSeen = false;
        for (let i = 0; i < 260; i++) { await run(1); was.add(head.st); if (g.combat.eaten) eatenSeen = true; if (eatenSeen && !g.combat.eaten && head.st === 0) break; if (g.combat.dead) break; }
        out.meStates = [...was]; out.eatenSeen = eatenSeen; out.meLoss = h2 - hp(); out.freeAfter = !g.combat.eaten;
        // ---- a magic robe: spat out at once, no harm
        head.cool = 0; head.st = 0; head.prey = null; g.armor.worn.robe = makeRobe(true);
        const h3 = hp();
        g.character.group.position.set(head.x + 3, head.y + 2.1, head.z); g.plants._rebuildNear(g.character.group.position);
        let spat = false, held = false;
        for (let i = 0; i < 60; i++) { await run(1); if (head.st === 6) spat = true; if (g.combat.eaten) held = true; }
        out.robeSpat = spat; out.robeHeld = held; out.robeLoss = h3 - hp();
        g.armor.worn.robe = null;
        return out;
    });
    console.log(JSON.stringify(r));
    console.log('ERRORS', JSON.stringify(realErrors(errors).slice(0, 5)));
    assert.ok(r.active, 'new worlds have plants');
    assert.ok(r.found.tele && r.found.head, 'both kinds grow within reach');
    assert.ok(r.sizes.tele >= 2 && r.sizes.tele <= 6, 'a group of flowers (some places may be rock or water)');
    assert.ok(r.sizes.head >= 1 && r.sizes.head <= 5);
    assert.ok(r.pricked >= 1, `thorns prick: lost ${r.pricked}`);
    assert.equal(r.steelLoss, 0, 'a full steel set is not pricked');
    assert.equal(r.leaf, true, 'a broken flower leaves a leaf');
    assert.equal(r.headBox, true);
    if (r.spawnedCow) assert.equal(r.cowEaten, true, 'the animal is eaten');
    assert.equal(r.eatenSeen, true, 'a man without armour is held');
    assert.equal(r.freeAfter, true, 'and let go');
    assert.equal(r.robeHeld, false, 'a magic robe: never held');
    assert.equal(r.robeSpat, true);
    assert.equal(r.robeLoss, 0);
    const errs = realErrors(errors);
    assert.deepEqual(errs, [], 'no page errors');
});
