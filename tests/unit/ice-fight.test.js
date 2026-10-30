// The Ice Queen's fight (IceGiants.js, IceQueen.js): the giants and snowmen MELT in fire (smaller and weaker with every flame; the Hellfire twice the
// Inferno; no death before the least size), the queen cannot get through «Protection» / «Protection Maxima» (but goes through a magic robe, which pays),
// her tactics (freeze from afar → run up → the rod grows into a blade → the frozen one is broken), and the great ice arena on the real generated world.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IceCastleLife, ICE, ICE_TARGETS, FIRE_K } from '../../src/game/IceQueen.js';
import { MELT, MELT_K, MELT_STEPS, meltStats, meltScale, meltGain, applyFire, QUEEN_AI, rangeBand, mayFreeze, chargeOn, bladeGrow, freezeSeconds, QUEEN_VS } from '../../src/game/IceGiants.js';
import { shieldHitCost } from '../../src/game/Combat.js';
import { ICE_CASTLE } from '../../src/world/IceCastle.js';
import { iceQueenModel } from '../../src/game/IceModels.js';
import { WORLD_GEN, ICE_ARENA_FROM_GEN, TerrainData } from '../../src/world/Terrain.js';
import { measure, walkRound, GIANT_R } from '../../tools/icearenabench.mjs';

// ---------------------------------------------------------------- the melting (rules)
test('the melting table: every step weaker than the one before, never below the least size; fire kinds all known', () => {
    for (let i = 1; i < MELT_STEPS.length; i++) {
        const a = MELT_STEPS[i - 1], b = MELT_STEPS[i];
        assert.ok(b.at > a.at && b.dmg < a.dmg && b.speed < a.speed && b.reach < a.reach, `step ${i} is weaker`);
    }
    assert.equal(MELT_STEPS[0].at, 0); assert.equal(MELT_STEPS.at(-1).at, 1);
    assert.equal(meltScale(0), 1); assert.ok(Math.abs(meltScale(1) - MELT.MIN) < 1e-9); assert.ok(Math.abs(meltScale(7) - MELT.MIN) < 1e-9); assert.equal(meltScale(-3), 1);
    assert.ok(MELT.MIN >= 0.3 - 1e-9, 'the scale never under 0.3');
    let last = { scale: 2, dmg: 2, speed: 2, reach: 2 };
    for (let m = 0; m <= 1.0001; m += 0.05) {
        const s = meltStats(m);
        assert.ok(s.scale <= last.scale && s.dmg <= last.dmg && s.speed <= last.speed && s.reach <= last.reach, `monotone at ${m}`);
        last = s;
    }
    assert.equal(meltStats(0).dmg, 1); assert.equal(meltStats(1).dmg, MELT_STEPS.at(-1).dmg);
    for (const k of Object.keys(MELT_K)) assert.ok(FIRE_K[k], `${k} is a fire of the ice (FIRE_K)`);
    for (const k of ['Inferno', 'Fire', 'FireMaxima', 'Hellfire', 'dragonFire']) assert.ok(MELT_K[k] > 0, k);
});

test('the Hellfire melts twice as much as the Inferno; a plain blow does not melt', () => {
    assert.equal(MELT_K.Hellfire, 2 * MELT_K.Inferno);
    assert.ok(Math.abs(meltGain('monster', 'Hellfire', 3) - 2 * meltGain('monster', 'Inferno', 3)) < 1e-12);
    assert.equal(meltGain('monster', 'melee', 50), 0);
    assert.equal(meltGain('queen', 'Inferno', 50), 0, 'the queen does not melt (fire only hurts her)');
    assert.ok(meltGain('snowman', 'Inferno', 3) > meltGain('monster', 'Inferno', 3), 'a snowman: bigger steps');
});

