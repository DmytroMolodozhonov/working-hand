// «Обучение» (Tutorial.js, TutorialLand.js): the bounded land, and a fake player walked through every stage — each step waits for its
// deed, only its spell is allowed, a failure takes the step back, the hero stands frozen but on the walking stage, the end is reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TUTORIAL, tutorialHeight, generateTutorialChunk, onMeadow } from '../../src/world/TutorialLand.js';
import { Tutorial, STAGE_TITLES, heardHand, splitSay } from '../../src/game/Tutorial.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('«стоит напротив камеры» — only seen to the waist: shoulders and hips', () => {
    const { g } = fake();
    const T = new Tutorial(g);
    const lm = g.poseService.lastResults.poseLandmarks;
    assert.equal(T._toWaist(), true);
    lm[23] = { x: 0.4, y: 1.2, visibility: 0.9 }; // (the hips under the picture: only the head and shoulders seen)
    assert.equal(T._toWaist(), false);
    lm[23] = { x: 0.4, y: 0.8, visibility: 0.2 };
    assert.equal(T._toWaist(), false);
});

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

test('a long narrator\'s line is told in pieces of whole sentences', () => {
    const long = 'Поднимите руку с палочкой на волшебника и скажите: «Экспеллиармус». Когда ваш луч столкнётся с его лучом, держите руку на нём и давите, пока не победите.';
    const parts = splitSay(long);
    assert.ok(parts.length >= 2);
    for (const p of parts) assert.ok(p.length <= 110, p);
    assert.equal(parts.join(' '), long);
    assert.deepEqual(splitSay('Скажите: «Нокс».'), ['Скажите: «Нокс».']);
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
        poseService: { lastResults: { poseLandmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 })), leftHandLandmarks: [1], rightHandLandmarks: [1] } },
        character: { group: new THREE.Group(), velocity: { x: 0, z: 0 }, isRunning: false },
        terrain: { data: { get: (x, L, z) => blocks.get(`${x},${L},${z}`) ?? (L <= tutorialHeight(x, z) ? BLOCK.STONE : 0) } },
        items: {
            loose, held, worn: {},
            spawnLoose(item) { const L = { item }; loose.set(item.uid, L); return L; },
            removeLoose(uid) { loose.delete(uid); },
            releaseHand(side) { held[side] = null; },
            heldOf(kind) { for (const s of ['right', 'left']) if (held[s]?.item.kind === kind) return { side: s, ...held[s] }; return null; },
        },
        inventory: { slots: new Array(5).fill(null), back: [null, null], _render() {}, purse: { magic: true, count: 0, ensure() {}, add(n) { this.count += n; return 0; } } },
        armor: { worn: {} },
        combat: { enabled: true, hp: 20, maxHp: 20, fatigue: 30, maxFatigue: 30, shield: null },
        wandMagic: { light: null },
        zombies: [],
        _createZombie(p) { const z = { p, isDead: false, isFrozen: false }; this.zombies.push(z); return z; },
        removeZombie(z) { this.zombies.splice(this.zombies.indexOf(z), 1); },
        camera: { dir: new THREE.Vector3(0, 0, -1), getWorldDirection(o) { return o.copy(this.dir); } },
        scene: new THREE.Group(),
        collision: { groundY: () => 10.5, addBox() { return 1; } },
        castleLife: { castles: new Map(), addSite(def) { this.castles.set(def.id, { def }); }, talk: { counter: [], _counterCoins() { return this.counter; } } },
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
        if (/«Бомбардо»/.test(txt)) { assert.ok(T.allowed.has('Bombardo') && !T.allows('Inferno'), 'only the step\'s spell'); assert.equal(T.talking && T.allows('Bombardo'), false, 'not while the narrator speaks'); for (let x = -6; x <= 6; x++) for (let z = -18; z <= -6; z++) for (let L = 11; L <= 17; L++) blocks.set(`${x},${L},${z}`, 0); }
        if (/уберите палочку\./.test(txt)) { g.inventory.slots[0] = held.right.item; held.right = null; }
        if (/Повернитесь кругом/.test(txt)) g.camera.dir.set(0, 0, 1);
        if (/Вот яблоко/.test(txt)) { const L = loose.get(T.ctx.apple); loose.delete(T.ctx.apple); held.left = L; }
        if (/поднесите ко рту/.test(txt)) { held.left = null; g.combat.hp = 20; }
        if (/притяните хлеб/.test(txt)) { const L = loose.get(T.ctx.bread); loose.delete(T.ctx.bread); held.left = L; }
        if (/Положите хлеб в карман/.test(txt)) { g.inventory.slots[3] = held.left.item; held.left = null; }
        if (/Это шлем/.test(txt)) { const L = loose.get(T.ctx.helm); loose.delete(T.ctx.helm); g.armor.worn.helmet = L.item; }
        if (/Это рюкзак/.test(txt)) { const L = loose.get(T.ctx.pack); loose.delete(T.ctx.pack); g.items.worn.backpack = L; }
        if (/Притяните сыр/.test(txt)) { const L = loose.get(T.ctx.cheese); loose.delete(T.ctx.cheese); held.left = L; run(0.2); held.left = null; loose.set(L.item.uid, L); }
        if (/вторая палочка/.test(txt)) { const L = loose.get(T.ctx.wand2); loose.delete(T.ctx.wand2); held.left = L; }
        if (/поменяем палочки/.test(txt)) { const r = held.right; held.right = held.left; held.left = r; }
        if (/«Люмос»/.test(txt)) g.wandMagic.light = {};
        if (/«Нокс»/.test(txt)) g.wandMagic.light = null;
        if (/«Раскрой свои секреты»/.test(txt)) T.onCast('Reveal');
        if (/Скрестите руки/.test(txt)) { assert.ok(T.allows('Protection'), 'the crossed arms\' shield is let through'); g.combat.shield = { type: 1 }; }
        if (/Снимите щит/.test(txt)) g.combat.shield = null;
        if (/Шагайте на месте/.test(txt)) { assert.equal(T.frozen, false, 'free to walk'); g.character.group.position.z -= 15; }
        if (/бегите/.test(txt)) { g.character.isRunning = true; g.character.velocity = { x: 0, z: -8 }; }
        if (/Подойдите к нему/.test(txt)) { assert.equal(T.frozen, false); assert.equal(g.inventory.purse.count, 150, 'coins for the purchase'); g.character.group.position.set(20, 11, 3.5); }
        if (/Достаньте мешочек/.test(txt)) held.left = { item: { kind: 'coins', uid: 'pouch', count: 150 } };
        if (/Положите мешочек/.test(txt)) { held.left = null; g.castleLife.talk.counter = [{ item: { uid: 'pouch' } }]; }
        if (/что хотите купить/.test(txt)) loose.set('good', { item: { uid: 'good', kind: 'bread', shop: { stall: 'tutorial-market:s0', price: 10, paid: true } } });
        if (/Возьмите её с прилавка/.test(txt)) { loose.delete('good'); held.left = { item: { uid: 'good', kind: 'bread' } }; }
        if (/«Экспеллиармус»/.test(txt)) T.ctx.wizDown = true;
        if (/«Фрозен»/.test(txt)) for (const z of T.zombies) z.isFrozen = true;
        run(st.done && /wait/.test('') ? 0 : 1);
        if (at() === before) run(45); // (the narrator speaks, then the step's pause)
        if (at() === before && !T.done) assert.fail(`stuck at ${before}: ${txt.slice(0, 60)}`);
    }
    assert.ok(T.done, 'the end');
    assert.equal(seen.size, STAGE_TITLES.length);
    // frozen everywhere but the walking stage
    for (const [s, list] of frozenAt) if (!['Ходьба и бег', 'Покупка'].includes(STAGE_TITLES[s])) assert.ok(list.every(Boolean), `frozen on «${STAGE_TITLES[s]}»`);
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

