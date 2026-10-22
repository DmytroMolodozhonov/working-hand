/**
 * «Water Vortex» (+ «Bubble», «Frozen») and «Fire Maxima»: the words, the hand going round
 * (only real turns gather water, faster turns more), the rings, the flight (faster and
 * faster), the push, the bubble round a creature, the ice (−1 HP cold, −1 HP air a second)
 * and the fire that melts it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST, Combat } from '../../src/game/Combat.js';
import { WaterVortex, SwingMeter, VORTEX, FIRE_MAXIMA, turnWater, layersOf, layerRadius, flightSpeed, pushOf, bubbleRadius, iceDamagePerSecond } from '../../src/game/WaterVortex.js';

test('the words: «Water Vortex» (and «вотер вортекс»), «Fire Maxima»; the old words stay', () => {
    for (const t of ['Water Vortex', 'water vortex', 'вотер вортекс', 'Вотер вортэкс', 'ватер вортекс', 'вортекс', 'уотер вортикс']) assert.equal(matchSpell(t), 'WaterVortex', t);
    for (const t of ['Fire Maxima', 'fire maxima', 'файр максима', 'Фаер максима', 'файер макс']) assert.equal(matchSpell(t), 'FireMaxima', t);
    assert.equal(matchSpell('Fire'), 'Fire');
    assert.equal(matchSpell('файр'), 'Fire');
    assert.equal(matchSpell('Waterbollow'), 'Waterball');
    assert.equal(matchSpell('вотербол'), 'Waterball');
    assert.equal(matchSpell('максима'), 'Maxima');
    assert.equal(matchSpell('Bubble'), 'AirBubble');
    assert.equal(matchSpell('Frozen'), 'Frozen');
    assert.equal(matchSpell('Protection Maxima'), 'ProtectionMaxima');
    assert.equal(matchSpell('water forming'), 'WaterForming');
});

test('mana: Water Vortex is a very strong spell (25), Fire Maxima 20, Bubble free', () => {
    assert.equal(SPELL_COST.WaterVortex, 25);
    assert.equal(VORTEX.COST, 25);
    assert.equal(SPELL_COST.FireMaxima, 20);
    assert.equal(FIRE_MAXIMA.COST, 20);
    assert.equal(SPELL_COST.VortexBubble, 0, '«Bubble» is part of the vortex (already paid)');
});

/** Feed a hand going round a circle (radius r m, `turnsPerSec`) for `secs` at 30 FPS. */
function circle(meter, { r = 0.35, turnsPerSec = 1, secs = 3, t0 = 0, plane = 'xz' } = {}) {
    let added = 0;
    for (let i = 0; i <= secs * 30; i++) {
        const t = t0 + i / 30, a = t * turnsPerSec * Math.PI * 2;
        const p = plane === 'xz' ? new THREE.Vector3(Math.cos(a) * r, 0.2, Math.sin(a) * r) : new THREE.Vector3(Math.cos(a) * r + 0.3, Math.sin(a) * r, -0.5);
        added += meter.push(t, p);
    }
    return added;
}

test('swinging: each real turn of the hand is counted, round the body or in front', () => {
    const m = new SwingMeter();
    const added = circle(m, { turnsPerSec: 1, secs: 4 });
    assert.ok(m.turns > 3 && m.turns < 4.3, `4 turns of the hand → ~4 counted (${m.turns.toFixed(2)})`);
    assert.ok(Math.abs(added - m.turns) < 1e-9);
    assert.ok(m.rate > 0.8 && m.rate < 1.2, `rate ~1 turn/s (${m.rate.toFixed(2)})`);
    const v = new SwingMeter();
    circle(v, { turnsPerSec: 1, secs: 4, plane: 'xy' });
    assert.ok(v.turns > 3, `a circle in front of the body counts too (${v.turns.toFixed(2)})`);
});