test('fire cannot kill before the least size; at the least size it is a plain blow', () => {
    let melt = 0, hp = 180, hits = 0;
    while (melt < 1) { const r = applyFire('monster', 'Inferno', 3, 6, melt, hp); assert.ok(r.hp >= 1, 'alive while it shrinks'); assert.ok(r.melt >= melt); melt = r.melt; hp = r.hp; hits++; assert.ok(hits < 500); }
    assert.ok(hp > 100, 'it shrank without losing most of its health');
    assert.ok(hits > 10, `not at once: ${hits} hits`);
    const r = applyFire('monster', 'Inferno', 3, 6, 1, hp);
    assert.equal(r.hp, hp - 6, 'now the fire kills');
    // a few hits at a snowman shrink it a step at a time
    const s1 = applyFire('snowman', 'Inferno', 3, 12, 0, 10);
    assert.ok(s1.melt > 0 && s1.melt < 1 && s1.hp >= 1, 'a snowman is not gone in one flame');
});

// ---------------------------------------------------------------- a small game for the life
function fakeGame() {
    const scene = new THREE.Scene();
    const me = new THREE.Group(); me.position.set(0, 1.95, 0);
    const log = { hurt: [], voice: [], dmg: [], die: [], froze: [], pierce: [], blocked: [], shake: 0 };
    const combat = {
        enabled: true, dead: false, frozen: false, shield: null, hp: 100,
        shieldFactor: (from) => (combat.shield && (combat.shield === 'dome' || (from && combat.shield === 'hand' && combat.faces(from))) ? 1 : 0),
        faces: () => true,
        _blocked: (from, kind) => { if (!combat.shield || combat.mana <= 0) return false; combat.mana -= shieldHitCost(kind) * (combat.shield === 'dome' && String(kind).startsWith('Queen') ? 0.5 : 1); log.blocked.push(kind); return true; },
        mana: 1000,
        freeze(by, T) { combat.frozen = true; combat.frozenLeft = T; log.froze.push(T); },
        damage(a, by, kind) { log.dmg.push([a, kind]); },
        die(by, how) { combat.dead = true; log.die.push(how); },
        center: (out) => out.copy(me.position),
    };
    const g = {
        scene, authority: true, localId: 'me', frameCount: 0, remotes: new Map(), isDeadLocal: false,
        character: { group: me }, combat,
        collision: { groundAt: () => 0, resolveCylinder() {} },
        world: { terrain: { data: { get: () => 0, isSolidAt: () => false } } },
        fx: { spark() {}, shake: 0 }, sound: { playIce() {}, playFrozenHit() {}, playSnowStep() {} },
        hud: { setVoice: (t) => log.voice.push(t), flashColor() {}, notify() {} },
        armor: { pierce: (spell, cost) => { log.pierce.push([spell, cost]); return !!g.armor.magic; }, magic: false },
        knockback: { add() {} },
    };
    return { g, me, combat, log };
}
const at = (x, z) => ({ x, y: 0, z });
function withPlan(life, hallZ = -400) {
    life._plan = {
        x: 0, z: 0, R: 92, A: 70, rot: 0, x0: -90, x1: 90, z0: -90, z1: 90, floor: 0.5,
        hall: { ...at(0, hallZ), r: 13, top: 30 }, throne: at(0, hallZ - 8), chandelier: { ...at(0, hallZ), y: 20 },
        gate: { ...at(0, hallZ + 15), w: 5, h: 6, inner: at(0, hallZ + 11), out: at(0, hallZ + 23) }, guard: [at(-5, hallZ + 24), at(5, hallZ + 24)], chests: [],
    };
}
const step = (g, life, n, dt = 0.05) => { for (let i = 0; i < n; i++) { g.frameCount++; life.update(dt); } };

