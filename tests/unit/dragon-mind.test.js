// The fighting mind of a dragon: flies, dives, comes down and fights ON ITS FEET (DragonMind.js, Dragons.js).
// The author: «Драконы не обязательно должны постоянно летать… если они сражаются, особенно с НАЗЕМНОЙ целью, они должны как-то и СИДЯ атаковать, кусать».
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MIND, MOVES, MOVE_IDS, MOVES_VS, decide, pickMove, aimedAt, moveAnim, strikesDue, spotOk, landCandidates, liftPhase, targetClass, staminaStep, tiredK, waveAt, LANDING } from '../../src/game/DragonMind.js';
import { Dragons } from '../../src/game/Dragons.js';
import { DRAGON_HP, DRAGON } from '../../src/game/DragonKinds.js';

const base = { posture: 'air', stay: 20, dist: 20, cls: 'ground', hp: 1, stam: 1, crowd: 1, canLand: true, failT: 0, cornered: false };
const D_ = (o) => decide({ ...base, ...o });

test('in the air: a target on the ground and near — it lands; far / high / many — it stays up; no hurry (hysteresis)', () => {
    assert.equal(D_({}).act, 'land', 'near and on the ground');
    assert.equal(D_({ dist: MIND.LAND_NEAR + 5 }).act, 'stay', 'far: it circles');
    assert.equal(D_({ cls: 'high' }).act, 'stay', 'a flyer / a tower / a deck: fire and dives from above');
    assert.equal(D_({ crowd: MIND.CROWD }).act, 'stay', 'many of them: it is safer above');
    assert.equal(D_({ canLand: false }).act, 'stay', 'nowhere to sit (water, a roof, a slope)');
    assert.equal(D_({ failT: 4 }).act, 'stay', 'a failed landing: it waits before trying again');
    assert.equal(D_({ stay: MIND.MIN_AIR - 1 }).act, 'stay', 'it has only just taken off');
    assert.equal(D_({ dist: null }).act, 'stay', 'nobody to fight');
});

test('on its feet: it fights while they are near on the ground; takes off after a flyer / a runner / a crowd — but not before MIN_GROUND', () => {
    const G = (o) => decide({ ...base, posture: 'ground', stay: 20, dist: 8, ...o });
    assert.equal(G({}).act, 'stay', 'bites');
    assert.equal(G({ cls: 'high' }).act, 'takeoff');
    assert.equal(G({ dist: MIND.LEAVE_FAR + 3 }).act, 'takeoff', 'they ran far');
    assert.equal(G({ crowd: MIND.CROWD_LEAVE }).act, 'takeoff');
    assert.equal(G({ dist: null }).act, 'takeoff', 'nobody left');
    for (const o of [{ cls: 'high' }, { dist: 99 }, { crowd: 6 }]) assert.equal(G({ ...o, stay: MIND.MIN_GROUND - 2 }).act, 'stay', 'no take-off — landing — take-off flicker');
    assert.ok(MIND.LEAVE_FAR > MIND.LAND_NEAR + 10, 'a gap between «lands within» and «takes off beyond»');
});

test('hurt (≤ 30 %): it flies away — once; tired: it lands to rest; a retreat breaks any hysteresis', () => {
    assert.equal(D_({ hp: 0.25 }).act, 'retreat');
    assert.equal(D_({ hp: 0.25, stay: 0 }).act, 'retreat');
    assert.equal(decide({ ...base, posture: 'ground', stay: 1, dist: 5, hp: 0.2 }).act, 'retreat');
    assert.notEqual(D_({ hp: 0.25, cornered: true }).act, 'retreat', 'it fled once: now it fights to the end');
    assert.equal(D_({ stam: 0.1 }).act, 'land', 'tired: sits down and fights on its feet');
    assert.equal(D_({ stam: 0.1, cls: 'high' }).act, 'stay', 'a target out of reach — nothing to land by');
});