test('swinging: shaking, back-and-forth or a still hand gather nothing', () => {
    const m = new SwingMeter();
    for (let i = 0; i <= 120; i++) { const t = i / 30; m.push(t, new THREE.Vector3(Math.sin(t * 9) * 0.4, 0.2, -0.4)); }
    assert.ok(m.turns < 0.25, `back and forth is not going round (${m.turns.toFixed(2)})`);
    const s = new SwingMeter();
    for (let i = 0; i <= 120; i++) s.push(i / 30, new THREE.Vector3(0.3 + (Math.random() - 0.5) * 0.01, 0.2, -0.4));
    assert.ok(s.turns < 0.05, `a still (trembling) hand: nothing (${s.turns.toFixed(3)})`);
});

test('the faster the hand, the more water each turn brings; more turns, more water', () => {
    assert.ok(turnWater(3) > turnWater(1) * 1.3, 'faster hand → more water per turn');
    assert.ok(turnWater(0) > 0);
    const slow = new SwingMeter(), fast = new SwingMeter();
    circle(slow, { turnsPerSec: 0.6, secs: 3 });
    circle(fast, { turnsPerSec: 1.8, secs: 3 });
    assert.ok(fast.turns > slow.turns * 2, 'a faster hand makes more turns in the same time');
    assert.ok(fast.speed > slow.speed * 2, 'and goes faster');
});

test('the rings: layers with gaps between them, up to the maximum', () => {
    assert.deepEqual(layersOf(0), []);
    assert.deepEqual(layersOf(6), [0.5]);
    assert.deepEqual(layersOf(30), [1, 1, 0.5]);
    assert.equal(VORTEX.MAX_VOLUME / VORTEX.LAYER_VOLUME, 10, 'keep swinging: up to 10 rings');
    assert.equal(layersOf(1000).length, VORTEX.MAX_VOLUME / VORTEX.LAYER_VOLUME);
    for (let i = 1; i < 10; i++) assert.ok(layerRadius(i) - layerRadius(i - 1) > 0.5, 'a gap of air between the rings');
});

test('the flight goes faster and faster; a big vortex knocks down; bubble size', () => {
    assert.ok(flightSpeed(0.5) > flightSpeed(0) && flightSpeed(1) > flightSpeed(0.5));
    assert.equal(flightSpeed(100), VORTEX.VMAX);
    assert.equal(pushOf(4).knock, false);
    assert.equal(pushOf(20).knock, true);
    assert.ok(pushOf(40).speed > pushOf(5).speed);
    assert.ok(bubbleRadius(40) > bubbleRadius(5));
    assert.equal(iceDamagePerSecond(), 2);
});

