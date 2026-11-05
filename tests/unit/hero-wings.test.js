// «Зелье крыльев» (HeroWings.js, Potions 'wings'): the recipe (magic swan wings + a golden apple, one flask), the growing (10 min), the pain
// (−1 HP every 30 s for 20 min: one can die of it), the nausea, the bar; wings for good — death takes them; the save; the network; the
// Creative «С крыльями».
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WINGS, growthAt, painsBetween, HeroWings, attachWings } from '../../src/game/HeroWings.js';
import { recipeById } from '../../src/game/Potions.js';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { normalizeHero, DEFAULT_HERO } from '../../src/game/HeroSetup.js';

test('the potion: magic swan wings + a golden apple (plain swan wings do not do), one flask a cauldron', () => {
    const r = recipeById('wings');
    assert.deepEqual(r.ingredients, { magicSwanWings: 1, apple: 1 });
    assert.equal(r.portions, 1);
    assert.ok(r.effect.wings);
    assert.equal(DEFAULT_HERO.wings, false, 'the Creative start: without wings by default');
    assert.equal(normalizeHero({ wings: true }).wings, true);
});

test('the author\'s numbers: 10 minutes to grow, −1 HP every half a minute for 20 minutes (40 in all)', () => {
    assert.equal(WINGS.GROW_S, 600);
    assert.equal(WINGS.PAIN_S, 1200);
    assert.equal(growthAt(0), 0);
    assert.equal(growthAt(600), 1);
    assert.ok(growthAt(300) > 0.45 && growthAt(300) < 0.55);
    assert.equal(painsBetween(0, 1e6), 40);
    assert.equal(painsBetween(0, 29), 0);
    assert.equal(painsBetween(29, 31), 1);
});

function fakeGame(mode = 'freeworld', hp = 100) {
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter(scene);
    const said = [];
    const g = {
        config: { mode }, character: ch, scene, said,
        hud: { setVoice: (t) => said.push(t), damageFlash() {} },
        knock: { dizzyLeft: 0, dizzyDur: 0, dizzyS: 0 },
        combat: mode === 'creative' ? { enabled: false } : { enabled: true, hp, dead: false, die() { this.dead = true; } },
        damageLocalPlayer() {},
    };
    g.wings = new HeroWings(g);
    return g;
}
const run = (g, secs, dt = 0.5) => { for (let t = 0; t < secs; t += dt) g.wings.update(dt); };

test('drunk: they grow over 10 minutes with the bar and the words; the head swims; it hurts for 20 minutes; then wings for good', () => {
    const g = fakeGame('freeworld', 100);
    const W = g.wings;
    assert.equal(W.cantDrink(), null);
    assert.ok(W.start());
    assert.ok(W.cantDrink(), 'a second potion while they grow: not drunk');
    run(g, 300);
    assert.ok(W.grown > 0.4 && W.grown < 0.6 && W.growing);
    assert.ok(g.knock.dizzyS > 0 && g.knock.dizzyLeft > 0, 'the head swims');
    assert.equal(g.combat.hp, 100 - 10, '−1 every half a minute');
    assert.ok(g.said.some((t) => /25%/.test(t)));
    run(g, 310);
    assert.ok(W.has, 'grown');
    assert.ok(g.said.some((t) => /выросли/.test(t)));
    run(g, 700);
    assert.equal(g.combat.hp, 100 - 40, 'the pain stopped at 20 minutes');
    assert.equal(W.t, null);
    assert.ok(W.model && W.model.mounts.every((m) => m.visible), 'the wings on the back');
    // the net and the save
    assert.deepEqual(W.net().slice(0, 1), [100]);
    const snap = W.snapshot();
    const g2 = fakeGame();
    g2.wings.restore(snap);
    assert.ok(g2.wings.has, 'loaded: still has them');
    // death takes them
    W.onDeath();
    assert.equal(W.grown, 0);
    assert.equal(W.model, null);
    assert.equal(W.net(), undefined);
});

test('one can die of the growing (no food); the Creative immortal is not hurt; a load mid-growth keeps the time', () => {
    const g = fakeGame('freeworld', 20);
    g.wings.start();
    run(g, 700);
    assert.ok(g.combat.dead, '20 HP and 20+ pains: dead');
    const c = fakeGame('creative');
    let hurt = 0;
    c.damageLocalPlayer = () => hurt++;
    c.wings.start();
    run(c, 1300);
    assert.equal(hurt, 0, 'the immortal Creative hero feels no pain');
    assert.ok(c.wings.has);
    const m = fakeGame('freeworld', 100);
    m.wings.start();
    run(m, 200);
    const s = m.wings.snapshot();
    const m2 = fakeGame('freeworld', 100);
    m2.wings.restore(s);
    assert.ok(Math.abs(m2.wings.t - 200) < 1 && m2.wings.growing);
});

test('the Creative «С крыльями»: grown at once; the wings are big (a span of metres), folded down the back, spread to the sides', () => {
    const g = fakeGame('creative');
    g.wings.grant();
    g.wings.update(0.016);
    assert.ok(g.wings.has);
    const ch = g.character;
    const w = attachWings(ch, true);
    w.set(1, 1, 0, 0);
    ch.group.updateMatrixWorld(true);
    const tip = new THREE.Vector3(), root = new THREE.Vector3();
    // (the shared wing's box is the folded one: the spread one measured by where its mount puts the wing's far end)
    w.mounts[0].getWorldPosition(root);
    assert.ok(root.z > ch.group.position.z + 0.2, 'on the back');
    const s = w.mounts[0].scale;
    assert.ok(Math.abs(s.x) > 4 && Math.abs(s.y) > 4, 'big wings');
    w.dispose();
    assert.equal(w.mounts[0].parent, null);
});
