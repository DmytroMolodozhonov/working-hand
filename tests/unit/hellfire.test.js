import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HELLFIRE, Hellfire, hellfireBlock, hellfireCanStop, leftStrength, hellfireDrain, blazeReach, blazeRadius, inBlaze, inRing, ringRadius, ringSize } from '../../src/game/Hellfire.js';
import { SPELL_COST, Combat } from '../../src/game/Combat.js';
import { Mana } from '../../src/game/Mana.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('Hellfire: the words (English, and as the Russian recognizer writes them)', () => {
    for (const t of ['Let the Hellfire Come', 'let the hellfire come', 'Hellfire come', 'Come, hellfire', 'лет зе хеллфаер кам',
        'лет зе хелфайр кам', 'хэлфайр кам', 'хеллфайер кам', 'лет зэ хелл фаер кам', 'кам хелфаир', 'лет зе хеллфаер', 'Да придёт адский огонь',
        // (as a real recognizer also writes it: «hell» softened or lost, «let's», «fer»)
        'лец зе хель фаер кам', 'летс зе хил файр кам', 'лет зе хелфер кам', 'лет зе фаер кам', 'лед зе хелл фаер камэ', 'зе хелфаер кам']) {
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
    assert.equal(matchSpell('лет зе фаер'), null, '«let the fire…» waits for «come» — never a campfire');
    assert.equal(matchSpell('лед'), 'Ice');
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

test('Hellfire: the first real burn gives +20 to the mana maximum — only once', () => {
    const g = fakeGame();
    const c = g.combat;
    c.maxFatigue = 100; c.fatigue = 100;
    g.hellfire.cast(true);
    run(g, 1);
    assert.equal(c.maxFatigue, 100, 'nothing burnt yet: no reward');
    g.fire.lit = 1; // (a tree catches fire)
    run(g, 0.5);
    const after = c.maxFatigue;
    assert.equal(after, 120, '+20 the first time');
    g.hellfire.stop();
    g.hellfire._endAt = -99;
    c.fatigue = 100;
    g.hellfire.cast(true);
    g.fire.lit = 1;
    run(g, 0.5);
    assert.equal(c.maxFatigue, after, 'the second time: nothing');
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

test('Hellfire: «стоп» costs 50 mana; without 50 it burns on until the mana runs out', () => {
    assert.equal(HELLFIRE.STOP_COST, 50);
    assert.equal(hellfireCanStop({ enabled: true, mana: 49 }), false);
    assert.equal(hellfireCanStop({ enabled: true, mana: 50 }), true);
    assert.equal(hellfireCanStop({ enabled: false, mana: 0 }), true, 'Creative: free');
    const g = fakeGame();
    const c = g.combat;
    c.maxFatigue = 200; c.fatigue = 200;
    g.hellfire.cast(true);
    run(g, 0.5);
    c.fatigue = 40;
    assert.equal(g.hellfire.sayStop(), 'mana', 'not enough mana to stop it');
    assert.ok(g.hellfire.busy, 'it burns on');
    c.fatigue = 100;
    assert.equal(g.hellfire.sayStop(), true);
    assert.equal(c.fatigue, 50, '50 mana for «стоп»');
    assert.equal(g.hellfire.busy, false);
});

test('Hellfire: stopped (or out of mana), it leaves fires that burn on ≥ 30 s where it was — no growing, no following the hand', () => {
    assert.equal(leftStrength(0), 1);
    assert.equal(leftStrength(30), 1);
    assert.ok(leftStrength(33) > 0 && leftStrength(33) < 1);
    assert.equal(leftStrength(40), 0);
    const g = fakeGame('creative');
    g.hellfire.cast(true);
    run(g, 2);
    g.hellfire.stop('stop');
    const L = g.hellfire.left;
    assert.ok(L.length >= 1, 'fires left on the ground');
    const at = L[0].c.clone(), R0 = L[0].R;
    // the hand points elsewhere now: the left fire stays put and never grows
    g.character.getPointingDirection = (side, out = new THREE.Vector3()) => out.set(1, 0, 0);
    run(g, 29.5, 0.5);
    assert.ok(g.hellfire.left.length >= 1, 'still burning after 29.5 s');
    assert.ok(g.hellfire.left[0].c.distanceTo(at) < 1e-6, 'it does not move');
    assert.ok(g.hellfire.left[0].R <= R0 + 1e-6, 'it does not grow');
    run(g, 10, 0.5);
    assert.equal(g.hellfire.left.length, 0, 'then it dies down');
});

test('Hellfire: the fire left on the ground burns the caster who walks into it; out of mana leaves fires too', () => {
    const g = fakeGame();
    const c = g.combat;
    c.maxFatigue = 200; c.fatigue = 82;
    g.hellfire.cast(true);
    run(g, 2);
    assert.equal(g.hellfire.busy, false, 'the mana ran out');
    assert.ok(g.hellfire.log.some((e) => e.ev === 'out' && e.why === 'mana'));
    const f = g.hellfire.left[0];
    assert.ok(f, 'fires left after the mana ran out');
    g.character.group.position.set(f.c.x, f.c.y + 0.5, f.c.z);
    const hp0 = c.hp;
    run(g, 1.5);
    assert.ok(c.hp < hp0, `walked into it: burnt (${hp0} → ${c.hp})`);
});

test('Hellfire: every full turn of the hand spreads the ring further out — wider, a thicker wall, more serpents (up to a limit)', () => {
    let prev = ringSize(3, 0);
    for (let n = 1; n <= HELLFIRE.TURNS_MAX; n++) {
        const r = ringSize(3, n);
        assert.ok(r.rr > prev.rr && r.w > prev.w && r.h > prev.h && r.serpents > prev.serpents, `turn ${n} bigger`);
        prev = r;
    }
    assert.deepEqual(ringSize(3, 100), ringSize(3, HELLFIRE.TURNS_MAX), 'a sensible maximum');
    assert.equal(ringSize(3, 2.9).turns, 2, 'only full turns count');
    // the damage area grows with it: a body far out is in the big ring, not the small one
    const me = { x: 0, y: 2, z: 0 }, big = ringSize(3, 8), small = ringSize(3, 0);
    const far = { x: big.rr, y: 1, z: 0 };
    assert.ok(inRing(me, big.rr, far, 0.5, big.w, big.h));
    assert.ok(!inRing(me, small.rr, far, 0.5, small.w, small.h));
    // (a body right outside the thick wall is still in it — the flames reach further out)
    assert.ok(inRing(me, big.rr, { x: big.rr + big.w / 2, y: 1, z: 0 }, 0.3, big.w, big.h));
});

test('Hellfire: the real hand going round — the ring grows turn after turn, mana still 2 a second', () => {
    const g = fakeGame();
    const c = g.combat;
    c.maxFatigue = 500; c.fatigue = 500;
    let t = 0;
    // the wand hand circling in front of the body: one turn a second
    g.character.getHandWorldPosition = (side, out = new THREE.Vector3()) => out.set(0.25 + Math.cos(t * Math.PI * 2) * 0.3, 1.6 + Math.sin(t * Math.PI * 2) * 0.3, -0.5);
    g.hellfire.cast(true);
    const step = 1 / 30;
    const sizes = [];
    for (let i = 0; i < 30 * 9; i++) {
        t += step;
        c.update(step); g.hellfire.update(step);
        if (i % 30 === 29) sizes.push(g.hellfire.state.rr);
    }
    const s = g.hellfire.state;
    assert.ok(s.k > 0.9, 'the fire is a ring');
    const grows = g.hellfire.log.filter((e) => e.ev === 'grow');
    assert.ok(grows.length >= 5, `it spread out turn after turn: ${JSON.stringify(grows)}`);
    for (let i = 1; i < grows.length; i++) assert.ok(grows[i].rr > grows[i - 1].rr);
    assert.ok(sizes[sizes.length - 1] > sizes[1] + 4, `metres wider: ${sizes.map((x) => x.toFixed(1)).join(' → ')}`);
    assert.ok(Math.abs((500 - 80 - 2 * 9) - c.fatigue) < 0.2, `2 a second while held: ${c.fatigue}`);
});

test('Hellfire on castle knights: a raised shield and armour only slow the burn — the hearts still go down fast', async () => {
    const { CastleLife } = await import('../../src/game/CastleLife.js');
    const cl = Object.create(CastleLife.prototype);
    const noop = () => {};
    Object.assign(cl, { game: { authority: true, fx: { spark: noop } }, _flash: noop, _die: noop, _say: noop, _offence: noop });
    const knight = () => ({ id: 1, role: 'knight', hp: 20, armor: 50, x: 0, z: 0, yaw: 0, foe: 'p1', mode: 'block', model: { shield: {} }, damageCooldown: 0 });
    // (yaw 0 faces −z: the fire is in front of him, at z = −3; the burn comes from there: dir +z)
    const dir = new THREE.Vector3(0, 0, 1);
    const k = knight();
    for (let i = 0; i < 16; i++) cl.hit(k, HELLFIRE.CREATURE_DMG, dir, 'p1', { spell: true, magic: true, fire: true }); // (4 s in the fire)
    assert.ok(k.hp <= 0, `a shielded knight in armour burns to death in ~4 s: ${k.hp} HP, armour ${k.armor}`);
    const old = knight();
    for (let i = 0; i < 16; i++) cl.hit(old, HELLFIRE.CREATURE_DMG, dir, 'p1', { spell: true, magic: true });
    assert.ok(old.hp > 15, '(an ordinary blow still mostly stops on the shield and the armour)');
    assert.ok(k.shieldHeat > 2.5, 'the shield got hot');
});

test('Hellfire: its heat burns creatures near it (not only in it), they fear it, its breath pushes them back', () => {
    const g = fakeGame('creative');
    const hits = [], fears = [], pushes = [];
    const v = { id: 7 };
    g.duel = {
        _bodies: () => [{ kind: 'v', id: 7, a: new THREE.Vector3(0, 0, -11), b: new THREE.Vector3(0, 2, -11), r: 0.4 }],
        _creature: () => v,
    };
    g.castleLife = { hit: (cr, dmg, dir, by, opts) => hits.push({ dmg, opts }), fear: (cr, x, z, heat) => fears.push(heat) };
    g.creatureImpact = { apply: (c, o) => pushes.push(o) };
    g.hellfire.cast(true);
    const s = g.hellfire.state;
    run(g, 0.1);
    // the blaze a little way from the knight: he is outside it, but in its heat
    s.c.set(0, 1, -6); s.R = 3; s.k = 0;
    hits.length = 0;
    g.hellfire._burn('me', s, g.character.group.position);
    assert.equal(hits.length, 1, 'the heat reaches him');
    assert.ok(hits[0].dmg > 0 && hits[0].dmg < HELLFIRE.CREATURE_DMG && hits[0].opts.fire, `less than in it: ${hits[0].dmg}`);
    assert.ok(fears.length >= 1, 'he fears the fire');
    // in it: the full burn and a push away
    s.c.set(0, 1, -10); hits.length = 0; s.pushT = 0;
    g.hellfire._burn('me', s, g.character.group.position);
    assert.equal(hits[0].dmg, HELLFIRE.CREATURE_DMG);
    assert.ok(pushes.length >= 1 && pushes[pushes.length - 1].v.z < 0, 'thrown back, away from the fire');
    // far away: nothing
    s.c.set(0, 1, 40); hits.length = 0; fears.length = 0;
    g.hellfire._burn('me', s, g.character.group.position);
    assert.equal(hits.length + fears.length, 0);
});