// ---------------------------------------------------------------- a small world
function world({ mode = 'freeworld' } = {}) {
    const zombie = { id: 7, isDead: false, hp: 100, group: { position: new THREE.Vector3(0, 0, -8) }, stunTimer: 0, dmg: [] };
    const hud = { msgs: [], setVoice(t) { this.msgs.push(t); }, setStatus() {}, setFrozenOverlay() {}, damageFlash() {}, update() {}, setFatigue() {}, toast() {} };
    const ch = {
        group: { position: new THREE.Vector3(0, 0, 0), quaternion: new THREE.Quaternion() },
        hand: new THREE.Vector3(0.4, 0.3, -0.3),
        dir: new THREE.Vector3(0, 0, -1),
        getHandWorldPosition(side, out = new THREE.Vector3()) { return out.copy(this.group.position).add(this.hand); },
        getHandDirection(side, out = new THREE.Vector3()) { return out.copy(this.dir); },
        getPointingDirection(side, out = new THREE.Vector3()) { return out.copy(this.dir); },
        isArmRaised() { return true; },
        isTPose() { return true; },
        isArmExtended() { return true; },
        knockedDown: false,
    };
    const sent = [];
    const g = {
        config: { mode }, localId: 'me', fx: { spark() {}, lightFlash() {} }, authority: true, hud, character: ch, knockback: new THREE.Vector3(),
        zombies: [zombie], zombieById: new Map([[7, zombie]]),
        items: { heldOf: (k) => (k === 'wand' ? { side: 'right' } : null), wand: { plain: true } },
        terrain: { data: { get: (x, L, z) => (z <= -3 && z >= -6 && L <= 1 ? 8 : 0), isSolidAt: () => false, findWaterSurface: () => null } },
        collision: { pointBlocked: () => false, surfaceY: () => -1 },
        sync: { vortex: (m) => sent.push(m) },
        mana: { got: [], success(n) { this.got.push(n); } },
        damageZombie(z, amount) { z.hp -= amount; z.dmg.push(amount); if (z.hp <= 0) z.isDead = true; },
        damageLocalPlayer() {},
        duel: {
            _bodies(skip) {
                const out = [];
                if (!zombie.isDead) { const p = zombie.group.position; out.push({ kind: 'z', id: 7, a: new THREE.Vector3(p.x, p.y, p.z), b: new THREE.Vector3(p.x, p.y + 2, p.z), r: 0.7 }); }
                if (skip !== 'me') { const p = ch.group.position; out.push({ kind: 'p', id: 'me', a: new THREE.Vector3(p.x, p.y - 1.3, p.z), b: new THREE.Vector3(p.x, p.y + 2.15, p.z), r: 0.7 }); }
                return out;
            },
            _targetPos(b, out) { if (b.tk === 'z' && !zombie.isDead) return out.copy(zombie.group.position).add(new THREE.Vector3(0, 1, 0)); if (b.tk === 'p' && b.tid === 'me') return out.copy(ch.group.position).add(new THREE.Vector3(0, 0.6, 0)); return null; },
            _creature() { return null; },
            _handOf(by, side, o, d) { if (by !== 'me') return false; ch.getHandWorldPosition(side, o); ch.getPointingDirection(side, d); return true; },
            findTarget() { return zombie.isDead ? null : { kind: 'z', id: 7, dist: 8, miss: 0 }; },
        },
    };
    g.combat = new Combat(g);
    g.vortex = new WaterVortex(g);
    return { g, ch, zombie, sent, V: g.vortex };
}

const run = (V, secs, each) => { for (let i = 0; i < secs * 60; i++) { each?.(i / 60); V.update(1 / 60); } };

test('Water Vortex: only with a wand (Creative: a bare hand), only pointing at water', () => {
    const { g, ch, V } = world();
    g.items.heldOf = () => null;
    assert.equal(V.cast(true), null, 'no wand outside Creative');
    assert.match(g.hud.msgs.at(-1), /палочк/);
    g.config.mode = 'creative';
    ch.dir.set(0, 0, 1); // (away from the water)
    assert.equal(V.cast(true), null, 'not pointing at water');
    assert.match(g.hud.msgs.at(-1), /на воду/);
    ch.dir.set(0, -0.2, -1).normalize();
    assert.equal(V.cast(true), 'WaterVortex', 'Creative: a bare hand pointing at the water');
});

test('Water Vortex: no swinging within 3 s → the water falls back; mana is paid', () => {
    const { g, ch, V } = world();
    ch.dir.set(0, -0.2, -1).normalize();
    const before = g.combat.fatigue;
    assert.equal(V.cast(true), 'WaterVortex');
    assert.ok(before - g.combat.fatigue >= 25 * 0.85 - 1e-6, 'mana paid');
    run(V, 3.4);
    assert.equal(V.state, null);
    assert.ok(V.log.some((e) => e.ev === 'fizzle'));
});

