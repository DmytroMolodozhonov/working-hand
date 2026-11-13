// «Отход назад от нападающих» (the author 05.11): stepping with a foe coming at me in front — back, facing it; turned away — forward.
import test from 'node:test';
import assert from 'node:assert/strict';
import { threatStep, THREAT_BACK } from '../../src/game/ThreatBack.js';
import { Game } from '../../src/game/Game.js';

/** Run `secs` at 30 a second: the foe moves by fn(t) → {x, z}; me at the origin looking along −z (yaw 0) or as given. */
function run(st, secs, foe, yaw = 0, t0 = 0) {
    let r = null;
    for (let i = 1; i <= secs * 30; i++) { const t = t0 + i / 30, p = foe(t); r = threatStep(st, { x: 0, z: 0, yaw }, p ? [{ id: 'v1', hostile: true, ...p }] : [], 1 / 30, t); }
    return r;
}

test('only a sword or axe in the primary hand disables retreat (right- and left-handed, including the divine sword)', () => {
    for (const leftHanded of [false, true]) {
        const g = Object.create(Game.prototype);
        Object.assign(g, {
            settings: { leftHanded },
            character: { group: { position: { x: 0, y: 1.95, z: 0 }, rotation: { y: 0 } } },
            weapons: { hands: { left: { held: null }, right: { held: null } } },
            items: { held: { left: null, right: null } },
            crowd: { update() {}, near: () => [{ id: 'attacker', kind: 'zombie', x: 0, z: -3, ref: { isAttacking: true, yaw: Math.PI } }] },
        });
        assert.equal(g._threatBack(1 / 30), true, 'an attacker in front normally triggers retreat');
        for (const type of ['sword', 'axe', 'divine']) {
            g.weapons.hands[g.dom].held = { type };
            assert.equal(g._threatBack(1 / 30), false, type + ' in the primary hand');
            g.weapons.hands[g.dom].held = null;
            assert.equal(g._threatBack(1 / 30), true, 'releasing the blade restores normal behaviour');
            g.weapons.hands[g.off].held = { type };
            assert.equal(g._threatBack(1 / 30), true, type + ' in the secondary hand does not disable retreat');
            g.weapons.hands[g.off].held = null;
        }
        for (const kind of ['wand', 'hammer', 'bow']) {
            g.items.held[g.dom] = { item: { kind } };
            assert.equal(g._threatBack(1 / 30), true, kind + ' is not a melee blade');
        }
    }
});

test('a villager running at me from the front: back; turned away from him: forward (running away)', () => {
    const st = {};
    const r = run(st, 2, (t) => ({ x: 0, z: -14 + t * 4 }));
    assert.equal(r.back, true);
    assert.ok(r.foe.ang < 10);
    const away = run(st, 0.5, (t) => ({ x: 0, z: -6 }), Math.PI, 2); // (I turned round: he is behind me)
    assert.equal(away.back, false, 'turned away: the steps go forward');
});

test('not a foe: one not after me (even running at me), a hostile one standing far, passing by far, nobody', () => {
    let r = null; const st = {};
    for (let i = 1; i <= 60; i++) r = threatStep(st, { x: 0, z: 0, yaw: 0 }, [{ id: 'calm', x: 0, z: -14 + i * 0.15 }], 1 / 30, i / 30);
    assert.equal(r.back, false, 'a calm villager running up to talk');
    assert.equal(run({}, 3, () => ({ x: 0, z: -8 })).back, false, 'angry but standing far');
    assert.equal(run({}, 3, (t) => ({ x: -30 + t * 6, z: -20 })).back, false, 'far away running past');
    assert.equal(run({}, 1, () => null).back, false);
});

test('a foe that came stays one while it stands at me and strikes (HOLD), then not', () => {
    const st = {};
    run(st, 2, (t) => ({ x: 0, z: Math.min(-2, -12 + t * 5) }));
    assert.equal(run(st, 1, () => ({ x: 0, z: -2, attacking: true }), 0, 2).back, true, 'striking at me');
    assert.equal(run(st, THREAT_BACK.HOLD + 2, () => ({ x: 0, z: -12 }), 0, 3).back, false, 'went off and stands far: no more');
});

test('to the side: within FACE° — back; past it — forward', () => {
    const a = 60 * Math.PI / 180, b = 85 * Math.PI / 180;
    assert.equal(run({}, 2, (t) => { const d = 14 - t * 4; return { x: -Math.sin(a) * d, z: -Math.cos(a) * d }; }).back, true);
    assert.equal(run({}, 2, (t) => { const d = 14 - t * 4; return { x: -Math.sin(b) * d, z: -Math.cos(b) * d }; }).back, false);
});

test('the author 05.11: walking up to somebody who stands — no attack (only HIS movement counts); one angry at me — a foe at once', () => {
    const st = {};
    let r = null;
    for (let i = 1; i <= 60; i++) r = threatStep(st, { x: 0, z: -i * 0.15, yaw: 0 }, [{ id: 'v', x: 0, z: -12 }], 1 / 30, i / 30); // (I walk at 4.5 m/s towards him)
    assert.equal(r.back, false);
    const st2 = {};
    for (let i = 1; i <= 30; i++) r = threatStep(st2, { x: 0, z: 0, yaw: 0 }, [{ id: 'v', x: 0, z: -10 + i * 0.1, hostile: true }], 1 / 30, i / 30);
    assert.equal(r.back, true, 'he is after me and coming');
});

test('a foe lying knocked down is no threat: one walks up to it forward (the author 05.11: «если он загрен, но лежит… можно подойти»)', () => {
    const st = {};
    const me = { x: 0, z: 0, yaw: 0 }; // (looks along −z)
    let r;
    for (let i = 0; i < 30; i++) r = threatStep(st, me, [{ id: 'v1', x: 0, z: -3, hostile: false, down: true }], 1 / 30, i / 30);
    assert.equal(r.back, false);
    // angry at me, but lying: still no threat
    for (let i = 30; i < 60; i++) r = threatStep(st, me, [{ id: 'v1', x: 0, z: -3, hostile: true, down: true }], 1 / 30, i / 30);
    assert.equal(r.back, false);
    // gets up, angry and right there: a threat again
    for (let i = 60; i < 70; i++) r = threatStep(st, me, [{ id: 'v1', x: 0, z: -3, hostile: true, down: false, attacking: true }], 1 / 30, i / 30);
    assert.equal(r.back, true);
});


test('a trapped or distracted hostile creature does not force retreat', () => {
    for (const extra of [{ reachable: false }, { yaw: 0 }]) {
        assert.equal(run({}, 2, t => ({ x: 0, z: -10 + t * 3, ...extra })).back, false);
    }
    assert.equal(run({}, 2, t => ({ x: 0, z: -10 + t * 3, yaw: Math.PI, reachable: true })).back, true);
    const st = {};
    run(st, 1, t => ({ x: 0, z: -8 + t * 3 }));
    assert.equal(run(st, 2, () => ({ x: 0, z: -5 }), 0, 1).back, false, 'stuck without attacking');
});
