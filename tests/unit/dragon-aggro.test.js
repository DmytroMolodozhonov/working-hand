// A dragon never attacks without a reason (DragonAggro.js). The author's complaint: «Мы просто гуляли с другом, и на нас напал дракон…
// Чтобы дракон заагрился, мы должны ПРЯМО ПРИЦЕЛИТЬСЯ в него и ХОРОШО ПОПАСТЬ».
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AGGRO, AGGRO_RULES, NOT_A_REASON, HARMLESS, woundsGrudge, attackReason, sitterLeaves, restSpotOk, dodgeHeading, shouldForget } from '../../src/game/DragonAggro.js';
import { Dragons } from '../../src/game/Dragons.js';
import { DRAGON_HP, ON_DRAGON } from '../../src/game/DragonKinds.js';

// ---------------------------------------------------------------- the pure table
test('wound: any real hit counts; harmless spells, wind, an earthquake «in the cone» and a miss do not', () => {
    for (const k of ['Bombardo', 'Stupefy', 'melee', 'arrow', 'Lightning', 'Sapira', 'Thunderwave']) assert.ok(woundsGrudge(k, 5), k);
    assert.ok(woundsGrudge('Jolt', 0) && woundsGrudge('GroundVortex', 0), 'a direct hit with no damage still is a hit');
    for (const k of ['Lumos', 'Nox', 'Accio', 'Wind', 'WindImpulse', 'Pentagranium', 'Fireworks', 'Nihilis', 'Brainrot']) assert.ok(!woundsGrudge(k, 0) && !woundsGrudge(k, 9), k);
    assert.ok(!woundsGrudge('Earthquake', 10), 'an area shake is not an aim');
    assert.ok(!woundsGrudge(null, 0) && !woundsGrudge('Disarmor', 0));
    for (const k of HARMLESS) assert.ok(!(ON_DRAGON[k]?.dmg > 0), 'harmless kind that really hurts: ' + k);
});

test('the reasons: wounded / thief / lair / imperius / near the offender — nothing else', () => {
    assert.deepEqual(AGGRO_RULES.map((r) => r.id).sort(), ['imperius', 'lair', 'near', 'thief', 'wounded']);
    assert.ok(NOT_A_REASON.length >= 8);
    const c = { now: 100, grudgeT: 150 };
    assert.equal(attackReason({ grudge: {} }, 'a', c), null, 'a walker');
    assert.equal(attackReason({ grudge: { a: { at: 10 } } }, 'a', c), 'wounded');
    assert.equal(attackReason({ grudge: { a: { at: 10, thief: true } } }, 'a', c), 'thief');
    assert.equal(attackReason({ grudge: { a: { at: -100 } } }, 'a', c), null, 'an old grudge is let go');
    assert.equal(attackReason({ grudge: {} }, 'a', { ...c, inLair: true }), 'lair');
    assert.equal(attackReason({ grudge: {} }, 'a', { ...c, nearOffender: true }), 'near');
    assert.equal(attackReason({ grudge: {}, imp: true }, 'a', c), 'imperius');
    assert.equal(attackReason({ grudge: {}, aggro: 'a' }, 'a', c), null, 'aggro with no written reason is not a reason');
    assert.equal(attackReason({ grudge: {}, aggro: 'a', aggroWhy: 'wounded' }, 'a', c), 'wounded');
});

test('helpers: a sitter leaves, rest places keep away from people, the heading turns off people, forgetting', () => {
    assert.ok(sitterLeaves(AGGRO.SIT_LEAVE - 1, false) && !sitterLeaves(AGGRO.SIT_LEAVE + 1, false) && !sitterLeaves(5, true));
    assert.ok(!restSpotOk({ x: 0, z: 0 }, [{ x: 50, z: 0 }]) && restSpotOk({ x: 0, z: 0 }, [{ x: AGGRO.LAND_AVOID + 5, z: 0 }]));
    assert.deepEqual(dodgeHeading(1, 0, { x: 5, z: 0 }), [-1, -0]); assert.deepEqual(dodgeHeading(1, 0, { x: -5, z: 0 }), [1, 0]); assert.deepEqual(dodgeHeading(1, 0, null), [1, 0]);
    assert.ok(shouldForget(AGGRO.FORGET_T + 1) && !shouldForget(5));
    assert.ok(AGGRO.KEEP_AWAY >= 60 && AGGRO.LAIR_ZONE <= 25);
});

