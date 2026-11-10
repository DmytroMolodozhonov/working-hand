import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Cardilon } from '../../src/game/Cardilon.js';
import { cardilonCost, cardilonDelay, CARDILON_TARGETS } from '../../src/game/CardilonRules.js';
import { SpellManager, matchSpell } from '../../src/fx/SpellManager.js';
import { Combat } from '../../src/game/Combat.js';
import { START_SPELLS, knows } from '../../src/game/SpellBook.js';
import { mayCast } from '../../src/game/Concentration.js';
import { FX } from '../../src/fx/WizardFx.js';
import { WizardBlast } from '../../src/game/WizardBlast.js';
import { NetSync } from '../../src/net/NetSync.js';

function fixture(authority = true) {
    const sent = [], explosions = [], successes = [], voices = [];
    const g = { active: true, authority, localId: authority ? 'H' : 'guest', scene: new THREE.Scene(), onDeath: [], remotes: new Map(),
        hud: { setVoice: (s) => voices.push(s) }, mana: { success: (n) => successes.push(n) },
        fx: { glow: { spawn() {} }, castBurst() {}, lightFlash() {} },
        sync: { net: { players: new Map([['guest', {}]]), send: (m) => sent.push(m), sendTo: (to, m) => sent.push({ ...m, to }) } },
        castleLife: { byId: new Map(), _sees: () => true, _say() {}, _isPlayer: id => id === 'enemy' } };
    Object.assign(g.sync.net, { localId: g.localId, isHost: authority, isClient: !authority });
    g.spells = new SpellManager(g.scene, g.fx, { authoritative: () => authority, players: () => [], zombies: () => [],
        explode: (p) => explosions.push(p.clone()), success: (by, name) => successes.push(name) });
    g.combat = { game: g, fatigue: 100, maxFatigue: 100, manaOn: true, shield: { type: 1, side: 'left', left: 60, drain: 0.5 },
        center: (v) => v.set(0, 2.2, 0), shieldAt: (side, v) => v.set(-1, 2.7, 0),
        check(name, extra = 0) { return this.fatigue < this.costOf(name, extra) ? 'мало маны' : null; },
        costOf: Combat.prototype.costOf, pay: Combat.prototype.pay };
    const wizards = { game: g, life: g.castleLife, fight: { _turnTo() {} } };
    wizards.blasts = new WizardBlast(wizards); g.castleLife.wizards = wizards;
    const card = g.cardilon = new Cardilon(g);
    const bomb = (power = 1, x = -15, y = 2.2, id = 'bomb-1') => {
        g.spells.castBombardo(new THREE.Vector3(x, y, 0), new THREE.Vector3(1, 0, 0), 'enemy', power, id);
        return g.spells.spells.at(-1);
    };
    const sync = Object.assign(Object.create(NetSync.prototype), { game: g, net: g.sync.net });
    return { g, card, bomb, sent, explosions, successes, voices, receive: m => sync._onMessage(m) };
}

test('one word, known by every player without a scroll; no Maxima variant or casting through strict concentration', () => {
    for (const s of ['Cardilon', 'кардилон', 'Кардиллон', 'карделон']) assert.equal(matchSpell(s), 'Cardilon');
    for (const s of ['кардиолог', 'Cardilon Maxima', 'мы обсуждали кардилон вчера']) assert.notEqual(matchSpell(s), 'Cardilon');
    assert.ok(START_SPELLS.has('Cardilon'));
    assert.equal(knows('Cardilon', { mode: 'freeworld' }), true);
    assert.equal(mayCast('GodsShield', 'Cardilon'), false);
    assert.equal(mayCast('Duel', 'Cardilon'), false);
    assert.equal(mayCast('Levitation', 'Cardilon'), true);
    assert.ok(Object.keys(CARDILON_TARGETS).length >= 8);
});

test('actual Bombardo and Maxima are cancelled without explosion even in onEnd; 7/15 mana, shield consumed, pooled orb returned', () => {
    for (const power of [1, 3]) {
        const { g, card, bomb, explosions, successes } = fixture();
        bomb(power);
        assert.equal(card.cast(true), 'Cardilon');
        assert.equal(g.combat.fatigue, 100 - cardilonCost(power));
        assert.equal(g.combat.shield, null);
        g.spells.update(10);
        assert.equal(explosions.length, 0);
        assert.deepEqual(successes, ['Cardilon']);
        assert.equal(g.spells.spells.length, 0);
        assert.ok(g.spells.orbs.every(o => o.userData.free));
        assert.equal(card.cast(true), null, 'must raise Protection again');
        card.update(2);
        assert.ok(card.look.pool.every(e => !e.active && !e.root.visible));
        card.dispose(); assert.equal(card.look.pool.length, 0);
    }
});

