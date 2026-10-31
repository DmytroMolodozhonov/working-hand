// «Brain Rot Maxima»: when the spell takes a dragon and when it does not, the 0,5 mana a second, who «Атак» may name,
// the ridden dragon's seat and its flight over everything. (DragonTame.js, Dragons.js, DragonRide.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TAME, tameVerdict, offence, upkeep, angryAt, attackVerdict, seatOf, REFUSE } from '../../src/game/DragonTame.js';
import { Dragons } from '../../src/game/Dragons.js';
import { DragonRide } from '../../src/game/DragonRide.js';
import { DRAGON_KINDS, KIND_IDS } from '../../src/game/DragonKinds.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { FIRST_SPELL } from '../../src/game/Mana.js';
import { knows } from '../../src/game/SpellBook.js';

/** A bare game: just what Dragons asks for. */
function world({ authority = true } = {}) {
    const sent = [];
    const g = {
        scene: new THREE.Scene(), localId: 'me', authority, config: { mode: 'test' },
        remotes: new Map([['foe', { position: new THREE.Vector3(30, 0, 0), dead: false }], ['pal', { position: new THREE.Vector3(-30, 0, 0), dead: false }]]),
        character: { group: new THREE.Object3D() }, hud: { setVoice() {}, notify() {}, toast() {} },
        combat: { enabled: true, fatigue: 100 }, collision: null, sync: { dragon: (m) => sent.push(m) },
    };
    const D = new Dragons(g);
    D.enabled = true;
    return { g, D, sent };
}
const dragonAt = (D, kind = 'emerald', mode = 'sleep') => D.spawn({ id: 'dx', kind, react: 1, flame: 1, pos: new THREE.Vector3(0, 0, -10), mode });

test('the spell is said: «Brain Rot Maxima» (and the plain «Брейнрот» still works as before)', () => {
    for (const t of ['Brain Rot Maxima', 'brainrot maxima', 'брейнрот максима', 'брейн рот макс']) assert.equal(matchSpell(t), 'BrainrotMaxima', t);
    for (const t of ['брейнрот', 'brainrot', 'брейн рот', 'Брэйнрот']) assert.equal(matchSpell(t), 'Brainrot', t);
    assert.equal(SPELL_COST.Brainrot, 15);
    assert.equal(FIRST_SPELL.Brainrot, 3, 'Brainrot: 3 cells the first time');
    assert.ok(SPELL_COST.BrainrotMaxima > 0 && FIRST_SPELL.BrainrotMaxima > 0);
    assert.ok(!knows('BrainrotMaxima', { mode: 'freeworld' }) && knows('BrainrotMaxima', { mode: 'creative' }), 'only from a scroll outside Creative');
    assert.ok(knows('BrainrotMaxima', { mode: 'freeworld', spells: { BrainrotMaxima: true } }), 'its scroll teaches it');
    assert.ok(!knows('BrainrotMaxima', { mode: 'freeworld', spells: { Brainrot: true } }), 'the plain scroll teaches no Maxima');
});

test('takes: a dragon asleep, watching, flying past or sitting — not angry at the caster', () => {
    for (const mode of ['sleep', 'watch', 'air', 'landed']) {
        const { D } = world();
        const d = dragonAt(D, 'emerald', mode);
        assert.equal(D.tame(d, 'me').ok, true, mode);
        assert.equal(d.tame.by, 'me');
    }
});

test('does not take: angry at the caster, struck by them, robbed by them — and the anger is only lowered', () => {
    let { D } = world();
    let d = dragonAt(D, 'crimson', 'chase');
    d.aggro = 'me'; d.target = 'me'; d.breathCd = 0; d.blowCd = 0;
    const v = D.tame(d, 'me');
    assert.equal(v.ok, false); assert.equal(v.code, 'aggro'); assert.equal(d.tame, null);
    assert.ok(d.breathCd > 0 && d.blowCd > 0 && d.slow > 0, 'at best its anger is lowered: it still goes for them');
    assert.equal(d.aggro, 'me', 'but it stays angry');
    // struck
    ({ D } = world());
    d = dragonAt(D);
    D.hit(d, 10, 'Stupefy', 'me');
    assert.equal(D.tame(d, 'me').code === 'aggro' || D.tame(d, 'me').code === 'grudge', true);
    assert.equal(tameVerdict(d, 'me', D._t).ok, false);
    // after the grudge fades, and the anger is gone, a new meeting is neutral
    d.aggro = null; d.target = null;
    assert.equal(tameVerdict(d, 'me', D._t + TAME.GRUDGE_T + 1).ok, true);
    // robbed (a thief of its lair)
    ({ D } = world());
    d = dragonAt(D); d.lair = 'L1';
    D._thief('L1', 'me');
    d.aggro = null;
    assert.equal(tameVerdict(d, 'me', D._t).code, 'thief');
    assert.equal(tameVerdict(d, 'pal', D._t).ok, true, 'somebody else is not the thief');
    assert.ok(REFUSE.aggro.say && REFUSE.thief.say && REFUSE.grudge.say);
});