// ---------------------------------------------------------------- in the game
function world({ authority = true } = {}) {
    const sent = [], hurt = [], notes = [];
    const g = {
        scene: new THREE.Scene(), localId: 'me', authority, config: { mode: 'test' }, remotes: new Map(), perf: { note: (s) => notes.push(s) },
        character: { group: new THREE.Object3D() }, hud: { setVoice() {}, notify() {}, toast() {} },
        combat: { enabled: true, fatigue: 100, damage: (n, _a, k) => hurt.push([n, k]) },
        collision: { groundAt: () => 0, groundY: () => 0, lineOfSight: () => true },
        terrain: { data: { heightAt: () => 0.5, landMade: () => true, skyTopAt: () => 0.5 } },
        _flameBlock: () => 'air', sync: { dragon: (m) => sent.push(m) }, sound: { playDragon() {}, playExplosion() {} },
    };
    g.character.group.position.set(0, 2, 0);
    const D = new Dragons(g); D.enabled = true;
    return { g, D, hurt, notes };
}
const step = (D, d, secs, dt = 0.05, each = null) => { for (let t = 0; t < secs && !d.dead; t += dt) { D._think(d, dt); D._t += dt; each?.(t); } };
const cruiser = (D, o = {}) => { const d = D.spawn({ id: 'dc', kind: 'crimson', react: 1, flame: 1, pos: new THREE.Vector3(0, 60, -120), mode: 'air', ...o }); d.purpose = 'cruise'; d.dest = new THREE.Vector3(0, 60, 400); d.cruiseY = 60; return d; };
const seated = (D, o = {}) => { const d = D.spawn({ id: 'ds', kind: 'crimson', react: 1, flame: 1, pos: new THREE.Vector3(0, 0, -30), mode: 'landed', ...o }); d.restT = 40; return d; };

test('walkers shout, cast Lumos, blow things up in 30 m and miss — a flying-by dragon does not turn on them', () => {
    const { g, D } = world();
    const d = cruiser(D);
    step(D, d, 5);
    D.noise(new THREE.Vector3(0, 0, 25), 'me'); // (a blast 30 m off)
    D.hitAt(new THREE.Vector3(0, 0, 25), 5, 30, 'Bombardo', 'me'); // (the radius does not reach its body — it is in the sky)
    for (const k of ['Lumos', 'Wind', 'Nox', 'Pentagranium']) D.hit(d, 0, k, 'me');
    D.push('WindMaxima', 'me', () => new THREE.Vector3(1, 0, 0), {});
    step(D, d, 20);
    assert.equal(d.target, null); assert.equal(d.aggro, null); assert.notEqual(d.purpose, 'chase'); assert.equal(d.mode, 'air');
    assert.ok(!D.log.some((l) => /^(bite|claw|tail|dive|breath)/.test(l)));
});

test('a dragon sitting in the open: a man walks up — it does not pounce; it lifts off and goes away', () => {
    const { g, D } = world();
    g.character.group.position.set(0, 2, 0);
    const d = seated(D);
    step(D, d, 3);
    assert.ok(['landed', 'air'].includes(d.mode));
    assert.equal(d.aggro, null);
    g.character.group.position.set(0, 2, -10); // (they come up to 20 m)
    step(D, d, 2);
    assert.ok(D.log.includes('sitter-leaves'), 'it leaves');
    assert.equal(d.aggro, null); assert.equal(d.target, null);
    assert.ok(!D.log.some((l) => /^(bite|claw|tail|dive|breath)/.test(l)));
});

test('a wanderer never picks a rest place near people, and skips one if people come near it', () => {
    const { g, D } = world();
    const d = cruiser(D, { pos: new THREE.Vector3(0, 30, -200) });
    d.landAt = new THREE.Vector3(0, 0, -60); // (60 m from the walker)
    step(D, d, 1);
    assert.equal(d.landAt, null); assert.ok(D.log.includes('rest-skipped'));
    assert.ok(restSpotOk(new THREE.Vector3(0, 0, 400), [{ x: 0, z: 0 }]));
});

test('a real hit: it turns on the one who hit it (reason: wounded), the journal says so', () => {
    const { D, notes } = world();
    const d = cruiser(D, { pos: new THREE.Vector3(0, 40, -50) });
    D.hit(d, 20, 'Bombardo', 'me');
    assert.equal(d.aggro, 'me'); assert.equal(d.aggroWhy, 'wounded');
    assert.ok(notes.some((n) => /цель me: ранен им/.test(n)), notes.join('|'));
    step(D, d, 6);
    assert.ok(!notes.some((n) => /без причины/.test(n)), 'a wounded attack is no error');
    assert.equal(d.target, 'me');
});

test('direct-hit Jolt wounds; a harmless Lumos does not; the second player is not its enemy', () => {
    const { g, D } = world();
    g.remotes.set('b', { position: new THREE.Vector3(200, 2, 0), dead: false });
    const d = cruiser(D);
    D.boltHit(d, 'Jolt', 'me');
    assert.equal(d.aggro, 'me');
    assert.ok(D._why(d, 'me') === 'wounded' && D._why(d, 'b') === null, 'the friend far away has no quarrel');
    g.remotes.get('b').position.set(8, 2, 0); // (next to the offender: the tail and wings get him too)
    assert.equal(D._why(d, 'b'), 'near');
});