test('stamina: flight tires, the ground rests, sleep rests faster; tired and nowhere to sit: slower', () => {
    let s = 1;
    for (let t = 0; t < MIND.AIR_SECS * 0.9; t++) s = staminaStep(s, true, false, 1);
    assert.ok(s < MIND.REST_AT + 0.15, 'almost empty after ~55 s of flight');
    const a = staminaStep(0.2, false, false, 5), b = staminaStep(0.2, false, true, 5);
    assert.ok(a > 0.2 && b > a);
    assert.equal(tiredK(0.1, true), 1);
    assert.ok(tiredK(0.1, false) < 1);
    assert.equal(staminaStep(1, false, false, 99), 1); assert.equal(staminaStep(0, true, false, 99), 0);
});

test('target class: high above the ground, or on the sea — high', () => {
    assert.equal(targetClass(0), 'ground'); assert.equal(targetClass(MIND.HIGH - 1), 'ground'); assert.equal(targetClass(MIND.HIGH + 1), 'high'); assert.equal(targetClass(2, true), 'high');
});

test('the moves on its feet: by distance and angle — bite / claws in front, the tail behind, the wings at a middle range, nothing out of reach', () => {
    const P = (o) => pickMove({ dist: 6, ang: 0, size: 1.25, blowCd: 0, gustCd: 5, crowd: 1, last: null, rnd: 0.9, breathReady: true, ...o });
    assert.equal(P({}), 'bite');
    assert.equal(P({ dist: 4, rnd: 0.1 }), 'claw', 'very close: the claws too');
    assert.equal(P({ dist: 4, rnd: 0.1, last: 'claw' }), 'bite', 'not the same twice in a row');
    assert.equal(P({ ang: 2.6 }), 'tail', 'behind it: the tail');
    assert.equal(P({ ang: -2.1, dist: 11 }), 'tail');
    assert.equal(P({ ang: 0.45, dist: 6 }), 'claw', 'a bit off the jaws’ line: the claws, not the bite («лицом к цели»)');
    assert.equal(P({ ang: 1.2, dist: 6 }), null, 'beside it: it first turns');
    assert.equal(P({ dist: 25 }), null, 'far: no move (it walks, it breathes)');
    assert.equal(P({ dist: 15, gustCd: 0, rnd: 0.1 }), 'gust', 'a middle range: the wing gust');
    assert.equal(P({ dist: 15, gustCd: 0, rnd: 0.9, breathReady: true }), null, 'its fire is ready: the fire first');
    assert.equal(P({ dist: 15, gustCd: 0, rnd: 0.9, breathReady: false }), 'gust');
    assert.equal(P({ dist: 15, gustCd: 0, rnd: 0.9, crowd: 3 }), 'gust', 'many round it: the gust');
    assert.equal(P({ blowCd: 1, dist: 15, gustCd: 5 }), null, 'a blow was just struck');
    assert.equal(P({ blowCd: 1, dist: 6 }), null);
});

test('a blow lands at its moment, once; a target that stepped aside by then is missed', () => {
    for (const k of MOVE_IDS) { const M = MOVES[k]; assert.ok(M.end > M.wind && M.snd >= 0 && M.ru, k); }
    assert.equal(strikesDue('bite', 0, 0.2), 0); assert.equal(strikesDue('bite', 0.3, 0.4), 1); assert.equal(strikesDue('bite', 0.4, 0.5), 0);
    assert.equal(strikesDue('gust', 0.7, 0.9), 1); assert.equal(strikesDue('gust', 0.7, 1.3), 2, 'two beats of the wings'); assert.equal(strikesDue('roar', 0, 2), 0, 'a roar hurts nobody');
    assert.ok(aimedAt('bite', 0.05, 8, 1.25) && !aimedAt('bite', 0.05, 14, 1.25) && !aimedAt('bite', 1.2, 6, 1.25));
    assert.ok(aimedAt('tail', 2.8, 9, 1.25) && !aimedAt('tail', 0.1, 9, 1.25));
    assert.ok(aimedAt('gust', 0.3, 10, 1.25) && !aimedAt('gust', 2.5, 10, 1.25));
});

