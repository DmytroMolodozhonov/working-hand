import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat, PVP, SPELL_COST } from '../../src/game/Combat.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

/** Minimal game around one player standing at the origin, facing −Z. */
function fakeGame({ armOut = 'right', tPose = false } = {}) {
    const events = { deaths: [], flashes: 0, voice: [] };
    const g = {
        config: { mode: 'freeworld' },
        scene: new THREE.Scene(),
        localId: 'me',
        knockback: new THREE.Vector3(),
        remotes: new Map(),
        killCount: 0,
        punchCount: 0,
        weapons: { hasWeapon: () => false },
        fx: { spark() {}, lightFlash() {} },
        hud: {
            update() {}, setFatigue() {}, setStatus() {}, setFrozenOverlay() {},
            damageFlash() { events.flashes++; }, setVoice(t) { events.voice.push(t); },
        },
        character: {
            group: { position: new THREE.Vector3(0, 0.5, 0) },
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.set(side === 'left' ? -0.6 : 0.6, 1.2, -1.5),
            getHandDirection: (side, out = new THREE.Vector3()) => out.set(0, 0, -1),
            isArmExtended: (side) => armOut === side || armOut === 'both',
            isTPose: () => tPose,
        },
        playerName: (id) => (id === 'enemy' ? 'Враг' : null),
        onLocalDeath: (text, by) => events.deaths.push({ text, by }),
    };
    return { g, events, combat: new Combat(g) };
}

const FRONT = new THREE.Vector3(0, 1.2, -20); // an enemy in front of me
const BEHIND = new THREE.Vector3(0, 1.2, 20);

test('«Protection» / «Protection Maxima» are recognised (and not taken for other spells)', () => {
    for (const w of ['protection', 'Протекшн', 'протекшен', 'протекция', 'щит']) assert.equal(matchSpell(w), 'Protection', w);
    for (const w of ['protection maxima', 'протекшн максима', 'protection maximum']) assert.equal(matchSpell(w), 'ProtectionMaxima', w);
    assert.equal(matchSpell('бомбардо максима'), 'BombardoMaxima');
});

test('free world: 10 HP, every spell hurts players, death at 0 HP', () => {
    const { combat, events } = fakeGame();
    assert.equal(combat.hp, PVP.MAX_HP);
    assert.equal(PVP.MAX_HP, 10);
    combat.hitBySpell('Thunderwave', FRONT, 'enemy');
    assert.equal(combat.hp, 7);
    assert.equal(events.flashes, 1, 'red flash around the screen');
    combat.hitBySpell('Sapira', FRONT, 'enemy');
    assert.equal(combat.hp, 3);
    // Inferno ticks: not every frame
    combat.hitBySpell('Inferno', FRONT, 'enemy');
    combat.hitBySpell('Inferno', FRONT, 'enemy');
    assert.equal(combat.hp, 2);
    combat.hitBySpell('Sands', FRONT, 'enemy');
    assert.equal(combat.hp, 0);
    assert.equal(events.deaths.length, 1);
    assert.match(events.deaths[0].text, /Враг/);
    // Dead players take no more hits
    combat.hitBySpell('Sapira', FRONT, 'enemy');
    assert.equal(events.deaths.length, 1);
});

test('fatigue: 30 points, +1 per second, spells cost fatigue, not enough → the spell fails', () => {
    const { combat } = fakeGame();
    assert.equal(PVP.MAX_FATIGUE, 30);
    assert.equal(SPELL_COST.Protection, 5);
    assert.equal(SPELL_COST.ProtectionMaxima, 20);
    assert.equal(SPELL_COST.Bombardo, 15);
    assert.equal(SPELL_COST.BombardoMaxima, 25);
    assert.equal(SPELL_COST.Thunderwave, 15);
    assert.equal(combat.check('BombardoMaxima'), null);
    combat.pay('BombardoMaxima');
    assert.equal(combat.fatigue, 5);
    assert.match(combat.check('Bombardo'), /Нет сил/);
    assert.equal(combat.check('Protection'), null);
    for (let i = 0; i < 10 * 60; i++) combat.update(1 / 60); // 10 s
    assert.ok(Math.abs(combat.fatigue - 15) < 0.01, `${combat.fatigue}`);
    for (let i = 0; i < 60 * 60; i++) combat.update(1 / 60);
    assert.equal(combat.fatigue, 30, 'full again, never above 30');
});