test('Water Vortex: swinging gathers rings of water, pointing sends all of it, it hits and pushes; «Bubble» wraps, «Frozen» freezes, 2 HP a second, «Fire Maxima» melts', () => {
    const { g, ch, zombie, sent, V } = world();
    g.combat.fatigue = 200; // (plenty of mana for the whole test)
    ch.dir.set(0, -0.2, -1).normalize();
    assert.equal(V.cast(true), 'WaterVortex');
    // swing the hand round for 3 s: the vortex gathers
    let t = 0;
    run(V, 3, () => { t += 1 / 60; const a = t * Math.PI * 2 * 1.2; ch.hand.set(Math.cos(a) * 0.45, 0.4, Math.sin(a) * 0.45); });
    assert.equal(V.state.phase, 'gather');
    const v1 = V.state.volume;
    assert.ok(v1 > 6, `water gathered (${v1.toFixed(1)} m³)`);
    assert.ok(layersOf(v1).length >= 1);
    // keep swinging, faster: more water
    run(V, 2, () => { t += 1 / 60; const a = t * Math.PI * 2 * 2.2; ch.hand.set(Math.cos(a) * 0.45, 0.4, Math.sin(a) * 0.45); });
    const v2 = V.state.volume;
    assert.ok(v2 > v1 + 6, `more turns, more water (${v1.toFixed(1)} → ${v2.toFixed(1)})`);
    assert.ok(sent.some((m) => m.ev === 'st' && m.s && m.s[0] === 1), 'the vortex is sent to the others');
    // point at the zombie and hold still: it flies
    ch.hand.set(0.3, 0.4, -0.6);
    ch.dir.set(0, 0, -1);
    run(V, 1.5);
    assert.equal(V.state, null, 'not gathering any more');
    const launch = sent.find((m) => m.ev === 'launch');
    assert.ok(launch && launch.tk === 'z' && launch.v > 10, 'all the water flies at the zombie');
    // «Bubble» said at the hit (a moment before it)
    assert.equal(V.voice('AirBubble', 'bubble', true), 'VortexBubble');
    run(V, 1.0);
    assert.ok(V.log.some((e) => e.ev === 'hit' && e.tk === 'z'), 'it hit the zombie');
    assert.ok(g.mana.got.includes('WaterVortex'), 'mana: the strong spell really worked');
    assert.ok(V.log.some((e) => e.ev === 'push' && e.tk === 'z' && e.speed > 6 && e.knock), 'pushed hard by the water (and knocked down)');
    assert.equal(zombie.dmg.length, 0, 'the water does not hurt');
    const b = [...V.bubbles.values()][0];
    assert.ok(b && b.tk === 'z' && b.phase === 'liquid', 'a bubble round the zombie');
    run(V, 2.5);
    assert.ok(b.r > 1.3, `it grew as the whole vortex flowed in (${b.r.toFixed(2)})`);
    assert.equal(V.flights.size, 0, 'the vortex is spent');
    assert.ok(zombie.stunTimer > 0, 'the one inside is held');
    // «Frozen»: ice; 1 HP cold + 1 HP air every second
    assert.equal(V.voice('Frozen', 'frozen', true), 'Frozen');
    assert.equal(b.phase, 'ice');
    const hp0 = zombie.hp;
    run(V, 3.05);
    assert.equal(hp0 - zombie.hp, 6, `−2 HP a second for 3 s (${hp0 - zombie.hp})`);
    // «Fire Maxima» pointed at the ice: it melts very fast; the one inside is freed, unhurt by the fire
    ch.dir.set(0, 0, -1);
    assert.equal(V.voice('FireMaxima', 'fire maxima', true), 'FireMaxima');
    run(V, 0.5);
    assert.equal(b.phase, 'melt');
    const hpMelt = zombie.hp;
    run(V, 1.3);
    assert.equal(V.bubbles.size, 0, 'melted away');
    assert.equal(zombie.hp, hpMelt, 'freed: no more cold, the rescuing fire did not burn it');
});