test('the animation of each move: the head draws back and lunges, the leg is raised and swept, the tail cocked and swung, the wings up and down, the head up for a roar', () => {
    assert.ok(moveAnim('bite', 0.2).lunge < 0 && moveAnim('bite', 0.5).lunge > 0.5, 'drawn back, then thrust');
    assert.ok(moveAnim('claw', 0.25).claw > 0.6 && moveAnim('claw', 0.55).claw < moveAnim('claw', 0.25).claw);
    assert.ok(moveAnim('tail', 0.4, 1).sweep < 0 && moveAnim('tail', 1.0, 1).sweep > 0.4, 'cocked the other way, then swung round');
    assert.ok(moveAnim('tail', 0.4, -1).sweep > 0, 'the other side');
    const g1 = moveAnim('gust', 0.5), g2 = moveAnim('gust', 1.0);
    assert.ok(g1.rise > 0.5 && g1.wingFlare > 0.8 && g1.beat > 0 && g2.beat < g1.beat, 'rears up, the wings go up then down');
    assert.ok(moveAnim('roar', 0.8).rise > 0.5 && moveAnim('roar', 0.8).mouth > 0.9);
    for (const k of MOVE_IDS) for (let t = 0; t <= MOVES[k].end + 0.1; t += 0.05) for (const v of Object.values(moveAnim(k, t))) assert.ok(Number.isFinite(v), k + t);
    const L = liftPhase(0.2), L2 = liftPhase(0.9);
    assert.ok(L.crouch > 0.4 && L.climb === 0 && L2.crouch === 0 && L2.climb > 0.3, 'a crouch, then the climb');
    assert.ok(liftPhase(MIND.LIFT_T).climb === 1);
});

test('landing places: flat, dry, open above, not on the target — else not; the choices go round the target', () => {
    const ok = { made: true, water: false, terrain: 10, surface: 10, slope: 1, open: true, toTarget: 11 };
    assert.ok(spotOk(ok));
    for (const bad of [{ made: false }, { water: true }, { surface: 16 }, { slope: 5 }, { open: false }, { toTarget: 2 }]) assert.ok(!spotOk({ ...ok, ...bad }), JSON.stringify(bad));
    const c = landCandidates(0, 1.25);
    assert.ok(c.length >= 20 && c[0].a === 0 && c.every((q) => q.r > 8 && q.r < 25));
    assert.ok(waveAt(0, 1.25) > waveAt(10, 1.25) && waveAt(LANDING.R * 1.25 + 1, 1.25) === 0, 'the wave dies out with distance');
});

test('«на кого и на что»: every row says what it does and why; dragons do not hit dragons, gifts of the gods hold', () => {
    for (const [k, r] of Object.entries(MOVES_VS)) assert.ok(['hurt', 'push', 'break', 'none'].includes(r.does) && r.why.length > 20, k);
    assert.equal(MOVES_VS.dragons.does, 'none'); assert.equal(MOVES_VS.godGifts.does, 'none'); assert.equal(MOVES_VS.wards.does, 'none');
    assert.equal(MOVES_VS.players.does, 'hurt'); assert.equal(MOVES_VS.villagers.does, 'push');
    for (const k of ['bite', 'claw', 'tail', 'dive']) assert.ok(MOVES[k].dmg > 0 && MOVES[k].dmg <= 20, 'a boss, but a fair one: ' + k);
    assert.equal(MOVES.bite.dmg, DRAGON.BITE); assert.equal(MOVES.tail.dmg, DRAGON.TAIL);
});