test('Protection: arm out → shield for 3 s; spells from the front bounce off, from behind they hit', () => {
    const { combat, events } = fakeGame({ armOut: 'none' });
    assert.match(combat.castProtection(false), /вытяните руку/);
    assert.equal(combat.fatigue, 30, 'no fatigue spent on a failed cast');
    const { combat: c2 } = fakeGame({ armOut: 'right' });
    assert.equal(c2.castProtection(false), null);
    assert.equal(c2.fatigue, 25);
    assert.equal(c2.hitBySpell('Sapira', FRONT, 'enemy'), false, 'blocked');
    assert.equal(c2.hp, 10);
    assert.equal(c2.hitBySpell('Sapira', BEHIND, 'enemy'), true, 'hits from behind');
    assert.equal(c2.hp, 6);
    // Bombardo blast in front: half damage through the shield
    c2.hp = 10;
    c2.explosion(new THREE.Vector3(0, 1.1, -2), 3.6, 1, 'enemy');
    const halved = 10 - c2.hp;
    const { combat: c3 } = fakeGame();
    c3.explosion(new THREE.Vector3(0, 1.1, -2), 3.6, 1, 'enemy');
    assert.ok(halved > 0 && halved < 10 - c3.hp, `shielded ${halved} < unshielded ${10 - c3.hp}`);
    // After 3 s the shield is gone
    for (let i = 0; i < 200; i++) c2.update(1 / 60);
    assert.equal(c2.shield, null);
    assert.equal(c2.hitBySpell('Sapira', FRONT, 'enemy'), true);
    assert.equal(events.deaths.length, 0);
});

test('Protection Maxima: needs a T-pose, dome blocks every direction, costs 20', () => {
    const { combat } = fakeGame({ armOut: 'both', tPose: false });
    assert.match(combat.castProtection(true), /буква T|T/);
    const { combat: c } = fakeGame({ armOut: 'both', tPose: true });
    assert.equal(c.castProtection(true), null);
    assert.equal(c.fatigue, 10);
    assert.equal(c.hitBySpell('Thunderwave', FRONT, 'enemy'), false);
    assert.equal(c.hitBySpell('Thunderwave', BEHIND, 'enemy'), false);
    assert.equal(c.hp, 10);
    c.explosion(new THREE.Vector3(1, 1, 1), 6.2, 3, 'enemy'); // Bombardo Maxima right next to me
    assert.ok(c.hp >= 7, `dome takes 75% (hp ${c.hp})`);
});

test('ice beam freezes a player in 5 s, 20 s frozen, any hit shatters them whatever their HP', () => {
    const { combat, events } = fakeGame();
    for (let i = 0; i < 4 * 60; i++) combat.chillBy(1 / 60 / 5, FRONT, 'enemy');
    assert.equal(combat.frozen, false, 'not yet after 4 s');
    // Running out of the beam lets the chill fade
    for (let i = 0; i < 3 * 60; i++) combat.update(1 / 60);
    assert.ok(combat.chill < 0.5);
    for (let i = 0; i < 6 * 60; i++) combat.chillBy(1 / 60 / 5, FRONT, 'enemy');
    assert.equal(combat.frozen, true);
    assert.equal(Math.round(combat.frozenLeft), 20);
    assert.match(combat.check('Inferno'), /заморожены.*через 20 с/);
    for (let i = 0; i < 5 * 60; i++) combat.update(1 / 60);
    assert.equal(Math.round(combat.frozenLeft), 15);
    // a punch on a frozen player (10 HP) kills
    assert.equal(combat.hp, 10);
    combat.meleeHit(1, 'enemy');
    assert.equal(events.deaths.length, 1);
    assert.match(events.deaths[0].text, /заморожены/);
});

test('frozen player thaws after 20 s; a shield stops the ice beam', () => {
    const { combat } = fakeGame();
    combat.freeze('enemy');
    for (let i = 0; i < 21 * 60; i++) combat.update(1 / 60);
    assert.equal(combat.frozen, false);
    combat.meleeHit(1, 'enemy');
    assert.equal(combat.hp, 9, 'normal hit again');
    const { combat: c } = fakeGame();
    c.castProtection(false);
    assert.equal(c.chillBy(0.5, FRONT, 'enemy'), false, 'beam blocked');
    assert.equal(c.chill, 0);
});

test('own Bombardo does not hurt me; creative mode has no PvP', () => {
    const { combat } = fakeGame();
    combat.explosion(new THREE.Vector3(0, 1, 0), 3.6, 1, 'me');
    assert.equal(combat.hp, 10);
    const { g } = fakeGame();
    g.config.mode = 'creative';
    const c = new Combat(g);
    assert.equal(c.enabled, false);
    assert.equal(c.check('BombardoMaxima'), null, 'no fatigue in creative');
    c.hitBySpell('Sapira', FRONT, 'enemy');
    assert.equal(c.hp, 10);
});
