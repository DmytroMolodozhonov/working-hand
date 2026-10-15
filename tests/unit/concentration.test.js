import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mayCast, Concentration, FREE } from '../../src/game/Concentration.js';

test('concentration: nothing held — everything may be cast', () => {
    assert.equal(mayCast(null, 'FireMaxima'), true);
    assert.equal(mayCast(null, 'Bombardo'), true);
});

test('concentration: holding the water — another spell does not work, its own words and the exceptions do', () => {
    assert.equal(mayCast('Waterball', 'FireMaxima'), false);
    assert.equal(mayCast('Waterball', 'Bombardo'), false);
    assert.equal(mayCast('Waterball', 'Maxima'), true);
    assert.equal(mayCast('Waterball', 'Frozen'), true);
    for (const n of ['Lumos', 'LumosMaxima', 'Nox', 'Stand', 'Protection', 'ProtectionMaxima']) assert.equal(mayCast('Waterball', n), true, n);
    assert.equal(mayCast('WaterVortex', 'FireMaxima'), true); // (the vortex's own «Fire Maxima»)
    assert.equal(mayCast('WaterVortex', 'AirBubble'), true);
    assert.equal(mayCast('WaterVortex', 'Levitation'), false);
    assert.equal(mayCast('Alive', 'Attack'), true);
    assert.equal(mayCast('Alive', 'Inferno'), false);
    assert.equal(mayCast('Levitation', 'Flight'), false);
    assert.equal(mayCast('Levitation', 'Flight', { hovering: true }), true);
    assert.ok(FREE.has('Stand'));
});

function fakeGame() {
    const said = [];
    const g = {
        localId: 'me', said,
        hud: { setVoice: (t) => said.push(t), setTimer() {} },
        combat: { dead: false, stunned: false, frozen: false, shield: null },
        knock: { down: false },
        water: { active: true, drop() { this.active = false; } },
        livingTrees: { n: 1, mine() { return this.n ? [1] : []; }, stopMine(why) { this.why = why; const r = this.n > 0; this.n = 0; return r; } },
        sync: { stopSpells() { g.synced = true; } },
    };
    return g;
}

test('concentration: a spell said while holding is refused with a hint (also in Creative)', () => {
    const g = fakeGame();
    g.config = { mode: 'creative' };
    const f = new Concentration(g);
    assert.equal(f.held(), 'Waterball');
    assert.equal(f.gate('FireMaxima', true), 'Waterball');
    assert.match(g.said[0], /Сначала «стоп» — вы держите «Водяной шар»/);
    assert.equal(f.gate('Lumos', true), null);
    g.water.active = false; g.livingTrees.n = 0;
    assert.equal(f.gate('FireMaxima', true), null);
});

test('concentration breaks: stunned / knocked down / dead — the water falls, the living tree stops', () => {
    for (const hit of ['stun', 'fall', 'dead']) {
        const g = fakeGame();
        const f = new Concentration(g);
        f.update();
        assert.equal(g.water.active, true);
        if (hit === 'stun') g.combat.stunned = true;
        if (hit === 'fall') g.knock.down = true;
        if (hit === 'dead') g.isDeadLocal = true;
        f.update();
        assert.equal(g.water.active, false, hit);
        assert.equal(g.livingTrees.why, 'focus', hit);
        assert.equal(g.synced, true, hit);
        assert.equal(f.held(), null, hit);
    }
});

test('concentration: lying after the fall, a new spell can be held again', () => {
    const g = fakeGame();
    const f = new Concentration(g);
    g.knock.down = true;
    f.update(); // (the fall: the water dropped)
    g.water.active = true; // (cast again while lying)
    f.update();
    assert.equal(g.water.active, true);
});

test('concentration: instant spells hold nothing; the beams\' clash holds', () => {
    const g = fakeGame();
    g.water.active = false; g.livingTrees.n = 0;
    g.accio = { active: true };
    const f = new Concentration(g);
    assert.equal(f.held(), null); // (Accio flies by itself)
    g._inDuel = () => true;
    assert.equal(f.held(), 'Duel');
    assert.equal(mayCast('Duel', 'Maxima'), true);
    assert.equal(mayCast('Duel', 'Protection'), true);
    assert.equal(mayCast('Duel', 'Bombardo'), false);
});
