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
    // (the author 05.11: the change takes ~10 s — the pain, the red, the legs growing into the tail; the tail is there after it)
    g.mermaid.update(1 / 30);
    assert.ok(!g.mermaid.tail || g.mermaid.tail.root.scale.y < 0.5, 'not at once: the change first');
    for (let t = 0; t < MERMAID.CHANGE_S + 0.2; t += 1 / 30) g.mermaid.update(1 / 30);
    assert.ok(g.mermaid.tail?.root.visible, 'a tail');
    assert.equal(ch.leftLegPivot.visible, false, 'no legs');
    assert.equal(ch.speedScale, MERMAID.LAND_K, 'on the land: it drags itself');
    g.potionFx.update(12 * 60 + 1);
    g.mermaid.update(1 / 30);
    assert.equal(g.mermaid.tail, null);
    assert.equal(ch.leftLegPivot.visible, true, 'the legs back');
});

test('in the water: the waves build up speed — the more and the faster, the faster; slow waves ease her down; the arms down — no tail drive', () => {
    // (the author 05.11: «чем больше он делает движений… тем быстрее ускоряется; зависит от того, сколько и как быстро; остановиться —
    //  не делает движений; медленно — небольшое замедление»; it used to stop at twice the top speed at once)
    const { g, arms } = world();
    g.potionFx.start('mermaid');
    const M = new SwimMotion();
    arms(true, 1.2);
    const at = [];
    for (let i = 0; i < 900; i++) { g.mermaid.swim(M, 1 / 30); M.step(1 / 30, { under: true, look: 0 }); if (i === 90 || i === 899) at.push(M.speed); }
    assert.ok(at[0] > SWIM.MAX_SPEED * 1.2, `the first waves already carry her: ${at[0].toFixed(2)}`);
    assert.ok(at[1] > at[0] * 1.4 && at[1] <= SWIM.MAX_SPEED * MERMAID.TAIL_TOP + 1e-9, `faster and faster with the rhythm: ${at.map((v) => v.toFixed(1))}`);
    const fast = M.speed;
    arms(true, 0.6); // (slower waves)
    for (let i = 0; i < 60; i++) { g.mermaid.swim(M, 1 / 30); M.step(1 / 30, { under: true, look: 0 }); }
    assert.ok(M.speed < fast && M.speed > fast * 0.3, `slower waves: eased down, not stopped — ${fast.toFixed(1)} → ${M.speed.toFixed(1)}`);
    const Q = new SwimMotion();
    arms(true, 2.4);
    for (let i = 0; i < 300; i++) { g.mermaid.swim(Q, 1 / 30); Q.step(1 / 30, { under: true, look: 0 }); }
    const P = new SwimMotion(); g.mermaid.flow = 0;
    arms(true, 1.2);
    for (let i = 0; i < 300; i++) { g.mermaid.swim(P, 1 / 30); P.step(1 / 30, { under: true, look: 0 }); }
    assert.ok(Q.speed > P.speed, 'quicker waves build it up quicker');
    // looking down she dives (no stroke needed), and she hardly floats up when still
    const D = new SwimMotion();
    for (let i = 0; i < 60; i++) { g.mermaid.swim(D, 1 / 30); var m = D.step(1 / 30, { under: true, look: -0.6 }); }
    assert.ok(m.up < -1, `down where the head looks: ${m.up.toFixed(2)}`);
    const N = new SwimMotion();
    arms(false, 1.2);
    for (let i = 0; i < 300; i++) { g.mermaid.swim(N, 1 / 30); N.step(1 / 30, { under: true, look: 0 }); }
    assert.ok(N.speed < 0.1, 'the arms down: nothing');
});

test('the wriggle of the torso (no hands up) drives the tail; the longer, the faster — up to five times the start', async () => {
    // (the author 05.11: «не нужно руки вверх поднимать… достаточно просто туловищем туда-сюда водить… до 5 раз больше… при условии, что
    //  он немало времени потратил на то, чтобы петлять»)
    const { Mermaid, MERMAID } = await import('../../src/game/Mermaid.js');
    const { SWIM } = await import('../../src/game/SwimStroke.js');
    assert.equal(MERMAID.TAIL_TOP / MERMAID.TAIL_MAX, 5);
    const g = { currentPose: null, character: { areBothHandsUp: () => false, handRelVelocity: null } };
    const m = Object.create(Mermaid.prototype);
    m.game = g; m.wave = 0; m.flow = 0;
    const M = { speed: 0 };
    let t = 0;
    const run = (secs, sway) => { for (let k = 0; k < secs * 30; k++) { t += 1 / 30; const off = sway ? Math.sin(t * 2 * Math.PI * 0.8) * 0.25 : 0; g.currentPose = { aspect: 4 / 3, leftShoulder: { x: 0.6 + off * 0.3, y: 0.4 + off * 0.1 }, rightShoulder: { x: 0.4 + off * 0.3, y: 0.4 - off * 0.1 } }; m.swim(M, 1 / 30); } };
    run(3, true);
    const early = M.speed;
    assert.ok(early > SWIM.MAX_SPEED * 0.8, `the tail drives at once: ${early.toFixed(2)}`);
    run(45, true);
    assert.ok(M.speed > early * 3, `long wriggling: much faster ${M.speed.toFixed(1)} vs ${early.toFixed(1)}`);
    assert.ok(M.speed <= SWIM.MAX_SPEED * MERMAID.TAIL_TOP + 1e-6);
    const fast = M.speed;
    run(6, false);
    assert.ok(m.flow < 0.2, 'stops wriggling: the rhythm falls away');
    void fast;
});