test('a wizard inside: Protection raised before stops the water; Protection Maxima bursts the liquid bubble; in the ice only Fire Maxima works', () => {
    const { g, ch, zombie, V } = world();
    g.combat.fatigue = 200;
    zombie.group.position.x = 12; // (out of the way)
    // another wizard's vortex flies at me
    const launch = (id, v = 20) => V.onNet({ by: 'other', ev: 'launch', id, o: [0, 0.6, -10], d: [0, 0, 1], v, a: 0, pw: 1, tk: 'p', tid: 'me' });
    // 1) a dome raised beforehand: it breaks on it
    g.combat.shield = { type: 2, side: 'right', left: 5 };
    launch('other:1');
    run(V, 1);
    assert.ok(V.log.some((e) => e.ev === 'end' && e.why === 'block'), 'the shield stopped the water');
    assert.equal(g.combat.stunLeft || 0, 0);
    g.combat.shield = null;
    // 2) it hits: knocked down (not hurt)
    const hp = g.combat.hp;
    launch('other:2');
    run(V, 1);
    assert.ok(V.log.some((e) => e.ev === 'hit' && e.tk === 'p'));
    assert.ok(ch.knockedDown && g.combat.stunned, 'knocked down by a big vortex');
    assert.equal(g.combat.hp, hp, 'the water does not hurt');
    // the caster said «Bubble»: a bubble round me
    V.onNet({ by: 'other', ev: 'bubble', id: 'other:2', tk: 'p', tid: 'me', v: 20, p: [0, 0.6, 0] });
    assert.ok(V.myTrap(), 'I am in the bubble');
    run(V, 3.5); // (the knock-down passes)
    // Protection Maxima (T) from inside bursts it
    g.combat.stunLeft = 0;
    g.combat.castProtection(true);
    run(V, 0.1);
    assert.equal(V.myTrap(), null, 'Protection Maxima burst the liquid bubble');
    assert.ok(V.log.some((e) => e.ev === 'burst' && e.why === 'dome'));
    // 3) again — and frozen this time
    g.combat.shield = null;
    launch('other:3', 8);
    run(V, 1);
    V.onNet({ by: 'other', ev: 'bubble', id: 'other:3', tk: 'p', tid: 'me', v: 8, p: [0, 0.6, 0] });
    run(V, 0.5);
    V.onNet({ by: 'other', ev: 'freeze', id: 'other:3' });
    assert.equal(V.myTrap().phase, 'ice');
    assert.ok(g.combat.immobile, 'in the ice the body can\'t move');
    const hp1 = g.combat.hp;
    run(V, 2.05);
    assert.equal(hp1 - g.combat.hp, 4, 'cold + no air: −2 HP a second');
    // Protection Maxima can't help in the ice; other words do nothing
    assert.equal(V.voice('ProtectionMaxima', 'protection maxima', true), null);
    assert.match(g.hud.msgs.at(-1), /Fire Maxima/);
    assert.equal(V.voice('Sapira', 'сапира', true), null);
    // Fire Maxima from inside: it melts round me, I am free and unhurt by it
    const hp2 = g.combat.hp;
    assert.equal(V.voice('FireMaxima', 'fire maxima', true), 'FireMaxima');
    run(V, 1.5);
    assert.equal(V.myTrap(), null);
    assert.equal(g.combat.encased, false);
    assert.ok(!g.combat.immobile || g.combat.stunned, 'free to move again');
    assert.ok(g.combat.hp >= hp2 - 2, 'the fire itself did not hurt me');
});

test('Fire Maxima elsewhere: burns the creatures in its flower (and stops at a shield)', () => {
    const { g, ch, zombie, V } = world();
    g.combat.fatigue = 200;
    ch.dir.set(0, 0, -1);
    const hp0 = zombie.hp;
    assert.equal(V.castFire(true), 'FireMaxima');
    run(V, 0.6);
    assert.equal(hp0 - zombie.hp, FIRE_MAXIMA.CREATURE_DMG, 'the zombie burns');
    // another wizard's Fire Maxima on me: 3 HP, or blocked by a raised shield
    const hp = g.combat.hp;
    V.onNet({ by: 'other', ev: 'fire', id: 'other:f1', o: [0, 1, -10], p: [0, 0.6, 0], d: [0, 0, 1] });
    run(V, 0.6);
    assert.equal(hp - g.combat.hp, FIRE_MAXIMA.CREATURE_DMG);
    g.combat.shield = { type: 2, side: 'right', left: 5 };
    V.onNet({ by: 'other', ev: 'fire', id: 'other:f2', o: [0, 1, -10], p: [0, 0.6, 0], d: [0, 0, 1] });
    run(V, 0.6);
    assert.equal(hp - g.combat.hp, FIRE_MAXIMA.CREATURE_DMG, 'the dome stopped the second one');
});

