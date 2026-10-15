// Achievements (Achievements.js): everyone who took part gets it, the bonus (+50 mana, +15 %),
// a wizards' tower needs both its Master dead and the tower down, all five → «Высший маг»
// (+300, +100 %, the suit), the suit's −40 % from spells on top of a magic robe, kept on death.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Achievements, ACH, ACH_IDS, TOWER, achBonus, towerLeft, towerSamples } from '../../src/game/Achievements.js';
import { Mana } from '../../src/game/Mana.js';
import { makeRobe, makeArchmageSuit, wornEffects, soakBlow, wornCode, ROBE_STRONG } from '../../src/game/ArmorTypes.js';

const pos = (x, y, z) => ({ x, y, z });

/** A host with remote players; what each computer was told is kept. */
function fakeGame({ remotes = [], host = true } = {}) {
    const credits = [];
    const g = {
        localId: 'me',
        authority: host,
        remotes: new Map(remotes.map((id, i) => [id, { position: pos(5 + i, 0, 0), name: id }])),
        character: { group: { position: pos(0, 0, 0) } },
        combat: {
            enabled: true, maxFatigue: 30, fatigue: 30,
            addMaxFatigue(n) { this.maxFatigue += n; this.fatigue = Math.min(this.maxFatigue, this.fatigue + n); },
        },
        sync: { achCredit: (to, k) => credits.push([to, k]), ach() {} },
        inventory: { slots: [null, null], storeItem(it) { const i = this.slots.indexOf(null); if (i < 0) return false; this.slots[i] = it; return true; } },
        hud: { notify() {}, setVoice() {} },
    };
    g.mana = new Mana(g);
    g.achievements = new Achievements(g);
    return { g, a: g.achievements, credits };
}

test('a kill counts for everyone who took part (three players at the Ice Queen), not for one who did nothing', () => {
    const { a, credits } = fakeGame({ remotes: ['p2', 'p3', 'p4'] });
    a.hit('iceQueen', 'q1', 'me');
    a.hit('iceQueen', 'q1', 'p2');
    const ids = a.killed('iceQueen', 'q1', 'p3', pos(0, 0, 0)); // p3 struck the last blow
    assert.deepEqual(ids.sort(), ['me', 'p2', 'p3']);
    assert.ok(a.done.has('iceQueen'), 'mine on my computer');
    assert.deepEqual(credits.sort(), [['p2', 'iceQueen'], ['p3', 'iceQueen']], 'the guests told');
    assert.ok(!credits.some(([id]) => id === 'p4'), 'p4 did not take part');
});

test('a blow older than 60 s does not count; near and fighting does', () => {
    const { a } = fakeGame({ remotes: ['p2', 'p3'] });
    a.hit('king', 'k1', 'p2');
    a.hits.get('king:k1').set('p2', Date.now() - ACH.WINDOW - 1000); // (long ago)
    a.fighting.set('p2', Date.now() - ACH.WINDOW - 1000);
    a.fought('p3'); // p3 fights the knights 6 m from the king
    const ids = a.killed('king', 'k1', 'me', pos(0, 0, 0));
    assert.deepEqual(ids.sort(), ['me', 'p3']);
});

test('each achievement: +50 to the mana maximum and +15 % regeneration; never twice', () => {
    const { g, a } = fakeGame();
    a.hit('spider', 's1', 'me');
    a.killed('spider', 's1', 'me', pos(0, 0, 0));
    assert.equal(g.combat.maxFatigue, 30 + ACH.MANA);
    assert.ok(Math.abs(a.regenK - 1.15) < 1e-9);
    a.gain('spider');
    assert.equal(g.combat.maxFatigue, 80, 'the same one again gives nothing');
    a.gain('dragon');
    assert.equal(g.combat.maxFatigue, 130);
    assert.ok(Math.abs(a.regenK - 1.3) < 1e-9);
});

test('a guest never decides: a kill on a guest computer awards nothing there', () => {
    const { a } = fakeGame({ host: false });
    a.hit('dragon', 'd1', 'me');
    assert.deepEqual(a.killed('dragon', 'd1', 'me', pos(0, 0, 0)), []);
    assert.equal(a.count, 0);
    a.onCredit('dragon'); // (the host says so)
    assert.ok(a.done.has('dragon'));
});

