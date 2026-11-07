// «Обучение» (Tutorial.js, TutorialLand.js): the bounded land, and a fake player walked through every stage — each step waits for its
// deed, only its spell is allowed, a failure takes the step back, the hero stands frozen but on the walking stage, the end is reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TUTORIAL, tutorialHeight, generateTutorialChunk, onMeadow } from '../../src/world/TutorialLand.js';
import { Tutorial, STAGE_TITLES, heardHand } from '../../src/game/Tutorial.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('the land: a flat meadow, the hill before the hero, cliffs all round — no way out', () => {
    assert.equal(tutorialHeight(TUTORIAL.SPAWN.x, TUTORIAL.SPAWN.z), TUTORIAL.G);
    assert.ok(tutorialHeight(TUTORIAL.HILL.x, TUTORIAL.HILL.z) >= TUTORIAL.G + TUTORIAL.HILL.h - 1, 'the hill');
    for (let a = 0; a < 6.28; a += 0.3) {
        assert.ok(tutorialHeight(Math.cos(a) * 60, Math.sin(a) * 60) >= TUTORIAL.G + TUTORIAL.WALL * 0.8, 'the wall all round');
        assert.equal(tutorialHeight(Math.cos(a) * 30, Math.sin(a) * 30) - TUTORIAL.G, Math.hypot(Math.cos(a) * 30 - TUTORIAL.HILL.x, Math.sin(a) * 30 - TUTORIAL.HILL.z) < TUTORIAL.HILL.r ? tutorialHeight(Math.cos(a) * 30, Math.sin(a) * 30) - TUTORIAL.G : 0);
    }
    assert.ok(onMeadow(0, 0) && !onMeadow(60, 0));
    const c = generateTutorialChunk(0, 0);
    assert.equal(c.blocks.length > 0, true);
    assert.ok(c.maxTop >= TUTORIAL.G);
    // the zombies come from the meadow, not the cliffs
    assert.ok(TUTORIAL.ZOMBIES.r < TUTORIAL.MEADOW);
});

test('«я правша / я левша»', () => {
    assert.equal(heardHand('я левша'), 'left');
    assert.equal(heardHand('Я правша'), 'right');
    assert.equal(heardHand('привет'), null);
});

function fake() {
    const blocks = new Map();
    const loose = new Map();
    const held = { left: null, right: null };
    const g = {
        localId: 'me', dom: 'right', off: 'left', settings: {}, smoothHead: { yaw: 0, pitch: 0 }, currentPose: { bodyRotation: 0 },
        poseService: { lastResults: { poseLandmarks: [1], leftHandLandmarks: [1], rightHandLandmarks: [1] } },
        character: { group: new THREE.Group(), velocity: { x: 0, z: 0 }, isRunning: false },
        terrain: { data: { get: (x, L, z) => blocks.get(`${x},${L},${z}`) ?? (L <= tutorialHeight(x, z) ? BLOCK.STONE : 0) } },
        items: {
            loose, held, worn: {},
            spawnLoose(item) { const L = { item }; loose.set(item.uid, L); return L; },
            removeLoose(uid) { loose.delete(uid); },
            releaseHand(side) { held[side] = null; },
            heldOf(kind) { for (const s of ['right', 'left']) if (held[s]?.item.kind === kind) return { side: s, ...held[s] }; return null; },
        },
        inventory: { slots: new Array(5).fill(null), back: [null, null], _render() {} },
        armor: { worn: {} },
        combat: { enabled: true, hp: 20, maxHp: 20, fatigue: 30, maxFatigue: 30, shield: null },
        wandMagic: { light: null },
        zombies: [],
        _createZombie(p) { const z = { p, isDead: false, isFrozen: false }; this.zombies.push(z); return z; },
        removeZombie(z) { this.zombies.splice(this.zombies.indexOf(z), 1); },
        castleLife: null,
        faceYaw() {}, knockback: { set() {} }, hud: { setVoice() {} }, sound: {},
    };
    return { g, loose, held, blocks };
}