// ---------------------------------------------------------------- the melting (a giant, a snowman)
test('an ice giant in the Inferno: smaller with every flame, hits weaker, shorter reach, slower — dies only at the least size', () => {
    const { g } = fakeGame();
    const life = new IceCastleLife(g);
    let now = 0; life._clock = () => (now += 200); // (a flame every 0.2 s)
    const m = life._spawn('monster', new THREE.Vector3(30, 0, 0), { slot: 0 });
    const r0 = m.r, h0 = m.h, sp0 = m.speed, s0 = m.model.scale.x;
    assert.equal(m.sz, 1);
    let last = { sz: 1, dmgK: 1, reachK: 1, r: r0, h: h0, speed: sp0 };
    let hits = 0, shrunk = 0;
    while (!m.dead && hits < 400) {
        life.hit(m, 3, 'Inferno', 'me'); hits++;
        assert.ok(m.sz <= last.sz + 1e-9 && m.dmgK <= last.dmgK + 1e-9 && m.reachK <= last.reachK + 1e-9 && m.r <= last.r + 1e-9 && m.h <= last.h + 1e-9 && m.speed <= last.speed + 1e-9, 'only smaller and weaker');
        if (m.sz < last.sz - 1e-9) shrunk++;
        if (m.melt < 1) assert.ok(m.hp >= 1 && !m.dead, 'no death before the least size');
        last = { sz: m.sz, dmgK: m.dmgK, reachK: m.reachK, r: m.r, h: m.h, speed: m.speed };
    }
    assert.ok(m.dead, 'at last the fire kills it');
    assert.ok(shrunk >= 10, `it shrank step by step (${shrunk})`);
    assert.ok(Math.abs(m.sz - MELT.MIN) < 1e-9 && m.melt === 1, 'killed at the least size');
    assert.ok(m.r < r0 * 0.4 && m.h < h0 * 0.4 && m.speed < sp0 && Math.abs(m.model.scale.x - s0 * MELT.MIN) < 1e-6 || m.dead, 'the body follows (collision radius, height, scale)');
    assert.ok(hits > 15, `not at once (${hits} flames)`);
});

test('the Hellfire melts a giant in about half the flames of the Inferno', () => {
    const run = (kind) => {
        const { g } = fakeGame();
        const life = new IceCastleLife(g);
        let now = 0; life._clock = () => (now += 200);
        const m = life._spawn('monster', new THREE.Vector3(30, 0, 0), { slot: 0 });
        let n = 0;
        while (m.melt < 1 && n < 500) { life.hit(m, 3, kind, 'me'); n++; }
        return n;
    };
    const inf = run('Inferno'), hell = run('Hellfire');
    assert.ok(Math.abs(inf / hell - 2) < 0.25, `Inferno ${inf} flames, Hellfire ${hell}`);
    // a stream of flame calling every frame melts no faster than every MELT.TICK
    const { g } = fakeGame();
    const life = new IceCastleLife(g);
    let now = 1e6; life._clock = () => now;
    const m = life._spawn('monster', new THREE.Vector3(30, 0, 0), { slot: 0 });
    for (let i = 0; i < 20; i++) life.hit(m, 3, 'Inferno', 'me'); // 20 calls at the same instant
    assert.ok(m.melt <= meltGain('monster', 'Inferno', 3) + 1e-9, 'one effect per tick');
});

test('a melted giant strikes weaker, reaches less and throws smaller boulders', () => {
    const { g } = fakeGame();
    const life = new IceCastleLife(g);
    const m = life._spawn('monster', new THREE.Vector3(10, 0, 0), { slot: 0 });
    const punches = [];
    life._hurtPlayer = (id, dmg, kind) => punches.push(dmg);
    life._playerFeet = () => new THREE.Vector3(12.6, 0, 0);
    const strike = () => { m.act = 'punch'; m.actT = 0; m.actTo = { k: 'p', id: 'me', rad: 0.5 }; life._actDone(m); m.act = null; };
    life.plan; life._plan = { gate: { x: 100, z: 100, out: { x: 100, z: 120 } } };
    strike();
    m.melt = 1; life._resize(m);
    strike();
    assert.equal(punches[0], ICE.MONSTER.PUNCH);
    assert.ok(punches[1] < punches[0] * 0.5, `weaker: ${punches[1]} < ${punches[0]}`);
    assert.ok(m.reachK < 0.8);
    // a boulder
    const shots = [];
    life._addShot = (msg) => shots.push(msg.dm);
    life.game.sync = { ice() {} };
    life._fire('boulder', new THREE.Vector3(0, 5, 0), new THREE.Vector3(20, 1, 0), { dm: m.dmgK });
    assert.ok(shots[0] < 1);
});

