import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SoulSeal } from '../../src/game/SoulSeal.js';
import { SOUL_SEAL as S, SEAL_CHANCE, knowsSoulSeal, sealable, SEALED_WHY } from '../../src/game/SoulSealRules.js';
import { DeathSystem, DEATH } from '../../src/game/Death.js';
import { NetSync } from '../../src/net/NetSync.js';
import { Game } from '../../src/game/Game.js';
import { Savior } from '../../src/game/Savior.js';

function world() {
    const messages = [], states = new Map(), marks = new Map();
    const g = { authority: true, localId: 'H', active: true, scene: new THREE.Scene(), character: { group: new THREE.Group() }, remotes: new Map(),
        collision: { groundAt: () => 0 }, net: { pid: 'owner', isHost: true, players: new Map([['guest', { pid: 'owner' }]]), sendTo: (to, m) => messages.push({ to, ...m }) },
        hud: { setVoice: s => messages.push(s) }, items: { loose: new Map(), removeLoose(id) { this.loose.delete(id); } }, weapons: { byId: new Map() },
        pentagranium: { marks, _place(id, by, pent, x, y, z, r) { const m = { id, by, pent, x, y, z, r }; marks.set(id, m); return m; }, _permanent(m) { m.perm = true; }, _useFx() {} },
        sync: { pentagram(m) { messages.push(m); }, itemGone(id) { messages.push({ gone: id }); } } };
    g.sync.net = g.net; g.net.send = m => messages.push(m);
    const life = { game: g, byId: new Map(), state(id) { if (!states.has(id)) states.set(id, {}); return states.get(id); }, _say() {}, _ground(v) { v.y = 0; }, _sees: () => true, _playerPos: () => null,
        _goSpot(v, x, z, speed, dt) { const d = Math.hypot(x - v.x, z - v.z), k = Math.min(1, speed * dt / d); v.x += (x - v.x) * k; v.z += (z - v.z) * k; } };
    const seals = new SoulSeal({ game: g, life });
    const death = g.death = new DeathSystem(g);
    const addMage = (id = 'master') => { const v = { id, wizard: true, role: 'master', rank: 'master', cs: { def: { id: 'site' } }, mana: 200, fx: 0, x: 0, y: 0, z: 0 }; life.byId.set(id, v); return v; };
    const body = ({ level = 5, witness = null, bones = false } = {}) => {
        if (witness) seals.witness('guest', [witness]);
        const b = { id: 'body', k: 'p', who: 'guest', x: 1, y: 0, z: 0, age: bones ? DEATH.BODY_S + 1 : 0, lg: { owner: 'owner', dark: { level, skin: 0 } }, equipment: { items: ['mine'], weapons: [] } };
        death.addBody(b, new THREE.Group());
        return b;
    };
    const run = (v, seconds) => { for (let i = 0; i < seconds * 10; i++) { seals.update(0.1); seals.think(v, 0.1); } };
    return { g, life, seals, death, addMage, body, run, marks, messages, states, close: () => death.dispose() };
}

test('knowledge chances are stable per wizard and use rank, while level five means real darkness rather than skin', () => {
    for (const [rank, chance] of Object.entries(SEAL_CHANCE)) {
        let count = 0;
        for (let i = 0; i < 4000; i++) { const v = { id: 'wiz' + i, role: 'wanderer', rank }; count += knowsSoulSeal(v); assert.equal(knowsSoulSeal(v), knowsSoulSeal({ ...v })); }
        assert.ok(Math.abs(count / 4000 - chance) < 0.025, `${rank}: ${count}`);
    }
    assert.equal(sealable({ k: 'p', lg: { dark: { level: 4, skin: 4 } } }), false);
    assert.equal(sealable({ k: 'p', lg: { dark: { level: 5, skin: 0 } } }), true);
});

test('unwitnessed lone fights never produce a ritual, nor does a dead witness', () => {
    const w = world();
    try {
        const v = w.addMage(), b = w.body(); w.run(v, 120);
        assert.equal(w.marks.size, 0); assert.equal(b.seal, undefined);
        w.seals.witness('guest', [v]); v.dead = true;
        const late = { ...b, id: 'late' }; w.seals.onBody(late);
        assert.deepEqual(late.witnesses, []);
    } finally { w.close(); }
});

for (const bones of [false, true]) test(`a witnessed ${bones ? 'skeleton' : 'body'} takes ninety seconds and separate mana payments; only its belongings are collected`, () => {
    const w = world();
    try {
        const v = w.addMage(), b = w.body({ witness: v, bones });
        for (const uid of ['mine', 'innocent']) w.g.items.loose.set(uid, { item: { kind: 'scroll', uid }, model: { position: new THREE.Vector3(1, 0, 0) } });
        w.run(v, 1);
        assert.equal(v.mana, 150); assert.equal(w.marks.size, 1);
        assert.equal(b.seal, undefined);
        w.run(v, 88); assert.equal(b.seal, undefined, 'not instant and not shorter than a minute');
        w.run(v, 2);
        assert.equal(v.mana, 75); assert.ok(b.seal && b.lg);
        assert.ok(w.marks.values().next().value.perm, 'drawing remains');
        assert.equal(w.g.items.loose.has('mine'), false); assert.equal(w.g.items.loose.has('innocent'), true);
        assert.equal(w.seals.takeLoot(v)[0].uid, 'mine', 'collected things remain recoverable from the NPC');
        assert.equal(w.death.takeLegacy(b), false); assert.ok(b.lg);
        assert.ok(w.messages.includes(SEALED_WHY));
        const snapshot = w.death.snapshot(), restored = new DeathSystem({ scene: new THREE.Scene() });
        try { restored.restore(snapshot); assert.deepEqual(restored.bodies.get(b.id).seal, b.seal); } finally { restored.dispose(); }
    } finally { w.close(); }
});