test('the throw is a fast stream unwinding out of the rings; «Атака» throws it; «Bubble» said before still wraps the one it hits', () => {
    const { g, ch, zombie, V } = world();
    g.combat.fatigue = 500;
    ch.dir.set(0, -0.2, -1).normalize();
    assert.equal(V.cast(true), 'WaterVortex');
    let t = 0;
    run(V, 8, () => { t += 1 / 60; const a = t * Math.PI * 2 * 2; ch.hand.set(Math.cos(a) * 0.45, 0.4, Math.sin(a) * 0.45); });
    assert.ok(V.state.volume > 60, `a long fast swinging gathers a lot of water (${V.state.volume.toFixed(0)} m³)`);
    assert.ok(layersOf(V.state.volume).length >= 6, 'many rings');
    // «Bubble» while still swinging, then «Атака» with the hand at the zombie (20 m away)
    zombie.group.position.set(0, 0, -20);
    assert.equal(V.voice('AirBubble', 'bubble', true), 'VortexBubble');
    ch.dir.set(0, 0, -1);
    assert.equal(V.voice('Attack', 'атака', true), 'Attack');
    assert.equal(V.state, null);
    const f = [...V.flights.values()][0];
    const vol = f.volume;
    V.update(0.1);
    assert.ok(f.res < vol, 'the rings unwind into the stream');
    assert.ok(f.tail.distanceTo(f.pos) > 1.5, `a long stream from the rings to its head (${f.tail.toArray()} → ${f.pos.toArray()} ${f.phase})`);
    run(V, 0.5);
    assert.ok(V.log.some((e) => e.ev === 'hit' && e.tk === 'z'), 'the stream is fast: 20 m in about half a second');
    const b = [...V.bubbles.values()][0];
    assert.ok(b && b.tk === 'z', '«Bubble» said before the hit wrapped the zombie');
    const r0 = b.r;
    run(V, 3);
    assert.ok(b.r > r0 && V.flights.size === 0, 'the bubble grew as the whole vortex poured in');
});

test('«Bubble» said but the stream touched nobody: the water still gathers into a ball where it stopped; «Frozen» freezes it', () => {
    const { g, ch, zombie, V } = world();
    g.combat.fatigue = 500;
    zombie.isDead = true; // (nobody to hit)
    g.collision.pointBlocked = (x, y, z) => z < -15; // (a wall 15 m ahead)
    ch.dir.set(0, -0.2, -1).normalize();
    assert.equal(V.cast(true), 'WaterVortex');
    let t = 0;
    run(V, 2, () => { t += 1 / 60; const a = t * Math.PI * 2 * 1.5; ch.hand.set(Math.cos(a) * 0.45, 0.4, Math.sin(a) * 0.45); });
    ch.dir.set(0, 0, -1);
    assert.equal(V.voice('Attack', 'атака', true), 'Attack');
    assert.equal(V.voice('AirBubble', 'бабл', true), 'VortexBubble');
    run(V, 3);
    const b = [...V.bubbles.values()][0];
    assert.ok(b && !b.tk, 'a water ball with nobody inside');
    assert.ok(b.pos.z > -15.5 && b.pos.z < -12, `where the stream stopped (z ${b.pos.z.toFixed(1)})`);
    assert.ok(b.r > 1.3, 'all the water is in it');
    assert.equal(V.voice('Frozen', 'frozen', true), 'Frozen');
    assert.equal(b.phase, 'ice');
    run(V, 2);
    assert.ok(V.bubbles.has(b.id), 'an ice ball hanging there');
});