test('a neutral stare (an intruder, not a quarrel) is settled by the spell; the one it is calmed to is never turned on', () => {
    const { D } = world();
    const d = dragonAt(D, 'golden', 'chase');
    d.target = 'me'; // (an intruder: no aggro)
    assert.equal(D.tame(d, 'me').ok, true);
    assert.equal(d.target, null);
    D._anger(d, 'me'); // (anger with no offence)
    assert.equal(d.aggro, null, 'a calmed dragon is not turned on its tamer without an offence');
    D._anger(d, 'foe', true);
    assert.equal(d.aggro, 'foe', 'but it stays angry at others');
});

test('an attack by the holder breaks the spell: the dragon is angry at them, the holder is told', () => {
    const { D } = world();
    const d = dragonAt(D);
    D.tame(d, 'me');
    let told = null;
    D.game.dragonRide = { onBroken: (dd, why) => { told = why; } };
    D.hit(d, 5, 'Stupefy', 'me');
    assert.equal(d.tame, null);
    assert.equal(told, 'attacked');
    assert.equal(d.aggro, 'me');
    assert.equal(tameVerdict(d, 'me', D._t).ok, false);
    // a hit by somebody else does not break it
    const w = world(); const e = dragonAt(w.D);
    w.D.tame(e, 'me'); w.D.hit(e, 5, 'Stupefy', 'foe');
    assert.ok(e.tame, 'another player\'s blow leaves the spell on');
    assert.equal(e.aggro, 'foe');
});

test('another player cannot take a dragon that is already calmed', () => {
    const { D } = world();
    const d = dragonAt(D);
    D.tame(d, 'me');
    assert.equal(D.tame(d, 'pal').code, 'taken');
});

test('0,5 mana a second, and it breaks at zero', () => {
    let m = 10; let broke = false;
    for (let i = 0; i < 40; i++) { const u = upkeep(m, 0.5); m = u.mana; broke = u.broke; }
    assert.ok(Math.abs(m - 0) < 1e-9 || broke, 'after 20 s of 0,5/s: 10 mana is spent');
    assert.equal(upkeep(100, 1).mana, 99.5);
    assert.equal(upkeep(0.2, 1).broke, true);
});

test('«Атак»: only at one the dragon is ALREADY angry at — never at the innocent, never at the rider', () => {
    const { D } = world();
    const d = dragonAt(D, 'obsidian', 'air');
    D.tame(d, 'me');
    // nobody it is angry at
    assert.equal(D.order(d, 'me', 'foe').ok, false);
    assert.equal(d.order, null);
    // 'foe' struck it
    D.hit(d, 5, 'Stupefy', 'foe');
    assert.deepEqual(angryAt(d, 'me', D._t), ['foe']);
    assert.equal(D.order(d, 'me', 'pal').ok, false, 'pal did nothing');
    assert.equal(D.order(d, 'me', 'me').ok, false);
    assert.equal(D.order(d, 'me', 'foe').ok, true);
    assert.equal(d.order.target, 'foe');
    assert.equal(attackVerdict(d, 'pal', 'foe', D._t).ok, false, 'only the one who holds it can send it');
});

test('mounting: only the holder, only when it is calm; one rider; the rider leaves — the dragon stays calm', () => {
    const { D } = world();
    const d = dragonAt(D, 'ice', 'sleep');
    assert.equal(D.mount(d, 'me').ok, false, 'no spell yet');
    D.tame(d, 'me');
    assert.equal(D.mount(d, 'pal').ok, false);
    assert.equal(D.mount(d, 'me').ok, true);
    assert.equal(d.mode, 'ride');
    assert.equal(D.mount(d, 'me').ok, false, 'already seated');
    D.dismounted(d, 'me');
    assert.equal(d.tame.rider, null);
    assert.ok(d.tame, 'still calm');
    assert.notEqual(d.mode, 'ride');
    D.release(d, 'me');
    assert.equal(d.tame, null);
});

