// The titans (TitanRules.js, Titans.js, TitanModels.js): the rules of their nature, and each titan lived through in a plain world —
// its life at peace, its waking, its three stages, its staggering, its death — without a single error (the author 06.11: «не
// примитивные… разные анимации, взаимодействие… у каждого свои особенности»).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
    TITANS, TITAN_IDS, titanStage, STAGGER, staggerAfter, wormHears, shadeFrozen, heatBlow, lavaHeatStep, ironHeatStep, LAVA_CRUST,
    shellBlow, ICE_SHELL, rockChips, titanDamage, titanResist,
} from '../../src/game/TitanRules.js';
import { titanModel, poseWalker, WALKER_ACTS, titanSite, cloneTitan } from '../../src/game/TitanModels.js';
import { Titans } from '../../src/game/Titans.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('seven titans, one on each planet but the Earth (no Moon, no Pluto)', () => {
    assert.deepEqual(TITAN_IDS.sort(), ['jupiter', 'mars', 'mercury', 'neptune', 'saturn', 'uranus', 'venus']);
    for (const id of TITAN_IDS) assert.equal(TITANS[id].planet, id);
});

test('three stages by health', () => {
    assert.equal(titanStage(3000, 3000), 1);
    assert.equal(titanStage(2001, 3000), 1);
    assert.equal(titanStage(2000, 3000), 2);
    assert.equal(titanStage(1001, 3000), 2);
    assert.equal(titanStage(1000, 3000), 3);
});

test('staggered only by much harm fast, and not again during the cooldown', () => {
    const log = [];
    assert.equal(staggerAfter(log, 0, 50, 3000).stagger, false);
    assert.equal(staggerAfter(log, 1, 50, 3000).stagger, false);
    assert.equal(staggerAfter(log, 2, 120, 3000).stagger, true); // 220 ≥ 7 % of 3000
    const slow = [];
    for (let t = 0; t < 40; t += 5) assert.equal(staggerAfter(slow, t, 100, 3000).stagger, false, 'blows spread out never stagger');
    assert.equal(staggerAfter([], 0, 500, 3000, 10).stagger, false, 'in its cooldown');
    assert.ok(STAGGER.MUL > 1);
});

test('the sandworm hears runners far, creepers hardly, the still not at all', () => {
    assert.equal(wormHears(0), 0);
    assert.ok(wormHears(9) > wormHears(3));
    assert.ok(wormHears(3, true) < wormHears(3) / 3);
});

test('the shade freezes only when looked at in a light', () => {
    assert.equal(shadeFrozen([{ dot: 0.95, lit: false }]), false);
    assert.equal(shadeFrozen([{ dot: 0.5, lit: true }]), false);
    assert.equal(shadeFrozen([{ dot: 0.95, lit: true }]), true);
});

test('heat: red-hot iron cracks in the cold; hot lava steams, crusted lava breaks under blasts', () => {
    assert.equal(heatBlow('iron', 0.9, 'Ice').mul, 2.5);
    assert.equal(heatBlow('iron', 0.3, 'Ice').mul, 1, 'cold iron: nothing special');
    assert.equal(heatBlow('lava', 1, 'WaterVortex').mul, 2);
    assert.ok(heatBlow('lava', 1, 'Ice').cool > 0);
    assert.equal(heatBlow('lava', 0.2, 'Bombardo').mul, 2);
    assert.equal(heatBlow('lava', 1, 'Bombardo').mul, 1);
    // the lake heats it fast — not when frozen; under the Sun the iron heats, in the dark it cools
    assert.ok(lavaHeatStep(0.2, 2, true, false) > LAVA_CRUST);
    assert.ok(lavaHeatStep(0.2, 2, true, true) < LAVA_CRUST);
    assert.ok(ironHeatStep(0.5, 10, 0.9) > 0.5);
    assert.ok(ironHeatStep(0.5, 10, -0.5) < 0.5);
});