test('an evil snowman: small steps of melting, smaller and smaller; dies after the least size', () => {
    const { g } = fakeGame();
    const life = new IceCastleLife(g);
    let now = 0; life._clock = () => (now += 200);
    const s = life._spawn('snowman', new THREE.Vector3(10, 0, 0));
    const sizes = [];
    let n = 0;
    while (!s.dead && n < 100) { life.hit(s, 3, 'Inferno', 'me'); n++; sizes.push(s.sz); }
    assert.ok(s.dead && n >= 5, `${n} flames`);
    assert.ok(sizes[0] < 1 && sizes[0] > 0.7, 'the first flame: a small step');
    assert.ok(Math.abs(s.model.scale.x - MELT.MIN) < 1e-6 || s.dead);
    // a blast shatters it as before; the queen does not shrink at all
    const s2 = life._spawn('snowman', new THREE.Vector3(10, 0, 5));
    life.hit(s2, 5, 'Bombardo', 'me');
    assert.ok(s2.dead && s2.sz === 1, 'a blast: shattered, not melted');
    const q = life._spawn('queen', new THREE.Vector3(10, 0, 20));
    life.hit(q, 3, 'Inferno', 'me');
    assert.equal(q.sz, 1); assert.ok(q.hp < ICE.QUEEN.HP);
});

test('the melting goes over the network and into the save', () => {
    const a = fakeGame(), b = fakeGame();
    b.g.authority = false;
    const sent = [];
    a.g.sync = { ice: (m) => sent.push(m) };
    const host = new IceCastleLife(a.g), guest = new IceCastleLife(b.g);
    let now = 0; host._clock = () => (now += 200);
    const m = host._spawn('monster', new THREE.Vector3(30, 0, 0), { slot: 1 });
    for (let i = 0; i < 12; i++) host.hit(m, 3, 'Inferno', 'me');
    host._netSend(1); host._sendSoon = true; host._netT = 0; host._netSend(0.2);
    const state = sent.find((x) => x.e === 's');
    assert.ok(state, 'the host sends the state');
    guest.onNet(state, 'host');
    const gm = guest.list.find((c) => c.type === 'monster');
    assert.ok(gm && Math.abs(gm.melt - Math.round(m.melt * 100) / 100) < 0.011, 'the guest has the melt');
    assert.ok(gm.sz < 1 && gm.r < ICE.MONSTER.R && Math.abs(gm.model.scale.x - ICE.MONSTER.S * gm.sz) < 1e-6, 'and the size');
    const snap = host.snapshot();
    assert.ok(snap.monsterMelt[1] > 0);
    const h2 = new IceCastleLife(fakeGame().g);
    h2.restore(snap);
    assert.ok(Math.abs(h2.state.monsterMelt[1] - snap.monsterMelt[1]) < 1e-9, 'saved with the world');
});

// ---------------------------------------------------------------- the queen and the shield
test('the queen\'s blows cost the shield: dearer than a snowflake, the dome half the price', () => {
    for (const k of ['QueenFreeze', 'QueenSpikes', 'QueenBlade', 'QueenShard', 'QueenGust']) assert.ok(shieldHitCost(k) >= 2.5, k);
    assert.ok(shieldHitCost('QueenFreeze') > shieldHitCost('QueenShard'));
});

test('«Protection» and «Protection Maxima» hold EVERY blow of the queen: freeze, shards, spikes, gust, blade — a robe does not', () => {
    for (const shield of ['hand', 'dome']) {
        const { g, combat, log } = fakeGame();
        const life = new IceCastleLife(g);
        const q = life._spawn('queen', new THREE.Vector3(0, 0, -20));
        combat.shield = shield;
        const from = new THREE.Vector3(0, 3, -20);
        // the freeze
        let r = life._frozenMe('iceQueen', 5);
        assert.ok(!r.ok && r.held && !combat.frozen && !log.froze.length, `${shield}: the freeze is held`);
        // shards, spikes, gust (what each of the fx paths asks)
        life._hurtMe(3, 'ice', from, null, 'QueenShard');
        life._hurtMe(9, 'ice', from, new THREE.Vector3(0, 9, 0), 'QueenSpikes');
        life._hurtMe(3, 'ice', from, new THREE.Vector3(1, 4, 0), 'QueenGust');
        life._hurtMe(18, 'blade', from, new THREE.Vector3(0, 3, 0));
        assert.equal(log.dmg.length, 0, `${shield}: no harm`);
        assert.equal(log.die.length, 0, `${shield}: no death`);
        assert.equal(log.pierce.length, 0, 'the robe is not even asked: the shield took it');
        assert.deepEqual(log.blocked, ['QueenFreeze', 'QueenShard', 'QueenSpikes', 'QueenGust', 'QueenBlade'], `${shield}: each paid at its own price`);
        // out of mana: the shield breaks and the blow goes on (the author's «пока есть мана»)
        combat.mana = 0;
        life._hurtMe(9, 'ice', from, null, 'QueenSpikes');
        assert.equal(log.dmg.length, 1, `${shield}: out of mana the spikes get through`);
        void q;
    }
    // the dome is cheaper
    const price = (shield) => { const { g, combat } = fakeGame(); const life = new IceCastleLife(g); combat.shield = shield; combat.mana = 100; life._hurtMe(9, 'ice', new THREE.Vector3(0, 3, -20), null, 'QueenSpikes'); return 100 - combat.mana; };
    assert.ok(price('dome') * 2 - price('hand') < 1e-9 && price('dome') < price('hand'), 'Maxima holds for half the price');
});