// ---------------------------------------------------------------- in the game (a bare world: flat ground, one dragon, one player)
function world({ authority = true, flat = 0 } = {}) {
    const sent = [], hurt = [], log = [];
    const g = {
        scene: new THREE.Scene(), localId: 'me', authority, config: { mode: 'test' }, remotes: new Map(),
        character: { group: new THREE.Object3D() }, hud: { setVoice() {}, notify() {}, toast() {} },
        combat: { enabled: true, fatigue: 100, damage: (n, _a, k) => hurt.push([n, k]) },
        collision: { groundAt: () => flat, groundY: () => flat, lineOfSight: () => true },
        terrain: { data: { heightAt: () => flat + 0.5, landMade: () => true, skyTopAt: () => flat + 0.5 } },
        _flameBlock: () => 'air', sync: { dragon: (m) => sent.push(m) }, sound: { playDragon: (p, k) => log.push(k), playExplosion() {} },
    };
    g.character.group.position.set(0, flat + 2, 0); // (the player's origin is 2 m above his feet)
    const D = new Dragons(g);
    D.enabled = true;
    return { g, D, sent, hurt, log };
}
const wildDragon = (D, o = {}) => {
    const d = D.spawn({ id: 'dx', kind: 'crimson', react: 1, flame: 1, pos: new THREE.Vector3(0, 40, -70), mode: 'air', ...o });
    d.purpose = 'chase'; d.target = 'me'; d.aggro = 'me'; d.aggroWhy = 'wounded'; d.grudge.me = { at: 0 }; d.chaseFrom = new THREE.Vector3(0, 0, -70);
    return d;
};
const run = (D, d, secs, dt = 0.05, each = null) => { const modes = []; for (let t = 0; t < secs && !d.dead; t += dt) { D._think(d, dt); each?.(t); if (!modes.length || modes[modes.length - 1][0] !== d.mode) modes.push([d.mode, t]); } return modes; };

test('IN THE GAME: a dragon after a man on the ground comes down by him and fights on its feet — bites, claws, the tail; he is hurt by it', () => {
    const { D, hurt, g } = world();
    const d = wildDragon(D);
    d.breathCd = 999; // (no fire: the jaws)
    const modes = run(D, d, 90, 0.05, () => { const p = d.model.position; if (d.mode === 'fight') g.character.group.position.x = 1; });
    const names = modes.map((m) => m[0]);
    assert.ok(names.includes('land') && names.includes('fight'), 'it came down: ' + names.join('>'));
    assert.ok(D.log.some((l) => /^(bite|claw|tail|gust)$/.test(l)), 'it fought on its feet: ' + JSON.stringify([...D.log]).slice(0, 300));
    assert.ok(hurt.length > 0, 'and hurt the man');
    assert.equal(d.fly, 0, 'on the ground');
    assert.ok(Math.abs(d.model.position.y - 0) < 1.5, 'standing on the ground, not hovering');
});

test('IN THE GAME: a target in the air (flying, high on a tower) — it never lands: it circles, dives, breathes', () => {
    const { D, g } = world();
    g.character.group.position.set(0, 60, 0); // (a flyer: feet 58 m up)
    const d = wildDragon(D);
    const modes = run(D, d, 60);
    assert.ok(!modes.some((m) => m[0] === 'land' || m[0] === 'fight'), modes.map((m) => m[0]).join('>'));
    assert.ok(D.log.some((l) => l === 'move:dive' || l === 'breath'), 'it attacks from the air');
});

