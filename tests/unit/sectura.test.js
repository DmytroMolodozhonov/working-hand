// «Sectura» — the cutting curse (SlashRules.js, Slash.js): the author's numbers (50 mana, 10 m, 10–15 HP), the swing's reading, the sheet, and a REAL cut: the virtual blade runs through
// Dismember's own bone test — a level swing at the neck's height takes a head, at the knees a leg, across the torso only wounds; steel stops the severing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SLASH, SLASH_TARGETS, rollDamage, swingOf, swingFromRoll, packDir, unpackDir, sheetHit, bladeSweeps } from '../../src/game/SlashRules.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { DARK_SPELLS } from '../../src/game/DarkMagic.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { characterBody } from '../../src/game/CutBodies.js';
import { Dismemberment } from '../../src/game/Dismember.js';
import { Slash } from '../../src/game/Slash.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FWD = V(0, 0, 1);

test('the author\'s numbers: 50 mana, 10 m, 10…15 HP (both ends reached, nothing outside), black magic', () => {
    assert.equal(SPELL_COST.Sectura, 50);
    assert.equal(SLASH.RANGE, 10);
    const seen = new Set();
    for (let i = 0; i < 4000; i++) { const d = rollDamage(); assert.ok(Number.isInteger(d) && d >= 10 && d <= 15, String(d)); seen.add(d); }
    assert.deepEqual([...seen].sort((a, b) => a - b), [10, 11, 12, 13, 14, 15]);
    assert.equal(rollDamage(() => 0), 10); assert.equal(rollDamage(() => 0.9999999), 15);
    assert.ok(DARK_SPELLS.has('Sectura'));
});

test('the word «Sectura» is heard; everyday words are not it', () => {
    for (const w of ['sectura', 'Сектура', 'сектура', 'sektura']) assert.equal(matchSpell(w), 'Sectura', w);
    for (const w of ['сектора', 'секунда', 'секрет', 'сектор газа', 'привет как дела']) assert.notEqual(matchSpell(w), 'Sectura', w);
});

test('the swing: only a brisk SIDEWAYS sweep of the wand counts — a thrust forward or a slow wave is no slash', () => {
    const f = V(0, 0, -1); // (the pointing away from the face)
    assert.equal(swingOf(f, V(3, 0, 0)), null, 'slow');
    assert.equal(swingOf(f, V(0, 0, -14)), null, 'a thrust');
    assert.equal(swingOf(f, V(2, 0, -14)), null, 'mostly a thrust');
    const level = swingOf(f, V(14, 0, 0));
    assert.ok(level && Math.abs(level.s.x) > 0.99 && Math.abs(level.roll01 - 0.5) < 1e-6, 'a level swing: the sheet is level');
    const down = swingOf(f, V(0, -14, 0));
    assert.ok(down && Math.abs(down.s.y) > 0.99, 'a swing from above down: the sheet is upright');
    // the roll travels with the message and gives the same sheet (the sign of the swing is the same sheet)
    for (const v of [V(14, 0, 0), V(-14, 0, 0), V(10, 10, 0), V(-10, 8, 2), V(0, 14, 0), V(0, -14, 0)]) {
        const sw = swingOf(f, v);
        const wire = packDir(f, sw.roll01);
        assert.ok(wire.length() >= 1 && wire.length() < 2);
        const { f: f2, roll01 } = unpackDir(new THREE.Vector3(Math.round(wire.x * 1000) / 1000, Math.round(wire.y * 1000) / 1000, Math.round(wire.z * 1000) / 1000));
        const s2 = swingFromRoll(f2, roll01);
        assert.ok(Math.abs(Math.abs(s2.dot(sw.s)) - 1) < 0.01, `the roll differs for ${v.toArray()}: ${s2.dot(sw.s)}`);
        assert.ok(Math.abs(s2.dot(f2)) < 1e-6, 'the swing is across the pointing');
    }
});

test('the sheet: 10 m of reach, 5 m wide along the swing, thin across it', () => {
    const o = V(0, 3, 0), s = V(1, 0, 0);
    assert.ok(sheetHit(o, FWD, s, 10, V(0, 3, 5), 0.5) >= 0, 'in front');
    assert.ok(sheetHit(o, FWD, s, 10, V(2, 3, 9), 0.5) >= 0, 'to the side, in the width');
    assert.equal(sheetHit(o, FWD, s, 10, V(0, 3, 11.5), 0.5), -1, 'beyond 10 m');
    assert.equal(sheetHit(o, FWD, s, 10, V(4, 3, 5), 0.5), -1, 'beyond the width');
    assert.equal(sheetHit(o, FWD, s, 10, V(0, 4.5, 5), 0.5), -1, 'off the plane (a level swing misses a head 1.5 m higher)');
    assert.ok(sheetHit(o, FWD, s, 10, V(0, 3.4, 5), 0.5) >= 0, 'near the plane');
    assert.equal(sheetHit(o, FWD, s, 10, V(0, 3, -4), 0.5), -1, 'behind');
});

