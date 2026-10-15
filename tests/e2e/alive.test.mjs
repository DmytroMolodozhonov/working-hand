/**
 * «Alive»: the tree pointed at comes alive — its blocks leave the world and a tree
 * monster stands up; «Авада Кедавра» and swords do nothing to it, Инферно burns it
 * down; outside Creative it lives on the caster's mana and, the mana gone, turns back
 * into a tree and falls over (a fallen tree of its own wood).
 * Run: node --test tests/e2e/alive.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

/** (in the page) Stand so that the raised right hand points at a spawn-area tree 7 m away. */
const SETUP = `
window.__aim = async () => {
    const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
    const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
    window.__frames = frames;
    for (const a of [...g.animals.list]) g.animals._remove(a);
    // a tree with nothing else near it (no other tree in the way)
    const trees = g.world.trees.filter((t) => t.alive);
    const tree = trees.find((t) => trees.every((o) => o === t || Math.hypot(o.x - t.x, o.z - t.z) > 12)) || trees[0];
    for (let i = 0; i < 4; i++) {
        const hand = ch.getHandWorldPosition('right', new T.Vector3());
        const dir = ch.getHandDirection('right', new T.Vector3()).setY(0).normalize();
        const off = hand.clone().sub(ch.group.position);
        const want = new T.Vector3(tree.x, 0, tree.z).addScaledVector(dir, -7).sub(off.setY(0));
        ch.group.position.set(want.x, g.collision.groundY(want.x, want.z) + 2, want.z);
        await frames(4);
    }
    return tree;
};`;

