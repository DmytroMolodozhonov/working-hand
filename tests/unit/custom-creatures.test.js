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

// ---- the creatures in a small world without a screen
import { CustomCreatures } from '../../src/game/CustomCreatures.js';
import { CREATION, recipeKey } from '../../src/game/CreationRules.js';
function world() {
    const hurt = [];
    const g = {
        config: { mode: 'freeworld' }, authority: true, localId: 'me', scene: new THREE.Scene(), remotes: new Map(),
        character: { group: { position: new THREE.Vector3(30, 3.5, 0), rotation: { y: 0 } } },
        collision: { groundAt: () => 0, groundY: () => 0, resolveCylinder() {} },
        terrain: { data: { get: () => 0 } },
        combat: { enabled: true, dead: false, damage(n, by, kind) { hurt.push([n, kind]); }, heal() {} },
        hud: { setVoice() {} }, fx: { spark() {}, lightFlash() {} }, isNight: false,
        divine: { _key: (id) => 'k:' + id, fx2: { birth() {}, born() {} } },
    };
    g.customCreatures = new CustomCreatures(g);
    return { g, C: g.customCreatures, hurt };
}
const step = (C, s) => { for (let t = 0; t < s; t += 0.05) C.update(0.05); };

test('born out of light, it lives: walks about, a hostile one hunts and bites a stranger (never its maker), dies of wounds; fire-breathers do not burn', () => {
    const { C, hurt } = world();
    const r = sanitizeRecipe(null, 'злой огнедышащий зверь, 30 здоровья', 1);
    assert.equal(r.temper, 'hostile'); assert.equal(r.hp, 30); assert.ok(r.abilities.includes('fireBreath'));
    assert.equal(C.create(r, { x: 0, y: 0, z: 0 }, 'other', { key: 'k:other' }), true);
    const c = C.list[0];
    assert.equal(c.born, 0);
    step(C, CREATION.BIRTH_T + 0.5);
    assert.equal(c.born, 1, 'grown out of its cocoon');
    step(C, 20);
    assert.ok(hurt.length > 0, 'the stranger was bitten or burnt');
    assert.ok(hurt.every(([n]) => n <= 8), 'never more than the cap');
    const before = c.hp;
    C.hit(c, 10, 'Inferno', 'me');
    assert.equal(c.hp, before, 'a fire-breather does not burn');
    C.hit(c, 1000, 'blade', 'me');
    assert.ok(c.dead);
});

test('its maker is never its prey; a friendly one follows its maker; the limits hold; saved and loaded', () => {
    const { g, C, hurt } = world();
    const evil = sanitizeRecipe(null, 'злое существо', 2);
    assert.equal(C.create(evil, { x: 0, y: 0, z: 0 }, 'me', { key: 'k:me' }), true);
    step(C, CREATION.BIRTH_T + 15);
    assert.equal(hurt.length, 0, 'it never bites its own maker');
    let made = 1;
    while (C.create(sanitizeRecipe(null, 'злое существо номер ' + made, made + 3), { x: made * 3, y: 0, z: 0 }, 'other') === true) made++;
    assert.ok(C.list.filter((c) => !c.dead && c.recipe.temper === 'hostile').length <= CREATION.MAX_HOSTILE);
    const friend = sanitizeRecipe(null, 'добрый пушистый зверёк', 9);
    C.create(friend, { x: -25, y: 0, z: 0 }, 'me', { key: 'k:me' });
    const f = C.list.find((c) => c.recipe === C.species.get(recipeKey(friend))?.recipe);
    step(C, CREATION.BIRTH_T + 20);
    assert.ok(Math.hypot(f.model.position.x - 30, f.model.position.z) < 40, 'it came towards its maker');
    const snap = JSON.parse(JSON.stringify(C.snapshot()));
    const w2 = world();
    w2.C.restore(snap);
    assert.equal(w2.C.list.length, C.list.filter((c) => !c.dead).length);
    assert.equal(w2.C.species.size, C.species.size);
    void g;
});

// The author: «все существа получаются однотипными, похожи на кошечек… попросил похожее на коня, очень-очень большое —
// создало небольшое». The kind said decides the build; the size words multiply its own; each colour goes where it was said.
test('a creature like a horse is a horse; «очень-очень большой» is huge; the colours where they were said', async () => {
    const { sanitizeRecipe, sizeFactor } = await import('../../src/game/CreationRules.js');
    const { creatureDims } = await import('../../src/game/CreatureForge.js');
    const generic = { plan: 'quadruped', size: 1, legLen: 1, neck: 1, head: 1, tail: 'thin' }; // (a network's lazy answer)
    const horse = sanitizeRecipe({ type: 'creature', creature: generic }, 'существо, похожее на коня', 1);
    assert.equal(horse.species, 'horse');
    assert.equal(horse.feet, 'hoof'); assert.equal(horse.mane, 'neck'); assert.equal(horse.tail, 'hair');
    assert.ok(horse.legLen > 1.3 && horse.neck > 1.8, 'long legs, a long neck');
    const big = sanitizeRecipe({ type: 'creature', creature: generic }, 'существо, похожее на коня, очень-очень большое', 1);
    assert.ok(big.size > horse.size * 2.5, `huge: ${big.size} vs ${horse.size}`);
    assert.ok(sizeFactor('маленький цветок') < 1 && sizeFactor('существо с большими глазами') === 1);
    const bw = sanitizeRecipe(null, 'белый конь с чёрной гривой', 1);
    assert.ok(bw.colors[0] > 0xd00000, 'the body white');
    assert.equal(bw.maneColor, 0x1e1e24, 'the mane black');
    // every kind its own body: an elephant is not a cat
    const el = creatureDims(sanitizeRecipe(null, 'слон', 1), 1), cat = creatureDims(sanitizeRecipe(null, 'кошка', 1), 1);
    assert.equal(el.snoutKind, 'trunk'); assert.ok(el.tusks); assert.equal(el.earShape, 'fan');
    assert.ok(el.H > cat.H * 3, 'an elephant over a cat');
    // a creature not like any kind: medium (about the hero's size), never tiny unasked
    const any = sanitizeRecipe({ type: 'creature', creature: { ...generic, size: 0.4 } }, 'существо с крыльями', 1);
    assert.ok(any.size >= 1.5, `medium: ${any.size}`);
    for (const d of ['огромный серый слон', 'жираф', 'олень', 'медведь', 'черепаха', 'синий дракон с золотыми рогами', 'единорог', 'сова', 'паук']) {
        const r = sanitizeRecipe(null, d, 1);
        assert.ok(r.species, d);
        const D = creatureDims(r, 1);
        assert.ok(Number.isFinite(D.H) && D.legs.every((L) => Number.isFinite(L.upper)), d);
    }
});
