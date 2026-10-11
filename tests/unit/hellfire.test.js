import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HELLFIRE, Hellfire, hellfireBlock, hellfireDrain, hellfireReward, blazeReach, blazeRadius, inBlaze, inRing, ringRadius } from '../../src/game/Hellfire.js';
import { SPELL_COST, Combat } from '../../src/game/Combat.js';
import { Mana } from '../../src/game/Mana.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('Hellfire: the words (English, and as the Russian recognizer writes them)', () => {
    for (const t of ['Let the Hellfire Come', 'let the hellfire come', 'Hellfire come', 'Come, hellfire', 'лет зе хеллфаер кам',
        'лет зе хелфайр кам', 'хэлфайр кам', 'хеллфайер кам', 'лет зэ хелл фаер кам', 'кам хелфаир', 'лет зе хеллфаер', 'Да придёт адский огонь']) {
        assert.equal(matchSpell(t), 'Hellfire', t);
    }
    // its short sounds still mean what they meant
    assert.equal(matchSpell('файр'), 'Fire');
    assert.equal(matchSpell('файр максима'), 'FireMaxima');
    assert.equal(matchSpell('лет ит рейн'), 'LetItRain');
    assert.equal(matchSpell('инферно'), 'Inferno');
});

test('Hellfire: ordinary talk never casts it', () => {
    for (const t of ['мне уже пять лет', 'у нас дома камин', 'это просто адский огонь', 'хеллфаер', 'давай кам сюда', 'помнишь, сколько лет прошло',
        'hell yeah come on', 'камера не работает', 'огонь в камине', 'хелп ми плиз кам', 'shell fire', 'хеллоу кам']) {
        assert.notEqual(matchSpell(t), 'Hellfire', t);
    }
    assert.equal(matchSpell('хеллфаер'), null, '«hellfire» alone waits for «come» — never a campfire');
});

test('Hellfire: mana — a maximum of 100+, 80 at once, 2 a second; Creative has no mana rules', () => {
    assert.equal(SPELL_COST.Hellfire, 80);
    assert.equal(HELLFIRE.MIN_MAX_MANA, 100);
    assert.equal(HELLFIRE.COST, 80);
    assert.equal(hellfireDrain(1), 2);
    assert.equal(hellfireDrain(0.25), 0.5);
    assert.equal(hellfireDrain(-1), 0);
    assert.equal(hellfireBlock({ enabled: true, max: 99, mana: 99 }), 'max');
    assert.equal(hellfireBlock({ enabled: true, max: 100, mana: 79 }), 'mana');
    assert.equal(hellfireBlock({ enabled: true, max: 100, mana: 80 }), null);
    assert.equal(hellfireBlock({ enabled: false, max: 30, mana: 0 }), null, 'Creative: it just works');
});

test('Hellfire: +10 to the mana maximum only the first time', () => {
    const bonus = { hp: 0, fatigue: 3 };
    assert.equal(hellfireReward(bonus), 10);
    assert.deepEqual(bonus, { hp: 0, fatigue: 13, hellfire: true });
    assert.equal(hellfireReward(bonus), 0);
    assert.equal(bonus.fatigue, 13);
});

test('Hellfire: the hand controls it — reach by the stretched arm, size by time and the spread hands', () => {
    assert.equal(blazeReach(0), HELLFIRE.REACH_MIN);
    assert.equal(blazeReach(1), HELLFIRE.REACH_MAX);
    assert.ok(blazeRadius(5) > blazeRadius(0), 'held longer: bigger');
    assert.ok(blazeRadius(2, 1.5) > blazeRadius(2, 0.3), 'hands spread: bigger');
    assert.ok(blazeRadius(100, 5) <= HELLFIRE.R_MAX);
    const c = { x: 0, y: 1, z: -6 };
    assert.ok(inBlaze(c, 3, { x: 0, y: 1, z: -4 }));
    assert.ok(!inBlaze(c, 3, { x: 0, y: 1, z: 0 }));
    // the ring round the caster burns round them, not the caster in the middle
    const me = { x: 0, y: 1.5, z: 0 };
    const rr = ringRadius(3);
    assert.ok(inRing(me, rr, { x: rr, y: 1.5, z: 0 }));
    assert.ok(!inRing(me, rr, me));
    assert.ok(!inRing(me, rr, { x: rr + 5, y: 1.5, z: 0 }));
});