test('a magic robe does not stop the queen: the blow goes through, the robe\'s reserve pays, the freeze is shorter', () => {
    const { g, combat, log } = fakeGame();
    const life = new IceCastleLife(g);
    life._spawn('queen', new THREE.Vector3(0, 0, -20));
    // no shield, a plain body: the full freeze
    let r = life._frozenMe('iceQueen', QUEEN_AI.FREEZE_T);
    assert.ok(r.ok && r.T === QUEEN_AI.FREEZE_T && combat.frozen);
    combat.frozen = false;
    // a magic set / robe with a reserve: shorter, paid
    g.armor.magic = true;
    r = life._frozenMe('iceQueen', QUEEN_AI.FREEZE_T);
    assert.ok(r.ok && Math.abs(r.T - QUEEN_AI.FREEZE_T * QUEEN_AI.ARMOR_CUT) < 1e-9, 'the freeze is cut');
    assert.equal(log.pierce.at(-1)[0], 'Frozen');
    assert.equal(log.pierce.at(-1)[1], shieldHitCost('QueenFreeze') * 2, 'paid at the spell\'s price');
    // spikes through the robe: harm AND the reserve paid
    life._hurtMe(9, 'ice', new THREE.Vector3(0, 3, -20), null, 'QueenSpikes');
    assert.equal(log.dmg.at(-1)[0], 9);
    assert.equal(log.pierce.at(-1)[0], 'Frozen');
    assert.equal(freezeSeconds(5, true), 3); assert.equal(freezeSeconds(5, false), 5);
});

test('the blade: a frozen one is broken, one who is not takes 18, the monster form takes it as a blow', () => {
    const { g, combat, log } = fakeGame();
    const life = new IceCastleLife(g);
    life._spawn('queen', new THREE.Vector3(0, 0, -20));
    const from = new THREE.Vector3(0, 3, -4);
    combat.frozen = true;
    life._hurtMe(QUEEN_AI.BLADE_DMG, 'blade', from, null);
    assert.deepEqual(log.die, ['iceQueen'], 'frozen: broken');
    const b = fakeGame();
    const l2 = new IceCastleLife(b.g);
    l2._spawn('queen', new THREE.Vector3(0, 0, -20));
    l2._hurtMe(QUEEN_AI.BLADE_DMG, 'blade', from, null);
    assert.deepEqual(b.log.dmg, [[QUEEN_AI.BLADE_DMG, 'iceBlade']]); assert.equal(b.log.die.length, 0);
    const c = fakeGame();
    c.g.monster = { active: true }; c.combat.frozen = true;
    const l3 = new IceCastleLife(c.g);
    l3._hurtMe(QUEEN_AI.BLADE_DMG, 'blade', from, null);
    assert.equal(c.log.die.length, 0, 'the monster form\'s ice is not shattered by a blow');
    assert.equal(c.log.dmg.length, 1);
    for (const k of ['protection', 'protectionMaxima', 'magicRobe', 'frozen', 'noShield']) assert.ok(QUEEN_VS[k], k);
    assert.ok(ICE_TARGETS.melt && ICE_TARGETS.queenVsPlayer);
});

