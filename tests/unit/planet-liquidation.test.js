// «Planet Liquidation» (PlanetDestroy.js, PlanetDoom.js): the words, the price (1500 + the planet's mass), the gods'
// two and the Sun never, the blast (the host takes the planet away, its rocks a new cluster — saved), who dies.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { PlanetMagic } from '../../src/game/PlanetMagic.js';
import { PlanetDestroy } from '../../src/game/PlanetDestroy.js';
import { spaceSpellBlock } from '../../src/game/Space.js';
import { PlanetRegistry, planetPosition, SPACE } from '../../src/world/Planets.js';
import { DOOM, liquidationCost, liquidationRefusal } from '../../src/world/PlanetDoom.js';
import { Combat, SPELL_COST } from '../../src/game/Combat.js';
import { Mana, GOD_SPELLS, firstSpellGain } from '../../src/game/Mana.js';
import { TEMPLE_SCROLLS, templePlan } from '../../src/world/GodsTemple.js';
import { SCROLL_SPELL_COLOR } from '../../src/game/ItemTypes.js';

test('the words: the long phrase wins over «Liquidation»', () => {
    for (const t of ['Planet Liquidation', 'Планет Ликвидейшн', 'Плэнет ликвидэйшн', 'Уничтожь планету']) assert.equal(matchSpell(t), 'PlanetLiquidation', t);
    assert.equal(matchSpell('Ликвидейшн'), 'Liquidation');
    assert.equal(matchSpell('Liquidation Maxima'), 'LiquidationMaxima');
    assert.equal(matchSpell('Create a Planet'), 'CreatePlanet');
    assert.equal(SPELL_COST.PlanetLiquidation, 1500);
    assert.ok(GOD_SPELLS.has('PlanetLiquidation') && firstSpellGain('PlanetLiquidation') === 100);
    assert.ok(SCROLL_SPELL_COLOR.PlanetLiquidation, 'only from a burnt scroll outside Creative');
    assert.equal(TEMPLE_SCROLLS[5], 'PlanetLiquidation');
    assert.equal(templePlan(1).pedestals[5].spell, 'PlanetLiquidation');
    assert.match(spaceSpellBlock('PlanetLiquidation', 'earth', 'air'), /космос/);
    assert.match(spaceSpellBlock('PlanetLiquidation', 'mars', 'air'), /космос/);
    assert.equal(spaceSpellBlock('PlanetLiquidation', 'space', 'space'), null);
});

test('the price: 1500 + the mass — small worlds tens–hundreds, Mars more, the giants thousands; bigger — dearer', () => {
    const r = new PlanetRegistry(3), add = (id) => liquidationCost(r.get(id)).mass;
    for (const id of ['pluto', 'moon', 'mercury']) assert.ok(add(id) >= 50 && add(id) < 400, `${id}: ${add(id)}`);
    assert.ok(add('mars') > add('mercury') && add('mars') < 600);
    for (const id of ['jupiter', 'saturn', 'uranus', 'neptune']) assert.ok(add(id) >= 1500 && add(id) < 10000, `${id}: ${add(id)}`);
    assert.ok(add('jupiter') > add('saturn'));
    const mars = r.get('mars'), before = add('mars');
    r.update('mars', { radius: Math.round(mars.radius * 1.3), gravity: mars.gravity * 1.3 });
    assert.ok(add('mars') > before, 'an enlarged planet is heavier');
    assert.equal(liquidationCost(r.get('pluto')).total, 1500 + add('pluto'));
});

test('never: the Earth and Venus (the gods), the Sun (a star)', () => {
    const r = new PlanetRegistry(3);
    assert.match(liquidationRefusal(r.get('earth')), /защищён силой богов/);
    assert.match(liquidationRefusal(r.get('venus')), /защищён силой богов/);
    assert.match(liquidationRefusal(r.get('sun')), /звезда/);
    for (const id of ['moon', 'mars', 'jupiter', 'pluto']) assert.equal(liquidationRefusal(r.get(id)), null, id);
});

function heroInSpace(mode = 'freeworld') {
    const reg = new PlanetRegistry(7);
    const g = {
        config: { mode }, localId: 'me', remotes: new Map(), authority: true, dom: 'right', off: 'left',
        fx: { spark() {} }, said: [], deaths: [],
        hud: { setVoice: (t) => { g.said.push(t); }, toast() {}, update() {}, setFatigue() {}, setStatus() {} },
        character: { group: { position: new THREE.Vector3() }, isArmRaised: () => true, getHandDirection: (s, v) => v.copy(g._dir) },
        _dir: new THREE.Vector3(1, 0, 0),
        castOrigin: (s, out) => out.set(SPACE.ANCHOR_X, SPACE.ORIGIN_Y, SPACE.ANCHOR_Z),
        wandSide: () => 'right', knowsSpell: () => true, onLocalDeath() {}, net: { name: 'Аня' },
    };
    g.combat = new Combat(g);
    g.mana = new Mana(g);
    g.combat.maxFatigue = 9000; g.combat.fatigue = 9000;
    const S = g.space = {
        enabled: true, realm: 'space', planets: reg, P: { x: 0, y: 0, z: 0 }, O: { x: 0, y: 0, z: 0 }, T: 1000, view: null,
        now() { return this.T; }, create(def) { return reg.add(def); }, change(id, p) { return reg.update(id, p); },
        _die: (text) => { g.deaths.push(text); g.isDeadLocal = true; },
    };
    g.at = (x, y, z) => { S.P.x = S.O.x = x; S.P.y = S.O.y = y; S.P.z = S.O.z = z; };
    g.lookAt = (q) => g._dir.set(q.x - S.P.x, q.y - S.P.y, q.z - S.P.z).normalize();
    g.planetMagic = new PlanetMagic(g);
    g.pd = new PlanetDestroy(g);
    return g;
}

