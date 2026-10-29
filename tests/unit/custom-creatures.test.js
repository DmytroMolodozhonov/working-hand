// Creatures of one's own («Да пусть создастся существо …»): every skeleton × every way to walk and to fly builds and
// moves without breaking (no NaN, the feet on the ground, the wings folded on the ground), the same body twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildCreature, poseCreature, skinPixels, paletteOf } from '../../src/entities/CustomCreatureModel.js';
import { creatureDims } from '../../src/game/CreatureForge.js';
import { sanitizeRecipe, PLAN_KEYS, WALK_KEYS, FLY_KEYS, WING_KINDS, TAIL_KINDS, SKINS, PATTERNS } from '../../src/game/CreationRules.js';

const finite = (o) => { let ok = true; o.updateMatrixWorld(true); o.traverse((c) => { for (const v of c.matrixWorld.elements) if (!Number.isFinite(v)) ok = false; }); return ok; };

test('every skeleton, every gait, every flight: built and posed, nothing breaks', () => {
    let n = 0;
    for (const plan of PLAN_KEYS) for (const legs of [0, 2, 4, 6, 8]) {
        const r = sanitizeRecipe({ type: 'creature', creature: { plan, legs, size: 1 + (n % 5), wings: WING_KINDS[n % WING_KINDS.length], tail: TAIL_KINDS[n % TAIL_KINDS.length], skin: SKINS[n % SKINS.length], pattern: PATTERNS[n % PATTERNS.length], eyes: { n: 1 + (n % 8), size: 2 }, horns: { n: n % 4 } } }, 'существо', n);
        const m = buildCreature(r, 'k' + n, n);
        for (const walk of WALK_KEYS) { const a = { mode: 'walk', walk, speed: 3, k: 1 }; for (let i = 0; i < 20; i++) poseCreature(m, a, 0.05); assert.ok(finite(m), `${plan} ${legs} ${walk}`); }
        for (const fly of FLY_KEYS) { const a = { mode: 'fly', fly, walk: r.walk, speed: 6, vy: -3, k: 1 }; for (let i = 0; i < 20; i++) poseCreature(m, a, 0.05); assert.ok(finite(m), `${plan} ${fly}`); }
        for (const mode of ['idle', 'swim', 'dead', 'trip']) { const a = { mode, walk: r.walk, speed: 0, k: 0.3, deadT: 1, tripT: 0.5 }; poseCreature(m, a, 0.05); assert.ok(finite(m), `${plan} ${mode}`); }
        n++;
    }
});

test('the body: legs reach the ground, the same creature from the same seed, sizes as asked', () => {
    for (const plan of ['quadruped', 'biped', 'bird', 'insect', 'spider', 'dragon']) {
        const r = sanitizeRecipe({ type: 'creature', creature: { plan, size: 3 } }, 'существо', 1);
        const D = creatureDims(r, 5);
        assert.deepEqual(D, creatureDims(r, 5));
        assert.ok(D.H > 2.7 && D.H < 3.3, plan + ' height ' + D.H);
        for (const L of D.legs) assert.ok(L.upper + L.lower >= L.hip[1] * 0.85, `${plan}: a leg reaches the ground`);
        const m = buildCreature(r, 'g' + plan, 5);
        poseCreature(m, { mode: 'idle', k: 1 }, 0.1);
        const box = new THREE.Box3().setFromObject(m);
        assert.ok(box.min.y > -0.6 * D.H && box.max.y < 2 * D.H, `${plan}: its box ${box.min.y.toFixed(2)}…${box.max.y.toFixed(2)}`);
    }
});

test('the skin: a picture of its colours and pattern, made the same each time', () => {
    const r = sanitizeRecipe(null, 'существо с синей чешуёй в белых пятнах', 1);
    const pal = paletteOf(r, 1);
    const a = skinPixels(r, pal), b = skinPixels(r, pal);
    assert.deepEqual(a, b);
    let blue = 0;
    for (let i = 0; i < a.length; i += 4) if (a[i + 2] > a[i] + 20) blue++;
    assert.ok(blue > a.length / 4 * 0.3, 'mostly blue');
});