test('a spoken single word intercepts before the final transcript; recognizer repeats never consume a second shield', () => {
    const { g, card, bomb } = fixture();
    bomb(); assert.equal(card.cast(false), 'Cardilon');
    g.combat.shield = { type: 1, left: 60, side: 'left' };
    const newShield = g.combat.shield;
    bomb(1, -20, 2.2, 'second');
    assert.equal(card.cast(false), null);
    assert.equal(card.cast(true), null);
    assert.equal(g.combat.shield, newShield); assert.equal(g.combat.fatigue, 93);
    assert.equal(card.cast(true), 'Cardilon', 'a new utterance may spend the new shield');
    assert.equal(g.combat.fatigue, 86);
});

test('no mana/shield/capture with a dome, gods, tentative shield, missing bomb, moving-away bomb or intervening wall', () => {
    for (const cause of ['dome', 'gods', 'tentative', 'empty', 'away', 'wall', 'mana']) {
        const { g, card, bomb } = fixture();
        if (cause !== 'empty') bomb();
        if (cause === 'dome') g.combat.shield.type = 2;
        if (cause === 'gods') g.combat.shield.gods = true;
        if (cause === 'tentative') g.combat.shield.tent = true;
        if (cause === 'away') g.spells.spells[0].bomb.v.negate();
        if (cause === 'wall') g.collision = { pointBlocked: () => true };
        if (cause === 'mana') g.combat.fatigue = 6;
        const mana = g.combat.fatigue, shield = g.combat.shield;
        assert.equal(card.cast(true), null, cause);
        assert.equal(g.combat.fatigue, mana); assert.equal(g.combat.shield, shield);
    }
});

test('guest reserves mana and shield once; only host capture confirmation ends both real projectiles, duplicate reply never pays twice', () => {
    const host = fixture(), guest = fixture(false);
    host.bomb(3); guest.bomb(3);
    host.g.remotes.set('guest', { dead: false, position: new THREE.Vector3(100, 100, 100) });
    assert.equal(guest.card.cast(true), 'Cardilon');
    assert.equal(guest.g.combat.fatigue, 85);
    assert.equal(guest.card.cast(true), null);
    host.receive({ ...guest.sent[0], from: 'guest' });
    const reply = host.sent.find(m => m.t === 'cdl' && !m.no);
    assert.ok(reply, 'cast-time position works despite a queued old pose');
    guest.receive({ ...reply, from: 'intruder' });
    assert.ok(guest.card.pending);
    guest.receive({ ...reply, from: 'H' }); guest.receive({ ...reply, from: 'H' });
    assert.equal(guest.card.pending, null);
    assert.equal(guest.g.combat.fatigue, 85);
    assert.deepEqual(guest.successes, ['Cardilon']);
    host.g.spells.update(10); guest.g.spells.update(10);
    assert.equal(host.explosions.length, 0); assert.equal(guest.explosions.length, 0);
});

test('an already exploded host bomb cannot be retroactively captured; rejected guest reservation is refunded once', () => {
    const host = fixture(), guest = fixture(false);
    host.bomb(); guest.bomb(); guest.card.cast(true);
    host.g.spells.update(10);
    assert.equal(host.explosions.length, 1);
    host.receive({ ...guest.sent[0], from: 'guest' });
    const reply = host.sent.find(m => m.no);
    guest.receive({ ...reply, from: 'H' }); guest.receive({ ...reply, from: 'H' });
    assert.equal(guest.g.combat.fatigue, 100);
    assert.ok(guest.g.combat.shield);
    assert.equal(guest.successes.length, 0);
    assert.equal(host.explosions.length, 1);
});

test('death while awaiting the host never refunds mana or restores a shield into the new life', () => {
    const { g, card, bomb, sent } = fixture(false);
    bomb(); card.cast(true); const request = sent[0];
    for (const fn of g.onDeath) fn();
    g.combat.fatigue = 30; g.combat.shield = null;
    card.onNet({ t: 'cdl', no: 1, from: 'H', rq: request.rq, id: request.id });
    assert.equal(g.combat.fatigue, 30); assert.equal(g.combat.shield, null);
});