test('IN THE GAME: a grounded dragon takes off when the man rises into the air (after MIN_GROUND), and does not flicker', () => {
    const { D, g } = world();
    const d = wildDragon(D);
    d.breathCd = 999;
    let upAt = null;
    const modes = run(D, d, 120, 0.05, (t) => { if (d.mode === 'fight' && upAt == null && d.stay > 3) { upAt = t; g.character.group.position.set(2, 60, 2); } });
    assert.ok(upAt != null, 'it landed first');
    const names = modes.map((m) => m[0]);
    const iFight = names.indexOf('fight');
    assert.equal(names[iFight + 1], 'air', 'then it took off: ' + names.join('>'));
    const t0 = modes[iFight][1], t1 = modes[iFight + 1][1];
    assert.ok(t1 - t0 >= MIND.MIN_GROUND - 0.2, `no flicker: it sat ${(t1 - t0).toFixed(1)} s`);
    // (the way between: a take-off has its run-up — crouch, beats, climb — and the take-off ends in the air)
    assert.ok(names.filter((n) => n === 'fight').length === 1, 'and it does not land again at once on a flyer: ' + names.join('>'));
});

test('IN THE GAME: hurt to ≤ 30 %, it flies away and does not turn back at once; it fled once only', () => {
    const { D } = world();
    const d = wildDragon(D, { pos: new THREE.Vector3(0, 30, -30) });
    d.hp = DRAGON_HP * 0.25; d.stay = 30;
    run(D, d, 1);
    assert.equal(d.cornered, true); assert.ok(d.retreatT > 5, 'keeps away'); assert.equal(d.target, null);
    assert.equal(d.mode, 'air'); assert.notEqual(d.purpose, 'chase');
    D._anger(d, 'me', true); // (hit again as it flies off)
    assert.equal(d.target, null, 'it does not turn back until it has got away');
    const z0 = d.model.position.z;
    run(D, d, 6);
    assert.ok(Math.hypot(d.model.position.x, d.model.position.z - z0) > 20, 'it is going away');
    // (later it fights on: cornered)
    d.retreatT = 0; d.mode = 'air'; d.purpose = 'chase'; d.target = 'me'; d.aggro = 'me'; d.aggroWhy = 'wounded'; d.stay = 30; d.hp = DRAGON_HP * 0.2; d.dec = null;
    D._think(d, 0.05);
    assert.equal(d.purpose, 'chase', 'the second time it fights to the end');
});

test('IN THE GAME: after the fight it goes home — far from its hall on its feet, it FLIES (never walks through the mountain)', () => {
    const { D } = world();
    const d = D.spawn({ id: 'dh', kind: 'emerald', react: 1, flame: 1, pos: new THREE.Vector3(0, 0, -200), mode: 'fight', lair: 'L1' });
    D.lairAt = () => false; // (outside the hall)
    const L = { x: 300, z: 0, mouth: { x: 280, z: 0 }, out: { x: 270, z: 0 }, r: 20, hoard: { x: 300, z: 0 } };
    D._goHome(d, L);
    assert.equal(d.mode, 'air'); assert.equal(d.purpose, 'home'); assert.ok(d.liftT > 0, 'with a take-off run-up');
    const w = D.spawn({ id: 'dw', kind: 'emerald', react: 1, flame: 1, pos: new THREE.Vector3(0, 0, 0), mode: 'fight' });
    D._goHome(w, null);
    assert.equal(w.mode, 'air'); assert.equal(w.purpose, 'cruise', 'a wanderer flies off');
});

test('IN THE GAME: stuck on foot (a rock, a cliff) it takes off over it; the take-off has its phases and ends in the air', () => {
    const { D } = world();
    const d = wildDragon(D, { pos: new THREE.Vector3(0, 0, -40), mode: 'fight' });
    d.fly = 0; d.stay = 20; d.breathCd = 999;
    D._walkTo = () => 30; // (blocked: it never gets nearer)
    const ys0 = [];
    const modes = run(D, d, 8, 0.05, () => ys0.push(d.model.position.y));
    assert.ok(D.log.some((l) => l === 'stuck'), 'it noticed: ' + modes.map((m) => m[0]).join('>'));
    assert.equal(d.mode, 'air');
    assert.ok(Math.max(...ys0) > 8, 'it climbed over it');
    const ys = [];
    run(D, d, 4, 0.05, () => ys.push(d.model.position.y));
    assert.ok(Math.max(...ys) > 10, 'it climbed');
    assert.equal(d.liftT, 0, 'the run-up is over'); assert.ok(d.fly > 0.9);
});

