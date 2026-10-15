import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VillagerModel, villagerLook, ROLES } from '../../src/entities/VillagerModel.js';
import { WIZ, NPC_COST, WIZARD_ROLES, duelStrength, pickSpell, decide, react, wizardRoster } from '../../src/game/WizardAI.js';
import { TerrainData } from '../../src/world/Terrain.js';

const top = (m) => { m.group.updateMatrixWorld(true); return new THREE.Box3().setFromObject(m.group, true).max.y; };
const run = (m, s, state) => { for (let i = 0; i < Math.round(s * 60); i++) m.update(1 / 60, state); };
const seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };

test('wizards look like wizards: robes, pointed hats, wands (a staff on the road), the Master — an old man with a long white beard to the belt (as Dumbledore)', () => {
    // (wizards are appended to the roles: every older look stays the same)
    assert.deepEqual(ROLES.slice(0, 5), ['builder', 'farmer', 'merchant', 'knight', 'king']);
    for (const role of WIZARD_ROLES) {
        for (let seed = 0; seed < 10; seed++) {
            const L = villagerLook(seed, role, role === 'master' ? false : undefined);
            assert.ok(L.wizard && L.dress, `${role} robe`);
            assert.ok(L.hat.startsWith('wizard'), `${role} hat`);
            assert.equal(L.tool, role === 'wanderer' ? 'staff' : 'wand');
            const m = new VillagerModel(L);
            assert.ok(m.hat && m.hatTop, 'the hat is its own mesh');
            assert.ok(m.meshCount <= 12, `${role}: ${m.meshCount} meshes`);
        }
    }
    const M = villagerLook(3, 'master', false);
    assert.equal(M.beard, 'sage'); assert.equal(M.female, false);
    assert.equal(villagerLook(4, 'master', true).beard, 'sage', 'never a woman Master: always the beard');
    assert.equal(M.hat, 'wizardTall');
});

test('a pointed hat folds back under a low ceiling (and stands up again)', () => {
    for (const role of ['student', 'master', 'wanderer']) {
        const m = new VillagerModel(villagerLook(5, role));
        run(m, 0.2, { mode: 'idle' });
        const up = top(m);
        m.setHatTilt(1);
        run(m, 1.5, { mode: 'idle' });
        const folded = top(m);
        assert.ok(up - folded >= 0.25, `${role}: ${up.toFixed(2)} → ${folded.toFixed(2)}`);
        m.setHatTilt(0);
        run(m, 1.5, { mode: 'idle' });
        assert.ok(Math.abs(top(m) - up) < 0.05, 'stands up again');
    }
});

test('casting: the wand continues the forearm and points where the wizard aims (the bolt leaves its tip)', () => {
    const m = new VillagerModel(villagerLook(9, 'teacher'));
    for (const pitch of [0, 0.4, -0.3]) {
        m.setAim(pitch);
        run(m, 1, { mode: 'cast' });
        const d = m.getWandDir(new THREE.Vector3());
        assert.ok(d.z < -0.7, `forward ${d.z}`);
        assert.ok(Math.abs(Math.asin(d.y) - pitch) < 0.15, `pitch ${pitch}: ${Math.asin(d.y)}`);
        const tip = m.getWandTip(new THREE.Vector3()), hand = m.getRightHandWorldPosition(new THREE.Vector3());
        assert.ok(tip.distanceTo(hand) > 0.8 && tip.distanceTo(hand) < 1.3, 'the tip is a wand away from the hand');
    }
    const w = new VillagerModel(villagerLook(9, 'wanderer'));
    run(w, 1, { mode: 'cast' });
    assert.ok(w.getWandTip(new THREE.Vector3()).distanceTo(w.getRightHandWorldPosition(new THREE.Vector3())) > 2, 'a staff is long');
    for (const mode of ['practice', 'shield', 'offer']) run(m, 0.5, { mode });
});

test('the Master is twice as strong as a teacher (health, ward, skill, mana; casts twice as fast; shakes off a stun)', () => {
    const T = WIZ.teacher, M = WIZ.master;
    assert.equal(M.hp, 2 * T.hp);
    assert.equal(M.ward, 2 * T.ward);
    assert.equal(M.skill, 2 * T.skill);
    assert.equal(M.mana, 2 * T.mana);
    assert.ok(M.cast <= T.cast / 2);
    assert.ok(M.stunK < T.stunK);
    for (const s of Object.keys(M.spells)) assert.ok(NPC_COST[s] > 0, s);
});

test('spells: a student never uses Ice, Leviosa or Avada; the Master answers Avada only to one who used it', () => {
    let r = 0.123;
    const rng = () => (r = (r * 9301 + 49297) % 233280 / 233280);
    for (let i = 0; i < 400; i++) assert.ok(['Stupefy', 'SapiraDuel'].includes(pickSpell('student', rng)));
    let avada = 0;
    for (let i = 0; i < 400; i++) if (pickSpell('master', rng) === 'AvadaKedavra') avada++;
    assert.equal(avada, 0);
    for (let i = 0; i < 400; i++) if (pickSpell('master', rng, { foeUsedAvada: true }) === 'AvadaKedavra') avada++;
    assert.ok(avada > 50);
});