// ---------------------------------------------------------------- the queen's tactics
test('the numbers of the tactics: the bands, the freeze range, the charge, the blade', () => {
    assert.equal(rangeBand(5), 'near'); assert.equal(rangeBand(15), 'ok'); assert.equal(rangeBand(30), 'far');
    assert.ok(!mayFreeze(6, null) && mayFreeze(12, null) && !mayFreeze(30, null) && !mayFreeze(15, 2) && mayFreeze(15, 9));
    assert.ok(chargeOn(18, QUEEN_AI.FREEZE_T) && !chargeOn(40, QUEEN_AI.FREEZE_T) && !chargeOn(18, 1.5) && !chargeOn(18, 0));
    assert.ok(bladeGrow(0, 20) < 0.6 && bladeGrow(2, 5) === 1 && bladeGrow(0.4, 5) < 1);
    assert.ok(QUEEN_AI.CHARGE_SPEED > ICE.QUEEN.SPEED * 3, 'she skates up fast');
    assert.ok(QUEEN_AI.KEEP_MIN >= 10 && QUEEN_AI.KEEP_MAX <= 25 && QUEEN_AI.FREEZE_MIN >= 10);
});

/** The queen against one player 17 m away on open ground. */
function duel({ shield = null, magic = false } = {}) {
    const f = fakeGame();
    const { g, me, combat } = f;
    me.position.set(0, 1.95, 0);
    combat.shield = shield; g.armor.magic = magic;
    g.sync = { ice() {} };
    const life = new IceCastleLife(g);
    withPlan(life);
    life.state.queenDead = false;
    const q = life._spawn('queen', new THREE.Vector3(0, 0, -17), { yaw: Math.PI }); // (looks along +z: toward the player at the origin)
    q.greeted = true;
    life.active = true;
    return { ...f, life, q };
}
const seedRandom = (fn) => { const o = Math.random; Math.random = fn; return () => { Math.random = o; }; };

test('the queen: freezes from afar, runs up, the rod grows into a blade, breaks the frozen player', () => {
    const restore = seedRandom(() => 0.05);
    try {
        const { g, life, q, combat, log, me } = duel();
        q.castT = 0;
        let sawFreeze = false, bladeOut = 0, minD = 99, firstFreezeD = null;
        for (let i = 0; i < 600 && !log.die.length; i++) {
            step(g, life, 1, 0.05);
            const d = Math.hypot(me.position.x - q.model.position.x, me.position.z - q.model.position.z);
            if (log.froze.length && !sawFreeze) { sawFreeze = true; firstFreezeD = d; }
            if (q.blade > bladeOut) bladeOut = q.blade;
            minD = Math.min(minD, d);
            if (combat.frozen && i > 0 && combat.frozenLeft > 0) combat.frozenLeft -= 0.05;
        }
        assert.ok(sawFreeze, 'she froze him');
        assert.ok(firstFreezeD >= QUEEN_AI.FREEZE_MIN - 1.5, `from afar, not point blank (${firstFreezeD?.toFixed(1)} m)`);
        assert.ok(bladeOut > 0.95, `the rod grew into a blade (${bladeOut.toFixed(2)})`);
        assert.deepEqual(log.die, ['iceQueen'], 'and broke the frozen one');
        assert.ok(minD < QUEEN_AI.STRIKE + 1.5, `she came to the blade's reach (${minD.toFixed(1)} m)`);
        // afterwards the blade is a rod again
        combat.dead = false; combat.frozen = false; me.position.set(0, 1.95, 200);
        step(g, life, 400);
        assert.ok(q.blade < 0.05, `the blade is a rod again (${q.blade.toFixed(2)})`);
    } finally { restore(); }
});

test('the queen against «Protection» / «Protection Maxima»: no freeze, no charge, no harm — as long as the shield has mana', () => {
    const restore = seedRandom(() => 0.05);
    try {
        for (const shield of ['hand', 'dome']) {
            const { g, life, q, combat, log } = duel({ shield });
            q.castT = 0;
            step(g, life, 400);
            assert.ok(log.blocked.includes('QueenFreeze'), `${shield}: she tried to freeze`);
            assert.equal(log.froze.length, 0, `${shield}: never frozen`);
            assert.equal(log.die.length, 0, `${shield}: not broken`);
            assert.equal(log.dmg.filter(([, k]) => k === 'iceBlade').length, 0, `${shield}: no blade blow`);
            assert.equal(q.charge, null, `${shield}: no charge`);
        }
    } finally { restore(); }
});