test('the ice shell: fire melts it, other blows hardly pass', () => {
    const shell = 3000 * ICE_SHELL.PART;
    const a = shellBlow(shell, 100, 'Bombardo');
    assert.ok(a.shell < shell && a.through < 20);
    const b = shellBlow(shell, 100, 'Inferno');
    assert.ok(shell - b.shell > (shell - a.shell) * 5, 'fire eats the shell much faster');
    const c = shellBlow(10, 100, 'Fire');
    assert.equal(c.shell, 0);
    assert.ok(c.through > 0, 'the rest of the blow goes through');
});

test('the rock titan loses its stones as it is hurt', () => {
    assert.equal(rockChips(4200, 4200, 8), 0);
    assert.equal(rockChips(2100, 4200, 8), 4);
    assert.equal(rockChips(1, 4200, 8), 8);
});

test('immunities and the gods\' spells stay', () => {
    assert.equal(titanResist('venus', 'Inferno'), 0);
    assert.equal(titanResist('neptune', 'Ice'), 0);
    assert.equal(titanDamage('Die', 0, { hpMax: 3000 }), 1000);
    assert.equal(titanDamage('X', 10, { god: true }), 30);
});

test('every walker takes every pose without breaking (and the props are there)', () => {
    for (const look of ['iron', 'rock', 'lava', 'ice', 'shade']) {
        const m = titanModel(look);
        for (const act of WALKER_ACTS) for (const a of [0, 0.3, 0.6, 1]) {
            poseWalker(m, { act, a, w: 1, ph: 1, k: 0.5, breathe: 1 });
            m.updateMatrixWorld(true);
            m.traverse((o) => { for (const k of ['x', 'y', 'z']) assert.ok(Number.isFinite(o.rotation[k]) && Number.isFinite(o.position[k]), `${look} ${act} ${a}`); });
        }
        const R = m.userData.rig;
        if (look === 'iron') assert.ok(R.prop && R.blades.length === 4);
        if (look === 'ice') assert.ok(R.prop && R.shell.length > 0);
        if (look === 'rock') assert.ok(R.club && R.chips.length === 8);
        // a copy poses its own joints, not the first body's
        const c = cloneTitan(m);
        poseWalker(c, { act: 'kneel', a: 0.5 });
        poseWalker(m, { act: 'roar', a: 0.5 });
        assert.notEqual(c.userData.rig.legR.kn.rotation.x, m.userData.rig.legR.kn.rotation.x);
    }
    assert.ok(titanSite('iron').children.length && titanSite('lava').children.length);
});

test('the kneel and the sitting keep the feet on the ground (the hips low, the legs bent — not sunk)', () => {
    const m = titanModel('rock');
    for (const act of ['sit', 'kneel']) {
        poseWalker(m, { act, a: act === 'sit' ? 1 : 0.5, w: 1 });
        m.updateMatrixWorld(true);
        const R = m.userData.rig;
        const y = (o) => o.getWorldPosition(new THREE.Vector3()).y;
        const feet = Math.min(y(R.legL.ft), y(R.legR.ft));
        assert.ok(feet > -0.08 && feet < 0.12, `${act}: the feet at ${feet.toFixed(3)}`);
        assert.ok(y(R.head) < 0.9, `${act}: the head lowered`);
    }
});