test('every kind of body the spells look for has a decision with its reason', () => {
    for (const k of ['p', 'z', 'a', 'v', 'c', 't', 'b', 's', 'D', 'f', 'N', 'T', 'C', 'o', 'S', 'G', 'g', 'Y', 'I', 'P', 'F']) {
        const T = SLASH_TARGETS[k];
        assert.ok(T && ['cut', 'hurt', 'none'].includes(T.does) && T.why.length > 10, k);
    }
});

// ------------------------------------------------------------ a real cut on the hero's body
function setup() {
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter(scene);
    ch.setIdlePose();
    ch.group.position.set(0, 1.5, 0);
    ch.group.updateMatrixWorld(true);
    const game = { character: ch, localId: 'A', authority: true, config: { mode: 'freeworld' }, remotes: new Map(), fx: { blood() {}, spark() {} }, hud: { setVoice() {} } };
    game.dismember = new Dismemberment(game);
    const sl = new Slash(game);
    return { ch, game, sl, who: { k: 'p', id: 'A', t: null, body: characterBody(ch), r: { look: ch.look, character: ch } } };
}
const cutAt = (S, y, s = V(1, 0, 0), x = 0) => {
    const sweeps = bladeSweeps(V(x, y, -8), FWD, s, 10);
    return S.sl._cutOf(S.who, null, sweeps, { tf: 8, r: 1 });
};

test('a level swing at the neck takes the head, at the knees a leg; across the torso — no cut (a wound instead); the blade is as sharp as a sword', () => {
    const S = setup();
    const neck = cutAt(S, 3.1);
    assert.equal(neck?.kind, 'cut');
    assert.equal(neck.sever.limb, 'head', 'the neck');
    const knees = cutAt(S, 0.2);
    assert.equal(knees?.kind, 'cut');
    assert.ok(/Leg$/.test(knees.sever.limb), knees.sever.limb);
    const chest = cutAt(S, 2.0);
    assert.ok(!chest || chest.kind !== 'cut', 'the torso stops the blade (no limb is crossed first)');
    // a blade that passes far over the head cuts nothing
    assert.equal(cutAt(S, 6.5), null);
});

test('a slash that reaches only the arm takes the arm', () => {
    const S = setup();
    // a level sheet standing to the left of the body (its right edge ends past the arm, short of the leg): through the hanging arm at the height of the forearm
    const sweeps = bladeSweeps(V(-3.0, 1.2, -8), FWD, V(1, 0, 0), 10);
    const r = S.sl._cutOf(S.who, null, sweeps, { tf: 8, r: 1 });
    assert.ok(r?.kind === 'cut' && /Arm$/.test(r.sever.limb), JSON.stringify(r?.sever?.limb || r?.kind));
});

test('steel on the limb stops the severing: a plate leg is wounded, not cut', () => {
    const S = setup();
    S.ch.armorWorn = { legs: { hp: 30 } };
    const r = cutAt(S, 0.2);
    assert.ok(r && r.kind !== 'cut', r?.kind);
});

test('the wound of a creature: 10…15 damage through its own hit and a bleeding that closes by itself', () => {
    const S = setup();
    const hits = [];
    S.game.castleLife = { hit: (v, dmg, dir, by, o) => hits.push({ dmg, by, o }) };
    const bled = [];
    S.game.dismember._bleed = (who, rate, by, time) => bled.push({ rate, time });
    const v = { id: 'v1', hp: 20 };
    S.sl._wound({ kind: 'v', id: 'v1' }, v, 12, 'A', { k: 'v', id: 'v1', t: v }, null);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].dmg, 12);
    assert.deepEqual(bled, [{ rate: SLASH.BLEED_RATE, time: SLASH.BLEED_TIME }]);
});

test('bleeding of a wound ends by itself after BLEED_TIME; a lost limb\'s bleeding (no end) stays', () => {
    const S = setup();
    const dm = S.game.dismember;
    S.game.castleLife = { _die() {} };
    const v = { id: 'v2', hp: 100 };
    const who = { k: 'v', id: 'v2', t: v };
    dm._bleed(who, 1, 'A', 12);
    for (let i = 0; i < 60 * 13; i++) dm.update(1 / 60);
    assert.ok(!(v.bleed > 0) && !dm.bleeders.has('v:v2'), 'the wound closed');
    assert.ok(v.hp < 100 && v.hp > 85, `lost about 12: ${v.hp}`);
    const w = { id: 'v3', hp: 100 };
    dm._bleed({ k: 'v', id: 'v3', t: w }, 1.5, 'A');
    dm._bleed({ k: 'v', id: 'v3', t: w }, 1, 'A', 12); // (a wound on a stump: the endless one stays)
    for (let i = 0; i < 60 * 20; i++) dm.update(1 / 60);
    assert.ok(w.hp < 80 && dm.bleeders.has('v:v3'), 'the stump still bleeds');
});