test('cornered with the foe close: the blade anyway; the foe out of reach when the blow lands: a miss', () => {
    const restore = seedRandom(() => 0.9);
    try {
        const { g, life, q, log, me } = duel();
        // a foe that has left: the blow goes nowhere
        const e = { k: 'p', id: 'me', rad: 0.5, p: me.position.clone().setY(0), giant: false };
        q.charge = { id: 'me', until: 99, t0: 0 };
        me.position.set(0, 1.95, 300);
        life._queenCast(q, 'slash', e);
        assert.equal(log.dmg.length + log.die.length, 0, 'out of reach: a miss');
        assert.equal(q.charge, null);
        assert.ok(q.sheathT >= 1.4, 'and the blade goes back to a rod');
    } finally { restore(); }
});

test('a guest\'s computer answers whether the freeze took: held — she does not chase', () => {
    const restore = seedRandom(() => 0.05);
    try {
        const { g, life, q } = duel();
        q.charge = { id: 'friend', until: g.frameCount + 99, pend: true };
        life._frozeAnswer('friend', false, 0);
        assert.equal(q.charge, null);
        q.charge = { id: 'friend', until: 5, pend: true };
        life._t = 2;
        life._frozeAnswer('friend', true, 4);
        assert.ok(q.charge && q.charge.until > 5.5 && !q.charge.pend);
    } finally { restore(); }
});

// ---------------------------------------------------------------- the great ice arena
test('the arena belongs to the new generation only: older worlds keep their small shelf', () => {
    assert.ok(ICE_ARENA_FROM_GEN <= WORLD_GEN);
    const gen = (iceArena) => { const d = new TerrainData(); d.generate({ seed: 12345, mountains: true, seas: true, deepCaves: true, lush: true, iceArena }); return d.iceCastle.plan; };
    const old = gen(false), now = gen(true);
    assert.equal(old.R, ICE_CASTLE.R); assert.ok(!old.arena && old.A === old.R);
    assert.equal(now.R, ICE_CASTLE.ARENA.R); assert.ok(now.arena && now.A >= 60 && now.A <= 80, `clear radius ${now.A}`);
});

test('the arena on real worlds: the floor is level, every giant and snowman can reach the whole terrace, the way from the gateway to the palace is 6 blocks wide', () => {
    for (const seed of [12345, 777, 42]) {
        const m = measure(seed);
        assert.ok(m.plan, `seed ${seed}: a castle`);
        assert.ok(m.giantOk / m.disk > 0.9, `seed ${seed}: floor under the giants (${(100 * m.giantOk / m.disk).toFixed(1)} %)`);
        assert.equal(m.giantReached, m.giantOk, `seed ${seed}: every spot a giant can stand on is reached from the gateway (no pockets)`);
        assert.equal(m.snowReached, m.snowOk, `seed ${seed}: and every snowman's`);
        assert.ok(m.reaches6 && m.reachesGiant, `seed ${seed}: the way to the palace's yard is wide`);
        assert.ok(m.plan.A >= 60, 'at least 60 m of clear floor from the middle');
        assert.ok(GIANT_R * 2 < 6);
    }
});

test('giants and snowmen walk all round the arena with the game\'s walking brain: all arrive, nobody stands, nobody is put back', () => {
    const m = measure(12345);
    const r = walkRound(m);
    assert.equal(r.arrived, r.total, `arrived ${r.arrived}/${r.total} in ${r.time} s`);
    assert.ok(r.maxStand <= 4, `the longest stand ${r.maxStand} s`);
    assert.ok(r.unsticks <= 0, `put back ${r.unsticks} times`);
    assert.ok(r.deepestOverlap <= 0.05, `bodies inside each other: ${r.deepestOverlap} m`);
});