// ------------------------------------------------------------------ each titan lived through in a plain world
function fakeGame(planet) {
    const scene = new THREE.Scene();
    const me = new THREE.Group();
    const log = { hurt: 0, voice: [], sounds: new Set(), edits: 0 };
    const top = 10;
    const blocks = new Map();
    const data = {
        topLayer: (x, z) => { let L = top; while (blocks.get(`${x},${L + 1},${z}`)) L++; return L; },
        get: (x, L, z) => blocks.get(`${x},${L},${z}`) ?? (L <= top ? (planet === 'mars' ? BLOCK.REGOLITH : BLOCK.PLANET_ROCK) : BLOCK.AIR),
        landMade: () => true,
    };
    const g = {
        scene, localId: 'me', authority: true, remotes: new Map(),
        camera: Object.assign(new THREE.PerspectiveCamera(), {}),
        character: { group: me, velocity: { x: 0, z: 0 }, isCrouching: false },
        space: {
            realm: planet,
            surfaceSpot: () => ({ x: 1000, y: 11, z: 1000 }),
            planets: new Map([[planet, { id: planet }]]),
            localSun: () => ({ y: 0.8 }),
            now: () => 0,
        },
        terrain: { data },
        builder: { _sendEdits: (e) => { log.edits += e.length; for (const [x, L, z, b] of e) blocks.set(`${x},${L},${z}`, b === BLOCK.AIR ? undefined : b); } },
        combat: { enabled: true, dead: false, damage: () => { log.hurt++; }, freeze: () => {} },
        hud: { setVoice: (t) => log.voice.push(t), flash: () => {} },
        sound: { playTitan: (p, k) => log.sounds.add(k) },
        fx: { spark: () => {}, explosion: () => {}, lightFlash: () => {} },
        cameraShake: () => {},
        knockback: { add: () => {} },
        achievements: { hit: () => {}, killed: () => {} },
        wandMagic: { light: null, _nox: () => {} },
    };
    return { g, me, log };
}

for (const id of TITAN_IDS) {
    test(`${id}: peace → waking → three stages → staggered → death, without an error`, () => {
        const def = TITANS[id];
        const { g, me, log } = fakeGame(def.planet);
        const T0 = new Titans(g);
        g.titans = T0;
        // far: at peace
        me.position.set(1000 + 600, 13, 1000);
        const step = (s) => { for (let t = 0; t < s; t += 0.05) T0.update(0.05); };
        step(3);
        const T = T0.active.get(id);
        assert.ok(T, 'built near its home');
        assert.equal(T.mode, 'peace');
        if (['mercury', 'saturn', 'venus', 'neptune'].includes(id)) assert.ok(T.act, 'its life at peace is an action (forge, sit, bathe, guard)');
        // a foe comes (running: the worm hears him)
        g.character.velocity = { x: 6, z: 0 };
        me.position.set(1000 + 60, 13, 1000);
        step(8);
        assert.equal(T.mode, 'fight', 'it woke');
        // its stages: wounded down to each
        for (const frac of [0.6, 0.3]) {
            T.hp = def.hp * frac;
            step(10);
        }
        assert.equal(T.stage, 3, 'it reached the third stage');
        // the stage turns: the ice one grew its shell, the shade its shadows, the storm its two whirls, the rock its club
        if (id === 'saturn') assert.ok(T.club, 'the pillar torn out');
        if (id === 'jupiter') assert.equal(T.minis.length, 2);
        // a fast heavy blow staggers it (the worm only when up — it is made to be)
        if (def.kit === 'worm') { T.wm = 'up'; T.up = 1; T.wT = 5; }
        T.stagCool = 0;
        if (id === 'neptune') { assert.ok(T.shell > 0, 'the ice one grew its shell at stage 2'); T.shell = 0; } // (the shell would eat the blow — melted first)
        if (id === 'uranus') T.lit = 1; // (the shade unlit takes a quarter — lit first)
        T0.hit(T, def.hp * 0.09, 'Bombardo', 'me', null, T.pos.clone());
        assert.ok(T.stagT > 0, 'staggered');
        step(6);
        // death
        T0.hit(T, 1e6, 'AvadaKedavra', 'me');
        assert.equal(T.mode, 'dying');
        step(10);
        assert.ok(T0.isDead(id));
        assert.ok(!T0.active.has(id), 'the body gone after its fall');
        assert.ok(log.sounds.size >= 4, 'it sounds');
        T0.dispose();
    });
}

test('the iron one: no Sun — no ray; red-hot iron quenched hurts ×2.5', () => {
    const { g, me } = fakeGame('mercury');
    const T0 = new Titans(g);
    me.position.set(1500, 13, 1000);
    for (let i = 0; i < 20; i++) T0.update(0.05);
    const T = T0.active.get('mercury');
    T.mode = 'fight'; T.heat = 0.95;
    const hp = T.hp;
    T0.hit(T, 10, 'Ice', 'me');
    assert.equal(Math.round(hp - T.hp), 25);
    g.space.localSun = () => ({ y: -0.6 });
    assert.ok(T0.sunAt(T) < 0.1);
});

