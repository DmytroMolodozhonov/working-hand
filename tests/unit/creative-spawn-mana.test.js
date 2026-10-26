import test from 'node:test';
import assert from 'node:assert/strict';
import { HeroApply } from '../../src/game/HeroApply.js';
import { Combat } from '../../src/game/Combat.js';
import { normalizeHero } from '../../src/game/HeroSetup.js';
import { farTarget } from '../../src/game/SpawnSpots.js';
import { TerrainData } from '../../src/world/Terrain.js';

const make = (cells, restored = false) => {
    const hero = normalizeHero({ infiniteMana: false, cells, spawn: 'start' });
    const g = { config: { mode: 'creative', hero }, hero, _playerRestored: restored };
    g.combat = new Combat(g); return g;
};

test('a fresh Creative hero has exactly as much current mana as configured cells, not 30', () => {
    for (const cells of [30, 500, 800, 100000]) {
        const g = make(cells); new HeroApply(g).start();
        assert.equal(g.combat.maxFatigue, cells); assert.equal(g.combat.fatigue, cells);
    }
});

test('continued worlds and ordinary mana recalculation do not refill spent mana', () => {
    const g = make(800, true); g.combat.fatigue = 17; const apply = new HeroApply(g);
    apply.start(); assert.equal(g.combat.fatigue, 17);
    g.combat.fatigue = 200; apply.applyMana(); assert.equal(g.combat.fatigue, 200);
    g.config.mode = 'freeworld'; g.combat.fatigue = 25; apply.start(); assert.equal(g.combat.fatigue, 25);
});

test('city, wizard settlement and lone wizard resolve different real indexed destinations', () => {
    for (const seed of [12345, 20261015, 7]) {
        const d = new TerrainData(); d.generate({ seed, mountains: true, seas: true, lush: true, test: true });
        const city = farTarget('village', d); assert.ok(city);
        const cityDef = d.villages.spawnVillage(); assert.equal(cityDef.kind, 'wizvillage');
        const chosen = [];
        for (const id of ['magevillage', 'magehut']) {
            const t = farTarget(id, d); assert.ok(t, `${id} seed ${seed}`);
            const h = d.sites.byId(t.siteId); assert.equal(h.kind, 'hamlet'); assert.equal(h.type, id);
            assert.equal(t.x, Math.round(h.gate.x)); assert.equal(t.z, Math.round(h.gate.z));
            if (id === 'magehut') { assert.equal(h.houses.length, 1); assert.equal(!!h.fire, false); }
            else { assert.ok(h.houses.length >= 4 && h.houses.length <= 9); assert.ok(h.fire); }
            assert.deepEqual(farTarget(id, d), t);
            chosen.push(h.id);
        }
        assert.notEqual(chosen[0], chosen[1]);
    }
});

test('new destinations never substitute an ordinary village, city or hermit when the right place is absent', () => {
    const data = { sites: { hamlets: { cellOf: () => [
        { kind: 'hamlet', type: 'hermit', gate: { x: 10, z: 10 } },
        { kind: 'wizvillage', type: 'magevillage', gate: { x: 20, z: 20 } },
        { kind: 'hamlet', type: 'village', gate: { x: 30, z: 30 } },
    ] } } };
    assert.equal(farTarget('magevillage', data), null); assert.equal(farTarget('magehut', data), null);
});