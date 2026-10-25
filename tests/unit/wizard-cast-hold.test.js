import test from 'node:test';
import assert from 'node:assert/strict';
import { CAST_HOLD, castHold, holdsCast } from '../../src/game/WizardAI.js';
import { WizardFight } from '../../src/game/WizardFight.js';

test('after a cast a wizard holds his pose 1.5–2.5 s (random), longer while his charge flies, at most 4 s', () => {
    assert.equal(castHold(() => 0), 1.5);
    assert.equal(castHold(() => 1), 2.5);
    assert.ok(holdsCast({ left: 0.5, held: 1.2 }));
    assert.ok(!holdsCast({ left: 0, held: 2 }));
    assert.ok(holdsCast({ left: 0, held: 2.6, flying: true }), 'his beam still flies from his wand: no running');
    assert.ok(!holdsCast({ left: 0, held: CAST_HOLD.MAX_T, flying: true }));
    assert.ok(!holdsCast({ left: 1, held: 0.3, fleeing: true }), 'a danger breaks it');
    assert.ok(!holdsCast({ left: 1, held: 0.3, foeDist: 1 }), 'a foe right at him breaks it');
});

test('WizardFight: a wizard who just cast stands still for the pose, then may move', () => {
    const bolts = new Map();
    const f = new WizardFight({ life: { _ground() {} }, game: { duel: { bolts } } });
    const v = { id: 7, x: 0, z: 0, yaw: 0, speed: 3, path: [1], fleeT: 0 };
    f._startHold(v);
    v.holdT = 2; // (the roll: 2 s)
    let still = 0;
    for (let i = 0; i < 300 && f.holdStill(v, 1 / 60); i++) { still++; assert.equal(v.speed, 0); assert.equal(v.path, null); }
    assert.ok(Math.abs(still / 60 - 2) < 0.05, `held ${still / 60} s`);
    assert.ok(!f.holding(v, 1 / 60), 'then free to move');
    // his charge still flying: he waits for it
    f._startHold(v); v.holdT = 1.5;
    bolts.set('7:1', { by: 7, state: 'flying' });
    for (let i = 0; i < 120; i++) f.holding(v, 1 / 60);
    assert.ok(f.holding(v, 1 / 60));
    bolts.clear();
    assert.ok(!f.holding(v, 1 / 60));
});

test('in a fight a wizard keeps a duel\'s distance: not close — further from a foe behind his shield', async () => {
    const { WIZ, duelBand, duelDist } = await import('../../src/game/WizardAI.js');
    for (const k of ['student', 'adept', 'teacher', 'master']) {
        const R = WIZ[k].range;
        const [lo, hi] = duelBand(R);
        assert.ok(lo >= (R[0] + R[1]) / 2 - 1 && hi <= R[1], k);
        assert.equal(duelDist(2, R), lo, 'too near: he backs off');
        assert.ok(duelBand(R, true)[0] > lo, 'a shield: further');
    }
});

test('Творческий: in a duel a player is as strong in mana as his opponent (a wizard: the wizard\'s mana now)', async () => {
    const { Duel } = await import('../../src/game/Duel.js');
    const { duelPower } = await import('../../src/game/WizardAI.js');
    const wiz = { wizard: true, mana: 480, hp: 32, maxHp: 32, role: 'master' };
    const me = { me: 'me', game: { config: { mode: 'creative' }, combat: { enabled: false, fatigue: 30, maxFatigue: 30 }, remotes: new Map(), castleLife: { byId: new Map([[5, wiz]]) } } };
    me._npcWizard = Duel.prototype._npcWizard; me._playerMana = Duel.prototype._playerMana; me._mastery = Duel.prototype._mastery;
    const s = Duel.prototype._strength.call(me, 'me', 0, 5);
    assert.equal(s, duelPower(480, 1, 0));
    me.game.config.mode = 'freeworld';
    assert.equal(Duel.prototype._strength.call(me, 'me', 0, 5), duelPower(30, 1, 0), 'Хардкор: his own store');
});