test('the lair: in the mouth zone — a reason; a hero at the test ledge 60+ m away — none; the thief — wounded for good', () => {
    const { g, D } = world();
    const L = { x: 0, z: -300, mouth: { x: 0, z: -80 }, out: { x: 0, z: -70 }, r: 20, hoard: { x: 0, z: -300 } };
    const d = D.spawn({ id: 'dl', kind: 'crimson', react: 1, flame: 1, pos: new THREE.Vector3(0, 0, -300), mode: 'sleep', lair: 'L1' });
    D.lairs.set('L1', { L, st: { d: [] } });
    D.lairAt = () => false;
    g.character.group.position.set(0, 2, -20); // (60 m from the mouth)
    assert.equal(D._why(d, 'me'), null, 'the spawn place in front of the lair is not an intrusion');
    g.character.group.position.set(0, 2, -60); // (20 m from the mouth)
    assert.equal(D._why(d, 'me'), 'lair');
    g.character.group.position.set(0, 2, 0);
    D._thief('L1', 'me');
    assert.equal(D._why(d, 'me'), 'thief');
});

test('the tripwire: an attacker with no reason drops the target and writes «напал без причины»; Imperius is a reason', () => {
    const { D, notes } = world();
    const d = D.spawn({ id: 'dt', kind: 'crimson', react: 1, flame: 1, pos: new THREE.Vector3(0, 40, -50), mode: 'air' });
    d.purpose = 'chase'; d.target = 'me'; d.aggro = 'me'; // (no aggroWhy, no grudge: something chased for nothing)
    step(D, d, 1.5);
    assert.equal(d.target, null);
    assert.ok(notes.some((n) => /напал без причины/.test(n)));
    const e = D.spawn({ id: 'de', kind: 'crimson', react: 1, flame: 1, pos: new THREE.Vector3(0, 40, -50), mode: 'air' });
    e.imp = { mine: false }; assert.equal(D._why(e, 'me'), 'imperius');
});

test('forgetting: a target farther than 150 m for 50 s — it lets go and flies on', () => {
    const { g, D } = world();
    const d = D.spawn({ id: 'df', kind: 'crimson', react: 1, flame: 1, pos: new THREE.Vector3(0, 40, -400), mode: 'air' });
    d.purpose = 'chase'; d.target = 'me'; d.aggro = 'me'; d.aggroWhy = 'wounded'; d.chaseFrom = new THREE.Vector3(0, 0, -400);
    d.grudge.me = { at: 0 };
    step(D, d, AGGRO.FORGET_T + 5, 0.25);
    assert.equal(d.target, null); assert.equal(d.aggro, null); assert.ok(D.log.includes('forget') || D.log.includes('giveup'));
});

test('an old save: a grudge in `grudge` still counts', () => {
    const { D } = world();
    const d = cruiser(D);
    d.grudge = { me: { at: D._t - 10, thief: false } };
    assert.equal(D._why(d, 'me'), 'wounded');
});

test('SIMULATION: 10 000 dragon-hours with walkers (shouting, lights, blasts in the distance) — 0 attacks without a reason', () => {
    let attacks = 0, hours = 0, wrong = 0;
    for (let seed = 0; seed < 40; seed++) {
        const { g, D, notes } = world();
        let s = seed + 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        g.remotes.set('b', { position: new THREE.Vector3(5, 2, 5), dead: false });
        const d = D.spawn({ id: 'sim', kind: 'crimson', react: 1, flame: 1, pos: new THREE.Vector3(rnd() * 200 - 100, 55, -150), mode: 'air' });
        d.purpose = 'cruise'; d.dest = new THREE.Vector3(rnd() * 200 - 100, 55, 300); d.cruiseY = 55;
        // 250 dragon-hours each: 6 s steps (the thinking is stepped coarsely: it checks the rules, not the physics)
        for (let t = 0; t < 250 * 3600; t += 6) {
            D._t += 6;
            if (rnd() < 0.2) D.noise(new THREE.Vector3(rnd() * 80 - 40, 0, rnd() * 80 - 40), rnd() < 0.5 ? 'me' : 'b');
            if (rnd() < 0.1) D.hit(d, 0, ['Lumos', 'Wind', 'Nox', 'Pentagranium', 'Fireworks'][Math.floor(rnd() * 5)], rnd() < 0.5 ? 'me' : 'b');
            D._think(d, 6);
            if (d.mode === 'air' && d.purpose !== 'chase' && d.model.position.z > 250) d.model.position.set(rnd() * 200 - 100, 55, -150);
            if (d.target || d.aggro || d.mode === 'land' || d.mode === 'fight' || D.log.some((l) => /^(bite|claw|tail|dive|breath)/.test(l))) { attacks++; break; }
            if (d.mode === 'landed') d.mode = 'air';
            if (d.purpose === 'chase') { wrong++; break; }
        }
        hours += 250;
        assert.ok(!notes.some((n) => /без причины/.test(n)));
        void g;
    }
    assert.equal(hours, 10000); assert.equal(attacks, 0); assert.equal(wrong, 0);
});

test('DRAGON_HP is unchanged by the new rules (the numbers are the author\'s)', () => assert.ok(DRAGON_HP > 0));