test('the ball forms slowly round the creature and lifts it; the caster carries it up with the hand; «Bubble» a moment after the stream ran out still works', () => {
    const { g, ch, zombie, V } = world();
    g.combat.fatigue = 500;
    g.collision.surfaceY = () => 0;
    ch.dir.set(0, -0.2, -1).normalize();
    assert.equal(V.cast(true), 'WaterVortex');
    let t = 0;
    run(V, 2, () => { t += 1 / 60; const a = t * Math.PI * 2 * 1.5; ch.hand.set(Math.cos(a) * 0.45, 0.4, Math.sin(a) * 0.45); });
    ch.dir.set(0, 0, -1);
    assert.equal(V.voice('Attack', 'атака', true), 'Attack');
    // nothing said: the stream hits, pours and runs out
    run(V, 6);
    assert.equal(V.bubbles.size, 0);
    assert.equal(V.flights.size, 0, 'the stream ran out');
    // «Bubble» a moment later (as the Russian recognizer hears it)
    assert.equal(V.voice('AirBubble', 'бабал', true), 'VortexBubble');
    const b = [...V.bubbles.values()][0];
    assert.ok(b && b.tk === 'z', 'the water rose back round the zombie');
    const y0 = zombie.group.position.y;
    V.update(1 / 60);
    assert.ok(b.grow < 0.1, 'not a ball at once');
    run(V, 1);
    assert.ok(b.grow > 0.2 && b.grow < 1, `it forms over a few seconds (${b.grow.toFixed(2)})`);
    run(V, 2);
    assert.equal(b.grow, 1);
    assert.ok(zombie.group.position.y > y0 + 0.4, `the zombie is lifted off the ground inside (${(zombie.group.position.y - y0).toFixed(2)} m)`);
    assert.ok(zombie.lev && zombie.lev.vortex === b.id, 'held up in the water');
    // held like «Левиоса» as soon as it formed: it follows the hand (taken where it is, no jump)
    V.update(1 / 60);
    assert.ok(b.held, 'the caster holds the ball');
    const yb = b.pos.y;
    run(V, 0.3);
    assert.ok(Math.abs(b.pos.y - yb) < 0.5, 'no jump to the hand\'s line');
    ch.dir.y += 0.5; ch.dir.normalize(); // (the hand goes up)
    run(V, 2.5);
    assert.ok(b.pos.y > yb + 2, `raised with the hand (${(b.pos.y - yb).toFixed(1)} m)`);
    assert.ok(zombie.group.position.y > y0 + 2, 'the zombie goes up with it');
    ch.dir.x += 0.6; ch.dir.normalize(); // (the hand turns aside: the ball goes after it)
    const x0 = b.pos.x;
    run(V, 2);
    assert.ok(b.pos.x > x0 + 2, 'it follows the hand sideways too');
    // a sharp flick throws it off: it flies on a little and hangs there
    g.duel.jerk = { right: [{ t: 0, x: 0, y: 0, z: 0 }, { t: 0.1, x: 0.8, y: 0, z: 0 }, { t: 0.2, x: 1.7, y: 0, z: 0 }] };
    ch.handVelocity = { right: new THREE.Vector3(6, 0, 0) };
    V.update(1 / 60);
    g.duel.jerk = { right: [] };
    assert.ok(!b.held && b.thrown, 'thrown off');
    run(V, 3);
    const yh = b.pos.clone();
    run(V, 1);
    assert.ok(!b.held && b.pos.distanceTo(yh) < 0.05, 'then it hangs where it stopped');
});