test('the wand counts in a duel as everywhere: ×1.15 and its own bonuses; a wizard keeps his own wand', async () => {
    const { Duel } = await import('../../src/game/Duel.js');
    const ctx = (wand, wiz) => ({ me: 'me', game: { items: { wand }, remotes: new Map() }, _npcWizard: (id) => (id === 5 ? wiz : null) });
    const k = (wand, id = 'me', wiz = null) => Duel.prototype._wandK.call(ctx(wand, wiz), id, 'SapiraDuel');
    assert.equal(k(null), 1, 'a bare hand');
    assert.ok(Math.abs(k({ plain: true, power: 0 }) - 1.15) < 1e-9);
    assert.ok(Math.abs(k({ power: 8 }) - 1.15 * 1.08) < 1e-9, 'a good one: about +24 %');
    assert.ok(Math.abs(k({ dir: 'duel', fav: 'Sapira', power: 50 }) - 1.15 * 1.25 * 1.4 * 1.5) < 1e-9);
    const wiz = { wizard: true, role: 'teacher', robe: false };
    const a = k(null, 5, wiz), b = k(null, 5, wiz);
    assert.ok(a >= 1.15 && a === b, 'his own wand, always the same');
    wiz.noWand = true;
    assert.equal(k(null, 5, wiz), 1);
});

test('«дуэльное мастерство»: 6 % of the beaten mana (a known one half), 10 % to the death; counted as mana in a duel; death takes it into the body', async () => {
    const { Mana } = await import('../../src/game/Mana.js');
    const { captureLegacy, absorbLegacy } = await import('../../src/game/Legacy.js');
    const { Duel } = await import('../../src/game/Duel.js');
    const { duelPower } = await import('../../src/game/WizardAI.js');
    const g = { combat: { enabled: true, fatigue: 100, maxFatigue: 100, hp: 20, maxHp: 20 }, hud: {}, remotes: new Map(), config: { mode: 'freeworld' } };
    const M = g.mana = new Mana(g);
    M.duelWonAlive(7, Math.random, 100); M.duelWonAlive(7, Math.random, 100); M.duelWon(500, 8);
    assert.equal(M.mastery, 6 + 3 + 50, 'adept 100 mana: 6, again 3; the Master (500) to the death: 50');
    const s = Duel.prototype._strength.call({ me: 'me', game: g, _npcWizard: () => null, _mastery: Duel.prototype._mastery }, 'me', 0);
    assert.equal(s, duelPower(100 + 59, 1));
    const rec = captureLegacy(g);
    M.onDeath();
    assert.equal(M.mastery, 0);
    absorbLegacy(g, rec);
    assert.equal(M.mastery, 59);
    M.duelWonAlive(7, Math.random, 100);
    assert.equal(M.mastery, 62, 'the one he beat before: still known');
    const M2 = new Mana(g); M2.restore(M.snapshot());
    assert.equal(M2.mastery, 62);
});

test('before every spell a wizard says it — about a second, standing, facing the foe — only then the charge flies', async () => {
    const { CAST_PREP } = await import('../../src/game/WizardAI.js');
    const foe = { x: 0, y: 1.95, z: -10 };
    const f = new WizardFight({ life: { _ground() {}, _playerPos: () => foe }, game: { duel: { bolts: new Map(), clashes: [] }, collision: null } });
    let firedAt = null, t = 0;
    f._cast = () => { firedAt = t; return true; };
    const v = { id: 3, x: 0, y: 0, z: 0, yaw: 0, speed: 2, mana: 50, W: { cast: 2 }, castCd: 0 };
    assert.ok(f._begin(v, 'Stupefy', 'p1', foe, { cost: 12, cd: 2 }));
    assert.ok(!f._begin(v, 'Stupefy', 'p1', foe), 'one at a time');
    for (let i = 0; i < 120; i++) { t += 1 / 60; f._prepTick(v, 1 / 60); assert.equal(v.speed, 0); assert.equal(v.mode === 'cast' || firedAt != null, true); }
    assert.ok(firedAt >= CAST_PREP.T - 1e-6 && firedAt <= CAST_PREP.T + CAST_PREP.JITTER + 0.05, `flew at ${firedAt}`);
    assert.equal(v.mana, 38);
    assert.ok(v.castCd >= 2 - 1e-6 && !v.prep);
    // his back to the foe: he can't begin saying it (first he turns)
    const w = { id: 4, x: 0, y: 0, z: 0, yaw: Math.PI, mana: 50, W: { cast: 2 } };
    assert.ok(!f._begin(w, 'Stupefy', 'p1', foe));
    // stunned while saying it: lost
    const u = { id: 5, x: 0, y: 0, z: 0, yaw: 0, mana: 50, W: { cast: 2 } };
    f._begin(u, 'Stupefy', 'p1', foe); u.stunT = 3;
    assert.ok(!f._prepTick(u, 0.1) && !u.prep);
});