test('a spell before the narrator is done: «подождите» and the words again; after them — it works', () => {
    const { g } = fake();
    const T = new Tutorial(g);
    T._start(2); T.step = 3; T._next(); // (the «Бомбардо» step: its words being said)
    assert.ok(T.talking);
    assert.equal(T.allows('Bombardo'), false);
    assert.match(T._said, /^Подождите, я ещё не договорила/);
    for (let i = 0; i < 400 && T.talking; i++) T.update(0.1);
    assert.equal(T.allows('Bombardo'), true);
});

test('the narrator: the first line waits for the voices to load (it was lost), the step\'s time starts after the words', () => {
    const { g } = fake();
    const said = [];
    const sp = { supported: true, enabled: true, neuralUsable: true, neural: { ready: false }, preload() {}, say(text, o) { said.push(text); this.cur = o; return true; } };
    g.castleLife = { talk: { speech: sp } };
    const T = new Tutorial(g);
    for (let i = 0; i < 30; i++) T.update(0.1);
    assert.equal(said.length, 0, 'nothing said while the voices load');
    assert.equal(T.t, 0, 'the step waits for its words');
    sp.neural.ready = true;
    T.update(0.1);
    assert.equal(said.length, 1);
    assert.match(said[0], /^Добро пожаловать/, 'the very first line is said, not skipped');
    sp.cur.onStart(); sp.cur.onEnd();
    assert.equal(said.length, 2, 'the next piece only after the first ended');
    for (let n = 0; n < 6 && T.talking; n++) { sp.cur.onStart(); sp.cur.onEnd(); }
    g.poseService.lastResults.poseLandmarks = []; // (not seen yet: the step waits for him — its time runs)
    T.update(0.1);
    assert.ok(T.t > 0 && !T.talking, 'the step\'s time runs once the words are said');
});