test('the blast: paid 1500 + mass, gone at DOOM.T, a cluster of its rocks on its orbit (saved), who is near dies', () => {
    const g = heroInSpace(), S = g.space, reg = S.planets;
    // the Earth: the gods' shield — nothing paid
    const ep = planetPosition(reg.get('earth'), S.T, undefined, reg);
    g.at(ep.x + 8000, ep.y, ep.z); g.lookAt(ep);
    assert.equal(g.pd.cast(true), null);
    assert.match(g.said.at(-1), /защищён силой богов/);
    assert.equal(g.combat.fatigue, 9000);
    // Mars: not enough mana — the sum said, nothing happens
    const mars = reg.get('mars'), mp = planetPosition(mars, S.T, undefined, reg), cost = liquidationCost(mars);
    g.at(mp.x + 3000, mp.y, mp.z); g.lookAt(mp);
    assert.match(g.pd.panelLine(), new RegExp(`1500 \\+ ${cost.mass} = ${cost.total}`));
    g.combat.fatigue = 1000;
    assert.equal(g.pd.cast(true), null);
    assert.match(g.said.at(-1), new RegExp(`${cost.total}`));
    assert.ok(!mars.doomAt);
    // enough: cast — paid, the planet dying
    g.combat.fatigue = 9000;
    const max0 = g.combat.maxFatigue;
    assert.equal(g.pd.cast(true), 'PlanetLiquidation');
    assert.equal(mars.doomAt, S.T);
    assert.equal(g.combat.maxFatigue, max0 + 100, '+100 cells the first time');
    assert.equal(g.combat.fatigue, Math.min(g.combat.maxFatigue, 9000 - cost.total + 100));
    // a hero standing in its air is warned, then dies at the blast; the host takes it away
    g.at(mp.x + mars.radius + 100, mp.y, mp.z);
    S.T += 3; g.pd.update(0.016);
    assert.match(g.said.at(-1), /взорвётся/);
    assert.ok(reg.get('mars'), 'still there while it cracks');
    S.T = mars.doomAt + DOOM.T + 0.1; g.pd.update(0.016);
    assert.equal(g.deaths.length, 1, 'dead with it');
    assert.equal(reg.get('mars'), null, 'gone');
    const slot = mars.slot;
    assert.equal(reg.bySlot(slot), null);
    const d = reg.cluster('dbr_mars');
    assert.ok(d && !d.used && d.from === 'Марс', 'its rocks: a new meteor cluster');
    // the cluster is where the planet was going, on its orbit
    const t2 = S.T + 100, dp = planetPosition(d, t2), was = planetPosition({ ...mars, doomAt: undefined }, t2);
    assert.ok(Math.hypot(dp.x - was.x, dp.y - was.y, dp.z - was.z) < 5, 'on its orbit');
    // saved / sent: gone, its rocks there, its slot never given again
    const r2 = new PlanetRegistry(7);
    r2.applyJSON(JSON.parse(JSON.stringify(reg.toJSON())));
    assert.equal(r2.get('mars'), null);
    assert.ok(r2.cluster('dbr_mars') && !r2.cluster('dbr_mars').used);
    const id = r2.add({ name: 'Новая', a: 50000 });
    assert.notEqual(r2.get(id).slot, slot);
    // «Create a Planet» from its rocks
    g.isDeadLocal = false;
    const cp = planetPosition(d, S.T);
    g.at(cp.x + 2000, cp.y, cp.z); g.lookAt(cp);
    assert.equal(g.planetMagic.cast('CreatePlanet', true), 'CreatePlanet');
    assert.ok(reg.cluster('dbr_mars').used);
});

test('Creative: free; a created planet and the Moon may go too', () => {
    const g = heroInSpace('creative'), S = g.space, reg = S.planets;
    g.combat.enabled = false;
    const moon = reg.get('moon'), p = planetPosition(moon, S.T, undefined, reg);
    g.at(p.x + 2000, p.y, p.z); g.lookAt(p);
    assert.equal(g.pd.cast(true), 'PlanetLiquidation');
    S.T += DOOM.T + 1; g.pd.update(0.016);
    assert.equal(reg.get('moon'), null);
    assert.ok(reg.cluster('dbr_moon'));
});