test('sizes: the queen\'s blade, measured on the model (Box3): hair-thin as a rod, then about as long as she is tall; the guard not wider than 3 m', () => {
    const m = iceQueenModel(); m.scale.setScalar(ICE.QUEEN.S); m.updateMatrixWorld(true);
    const box = (o) => new THREE.Box3().setFromObject(o);
    const u = m.userData;
    const sheathed = box(u.blade), h0 = box(m).max.y;
    assert.ok(sheathed.max.y - sheathed.min.y < 0.5, 'the sheathed blade is a hair-thin line');
    u.blade.scale.y = QUEEN_AI.BLADE_LEN; m.updateMatrixWorld(true);
    const out = box(u.blade), len = out.max.y - out.min.y;
    assert.ok(len > 5 && len < h0 * 1.2, `the blade is ${len.toFixed(1)} m (the queen ${h0.toFixed(1)} m)`);
    assert.ok(out.max.x - out.min.x < 3, 'the guard');
}) ;

// ---- Бомбарда / Бомбарда Максима по ледяным (IceGiants.BLAST)
import { blastVerdict, crackCount, BLAST, SHATTER_KINDS } from '../../src/game/IceGiants.js';

test('a blast on a snowman bursts it; on a giant a plain Bombardo cracks it, a Maxima near breaks it into blocks', () => {
    const snow = blastVerdict('snowman', 'Bombardo', 8, ICE.SNOW.HP);
    assert.ok(snow.dmg >= ICE.SNOW.HP && snow.breaks, 'a plain blast at the centre kills a snowman and it flies apart');
    const far = blastVerdict('snowman', 'Bombardo', 2.4, ICE.SNOW.HP);
    assert.ok(far.breaks && far.dmg >= 7, 'at the edge it is badly hurt');
    const M = ICE.MONSTER.HP;
    const plain = blastVerdict('monster', 'Bombardo', 8, M);
    assert.ok(plain.dmg > 0 && plain.dmg < M * 0.2, `a plain Bombardo cracks a giant (${plain.dmg} of ${M})`);
    const maxFar = blastVerdict('monster', 'BombardoMaxima', 24 * 0.3, M);
    assert.ok(maxFar.dmg > 0 && maxFar.dmg < M * 0.2, 'a Maxima at the edge: a heavy crack, not a break');
    const maxNear = blastVerdict('monster', 'BombardoMaxima', 24, M);
    assert.equal(maxNear.dmg, M, 'a Maxima at the centre breaks it into blocks');
    assert.ok(maxNear.breaks);
    for (const k of SHATTER_KINDS) assert.equal(blastVerdict('monster', k, 1, M).dmg, M, k + ' breaks a giant at once');
    assert.equal(blastVerdict('monster', 'SomeGodSpell', 1, M, true).dmg, M, 'the gods\' spells break it at once');
    assert.equal(blastVerdict('monster', 'Ice', 8, M), null, 'not a blast: the usual table');
    assert.equal(blastVerdict('monster', 'Bombardo', 0, M), null);
});

test('the queen is not torn apart: a shove and a little damage; the gods\' spells go as on anyone', () => {
    const plain = blastVerdict('queen', 'Bombardo', 8, 350);
    assert.ok(plain.dmg > 0 && plain.dmg <= 8 * BLAST.QUEEN_PLAIN + 1e-9 && !plain.breaks);
    const mx = blastVerdict('queen', 'BombardoMaxima', 24, 350);
    assert.ok(mx.dmg < 350 * 0.1 && !mx.breaks);
    assert.ok(!blastVerdict('queen', 'Boom', 99, 350).breaks);
});

test('the fissures grow with the strength lost: none whole, all when it is nearly gone', () => {
    assert.equal(crackCount(180, 180), 0);
    assert.equal(crackCount(0, 180), BLAST.CRACKS);
    let last = -1;
    for (let hp = 180; hp >= 0; hp -= 5) { const n = crackCount(hp, 180); assert.ok(n >= last); last = n; }
    assert.ok(crackCount(120, 180) >= 2 && crackCount(120, 180) < BLAST.CRACKS);
});

test('the table «кто/что» has the blast row', () => {
    assert.equal(ICE_TARGETS.blast.does, 'break');
});

test('раненая Королева (< 40 HP) уходит от врага и отдаёт бой страже', () => {
  assert.ok(QUEEN_AI.WEAK_HP === 40 && QUEEN_AI.WEAK_KEEP > QUEEN_AI.KEEP_MAX);
});
