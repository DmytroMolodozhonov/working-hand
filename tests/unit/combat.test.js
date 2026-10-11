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

test('free world: 20 HP, every spell hurts players, death at 0 HP', () => {
    const { combat, events } = fakeGame();
    assert.equal(combat.hp, PVP.MAX_HP);
    assert.equal(PVP.MAX_HP, 20);
    combat.hp = 10; // (the arithmetic below starts from 10)
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
    assert.match(combat.check("Bombardo"), /Не хватает маны/);
    assert.equal(combat.check('Protection'), null);
    for (let i = 0; i < 10 * 60; i++) combat.update(1 / 60); // 10 s
    assert.ok(Math.abs(combat.fatigue - 15) < 0.01, `${combat.fatigue}`);
    for (let i = 0; i < 60 * 60; i++) combat.update(1 / 60);
    assert.equal(combat.fatigue, 30, 'full again, never above 30');
});

test('Protection: arm out → the shield holds; spells from the front bounce off, from behind they hit', () => {
    const { combat, events } = fakeGame({ armOut: 'none' });
    // No arm fully stretched: the shield still forms at the hand reaching furthest
    assert.equal(combat.castProtection(false), null);
    assert.equal(combat.shield.type, 1);
    assert.equal(combat.fatigue, 25);
    const { combat: c2 } = fakeGame({ armOut: 'right' });
    assert.equal(c2.castProtection(false), null);
    assert.equal(c2.fatigue, 25);
    assert.equal(c2.hitBySpell('Sapira', FRONT, 'enemy'), false, 'blocked');
    assert.equal(c2.hp, 20);
    assert.equal(c2.hitBySpell('Sapira', BEHIND, 'enemy'), true, 'hits from behind');
    assert.equal(c2.hp, 16);
    // Bombardo blast in front: half damage through the shield
    c2.hp = 20;
    c2.explosion(new THREE.Vector3(0, 1.1, -2), 3.6, 1, 'enemy');
    const halved = 20 - c2.hp;
    const { combat: c3 } = fakeGame();
    c3.explosion(new THREE.Vector3(0, 1.1, -2), 3.6, 1, 'enemy');
    assert.ok(halved > 0 && halved < 20 - c3.hp, `shielded ${halved} < unshielded ${20 - c3.hp}`);
    // It is still up after 3 s (no longer a 3-second shield)
    for (let i = 0; i < 200; i++) c2.update(1 / 60);
    assert.ok(c2.shield, 'still holding');
    assert.equal(c2.hitBySpell('Sapira', FRONT, 'enemy'), false);
    assert.equal(events.deaths.length, 0);
});

test('Protection costs 5, then holds as many seconds as the strength left; the strength drains, not comes back', () => {
    const { combat: c, events } = fakeGame({ armOut: 'right' });
    c.fatigue = 18;
    assert.equal(c.castProtection(false), null);
    assert.equal(c.fatigue, 13, '5 taken at once');
    assert.ok(Math.abs(c.shield.left - 13) < 1e-9, 'it will hold 13 s');
    for (let i = 0; i < 5 * 60; i++) c.update(1 / 60); // 5 s
    assert.ok(Math.abs(c.fatigue - 8) < 0.05, `1 a second spent while holding (${c.fatigue})`);
    assert.ok(Math.abs(c.shield.left - 8) < 0.05, `${c.shield.left} s left`);
    for (let i = 0; i < 7.9 * 60; i++) c.update(1 / 60);
    assert.ok(c.shield, 'still up just before the strength ends');
    for (let i = 0; i < 0.3 * 60; i++) c.update(1 / 60);
    assert.equal(c.shield, null, 'out when the strength is gone');
    assert.ok(events.voice.some((t) => /мана кончилась/.test(t)));
    // then the strength comes back as usual
    const f0 = c.fatigue;
    for (let i = 0; i < 60; i++) c.update(1 / 60);
    assert.ok(c.fatigue > f0 + 0.9);
});