test('creative: «Alive» at a tree — its blocks are gone, a tree monster stands up; Avada and a sword do nothing; Inferno burns it down', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.addScriptTag({ content: SETUP });
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 12, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const tree = await window.__aim();
        const frames = window.__frames;
        const said = g.castLocalSpell('алайв', true);
        const gone = !tree.alive;
        const lt = g.livingTrees.list[0];
        if (!lt) return { said, gone, none: true };
        await frames(2);
        const start = { phase: lt.phase, form: lt.form, rig: lt.model.userData.rig.position.y };
        const t0 = performance.now();
        while (lt.phase === 'rise' && performance.now() - t0 < 40000) await frames(2);
        const grew = lt.age; // (game seconds)
        await frames(10);
        const stood = { phase: lt.phase, form: lt.form, rig: lt.model.userData.rig.position.y, eyes: lt.model.userData.glow.opacity, mouth: lt.model.userData.mouth.scale.y, arm: lt.model.userData.arms[0].sh.scale.x };
        // Avada Kedavra and a sword: nothing
        g.duel.applyToCreature('AvadaKedavra', lt, g.localId);
        g.onLocalHit(lt, 6, new T.Vector3(1, 0, 0), true);
        g.explode(lt.model.position.clone().add(new T.Vector3(0, 1, 0)), 3, g.localId, 1);
        await frames(3);
        const afterAvada = { hp: lt.hp, phase: lt.phase };
        // Inferno: the stream from me at it
        const ch = g.character;
        const t1 = performance.now();
        while (!lt.isDead && performance.now() - t1 < 40000) {
            const o = ch.getHandWorldPosition('right', new T.Vector3());
            const d = lt.model.position.clone().add(new T.Vector3(0, 3, 0)).sub(o).normalize();
            g.spells.hooks.ignite(o, d, 20);
            await frames(3);
        }
        const burnt = { phase: lt.phase, hp: lt.hp };
        const t2 = performance.now();
        while (g.livingTrees.list.includes(lt) && performance.now() - t2 < 30000) await frames(5);
        return { said, gone, start, grew, stood, afterAvada, burnt, removed: !g.livingTrees.list.includes(lt), laid: lt.laid || 0 };
    });
    assert.equal(r.said, 'Alive');
    assert.ok(r.gone, 'the tree left the world');
    assert.ok(!r.none, 'a living tree came into being');
    assert.equal(r.start.phase, 'rise');
    assert.ok(r.start.form < 0.1 && r.start.rig < -1.5, `it starts as a tree, the legs still in the ground (${r.start.rig.toFixed(2)})`);
    assert.ok(r.grew > 2.2 && r.grew < 5, `the coming alive takes about 3 s (${r.grew.toFixed(1)} s)`);
    assert.equal(r.stood.phase, 'alive');
    assert.ok(Math.abs(r.stood.rig) < 0.15, `it stood up on its root legs (${r.stood.rig.toFixed(2)})`);
    assert.ok(r.stood.eyes > 0.3 && r.stood.mouth > 0.6 && r.stood.arm > 0.95, `glowing eyes, an open mouth, grown arms (${JSON.stringify(r.stood)})`);
    assert.deepEqual(r.afterAvada, { hp: 7, phase: 'alive' }, 'Avada and a sword do nothing; Bombardo tears it (−8)');
    assert.equal(r.burnt.phase, 'burn', 'Inferno burnt it');
    assert.ok(r.removed, 'it collapsed and is gone');
    assert.equal(r.laid, 0, 'burnt: no fallen tree is left');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('survival: «Alive» is learnt from its scroll; the tree lives on the mana and, the mana gone, falls over as a fallen tree', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'survival');
    await waitHudVisible(page);
    await page.addScriptTag({ content: SETUP });
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 12, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        for (const z of [...g.zombies]) g.removeZombie(z);
        const tree = await window.__aim();
        const frames = window.__frames;
        const refused = g.castLocalSpell('alive', true);
        g.bonus = g.bonus || {};
        g.bonus.spells = { ...(g.bonus.spells || {}), Alive: true }; // (its scroll burnt)
        g.combat.fatigue = 30;
        const max0 = g.combat.maxFatigue || 30;
        const said = g.castLocalSpell('alive', true);
        // (a spell that worked grows the mana: the first time of a strong one +1 +3, added to the bar too)
        const paid = g.combat.fatigue - ((g.combat.maxFatigue || 30) - max0);
        const lt = g.livingTrees.list[0];
        if (!lt) return { refused, said, none: true, alive: tree.alive };
        await frames(30);
        const drained = g.combat.fatigue - ((g.combat.maxFatigue || 30) - max0); // (the same mana growth taken out)
        const t0 = performance.now();
        while (lt.phase === 'rise' && performance.now() - t0 < 40000) await frames(3);
        g.combat.fatigue = 0.4; // (almost no mana left)
        const t1 = performance.now();
        while (lt.phase === 'alive' && performance.now() - t1 < 20000) await frames(1);
        const ended = { phase: lt.phase };
        const t2 = performance.now();
        let sawFall = false;
        while (g.livingTrees.list.includes(lt) && performance.now() - t2 < 60000) { if (lt.phase === 'fall') sawFall = true; await frames(1); }
        // the fallen tree: its own wood on the ground in front of where it stood
        const data = g.terrain.data, p = lt.model.position;
        let wood = 0;
        for (let x = -14; x <= 14; x++) for (let z = -14; z <= 14; z++) {
            const X = Math.round(p.x) + x, Z = Math.round(p.z) + z, L = data.topLayer(X, Z);
            const b = data.get(X, L, Z);
            if (b === 6 || b === 12 || b === 14 || b === 16 || b === 18) wood++;
        }
        await frames(40);
        return { refused, said, paid, drained, ended, sawFall, removed: !g.livingTrees.list.includes(lt), laid: lt.laid || 0, wood, manaBack: g.combat.fatigue };
    });
    assert.equal(r.refused, null, 'not without its scroll');
    assert.equal(r.said, 'Alive');
    assert.ok(!r.none, 'a living tree came into being');
    assert.ok(Math.abs(r.paid - 5) < 0.01, `25 mana at once (${r.paid})`);
    assert.ok(r.drained < r.paid - 0.2, `the mana drains while it lives (${r.paid} → ${r.drained})`);
    assert.equal(r.ended.phase, 'stiff', 'the mana gone, it stiffens');
    assert.ok(r.sawFall, 'and falls over');
    assert.ok(r.removed, 'the monster is gone');
    assert.ok(r.laid > 5 && r.wood >= 4, `a fallen tree lies there (${r.laid} blocks, ${r.wood} of wood on top)`);
    assert.ok(r.manaBack > 0.5, 'the mana comes back once the tree is gone');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
