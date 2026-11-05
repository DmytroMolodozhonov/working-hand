// «Зелье русалки» (the author 05.11: «хвост, дышит под водой, ×2 скорость при «рыбьих» движениях с поднятыми руками, не ходит; «стоп» не
// снимает: хвост магического водного существа + груша Баксади»; Mermaid.js): the recipe; the tail for the legs (and gone after); the
// tail drives the body up to twice the swimmer's speed only with the arms raised and waving; on the land — a slow drag.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RECIPES } from '../../src/game/Potions.js';
import { POTION_FX, PotionEffects } from '../../src/game/PotionEffects.js';
import { Mermaid, MERMAID } from '../../src/game/Mermaid.js';
import { SwimMotion, SWIM } from '../../src/game/SwimStroke.js';
import { VoxelCharacter } from '../../src/entities/Character.js';

test('the recipe: the glowfin\'s tail and a Baksadi pear; 12 minutes', () => {
    const r = RECIPES.find((x) => x.id === 'mermaid');
    assert.deepEqual(r.ingredients, { glowfinTail: 1, baksadi_pear: 1 });
    assert.equal(r.effect.timed, 'mermaid');
    assert.equal(POTION_FX.mermaid.s, 12 * 60);
});

function world() {
    const ch = new VoxelCharacter(new THREE.Scene());
    let up = false, vy = 0;
    ch.areBothHandsUp = () => up;
    const g = { character: ch, hud: { setVoice() {} } };
    g.potionFx = new PotionEffects(g);
    g.mermaid = new Mermaid(g);
    return { g, ch, arms: (u, v) => { up = u; vy = v; ch.handRelVelocity.left.set(0, vy, 0); ch.handRelVelocity.right.set(0, -vy, 0); } };
}

test('the tail: grows for the legs while it lasts, gone after (the legs back); on the land a slow drag', () => {
    const { g, ch } = world();
    g.potionFx.start('mermaid');
    g.mermaid.update(1 / 30);
    assert.ok(g.mermaid.tail?.root.visible, 'a tail');
    assert.equal(ch.leftLegPivot.visible, false, 'no legs');
    assert.equal(ch.speedScale, MERMAID.LAND_K, 'on the land: it drags itself');
    g.potionFx.update(12 * 60 + 1);
    g.mermaid.update(1 / 30);
    assert.equal(g.mermaid.tail, null);
    assert.equal(ch.leftLegPivot.visible, true, 'the legs back');
});

test('in the water: the arms raised and waving — up to twice the top speed; the arms down — no tail drive', () => {
    const { g, arms } = world();
    g.potionFx.start('mermaid');
    const M = new SwimMotion();
    arms(true, 1.2);
    for (let i = 0; i < 300; i++) { g.mermaid.swim(M, 1 / 30); M.step(1 / 30, { under: true, look: 0 }); }
    assert.ok(M.speed > SWIM.MAX_SPEED * 1.3 && M.speed <= SWIM.MAX_SPEED * MERMAID.TAIL_MAX + 1e-9, `fast: ${M.speed.toFixed(2)}`);
    const N = new SwimMotion();
    arms(false, 1.2);
    for (let i = 0; i < 300; i++) { g.mermaid.swim(N, 1 / 30); N.step(1 / 30, { under: true, look: 0 }); }
    assert.ok(N.speed < 0.1, 'the arms down: nothing');
});
