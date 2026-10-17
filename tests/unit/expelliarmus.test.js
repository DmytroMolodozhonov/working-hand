/**
 * «Экспеллиармус»: a duel spell that knocks the wand (or the sword) out of the hand —
 * it flies 4–10 m off in a random direction and lands as a loose thing anyone can take.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat } from '../../src/game/Combat.js';
import { Duel, DUEL_SPELLS } from '../../src/game/Duel.js';
import { DUEL_SPELL_NAME } from '../../src/game/Mana.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { isExpelliarmus, flightVelocity, pickFlight, disarmVillager, EXPELLIARMUS } from '../../src/game/Expelliarmus.js';

test('the word: «Экспеллиармус» and how it is heard — whole words only, never ordinary talk', () => {
    for (const w of ['экспеллиармус', 'Экспелиармус!', 'экспеллиармас', 'экспелармус', 'Expelliarmus', 'expeliarmus', 'экспелли армус', 'экспилиармус', 'экспеллиармуз', 'ну экспеллиармус же'])
        assert.equal(matchSpell(w), 'Expelliarmus', w);
    for (const w of ['эксперимент', 'экспедиция', 'экспорт', 'армия', 'экспресс', 'я пел армию', 'expel', 'arms', 'spell', 'это экспертиза', 'армус'])
        assert.equal(isExpelliarmus(w), false, w);
    // the old spells still win their own words
    assert.equal(matchSpell('остолбеней'), 'Stupefy');
    assert.equal(matchSpell('даст'), 'Sands');
    assert.equal(matchSpell('айс'), 'Ice');
});

test('a duel charge of its own: crimson with a white core, the cost of «Остолбеней», mana on success', () => {
    const s = DUEL_SPELLS.Expelliarmus;
    assert.ok(s);
    assert.equal(s.name, 'Экспеллиармус');
    assert.notEqual(s.color, DUEL_SPELLS.Stupefy.color);
    assert.equal(s.coreColor, 0xffffff);
    assert.equal(SPELL_COST.Expelliarmus, SPELL_COST.Stupefy);
    assert.equal(DUEL_SPELL_NAME.Expelliarmus, 'Expelliarmus');
});

test('the throw lands 4–10 m away, a few metres up, spinning', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 50; i++) {
        const f = pickFlight(null, new THREE.Vector3(0, 10, 0), rng);
        assert.ok(f.dist >= EXPELLIARMUS.MIN && f.dist <= EXPELLIARMUS.MAX, `dist ${f.dist}`);
        // ballistic range on level ground (no drag)
        const T = 2 * f.vel.y / EXPELLIARMUS.G;
        const range = Math.hypot(f.vel.x, f.vel.z) * T;
        assert.ok(Math.abs(range - f.dist) < 1e-6, `range ${range} vs ${f.dist}`);
        const peak = f.vel.y * f.vel.y / (2 * EXPELLIARMUS.G);
        assert.ok(peak > 1.5 && peak < 4.5, `peak ${peak}`);
        assert.ok(f.spin.length() >= 10);
    }
    const { vel } = flightVelocity(6, 0);
    assert.ok(vel.z > 0 && Math.abs(vel.x) < 1e-9, 'flies towards its yaw');
});

test('a wall on the way / a long drop: another direction is taken', () => {
    // a wall along x = 2 (everything at x > 2 is behind it), the ground at y = 0 everywhere
    const col = { groundAt: () => 0, lineOfSight: (ax, ay, az, bx) => !(Math.max(ax, bx) > 2) };
    let k = 0;
    const seq = [0.25, 0.5, 0.75, 0.1, 0.9, 0.3, 0.6, 0.2, 0.4, 0.8]; // first yaw: +x (into the wall)
    const rng = () => seq[k++ % seq.length];
    const f = pickFlight({ collision: col }, new THREE.Vector3(0, 1, 0), rng);
    assert.ok(f.land.x <= 2, `landed behind the wall: ${f.land.x}`);
});

function fakeGame(mode = 'freeworld') {
    const ev = { voice: [], spawned: [], thrown: [], released: [] };
    const wandModel = { position: new THREE.Vector3(0.3, 1.2, -0.4), quaternion: new THREE.Quaternion() };
    const g = {
        config: { mode }, localId: 'me', knockback: new THREE.Vector3(), remotes: new Map(), killCount: 0, punchCount: 0, authority: true,
        weapons: { hasWeapon: () => false, hands: { right: {}, left: {} } }, fx: { spark() {}, lightFlash() {} },
        hud: { update() {}, setFatigue() {}, setStatus() {}, setFrozenOverlay() {}, damageFlash() {}, setVoice(t) { ev.voice.push(t); }, flashColor() {}, toast() {} },
        character: { group: { position: new THREE.Vector3(), rotation: { y: 0 } }, getHandWorldPosition: (s, o = new THREE.Vector3()) => o, getHandDirection: (s, o = new THREE.Vector3()) => o.set(0, 0, -1), isArmExtended: () => false, isTPose: () => false },
        playerName: () => null,
        onLocalDeath() {},
        items: {
            auth: true,
            held: { right: { item: { kind: 'wand', uid: 'w1', color: 0x123456, model: 3, power: 20, fav: 'Inferno' }, model: wandModel }, left: null },
            heldOf(kind) { for (const side of ['right', 'left']) if (this.held[side]?.item.kind === kind) return { side, ...this.held[side] }; return null; },
            releaseHand(side) { const h = this.held[side]; this.held[side] = null; ev.released.push(side); return h.item; },
            spawnLoose(item, pos, o) { ev.spawned.push({ item, pos: pos.clone(), vel: o.vel.clone(), spin: o.spin?.clone() }); return {}; },
        },
    };
    g.combat = new Combat(g);
    return { g, ev };
}
const duelOf = (g) => Object.assign(Object.create(Duel.prototype), { game: g, log: [], _t: 0, bolts: new Map(), _burst() {}, _hitBurst() {} });

test('«Экспеллиармус» on me: my wand leaves the hand and flies off — the same wand (colour, power…)', () => {
    const { g, ev } = fakeGame();
    duelOf(g).applyToMe('Expelliarmus', 'enemy');
    assert.equal(g.items.held.right, null, 'the hand is empty');
    assert.equal(ev.spawned.length, 1, 'a loose wand in the world');
    const w = ev.spawned[0];
    assert.deepEqual(w.item, { kind: 'wand', uid: 'w1', color: 0x123456, model: 3, power: 20, fav: 'Inferno' });
    assert.ok(w.vel.y > 5 && Math.hypot(w.vel.x, w.vel.z) > 2, 'thrown up and away');
    assert.ok(ev.voice.some((t) => /палочка отлетела/.test(t)));
    // a guest: the wand goes to the host as a throw (the host owns loose things)
    const b = fakeGame();
    const sent = [];
    b.g.items.auth = false;
    b.g.sync = { itemThrow: (item, p, v) => sent.push({ item, v }), duelEnd() {} };
    duelOf(b.g).applyToMe('Expelliarmus', 'enemy');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].item.uid, 'w1');
    assert.equal(b.ev.spawned.length, 0);
});

test('«Экспеллиармус» with nothing in the hands: only a push, a clear word', () => {
    const { g, ev } = fakeGame();
    g.items.held.right = null;
    duelOf(g).applyToMe('Expelliarmus', 'enemy');
    assert.equal(ev.spawned.length, 0);
    assert.ok(ev.voice.some((t) => /ничего не было/.test(t)));
});

test('«Protection» blocks it: the wand stays in the hand', () => {
    const { g, ev } = fakeGame();
    g.combat.shield = { type: 2, left: 5, side: 'right' };
    g.combat._blocked = () => { ev.blocked = true; return true; }; // (held: mana enough)
    const d = duelOf(g);
    const b = { id: 'enemy:1', by: 'enemy', spell: 'Expelliarmus', side: 'right', o: new THREE.Vector3(0, 1, -8), dir: new THREE.Vector3(0, 0, 1), front: new THREE.Vector3(0, 1, -0.5), state: 'arrived', tk: 'p', tid: 'me' };
    d.bolts.set(b.id, b);
    d._arriveAtMe(b);
    assert.ok(ev.blocked);
    assert.ok(g.items.held.right, 'still in the hand');
    assert.equal(ev.spawned.length, 0);
    // no shield: it hits
    const c = fakeGame();
    const d2 = duelOf(c.g);
    const b2 = { ...b, id: 'enemy:2' };
    d2.bolts.set(b2.id, b2);
    d2._arriveAtMe(b2);
    assert.equal(c.g.items.held.right, null);
});

test('a tower wizard loses the wand (it flies off), a knight his sword; a wanderer his staff', () => {
    const spawned = [], swords = [];
    const g = {
        items: { spawnLoose: (item, pos, o) => spawned.push({ item, vel: o.vel }) },
        weapons: { spawn: (type, p, q) => { const w = { type, velocity: new THREE.Vector3(), angularVelocity: new THREE.Vector3() }; swords.push(w); return w; }, markMagic: (w) => w },
    };
    const model = (tool) => ({ toolKind: tool, tool: null, setHeldTool(k) { this.toolKind = k; } });
    const wiz = { wizard: true, role: 'teacher', x: 0, y: 0, z: 0, model: model('wand') };
    assert.equal(disarmVillager(g, wiz, () => ({ kind: 'wand', uid: 'nw' })), 'wand');
    assert.equal(wiz.model.toolKind, 'none');
    assert.ok(wiz.noWand && wiz.lostWand.uid === 'nw');
    assert.equal(spawned.length, 1);
    assert.ok(spawned[0].vel.y > 5);
    // twice: nothing more to knock out
    assert.equal(disarmVillager(g, wiz, () => ({ kind: 'wand', uid: 'x' })), null);
    const knight = { role: 'knight', x: 0, y: 0, z: 0, model: model('sword') };
    assert.equal(disarmVillager(g, knight, null), 'sword');
    assert.ok(knight.disarmed && knight.model.toolKind === 'none');
    assert.equal(swords.length, 1);
    assert.ok(swords[0].velocity.y > 5, 'the sword flies');
    // the author: «неважно, жезл или палочка — должен выпасть»
    const wanderer = { wizard: true, role: 'wanderer', x: 0, y: 0, z: 0, model: model('staff') };
    assert.equal(disarmVillager(g, wanderer), 'wand');
    assert.equal(wanderer.model.toolKind, 'none');
    assert.ok(spawned.at(-1).item.kind === 'wand' && spawned.at(-1).item.staff, 'his staff lies on the ground (a staff-wand)');
});

test('disarming a wizard (or a knight) is an attack: the castle takes it as one — he fights back once his wand is back', () => {
    const hits = [];
    const g = {
        localId: 'me', authority: true, scene: new THREE.Scene(), remotes: new Map(), zombies: [], zombieById: new Map(),
        fx: { spark() {}, lightFlash() {} }, hud: { setVoice() {} },
        items: { spawnLoose() {} },
        creatureImpact: { spellHit() {} },
        castleLife: { wardOff: () => false, _say() {}, hit: (v, dmg, dir, by, opts) => hits.push([v.id, dmg, by, opts.kind]) },
    };
    const d = new Duel(g);
    d._burst = () => {};
    const model = (tool) => ({ toolKind: tool, tool: null, setHeldTool(k) { this.toolKind = k; } });
    const wiz = { id: 'w1', isVillager: true, wizard: true, role: 'teacher', x: 0, y: 0, z: -5, model: model('wand') };
    d.applyToCreature('Expelliarmus', wiz, 'me', new THREE.Vector3(0, 3, 0));
    assert.ok(wiz.lostWand, 'the wand flew off');
    assert.deepEqual(hits, [['w1', 0, 'me', 'Expelliarmus']], 'an offence against him by me (no damage)');
    // nothing knocked out (no wand any more): only the push, no new offence
    d.applyToCreature('Expelliarmus', wiz, 'me', new THREE.Vector3(0, 3, 0));
    assert.equal(hits.length, 1);
});