test('Protection: a sharp jerk of the shield arm puts it out; a small move does not; «стоп» does', () => {
    const { g, combat: c } = fakeGame({ armOut: 'right' });
    const jerk = { left: [], right: [] };
    g.duel = { jerk };
    c.castProtection(false);
    const move = (dist, secs) => {
        // the hand's last positions as the duel keeps them ({t, x, y, z})
        for (let i = 0; i <= secs * 30; i++) {
            jerk.right.push({ t: (jerk.right.length) / 30, x: Math.min(1, i / (secs * 30)) * dist, y: 0, z: 0 });
            c.update(1 / 30);
        }
    };
    move(0, 1); // held still for a second
    move(0.6, 0.3); // a small move of the hand
    assert.ok(c.shield, 'a small move does not drop it');
    jerk.right.length = 0;
    move(1.9, 0.2); // a sharp jerk
    assert.equal(c.shield, null, 'a jerk drops it');
    // «стоп» drops it too
    const { combat: c2 } = fakeGame({ armOut: 'right' });
    c2.castProtection(false);
    assert.equal(c2.dropShield(), true);
    assert.equal(c2.shield, null);
    assert.equal(c2.dropShield(), false, 'nothing to drop');
});

test('Protection Maxima: needs a T-pose, dome for 5 s blocks every direction, costs 20', () => {
    const { combat } = fakeGame({ armOut: 'both', tPose: false });
    assert.match(combat.castProtection(true), /буква T|T/);
    const { combat: c } = fakeGame({ armOut: 'both', tPose: true });
    assert.equal(c.castProtection(true), null);
    assert.equal(c.fatigue, 10);
    assert.equal(c.shield.left, 5, 'the dome lasts 5 seconds');
    assert.equal(c.hitBySpell('Thunderwave', FRONT, 'enemy'), false);
    assert.equal(c.hitBySpell('Thunderwave', BEHIND, 'enemy'), false);
    assert.equal(c.hp, 20);
    c.explosion(new THREE.Vector3(1, 1, 1), 6.2, 3, 'enemy'); // Bombardo Maxima right next to me (would kill)
    assert.ok(c.hp >= 13, `dome takes 75% (hp ${c.hp})`);
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
    // a punch on a frozen player (full 20 HP) kills
    assert.equal(combat.hp, 20);
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
    assert.equal(combat.hp, 19, 'normal hit again');
    const { combat: c } = fakeGame();
    c.castProtection(false);
    assert.equal(c.chillBy(0.5, FRONT, 'enemy'), false, 'beam blocked');
    assert.equal(c.chill, 0);
});

test('own Bombardo does not hurt me; creative mode has no PvP', () => {
    const { combat } = fakeGame();
    combat.explosion(new THREE.Vector3(0, 1, 0), 3.6, 1, 'me'); // (my own blast: Game.applyExplosion decides)
    assert.equal(combat.hp, 20);
    const { g } = fakeGame();
    g.config.mode = 'creative';
    const c = new Combat(g);
    assert.equal(c.enabled, false);
    assert.equal(c.check('BombardoMaxima'), null, 'no fatigue in creative');
    c.hitBySpell('Sapira', FRONT, 'enemy');
    assert.equal(c.hp, 20);
});

test('Bombardo damage depends on the distance: point-blank kills, the edge barely hurts', async () => {
    const { bombardoDamage } = await import('../../src/game/Combat.js');
    assert.ok(bombardoDamage(0, 3.6, 1) >= PVP.MAX_HP, 'point-blank Bombardo kills');
    assert.ok(bombardoDamage(0, 6.2, 3) > bombardoDamage(0, 3.6, 1), 'Maxima is stronger');
    const mid = bombardoDamage(2, 3.6, 1), far = bombardoDamage(5.5, 3.6, 1);
    assert.ok(mid > 5 && mid < 15, `2 m away: ${mid}`);
    assert.ok(far < 1, `at the edge: ${far}`);
    assert.equal(bombardoDamage(7, 3.6, 1), 0, 'out of reach');
});