test('the worm never rises out of rock, a blast lures it, a spell into its open mouth hurts most', () => {
    const { g, me } = fakeGame('mars');
    const T0 = new Titans(g);
    me.position.set(1100, 13, 1000);
    for (let i = 0; i < 20; i++) T0.update(0.05);
    const T = T0.active.get('mars');
    T0.noise(new THREE.Vector3(1300, 11, 1000));
    assert.ok(T.heard && Math.abs(T.heard.x - 1300) < 1, 'it goes to the blast');
    T.wm = 'up'; T.up = 1; T.mode = 'fight';
    T0._draw(T, 0.016);
    const mouth = T0._mouth(T, new THREE.Vector3());
    const hp = T.hp;
    T0.hit(T, 10, 'Bombardo', 'me', null, mouth);
    assert.equal(Math.round(hp - T.hp), 25);
});

test('the lava one crusts under water and goes back to its lake; a frozen lake does not heat it', () => {
    const { g, me } = fakeGame('venus');
    const T0 = new Titans(g);
    me.position.set(1150, 13, 1000);
    for (let i = 0; i < 20; i++) T0.update(0.05);
    const T = T0.active.get('venus');
    T.mode = 'fight';
    for (let i = 0; i < 4; i++) T0.hit(T, 5, 'WaterVortex', 'me');
    assert.ok(T.heat < LAVA_CRUST, 'crusted');
    T0.coldAt(T.home.clone());
    assert.ok(T.lakeFrozenT > 0, 'the lake frozen over');
});

test('the storm: wind feeds it; a blow in its eye hits its heart ×3', () => {
    const { g, me } = fakeGame('jupiter');
    const T0 = new Titans(g);
    me.position.set(1200, 13, 1000);
    for (let i = 0; i < 20; i++) T0.update(0.05);
    const T = T0.active.get('jupiter');
    const hp = T.hp;
    T0.hit(T, 50, 'Tornado', 'me');
    assert.equal(T.hp, hp);
    assert.ok(T.grow > 1);
    T0.hit(T, 10, 'Bombardo', 'me', null, T.pos.clone().setY(T.pos.y + 60));
    assert.equal(Math.round(hp - T.hp), 30);
});

test('the ice cage is made of real ice and melts away; a save in the middle never leaves it standing', () => {
    const { g, me, log } = fakeGame('neptune');
    const T0 = new Titans(g);
    me.position.set(1100, 13, 1000);
    for (let i = 0; i < 20; i++) T0.update(0.05);
    const T = T0.active.get('neptune');
    T0._cage(T, new THREE.Vector3(1100, 11, 1000));
    assert.ok(log.edits > 50);
    const snap = T0.snapshot();
    assert.equal(snap.cages.length, 1);
    const T1 = new Titans(g);
    T1.restore(snap);
    const before = log.edits;
    for (let i = 0; i < 80; i++) T1.update(0.05);
    assert.ok(log.edits > before, 'the cage melted after loading');
    assert.equal(T1.state.cages.length, 0);
});

// ------------------------------------------------------------------ the god (Godhood.js)
import { Godhood, GOD } from '../../src/game/Godhood.js';
import { SUN_HALL } from '../../src/world/SunHallPlan.js';

function godGame() {
    const { g, me } = fakeGame('earth');
    const blocks = new Map();
    g.world = { terrain: { data: {
        landMade: () => true,
        get: (x, L, z) => blocks.get(`${x},${L},${z}`) ?? BLOCK.AIR,
        set: (x, L, z, t) => blocks.set(`${x},${L},${z}`, t),
        surfaceY: () => 10,
    } } };
    g.combat.maxFatigue = 30; g.combat.fatigue = 30; g.combat.hp = 20; g.combat.maxHp = 20;
    g.config = { mode: 'creative' };
    g.faceYaw = () => {};
    me.position.set(0, 12, 0);
    return { g, me, blocks };
}