test('a calmed dragon wakes for nobody it is calmed to, flies low to be got on, and does not fly off', () => {
    const { D } = world();
    const d = dragonAt(D, 'emerald', 'sleep');
    d.model.position.set(0, 0, -10);
    D.tame(d, 'me'); // (the hero stands at 0,0,0)
    for (let i = 0; i < 40; i++) D.update(0.1);
    assert.equal(d.mode, 'sleep', 'the tamer walks up: it does not wake');
    const w = world();
    const e = dragonAt(w.D, 'emerald', 'landed'); e.restT = 0.1;
    w.D.tame(e, 'me');
    for (let i = 0; i < 30; i++) w.D._think(e, 0.1);
    assert.equal(e.mode, 'landed', 'calmed: it waits for its rider');
    // flying past: it is told to come down near the holder
    const f = world();
    const a = dragonAt(f.D, 'golden', 'air'); a.purpose = 'cruise'; a.model.position.set(100, 60, 0);
    f.D.tame(a, 'me');
    assert.ok(a.landAt, 'it comes down near the one who calmed it');
    assert.ok(Math.hypot(a.landAt.x, a.landAt.z) < 40);
});

test('an ordered fire burns only its target: no villagers, trees, ships (the dragon is no weapon)', () => {
    const { D } = world();
    const d = dragonAt(D, 'crimson', 'air');
    D.tame(d, 'me'); D.hit(d, 1, 'Stupefy', 'foe'); D.mount(d, 'me');
    d.order = { target: 'foe', until: D._t + 9 };
    d.model.position.set(15, 10, 0); // (the foe stands at 30, 0, 0: in the fire's reach)
    d.model.rotation.y = Math.atan2(-(30 - 15), -(0 - 0)); // (the model faces -z at yaw 0: turned to the foe)
    d.breathCd = 0;
    D._rideCombat(d, 0.1);
    assert.ok(d.breath?.ride, 'the breath is an ordered one');
    assert.equal(d.breath.aim, 'foe');
    let burnt = 0;
    D.game._burnRay = () => { burnt++; };
    D.game.zombies = [];
    D.game.fx = null;
    D.auth && D._breathe(d, 0.3);
    assert.equal(burnt, 0, 'it burnt nothing else');
});

test('the rider\'s seat comes from the real size of each kind: on its back, not in the air and not in the ground', () => {
    for (const k of KIND_IDS) {
        const { D } = world();
        const d = dragonAt(D, k);
        const s = d.size;
        assert.ok(Math.abs(s - 1.25 * DRAGON_KINDS[k].size) < 1e-9, k);
        const seat = seatOf(0, 0, 0, 0, s);
        // (the back: BODY.y 2.9 + BODY.r 1.9 = 4.8 of the model, × its size; the hero is ~3.5 m, his legs under the seat)
        assert.ok(seat.y > 4 * s && seat.y < 5.5 * s, `${k}: the seat's height ${seat.y}`);
        assert.ok(seat.z > 0 && seat.z < 1 * s, `${k}: the seat over its middle, towards the shoulders`);
        const box = new THREE.Box3().setFromObject(d.model);
        assert.ok(box.max.y > 0, k);
    }
});

test('a rider comes down gently when the spell is torn in the air; down from the saddle when let go on the ground', () => {
    // the rider side with a bare game
    const log = [];
    const ch = { group: new THREE.Object3D(), head: new THREE.Object3D(), isCrouching: false, isRunning: false, runIntensity: 0, areBothHandsUp: () => false, setBodyRotation() {} };
    ch.group.position.set(0, 120, 0);
    const col = { groundAt: () => 10, groundY: () => 10, pointBlocked: () => false, resolveCylinder() {} };
    const g = { localId: 'me', authority: true, character: ch, collision: col, hud: { setVoice: (t) => log.push(t) }, combat: { enabled: true, fatigue: 50, damage() {}, stun() {} }, currentPose: null,
        dragons: { release() {}, dismounted() {}, list: [], tame() {}, mount() {} }, sync: null, settings: {}, flight: {}, space: null };
    const R = new DragonRide(g);
    R.dropping = { why: 'attacked' };
    for (let i = 0; i < 200 && R.dropping; i++) R._dropStep(0.1);
    assert.equal(R.dropping, null, 'it ended');
    assert.ok(Math.abs(ch.group.position.y - (10 + 2.0)) < 1e-6, 'on the ground, feet down: ' + ch.group.position.y);
    // each step is slow (a gentle fall)
    R.dropping = { why: 'attacked' }; ch.group.position.set(0, 120, 0);
    R._dropStep(1);
    assert.ok(120 - ch.group.position.y <= TAME.DROP_SPEED + 1e-9, 'a gentle fall');
});