/** A small game: a wizard with a wand in the right hand, the free world's mana rules (or Creative). */
function fakeGame(mode = 'freeworld') {
    const noop = () => {};
    const hud = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop) });
    const pos = new THREE.Vector3(0, 1.5, 0);
    const g = {
        config: { mode }, hud, localId: 'me', authority: true,
        character: {
            group: { position: pos },
            slowScale: 1,
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.set(side === 'right' ? 0.25 : -0.25, 1.6, -0.5),
            getPointingDirection: (side, out = new THREE.Vector3()) => out.set(0, 0, -1),
            getHandDirection: (side, out = new THREE.Vector3()) => out.set(0, 0, -1),
            isArmRaised: () => true,
            handLost: () => false,
        },
        items: { heldOf: (k) => (k === 'wand' ? { side: 'right', plain: false } : null) },
        castOrigin: (side, out = new THREE.Vector3()) => out.set(0.25, 1.6, -0.8),
        collision: { groundY: () => 0 },
        _flameBlock: () => null,
        _flameWaters: () => [],
        fire: { lit: 0, ignite() { return this.lit-- > 0; } },
        duel: { _bodies: () => [] },
    };
    g.combat = new Combat(g);
    g.mana = new Mana(g);
    g.hellfire = new Hellfire(g);
    return g;
}

const run = (g, secs, step = 0.1) => { for (let t = 0; t < secs - 1e-9; t += step) { g.combat.update(step); g.hellfire.update(step); } };

test('Hellfire: needs a mana maximum of 100; costs 80, then drains 2 a second; out when the mana runs out', () => {
    const g = fakeGame();
    const c = g.combat;
    c.fatigue = 30;
    assert.equal(g.hellfire.cast(true), null, 'a maximum of 30: not strong enough');
    assert.equal(c.fatigue, 30, 'nothing paid');
    c.maxFatigue = 100; c.fatigue = 100;
    assert.equal(g.hellfire.cast(true), 'Hellfire');
    assert.equal(c.fatigue, 20, '80 at once (a wand saves nothing on it)');
    run(g, 2);
    assert.ok(Math.abs(c.fatigue - 16) < 0.05, `2 a second while held, nothing comes back: ${c.fatigue}`);
    assert.ok(g.hellfire.busy);
    run(g, 9);
    assert.equal(g.hellfire.busy, false, 'no mana left: the fire went out');
    assert.ok(g.hellfire.log.some((e) => e.ev === 'out' && e.why === 'mana'));
});

test('Hellfire: «стоп» puts it out; Creative casts it with no mana at all', () => {
    const g = fakeGame('creative');
    g.combat.fatigue = 0;
    assert.equal(g.hellfire.cast(true), 'Hellfire');
    run(g, 1);
    assert.ok(g.hellfire.busy);
    assert.equal(g.hellfire.stop(), true);
    assert.equal(g.hellfire.busy, false);
});

test('Hellfire: the first real burn gives +10 to the mana maximum — only once, kept in the bonuses', () => {
    const g = fakeGame();
    const c = g.combat;
    c.maxFatigue = 100; c.fatigue = 100;
    g.hellfire.cast(true);
    run(g, 1);
    assert.equal(c.maxFatigue, 100, 'nothing burnt yet: no reward');
    g.fire.lit = 1; // (a tree catches fire)
    run(g, 0.5);
    assert.equal(g.bonus.hellfire, true);
    assert.equal(g.bonus.fatigue, 10);
    const after = c.maxFatigue;
    assert.ok(after >= 110, `+10 (and the strong spell's first success): ${after}`);
    g.hellfire.stop();
    g.hellfire._endAt = -99;
    c.fatigue = 100;
    g.hellfire.cast(true);
    g.fire.lit = 1;
    run(g, 0.5);
    assert.equal(g.bonus.fatigue, 10, 'no second +10');
    assert.ok(c.maxFatigue - after <= 1, 'only the ordinary +1 for a spell that worked');
});

test('Hellfire: the caster is not immune — the blaze on him burns him (a shield only halves it)', () => {
    const g = fakeGame();
    const c = g.combat;
    c.maxFatigue = 200; c.fatigue = 200;
    // (the wand pointing at his own feet)
    g.character.getPointingDirection = (side, out = new THREE.Vector3()) => out.set(0, -1, 0.05).normalize();
    g.castOrigin = (side, out = new THREE.Vector3()) => out.set(0.25, 1.4, -0.4);
    g.hellfire.cast(true);
    const hp0 = c.hp;
    run(g, 2);
    assert.ok(c.hp < hp0, `he burns in his own fire: ${hp0} → ${c.hp}`);
    assert.ok(g.hellfire.log.some((e) => e.ev === 'hurtMe' && e.by === 'self' && e.dmg === HELLFIRE.PLAYER_DMG));
    c.shield = { type: 2, side: 'right', left: 99 };
    g.hellfire.log.length = 0;
    run(g, 1);
    assert.ok(g.hellfire.log.some((e) => e.ev === 'hurtMe' && e.dmg === HELLFIRE.PLAYER_DMG * HELLFIRE.SHIELD), 'a shield only halves it');
});