test('combat, lifting the body and death interrupt the rite and a surviving witness may take over', () => {
    const w = world();
    try {
        const v = w.addMage(), other = w.addMage('other'); w.seals.witness('guest', [other]);
        const b = w.body({ witness: v });
        w.run(v, 20); v.dead = true;
        w.seals.update(1);
        assert.equal(b.sealWorker, other.id);
        assert.equal(other.mana, 200, 'handoff has not charged another drawing');
        w.run(other, 10); assert.equal(other.mana, 200, 'existing drawing is reused');
        b.lev = true; w.seals.think(other, 0.1); assert.equal(other.soulTask, null);
        b.lev = false; other.foe = 'attacker'; w.g.remotes.set('attacker', { position: new THREE.Vector3() });
        w.life._playerPos = () => ({ x: 2, y: 2, z: 0 }); w.seals.update(1);
        assert.equal(other.soulTask, null); assert.equal(b.seal, undefined);
    } finally { w.close(); }
});

test('creation and use need not fit in one mana store; an idle mage regenerates before paying the rite', () => {
    const w = world();
    try {
        const v = w.addMage(), b = w.body({ witness: v }); v.maxMana = 100; v.mana = 50;
        w.run(v, 1); assert.equal(v.mana, 0);
        for (let i = 0; i < 910; i++) { v.mana = Math.min(v.maxMana, v.mana + 0.1); w.seals.think(v, 0.1); }
        assert.ok(b.seal); assert.ok(v.mana < 20);
    } finally { w.close(); }
});

test('a Saviour who personally witnessed the crime stays for the ritual, then leaves instead of attacking the new life', () => {
    const w = world();
    try {
        w.g.castleLife = w.life;
        const v = w.addMage(); v.savior = 0; v.fly = true;
        const b = w.body({ witness: v }), savior = new Savior(w.g); savior.v = v; savior.foe = 'guest';
        let left = 0; savior._leave = () => { left++; savior.v = null; };
        savior.playerDied('guest');
        assert.equal(savior.v, v); assert.ok(v.soulTask); assert.equal(v.fly, false);
        savior.update(1); assert.equal(left, 0);
        w.run(v, 92); assert.ok(b.seal);
        savior.update(1); assert.equal(left, 1);
    } finally { w.close(); }
});

test('a late guest cannot restore a sealed life; host reservations serialize a claim against the ritual', () => {
    const w = world();
    try {
        const v = w.addMage(), b = w.body({ witness: v });
        w.g.remotes.set('guest', { position: new THREE.Vector3(1, 2, 0) });
        w.death.claims.host({ id: b.id, from: 'guest', rq: 1 });
        assert.equal(w.messages.at(-1).ok, true);
        assert.equal(w.seals.finish(b, v.id, 'mark'), false, 'a granted claim wins before the rite');
        w.death.claims.host({ id: b.id, from: 'guest', rq: 1, cancel: 1 });
        assert.equal(w.seals.finish(b, v.id, 'mark'), true);
        w.death.claims.host({ id: b.id, from: 'guest', rq: 2 });
        assert.equal(w.messages.at(-1).ok, false); assert.ok(w.messages.at(-1).seal);
        assert.equal(w.death.onNetLegacy(b.id, 'guest'), false); assert.ok(b.lg);
    } finally { w.close(); }
});

test('a guest pays and restores power only after the real network handlers receive host approval, once', () => {
    const w = world(), outgoing = []; let paid = 0;
    const g = { active: true, authority: false, localId: 'guest', scene: new THREE.Scene(), character: { group: new THREE.Group() },
        net: { isClient: true, isHost: false, localId: 'guest', pid: 'owner', send: m => outgoing.push(m) },
        hud: { setVoice() {}, update() {} }, bonus: { hp: 0, fatigue: 0 }, books: { learned: new Set() },
        combat: { check: () => null, pay() { paid++; } }, dark: { level: 0, skin: 0, onDeath() {}, restore(s) { this.level = s.level; this.skin = s.skin; } } };
    const client = Object.assign(Object.create(NetSync.prototype), { game: g, net: g.net });
    const host = Object.assign(Object.create(NetSync.prototype), { game: w.g, net: w.g.net });
    g.sync = client; g.death = new DeathSystem(g); g._finishGiveMyPower = Game.prototype._finishGiveMyPower;
    try {
        const b = w.body(); b.lg.spells = ['LightningStrike'];
        w.g.remotes.set('guest', { position: new THREE.Vector3(1, 2, 0) });
        w.g.remotes.get('guest').position.set(100, 2, 100); // the latest pose is still waiting behind a congested channel
        g.death.restore(w.death.snapshot());
        const copy = g.death.bodies.get(b.id);
        g.death.claims.request(copy);
        assert.equal(paid, 0); assert.equal(g.bonus.spells, undefined);
        host._onMessage({ ...outgoing.shift(), from: 'guest' });
        const ack = w.messages.find(m => m.t === 'dlack');
        assert.equal(ack.ok, true);
        client._onMessage({ ...ack, from: 'H' });
        client._onMessage({ ...ack, from: 'H' });
        assert.equal(paid, 1); assert.equal(g.bonus.spells.LightningStrike, true);
        assert.equal(copy.lg, undefined);
        assert.ok(b.lg, 'host keeps the record reserved until the successful restore is acknowledged');
        host._onMessage({ t: 'dblg', id: b.id, from: 'intruder' });
        assert.ok(b.lg, 'another guest cannot clear the owner’s record');
        host._onMessage({ ...outgoing.find(m => m.t === 'dblg'), from: 'guest' });
        assert.equal(b.lg, undefined);
    } finally { g.death.dispose(); w.close(); }
});