test('a wizards\' tower: pulled down without its Master dead — not counted; the Master dead, the tower standing — not counted; both — counted', () => {
    const def = { id: 'wt1', name: 'Звёздный', x: 0, z: 0, F: 0 };
    // the tower down, the Master alive
    let { a } = fakeGame({ remotes: ['p2'] });
    a.towerWrecked(def, 'p2');
    assert.equal(a.checkTower(def, 0.1), false);
    assert.equal(a.count, 0);
    // the Master dead, the tower standing
    ({ a } = fakeGame({ remotes: ['p2'] }));
    a.hit('master', 'm1', 'me');
    a.masterKilled(def, 'm1', 'me', pos(0, 0, 0));
    assert.equal(a.checkTower(def, 0.9), false);
    assert.equal(a.count, 0);
    // … then pulled down (by p2): both counted
    let credits;
    ({ a, credits } = fakeGame({ remotes: ['p2'] }));
    a.hit('master', 'm1', 'me');
    a.masterKilled(def, 'm1', 'me', pos(0, 0, 0));
    a.towerWrecked(def, 'p2');
    assert.equal(a.checkTower(def, TOWER.LEFT - 0.01), true);
    assert.ok(a.done.has('tower'));
    assert.deepEqual(credits, [['p2', 'tower']]);
    assert.equal(a.checkTower(def, 0), false, 'once');
});

test('how much of a tower stands: whole ≈ 1, two thirds of the walls gone → destroyed', () => {
    const def = { x: 100, z: -40, F: 2 };
    const cells = towerSamples(def);
    assert.ok(cells.length > 300);
    const wall = new Set(cells.map((c) => c.join(',')));
    const holes = new Set(cells.filter((_, i) => i % 20 === 0).map((c) => c.join(','))); // (windows)
    const get = (gone) => (x, L, z) => { const k = [x, L, z].join(','); return wall.has(k) && !holes.has(k) && !gone(k) ? 49 : 0; };
    assert.ok(towerLeft(def, get(() => false)) > 0.95);
    const gone = new Set(cells.filter((_, i) => i % 3 !== 0).map((c) => c.join(',')));
    assert.ok(towerLeft(def, get((k) => gone.has(k))) <= TOWER.LEFT);
    assert.equal(towerLeft(def, get(() => false), () => false), null, 'not loaded: unknown');
});

test('all five → «Высший маг»: +300 more, +100 % more, the suit comes into a slot', () => {
    const { g, a } = fakeGame();
    for (const k of ACH_IDS) a.gain(k);
    assert.ok(a.high);
    assert.equal(g.combat.maxFatigue, 30 + 5 * ACH.MANA + ACH.HIGH_MANA);
    assert.ok(Math.abs(a.regenK - (1 + 5 * ACH.REGEN + ACH.HIGH_REGEN)) < 1e-9);
    const suit = g.inventory.slots.find((it) => it?.archmage);
    assert.ok(suit && suit.kind === 'robe' && suit.magic, 'the suit is mine');
    assert.deepEqual(achBonus(5, true), { mana: 550, regen: 2.75 });
});

test('the suit: −40 % from any spell on top of a magic robe; blows as usual; seen as code 4', () => {
    const suit = makeArchmageSuit();
    const fx = wornEffects({ robe: suit });
    const robeFx = wornEffects({ robe: { ...makeRobe(true), strong: Object.keys(ROBE_STRONG) } });
    assert.equal(fx.robe, 'magic', 'the standard magic robe protection is kept');
    assert.ok(fx.archmage);
    assert.equal(soakBlow({ robe: suit }, fx, 10, 'Lightning').hp, 6);
    assert.equal(soakBlow({ robe: suit }, fx, 25, 'AvadaKedavra').hp, 15);
    assert.equal(soakBlow({ robe: suit }, fx, 10, 'cold').hp, 0, 'no cold, as a magic robe');
    assert.equal(soakBlow({ robe: suit }, fx, 10, 'animal').hp, 10, 'a beast is not a spell');
    // on top of a magic robe's own: it halves Lightning (a strong spell it softens) → the suit's ×0.6 on top
    const both = { ...robeFx, archmage: true };
    assert.equal(soakBlow({}, both, 10, 'Lightning').hp, 3);
    assert.equal(wornCode({ robe: suit }).r, 4);
});

test('death keeps the achievements: the practice-grown mana goes, the achievements\' bonus stays', () => {
    const { g, a } = fakeGame();
    g.mana.grow(20, 'spell', 'Lumos');
    a.gain('king');
    assert.equal(g.combat.maxFatigue, 30 + 20 + 50);
    g.mana.onDeath();
    assert.equal(g.combat.maxFatigue, 30 + 50);
    assert.ok(a.done.has('king'));
    // saved and loaded: the same, never twice
    const { g: g2, a: a2 } = fakeGame();
    a2.restore(a.snapshot());
    a2.restore(a.snapshot());
    assert.equal(g2.combat.maxFatigue, 80);
});