test('NPC rank and distance matter: nearby bomb wins the race, distant bomb can be intercepted; simultaneous bombs do not reset reaction forever', () => {
    assert.ok(cardilonDelay({ rank: 'novice' }) > cardilonDelay({ rank: 'adept' }));
    assert.ok(cardilonDelay({ rank: 'adept' }) > cardilonDelay({ rank: 'teacher' }));
    assert.ok(cardilonDelay({ rank: 'teacher' }) > cardilonDelay({ rank: 'master' }));
    for (const [rank, distance, captured] of [['novice', 6, false], ['teacher', 40, true], ['novice', 45, true]]) {
        const { g, card, bomb, explosions, sent } = fixture();
        const v = { id: 'npc', wizard: true, rank, x: 0, y: 0, z: 0, yaw: Math.PI / 2, mana: 100, fx: FX.SHIELD, W: {} };
        g.castleLife.byId.set(v.id, v);
        g.spells.hooks.bodyOnWay = (a, b) => b.x >= -2 ? b.clone() : null;
        bomb(1, -distance, distance > 40 ? 6 : 2.2);
        if (rank === 'teacher') bomb(1, -45, 5, 'bomb-2');
        for (let i = 0; i < 180; i++) { card.update(0.01); g.spells.update(0.01); }
        assert.equal(sent.some(m => m.t === 'cdl'), captured, rank + ' / ' + distance);
        assert.equal(!!v.castAtPlayers?.has('enemy'), captured, 'a released Cardilon is real combat; merely raising a shield is not');
        if (!captured) assert.ok(explosions.length);
        else assert.ok(v.mana < 100);
    }
});

test('stable projectile identity and actual NPC caster are carried in the existing spell event', () => {
    const { g, bomb, sent } = fixture();
    const b = bomb();
    const sync = Object.create(NetSync.prototype); sync.game = g; sync.net = g.sync.net;
    sync.spell('Bombardo', new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 'right', 'enemy');
    assert.equal(sent[0].bid, b.bomb.id); assert.equal(sent[0].by, 'enemy');
});

test('NPC Cardilon knowledge is stable: weak 50%, middle 80%, strong and higher always', async () => {
    const { knowsCardilon } = await import('../../src/game/CardilonRules.js');
    for (const [rank, chance] of [['novice', .5], ['adept', .8], ['teacher', 1], ['elder', 1], ['master', 1], ['savior', 1]]) {
        let n = 0;
        for (let i = 0; i < 5000; i++) { const v = { id: 'mage-' + i, rank }; const k = knowsCardilon(v); assert.equal(k, knowsCardilon(v)); n += k; }
        assert.ok(Math.abs(n / 5000 - chance) < .025, rank + ': ' + n);
    }
});

test('a mage without Cardilon raises real ground against Bombardo; a knowledgeable mage prefers capture', async () => {
    const { knowsCardilon } = await import('../../src/game/CardilonRules.js');
    const { Breakthrough } = await import('../../src/game/Breakthrough.js');
    const { BLOCK } = await import('../../src/world/Terrain.js');
    for (const know of [false, true]) {
        const { g, card, bomb, sent } = fixture();
        let i = 0; while (knowsCardilon({ id: 'weak-' + i, rank: 'novice' }) !== know) i++;
        const v = { id: 'weak-' + i, wizard: true, rank: 'novice', x: 0, y: 0, z: 0, yaw: Math.PI / 2, mana: 100, fx: FX.SHIELD, W: {} };
        const edits = new Map();
        g.castleLife.byId.set(v.id, v);
        g.terrain = { data: { get: (x,L,z) => edits.get(x+','+L+','+z) ?? (L <= 0 ? BLOCK.STONE : BLOCK.AIR), topLayer: () => 0,
            set: (x,L,z,b) => edits.set(x+','+L+','+z,b) } };
        g.fx.spark = () => {}; g.builder = { _sendEdits() {} }; g.breakthrough = new Breakthrough(g);
        g.sync.spell = (...args) => sent.push({ spell: args[0], by: args[4] });
        const s = bomb(1,-40); card._npc(v,s,2);
        if (know) {
            assert.ok(sent.some(m => m.t === 'cdl')); assert.equal(g.spells.spells.filter(x => !x.bomb).length,0);
            assert.equal(v.mana,93);
        } else {
            assert.equal(s.life > 0,true,'wall does not magically erase the bomb');
            assert.equal(v.mana,90); assert.equal(v.mode,'earthrise');
            const rise = g.spells.spells.find(x => !x.bomb); assert.ok(rise);
            for (let t=0;t<3;t+=.05) rise.onUpdate(rise,.05);
            assert.ok(edits.size > 60,'host actually lays NPC terrain');
            assert.ok(sent.some(m => m.spell === 'WallRise' && m.by === v.id));
            assert.ok(v.castAtPlayers.has('enemy'));
            card._npc(v,s,2); assert.equal(v.mana,90,'one wall, not one every scan');
        }
    }
});