test('the stream flies along the very line of the hand (like a duel spell) and turns after the hand while it flies', () => {
    const { g, ch, zombie, V } = world();
    g.combat.fatigue = 500;
    zombie.isDead = true;
    ch.dir.set(0, -0.2, -1).normalize();
    assert.equal(V.cast(true), 'WaterVortex');
    let t = 0;
    run(V, 2, () => { t += 1 / 60; const a = t * Math.PI * 2 * 1.5; ch.hand.set(Math.cos(a) * 0.45, 0.4, Math.sin(a) * 0.45); });
    ch.hand.set(0.4, 1.2, -0.3);
    ch.dir.set(0.3, 0.05, -1).normalize();
    assert.equal(V.voice('Attack', 'атака', true), 'Attack');
    const f = [...V.flights.values()][0];
    run(V, 0.25);
    const o = ch.getHandWorldPosition('right');
    const along = f.pos.clone().sub(o).dot(ch.dir);
    const miss = o.clone().addScaledVector(ch.dir, along).distanceTo(f.pos);
    assert.ok(along > 3 && miss < 0.2, `on the hand's line (${miss.toFixed(2)} m off, ${along.toFixed(1)} m out)`);
    // the hand turns left: the stream turns after it
    ch.dir.set(-0.4, 0.05, -1).normalize();
    run(V, 0.4);
    assert.ok(f.dir.angleTo(ch.dir) < 0.15, 'the stream turned after the hand');
});

import { bubbleLike } from '../../src/game/WaterVortex.js';
test('«Bubble» as the Russian recognizer may write it (only while the vortex waits for it)', () => {
    for (const t of ['бабл', 'Бабал', 'бобл', 'пабл', 'баббл', 'бубл', 'пузырь', 'Пузырь!', 'bubble', 'вабл']) assert.ok(bubbleLike(t), t);
    for (const t of ['стоп', 'атака', 'фрозен', 'Инферно', 'баран', 'привет']) assert.ok(!bubbleLike(t), t);
});

test('«Bubble» is carried by the hand like «Левиоса»: empty or with a creature inside, a camera glitch does not fling it, the others see it move', () => {
    for (const tk of [null, 'z']) {
        const { g, ch, V, sent } = world();
        g.items.heldOf = () => null; // (the wand on the belt: the magic hand still carries it)
        const b = V._addBubble({ id: 'me:1', by: 'me', tk, tid: tk ? 7 : null, v: 20, p: [0, 1, -8] });
        run(V, 3);
        assert.equal(b.grow, 1);
        V.update(1 / 60);
        assert.ok(b.held, `${tk || 'empty'}: taken by the hand as soon as it formed`);
        const p0 = b.pos.clone();
        // the camera loses the hand for one frame (a jump of the ray): the ball stays where it is
        ch.dir.set(1, 0, 0);
        V.update(1 / 60);
        ch.dir.set(0, 0, -1);
        run(V, 0.3);
        assert.ok(b.pos.distanceTo(p0) < 0.3, `${tk || 'empty'}: a glitch does not fling it (${b.pos.distanceTo(p0).toFixed(2)} m)`);
        // the hand turns up and aside: the ball follows smoothly
        ch.dir.set(0.5, 0.5, -1).normalize();
        run(V, 3);
        assert.ok(b.pos.y > p0.y + 2 && b.pos.x > p0.x + 2, `${tk || 'empty'}: it follows the hand (${b.pos.toArray().map((v) => v.toFixed(1))})`);
        assert.ok(sent.some((m) => m.ev === 'bpos'), 'its place is sent to the others');
        // another computer: the ball follows those messages
        const other = world().V;
        other.game.localId = 'them';
        other.onNet?.({ ...sent.find((m) => m.ev === 'bubble') || { ev: 'bubble', id: 'me:1', tk, tid: tk ? 7 : null, v: 20, p: [0, 1, -8] }, by: 'me' });
        if (!other.bubbles.size) other._addBubble({ id: 'me:1', by: 'me', tk, tid: tk ? 7 : null, v: 20, p: [0, 1, -8] });
        other.onNet({ ev: 'bpos', id: 'me:1', p: [b.pos.x, b.pos.y, b.pos.z], by: 'me' });
        run(other, 1);
        assert.ok(other.bubbles.get('me:1').pos.distanceTo(b.pos) < 0.3, 'the others see it where the caster carries it');
    }
});