test('shields work and show in every mode (creative too), without fatigue', () => {
    const { g } = fakeGame({ armOut: 'right' });
    g.config.mode = 'creative';
    const c = new Combat(g);
    assert.equal(c.castProtection(false), null);
    assert.ok(c.shield && c.visuals, 'shield + its visuals');
    c.update(0.1);
    assert.ok(c.visuals.hand.visible, 'the blue shield is visible');
    assert.equal(c.fatigue, 30);
    for (let i = 0; i < 40; i++) c.update(0.1);
    assert.ok(c.shield, 'no strength rules here: it holds until «стоп» or a jerk');
    assert.equal(c.fatigue, 30, 'and costs nothing');
    c.dropShield();
    c.update(0.1);
    assert.equal(c.shield, null);
    assert.equal(c.visuals.hand.visible, false);
});

test('voice: «Escape» means Earthquake, «Сандер вейв» is Thunderwave (not Sand)', () => {
    for (const w of ['escape', 'Эскейп', 'earthquake']) assert.equal(matchSpell(w), 'Earthquake', w);
    assert.equal(matchSpell('escape maxima'), 'EarthquakeMaxima');
    for (const w of ['thunder wave', 'Сандер вейв', 'тандер вейв', 'sander wave']) assert.equal(matchSpell(w), 'Thunderwave', w);
    assert.equal(matchSpell('sand'), 'Sands');
});

test('voice: water spells «Wave Attack» / «Air Bubble» (+ Максима)', () => {
    for (const w of ['wave attack', 'Вейв атак', 'вэйв аттак']) assert.equal(matchSpell(w), 'WaveAttack', w);
    assert.equal(matchSpell('wave attack maxima'), 'WaveAttackMaxima');
    for (const w of ['air bubble', 'эйр бабл', 'Эйр баббл']) assert.equal(matchSpell(w), 'AirBubble', w);
    assert.equal(matchSpell('эйр бабл максима'), 'AirBubbleMaxima');
    assert.equal(matchSpell('thunder wave'), 'Thunderwave');
});

test('voice: «Атак» and «Rescue»; wand words', () => {
    for (const w of ['атак', 'attack', 'Аттак']) assert.equal(matchSpell(w), 'Attack', w);
    for (const w of ['rescue', 'Рескью']) assert.equal(matchSpell(w), 'Rescue', w);
    assert.equal(matchSpell('wave attack'), 'WaveAttack');
    assert.equal(matchSpell('люмос максима'), 'LumosMaxima');
    assert.equal(matchSpell('раскрой свои секреты'), 'Reveal');
    assert.equal(matchSpell('латин вратин'), 'Draw');
});

test('voice: «Breakthrough» (+ Максима)', () => {
    for (const w of ['breakthrough', 'Брейкфру', 'брейк сру']) assert.equal(matchSpell(w), 'Breakthrough', w);
    assert.equal(matchSpell('breakthrough maxima'), 'BreakthroughMaxima');
});

test('Protection: saying it again while holding costs nothing more; a magic blade breaks it for good', () => {
    const { combat: c } = fakeGame({ armOut: 'right' });
    c.castProtection(false);
    assert.equal(c.fatigue, 25);
    assert.equal(c.castProtection(false), null);
    assert.equal(c.fatigue, 25, 'not paid twice');
    c.meleeHit(1, 'enemy', true);
    c.update(1 / 60);
    assert.equal(c.shield, null, 'broken, and it does not come back from the strength left');
});

test('«стоп» / stop are the stop word; spells held in the hands (flames, beams) of that caster end, others stay', async () => {
    for (const w of ['стоп', 'Стоп!', 'stop', 'STOP']) assert.equal(matchSpell(w), 'Stand', w);
    const { SpellManager } = await import('../../src/fx/SpellManager.js');
    const sm = Object.create(SpellManager.prototype);
    sm.spells = [];
    let ended = 0;
    sm.spells.push({ life: 3, held: true, by: 'a', onEnd: () => ended++ }, { life: 3, held: true, by: 'b' }, { life: 3, by: 'a' });
    assert.equal(sm.stopBy('a'), true);
    sm.update(0.01);
    assert.equal(ended, 1, 'a\'s flames ended');
    assert.equal(sm.spells.length, 2, 'b\'s and a one-shot spell remain');
    assert.equal(sm.stopBy('a'), false, 'nothing more of a\'s');
});