test('IN THE GAME: a sitting (resting) wanderer that is struck fights from where it sits; a flyer-target makes it take off', () => {
    const { D, g } = world();
    const d = D.spawn({ id: 'dl', kind: 'emerald', react: 1, flame: 1, pos: new THREE.Vector3(0, 0, -15), mode: 'landed' });
    D._anger(d, 'me', true);
    assert.equal(d.mode, 'fight', 'no need to fly up');
    const e = D.spawn({ id: 'dl2', kind: 'emerald', react: 1, flame: 1, pos: new THREE.Vector3(0, 0, -15), mode: 'landed' });
    g.character.group.position.set(0, 60, 0);
    D._anger(e, 'me', true);
    assert.equal(e.mode, 'air');
});

test('the net: the move and the take-off cross to the guests in the state row, the sounds are theirs too', () => {
    const { D, sent } = world();
    const d = wildDragon(D);
    d.mode = 'fight'; d.fly = 0; d.model.position.set(0, 0, -9);
    D._startMove(d, 'claw', -0.4);
    D._netSend(1);
    const row = sent.find((m) => m.e === 's').l[0];
    assert.equal(row[19], MOVE_IDS.indexOf('claw') + 1, 'the move');
    assert.equal(row[21] >> 1, 1, 'the leg');
    const guest = world({ authority: false });
    guest.D._applyState({ e: 's', l: [row], h: [] });
    const gd = guest.D.list[0];
    assert.equal(gd.move.kind, 'claw');
    assert.equal(gd.clawLeg, 1);
    guest.D._animate(gd, 0.5, 0); // (the sound at its moment, once)
    assert.ok(guest.log.includes('claw'), 'the guest hears it');
    guest.D._animate(gd, 0.05, 0);
    assert.equal(guest.log.filter((k) => k === 'claw').length, 1);
});

// ---------------------------------------------------------------- walking on the ground (like tools/crowdbench.mjs: bodies in the way, no pushing through)
import { BODY_R } from '../../src/game/Crowd.js';
test('IN THE GAME: on its feet it walks round the people in its way — never through them — and reaches its target (or, if it cannot, takes off: it never stands still)', () => {
    for (const [name, men] of [['a line of knights', 7], ['a crowd round the man', 12]]) {
        const { D, g } = world();
        const byId = new Map();
        for (let i = 0; i < men; i++) {
            const x = name === 'a line of knights' ? -12 + i * 4 : Math.cos(i) * 7, z = name === 'a line of knights' ? -30 : Math.sin(i) * 7;
            byId.set('k' + i, { id: 'k' + i, x, y: 0, z, role: 'knight', talking: 1, dead: false });
        }
        g.castleLife = { byId };
        const d = wildDragon(D, { pos: new THREE.Vector3(0, 0, -62), mode: 'fight' });
        d.fly = 0; d.stay = 0; d.target = 'me'; d.aggro = 'me'; d.breathCd = 999; d.react = 1;
        let deepest = 0, near = false, tookOff = false;
        for (let t = 0; t < 200 && !d.dead; t += 0.05) {
            D._think(d, 0.05);
            if (d.mode === 'air') { tookOff = true; break; }
            const p = d.model.position;
            for (const v of byId.values()) deepest = Math.max(deepest, BODY_R.dragon * d.size / 1.25 + BODY_R.knight - Math.hypot(p.x - v.x, p.z - v.z));
            if (Math.hypot(p.x, p.z) < 15) { near = true; break; }
        }
        assert.ok(near || tookOff, `${name} it came to its target (or flew over the obstacle)`);
        assert.ok(deepest < 1.4, `${name}: bodies are not driven into each other (${deepest.toFixed(2)} m)`);
    }
});