test('a player walked through every stage, step by step, to the end', () => {
    const { g, loose, held, blocks } = fake();
    const T = new Tutorial(g);
    const run = (s = 1) => { for (let t = 0; t < s; t += 0.1) T.update(0.1); };
    const at = () => `${T.stage}:${T.step}`;
    const seen = new Set();
    let guard = 0;
    const frozenAt = new Map();
    while (!T.done && guard++ < 400) {
        seen.add(T.stage);
        frozenAt.set(T.stage, (frozenAt.get(T.stage) || []).concat(T.frozen));
        const before = at(), st = T.stages[T.stage].steps[T.step];
        if (process.env.TUT_DEBUG) console.log(before, T._failT, (st.say || '').slice(0, 40), T._said.slice(0, 50));
        const txt = st.say || '';
        // the deeds, by what the step asks
        if (/«Меня хорошо слышно»/.test(txt)) T.hear('меня хорошо слышно');
        if (/правша или левша/.test(txt)) T.hear('я правша');
        if (/влево, а потом вправо/.test(txt)) { g.smoothHead.yaw = 0.6; run(0.2); g.smoothHead.yaw = -0.6; }
        if (/вверх, а потом вниз/.test(txt)) { g.smoothHead.pitch = 0.5; run(0.2); g.smoothHead.pitch = -0.4; }
        if (/Достаньте палочку/.test(txt)) { const i = g.inventory.slots.findIndex((s) => s?.kind === 'wand'); held.right = { item: g.inventory.slots[i] }; g.inventory.slots[i] = null; }
        if (/«Бомбардо»/.test(txt)) { assert.ok(T.allows('Bombardo') && !T.allows('Inferno'), 'only the step\'s spell'); for (let x = -6; x <= 6; x++) for (let z = -18; z <= -6; z++) for (let L = 11; L <= 17; L++) blocks.set(`${x},${L},${z}`, 0); }
        if (/уберите палочку обратно/.test(txt)) { g.inventory.slots[0] = held.right.item; held.right = null; }
        if (/появится яблоко/.test(txt)) { const L = loose.get(T.ctx.apple); loose.delete(T.ctx.apple); held.left = L; }
        if (/поднесите ко рту/.test(txt)) { held.left = null; g.combat.hp = 20; }
        if (/притяните хлеб/.test(txt)) { const L = loose.get(T.ctx.bread); loose.delete(T.ctx.bread); g.inventory.slots[3] = L.item; }
        if (/Это шлем/.test(txt)) { const L = loose.get(T.ctx.helm); loose.delete(T.ctx.helm); g.armor.worn.helmet = L.item; }
        if (/Это рюкзак/.test(txt)) { const L = loose.get(T.ctx.pack); loose.delete(T.ctx.pack); g.items.worn.backpack = L; }
        if (/Притяните сыр/.test(txt)) { const L = loose.get(T.ctx.cheese); loose.delete(T.ctx.cheese); held.left = L; run(0.2); held.left = null; loose.set(L.item.uid, L); }
        if (/вторая палочка/.test(txt)) { const L = loose.get(T.ctx.wand2); loose.delete(T.ctx.wand2); held.left = L; }
        if (/поменять их руками/.test(txt)) { const r = held.right; held.right = held.left; held.left = r; }
        if (/«Люмос»/.test(txt)) g.wandMagic.light = {};
        if (/«Нокс»/.test(txt)) g.wandMagic.light = null;
        if (/«Раскрой свои секреты»/.test(txt)) T.onCast('Reveal');
        if (/Скрестите руки/.test(txt)) g.combat.shield = { type: 1 };
        if (/Снимите щит/.test(txt)) g.combat.shield = null;
        if (/Шагайте на месте/.test(txt)) { assert.equal(T.frozen, false, 'free to walk'); g.character.group.position.z -= 15; }
        if (/бегите/.test(txt)) { g.character.isRunning = true; g.character.velocity = { x: 0, z: -8 }; }
        if (/«Экспеллиармус»/.test(txt)) T.ctx.wizDown = true;
        if (/«Фрозен»/.test(txt)) for (const z of T.zombies) z.isFrozen = true;
        run(st.done && /wait/.test('') ? 0 : 1);
        if (at() === before) run(16); // (a narrator's pause)
        if (at() === before && !T.done) assert.fail(`stuck at ${before}: ${txt.slice(0, 60)}`);
    }
    assert.ok(T.done, 'the end');
    assert.equal(seen.size, STAGE_TITLES.length);
    // frozen everywhere but the walking stage
    for (const [s, list] of frozenAt) if (STAGE_TITLES[s] !== 'Ходьба и бег') assert.ok(list.every(Boolean), `frozen on «${STAGE_TITLES[s]}»`);
});

test('a dropped wand takes the step back, the wand given again; the hero never dies in the tutorial', () => {
    const { g, loose, held } = fake();
    const T = new Tutorial(g);
    T._start(2); T.step = 4; T._enter(); // (the «Бомбардо» step)
    T.ctx.hand = 'right';
    // the wand fell on the ground
    for (let i = 0; i < 5; i++) g.inventory.slots[i] = null;
    held.right = null;
    loose.set('w', { item: { kind: 'wand', uid: 'w' } });
    T.update(0.1);
    assert.ok(T._failT > 0, 'failed');
    for (let i = 0; i < 40; i++) T.update(0.1);
    assert.ok(g.inventory.slots.some((s) => s?.kind === 'wand'), 'the wand back in the pocket');
    assert.ok(!loose.has('w'));
    assert.ok(T.intercept());
});