test('«Почти стал богом»: no magic for a while, then the ascension (not instant, through pain) — a god, +10 000 cells', () => {
    const { g, me } = godGame();
    const G = new Godhood(g);
    G.almost();
    assert.ok(G.noMagic && !G.god);
    for (let t = 0; t < GOD.ALMOST_WAIT + 1; t += 0.1) G.update(0.1);
    assert.ok(G.cer, 'the ascension began');
    assert.ok(G.noMagic, 'no magic while it comes');
    let maxLift = 0;
    for (let t = 0; t < GOD.ASCEND_T + 0.5; t += 0.05) { G.update(0.05); maxLift = Math.max(maxLift, me.position.y - 12); }
    assert.ok(maxLift > 3, 'lifted in the light');
    assert.ok(G.god && G.immortal && !G.noMagic);
    assert.equal(g.combat.maxFatigue, 30 + 10000);
    assert.ok(Math.abs(me.position.y - 12) < 0.01, 'set down again');
});

test('the Hall of the Sun: built when a god comes; the pentagram makes him mortal again (the cells back), the arch home', () => {
    const { g, me, blocks } = godGame();
    const G = new Godhood(g);
    G.state.god = true; G.state.cells = 10000; g.combat.maxFatigue = 10030;
    G.enterHall();
    for (let i = 0; i < 400 && (G.hall || !G.rect); i++) G.update(0.05);
    assert.ok(!G.hall, 'built and placed');
    assert.equal(blocks.get(`${SUN_HALL.CX},${SUN_HALL.F - 1},${SUN_HALL.CZ}`), BLOCK.GOLD);
    assert.ok(Math.hypot(me.position.x - SUN_HALL.CX, me.position.z - SUN_HALL.CZ - SUN_HALL.HERO.z) < 1);
    // into the circle
    me.position.x = SUN_HALL.CX; me.position.z = SUN_HALL.CZ + 2;
    for (let t = 0; t < SUN_HALL.MORTAL_T + 0.5; t += 0.1) G.update(0.1);
    assert.ok(!G.god && G.state.renounced);
    assert.equal(g.combat.maxFatigue, 30);
    // the arch
    me.position.x = SUN_HALL.CX + SUN_HALL.EXIT.x; me.position.z = SUN_HALL.CZ + SUN_HALL.EXIT.z;
    for (let t = 0; t < SUN_HALL.EXIT_T + 0.5; t += 0.1) G.update(0.1);
    assert.ok(Math.hypot(me.position.x, me.position.z - 8) < 1, 'home at the start');
});

test('карта: титан планеты помечен всегда (вдали, спящий), своим значком, пока не убит (автор 07.11: «указывался какой-то замок»)', async () => {
    const { Titans } = await import('../../src/game/Titans.js');
    const T = Object.create(Titans.prototype);
    T.state = { dead: [] }; T.active = new Map(); T.home = () => ({ x: 120, y: 5, z: -40 });
    const m = T.markOf('mercury');
    assert.ok(m && m.x === 120 && m.z === -40 && m.icon === '⚡' && m.always && m.titan === 'mercury', JSON.stringify(m));
    assert.equal(T.markOf('earth'), null, 'на Земле титана нет');
    T.active.set('mercury', { mode: 'idle', pos: { x: 5, z: 6 } });
    assert.deepEqual([T.markOf('mercury').x, T.markOf('mercury').z], [5, 6], 'проснулся — там, где стоит');
    T.state.dead.push('mercury');
    assert.equal(T.markOf('mercury'), null, 'убитого на карте нет');
    const hud = (await import('node:fs')).readFileSync(new URL('../../src/ui/Hud.js', import.meta.url), 'utf8');
    assert.match(hud, /icon === '⚡' \? 'titan'/, 'значок титана, не замок');
});