test('decide: flee, dome, wind, mercy, keep the range, cast, wait', () => {
    const base = { role: 'teacher', hp: 16, mana: 40, brave: 0.9, dist: 12, sees: true, castReady: true, domeReady: false, windReady: false, blinkReady: false, incoming: 0, inClash: false, clashP: 0.5, foeHelpless: false, hurtAgo: 99, closeT: 0 };
    assert.equal(decide({ ...base, role: 'student', hp: 3 }).a, 'flee');
    assert.equal(decide({ ...base, role: 'master', hp: 32, mana: 80, domeReady: true, incoming: 2 }).a, 'dome');
    assert.equal(decide({ ...base, role: 'master', hp: 32, mana: 80, windReady: true, dist: 3 }).a, 'wind');
    assert.equal(decide({ ...base, foeHelpless: true, hurtAgo: 6 }).a, 'hold');
    assert.equal(decide({ ...base, foeHelpless: true, hurtAgo: 2 }, () => 0.1).a, 'cast', 'just hurt: no mercy');
    assert.equal(decide({ ...base, dist: 30 }).a, 'move');
    assert.equal(decide({ ...base, sees: false }).a, 'move');
    const c = decide(base, () => 0.1);
    assert.equal(c.a, 'cast'); assert.ok(c.spell);
    assert.ok(['wait', 'move'].includes(decide({ ...base, mana: 2 }, () => 0.1).a));
    assert.equal(decide({ ...base, inClash: true }).a, 'clash');
    assert.equal(decide({ ...base, role: 'student', brave: 0.9, inClash: true, clashP: 0.1, mana: 2 }).a, 'giveup');
    assert.equal(decide({ ...base, role: 'master', hp: 32, mana: 0, inClash: true, clashP: 0.05 }).a, 'clash', 'the Master never gives up');
});

test('react: counter with enough mana, else a shield; the Master raises the dome against Avada', () => {
    assert.equal(react({ role: 'teacher', mana: 40, spell: 'Stupefy', eta: 1 }, seq(0.1, 0.1)), 'counter');
    assert.equal(react({ role: 'teacher', mana: 40, spell: 'Stupefy', eta: 1 }, seq(0.1, 0.9)), 'shield');
    assert.equal(react({ role: 'teacher', mana: 7, spell: 'Stupefy', eta: 1 }, seq(0.1, 0.1)), 'shield');
    assert.equal(react({ role: 'teacher', mana: 40 }, seq(0.99)), null);
    assert.equal(react({ role: 'master', mana: 80, domeReady: true, spell: 'AvadaKedavra' }, seq(0.1)), 'dome');
});

test('the people of a tower: the Master first, the scroll seller, teachers living in the cottages, students in the dormitory', () => {
    const t = new TerrainData(); t.generate({ seed: 4242, mountains: true });
    const k = t.towers.spawnKey();
    const gx = Math.round(k / 65536), gz = k - gx * 65536;
    const def = t.towers.cellOf(gx, gz);
    const a = wizardRoster(def, 0), b = wizardRoster(def, 0);
    assert.deepEqual(a, b);
    assert.equal(a.role, 'master');
    assert.equal(a.name, def.master);
    const S = def.stalls.length;
    for (let i = 1; i <= S; i++) { const e = wizardRoster(def, i); assert.equal(e.role, 'seller'); assert.equal(e.stall, i - 1); }
    for (let i = S + 1; i <= S + def.teachers; i++) {
        const e = wizardRoster(def, i);
        assert.equal(e.role, 'teacher');
        assert.ok(e.home >= 0 && e.home < def.houses.length - 1 && def.houses[e.home].kind !== 'tower', 'a teacher lives in a cottage');
    }
    const st = wizardRoster(def, S + def.teachers + 3);
    assert.equal(st.role, 'student');
    assert.equal(def.houses[st.home].kind, 'tower', 'students live in the tower');
    const w = wizardRoster(t.towers.wanderDef(2, 3), 1);
    assert.equal(w.role, 'wanderer');
});

test('wizard: a charge from behind is never answered; taken by surprise — late; ready — in time', async () => {
    const { noticeCharge } = await import('../../src/game/WizardAI.js');
    assert.equal(noticeCharge({ facing: -0.9, eta: 3, ready: true }).seen, false, 'from behind');
    assert.equal(noticeCharge({ facing: 1, sees: false, eta: 3, ready: true }).seen, false, 'behind a wall');
    const calm = noticeCharge({ facing: 1, eta: 0.8, ready: false, reactT: 0.45 });
    assert.ok(calm.seen && !calm.shield && !calm.counter, 'walking calmly: no time to raise the wand');
    const ready = noticeCharge({ facing: 1, eta: 0.6, ready: true, reactT: 0.45 });
    assert.ok(ready.shield && !ready.counter, 'in a fight: the hand shield in time');
    assert.ok(noticeCharge({ facing: 1, eta: 1.5, ready: true, reactT: 0.45 }).counter, 'from afar: a spell back — a duel');
});
