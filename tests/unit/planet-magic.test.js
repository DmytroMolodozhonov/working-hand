// The gods' scrolls (PlanetMagic.js): «Create a Planet», «Enlarge Planet», «Terraform Planet»,
// «Wingardium Leviosa Super Maxima» — the words, who / what they work on, the zones from the Sun, the new
// ground's recipe, the drag on a new orbit, +100 mana cells the first time (and death takes them into the body).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { PlanetMagic, PMAGIC, planetRefusal, PLANET_TARGETS } from '../../src/game/PlanetMagic.js';
import { PlanetRegistry, planetPosition, climateAt, terraformPatch, orbitThrough, SPACE, slotRect } from '../../src/world/Planets.js';
import { planetHeight, generatePlanetChunk } from '../../src/world/PlanetSurface.js';
import { BLOCK, CHUNK, MIN_LAYER } from '../../src/world/Terrain.js';
import { Combat, SPELL_COST } from '../../src/game/Combat.js';
import { Mana } from '../../src/game/Mana.js';
import { HELD, mayCast } from '../../src/game/Concentration.js';
import { captureLegacy, wipeHero, absorbLegacy } from '../../src/game/Legacy.js';

test('the words: the four spells, never the house / castle / plain Leviosa ones', () => {
    for (const t of ['Create a Planet', 'криейт э плэнет', 'создай планету']) assert.equal(matchSpell(t), 'CreatePlanet', t);
    for (const t of ['Enlarge Planet', 'инлардж плэнет', 'увеличь планету']) assert.equal(matchSpell(t), 'EnlargePlanet', t);
    for (const t of ['Terraform Planet', 'терраформ плэнет', 'терраформируй планету']) assert.equal(matchSpell(t), 'TerraformPlanet', t);
    for (const t of ['Wingardium Leviosa Super Maxima', 'вингардиум левиоса супер максима']) assert.equal(matchSpell(t), 'LevitationSuperMaxima', t);
    assert.equal(matchSpell('вингардиум левиоса максима'), 'LevitationMaxima');
    assert.equal(matchSpell('Create a House'), 'CreateHouse');
    assert.equal(matchSpell('Water Vortex Super Maxima'), 'WaterVortexSuperMaxima');
    assert.deepEqual([SPELL_COST.CreatePlanet, SPELL_COST.EnlargePlanet, SPELL_COST.TerraformPlanet, SPELL_COST.LevitationSuperMaxima], [500, 100, 1000, 100]);
    assert.ok(mayCast('PlanetMove', 'LevitationSuperMaxima') && !mayCast('PlanetMove', 'Bombardo'), 'holding a planet: concentration');
    assert.ok(HELD.PlanetMove);
});

test('zones from the Sun: Mercury no, Venus–Mars green, the belt / Jupiter ice, Saturn / Pluto no', () => {
    const r = new PlanetRegistry(5);
    const z = (id) => climateAt(r.get(id).a);
    assert.equal(z('mercury'), null);
    assert.equal(z('venus'), 'green');
    assert.equal(z('mars'), 'green');
    assert.equal(z('jupiter'), 'ice');
    assert.equal(z('saturn'), null);
    assert.equal(z('pluto'), null);
    assert.equal(climateAt(23000), 'desert');
    // who it does not work on — with the reason
    assert.match(planetRefusal('EnlargePlanet', r.get('sun')), /Солнце/);
    assert.match(planetRefusal('LevitationSuperMaxima', r.get('earth')), /Землю/);
    assert.match(planetRefusal('EnlargePlanet', r.get('venus')), /богов/);
    assert.match(planetRefusal('TerraformPlanet', r.get('jupiter')), /нет земли/);
    assert.match(planetRefusal('LevitationSuperMaxima', r.get('moon')), /Земли/);
    assert.equal(planetRefusal('EnlargePlanet', r.get('jupiter')), null);
    assert.ok(PLANET_TARGETS.creatures && PLANET_TARGETS.things, 'creatures and things: written down as «не действует»');
});

test('a terraformed planet: its own moss, trees and water — never the Earth\'s grass; the relief the same', () => {
    const r = new PlanetRegistry(9);
    const mars = r.get('mars'), rect = slotRect(mars);
    const before = [];
    for (let i = 0; i < 40; i++) before.push(planetHeight(mars, rect.cx + i * 37, rect.cz + i * 11));
    r.update('mars', terraformPatch(mars, 'green'));
    assert.ok(mars.terraformed && mars.air === 'air' && mars.sky === 'alien');
    let grass = 0;
    for (let i = 0; i < 40; i++) {
        assert.equal(planetHeight(mars, rect.cx + i * 37, rect.cz + i * 11), before[i], 'the same relief: buildings stay standing');
        if (planetHeight.top === BLOCK.PLANET_GRASS) grass++;
        assert.notEqual(planetHeight.top, BLOCK.GRASS);
    }
    assert.ok(grass > 10, 'its own moss');
    // trees (wood and crowns) somewhere in a few chunks
    let wood = 0, leaf = 0;
    const cx0 = Math.floor(rect.cx / CHUNK), cz0 = Math.floor((rect.cz + 1500) / CHUNK);
    for (let k = 0; k < 6; k++) {
        const c = generatePlanetChunk(cx0 + k, cz0, mars, MIN_LAYER + 2);
        for (const b of c.blocks) { if (b === BLOCK.PLANET_WOOD) wood++; else if (b === BLOCK.PLANET_LEAF) leaf++; }
    }
    assert.ok(wood > 0 && leaf > 0, `trees: ${wood} ${leaf}`);
    // an ice world: the lakes solid ice, no water
    const r2 = new PlanetRegistry(9), m2 = r2.get('mars');
    r2.update('mars', terraformPatch(m2, 'ice'));
    let water = 0;
    for (let k = 0; k < 4; k++) for (const b of generatePlanetChunk(cx0 + k, cz0, m2, MIN_LAYER + 2).blocks) if (b === BLOCK.WATER) water++;
    assert.equal(water, 0, 'ice world: no liquid water');
});

test('an orbit through a point: the body is there now; the registry moves it quietly while dragged', () => {
    const t = 1234.5;
    const o = orbitThrough(30000, -18000, t);
    const p = planetPosition({ ...o, lift: 700 }, t);
    assert.ok(Math.abs(p.x - 30000) < 1 && Math.abs(p.z + 18000) < 1 && p.y === 700);
    const r = new PlanetRegistry(3);
    let n = 0;
    r.onChange(() => n++);
    r.live('pluto', { ...o, lift: 0 });
    assert.equal(n, 0, 'no rebuild while dragging');
    assert.equal(r.get('pluto').a, o.a);
});

function heroInSpace(mode = 'freeworld') {
    const reg = new PlanetRegistry(7);
    const g = {
        config: { mode }, localId: 'me', remotes: new Map(), knockback: new THREE.Vector3(), playerHP: 20, maxHP: 20,
        fx: { spark() {}, lightFlash() {} },
        hud: { update() {}, setFatigue() {}, setStatus() {}, setVoice: (t) => { g.said.push(t); }, toast() {} },
        said: [],
        character: { group: { position: new THREE.Vector3() }, isArmRaised: () => true, getHandDirection: (s, v) => v.copy(g._dir) },
        _dir: new THREE.Vector3(1, 0, 0),
        castOrigin: (s, out) => out.set(SPACE.ANCHOR_X, SPACE.ORIGIN_Y, SPACE.ANCHOR_Z),
        wandSide: () => 'right',
        duel: { _handOf: (by, side, p, d) => { p.set(SPACE.ANCHOR_X, SPACE.ORIGIN_Y, SPACE.ANCHOR_Z); d.copy(g._dir); return true; } },
        onLocalDeath() {},
        playerName: () => null,
        net: { name: 'Аня' },
    };
    g.combat = new Combat(g);
    g.mana = new Mana(g);
    g.combat.maxFatigue = 3000; g.combat.fatigue = 3000;
    const S = g.space = {
        enabled: true, realm: 'space', planets: reg, P: { x: 0, y: 0, z: 0 }, O: { x: 0, y: 0, z: 0 }, T: 1000,
        now() { return this.T; }, create(def) { return reg.add(def); }, change(id, p) { return reg.update(id, p); }, view: null,
    };
    g.at = (x, y, z) => { S.P.x = S.O.x = x; S.P.y = S.O.y = y; S.P.z = S.O.z = z; };
    g.lookAt = (q) => g._dir.set(q.x - S.P.x, q.y - S.P.y, q.z - S.P.z).normalize();
    g.pm = new PlanetMagic(g);
    return g;
}

test('«Create a Planet»: only at a meteor cluster — a lifeless planet on its orbit, the cluster gone, 500 mana, +100 cells once', () => {
    const g = heroInSpace(), S = g.space, reg = S.planets;
    const c = reg.clusters[0], cp = planetPosition(c, S.T);
    // pointing away from it: nothing (and nothing paid)
    g.at(cp.x + 5000, cp.y, cp.z);
    g._dir.set(1, 0, 0);
    assert.equal(g.pm.cast('CreatePlanet', true), null);
    assert.match(g.said.at(-1), /скопление метеоритов/);
    assert.equal(g.combat.fatigue, 3000);
    // at it
    g.lookAt(cp);
    const max0 = g.combat.maxFatigue;
    assert.equal(g.pm.cast('CreatePlanet', true), 'CreatePlanet');
    const p = reg.list.find((d) => !d.base);
    assert.ok(p, 'a new planet');
    assert.equal(p.name, 'Планета Аня');
    assert.equal(p.air, 'none');
    assert.ok(p.gravity < 0.4 && p.gravity > 0.05, 'small gravity');
    assert.ok(p.slot >= 5, 'a surface of its own');
    const pp = planetPosition(p, S.T);
    assert.ok(Math.hypot(pp.x - cp.x, pp.y - cp.y, pp.z - cp.z) < 2, 'where the cluster was');
    assert.ok(c.used && c.usedAt === S.T, 'the cluster is gone');
    assert.equal(g.combat.maxFatigue, max0 + 100, '+100 mana cells');
    assert.equal(g.combat.fatigue, Math.min(g.combat.maxFatigue, 3000 - 500 + 100));
    // saved and sent: the same planet and the used cluster elsewhere
    const r2 = new PlanetRegistry(7);
    r2.applyJSON(JSON.parse(JSON.stringify(reg.toJSON())));
    assert.equal(r2.get(p.id).name, p.name);
    assert.ok(r2.cluster(c.id).used && r2.cluster(c.id).usedAt === S.T);
    // the next one: no +100 again
    const c2 = reg.clusters[1], cp2 = planetPosition(c2, S.T);
    g.at(cp2.x + 3000, cp2.y, cp2.z); g.lookAt(cp2);
    const max1 = g.combat.maxFatigue;
    assert.equal(g.pm.cast('CreatePlanet', true), 'CreatePlanet');
    assert.equal(g.combat.maxFatigue, max1);
    assert.ok(reg.list.some((d) => d.name === 'Планета Аня 2'));
});

test('«Enlarge Planet» +30 % (and gravity), at most 3 times; «Terraform Planet» by the zone; Pluto too far until moved', () => {
    const g = heroInSpace(), S = g.space, reg = S.planets;
    const moon = reg.get('moon'), mp = planetPosition(moon, S.T, { x: 0, y: 0, z: 0 }, reg);
    g.at(mp.x + 3000, mp.y, mp.z); g.lookAt(mp);
    const r0 = moon.radius, g0 = moon.gravity;
    assert.equal(g.pm.cast('EnlargePlanet', true), 'EnlargePlanet');
    assert.equal(moon.radius, Math.round(r0 * 1.3));
    assert.ok(Math.abs(moon.gravity - g0 * 1.3) < 0.01);
    assert.ok(moon.grownAt === S.T && moon.radiusFrom === r0, 'its growth is seen');
    g.pm.cast('EnlargePlanet', true); g.pm.cast('EnlargePlanet', true);
    assert.equal(g.pm.cast('EnlargePlanet', true), null, 'the fourth time: no');
    assert.equal(moon.grown, 3);
    // terraform the Moon: the Earth's distance — green
    assert.equal(g.pm.cast('TerraformPlanet', true), 'TerraformPlanet');
    assert.equal(moon.climate, 'green');
    assert.equal(moon.air, 'air');
    // Pluto: too far — nothing paid
    const pl = reg.get('pluto'), pp = planetPosition(pl, S.T, { x: 0, y: 0, z: 0 }, reg);
    g.at(pp.x + 2000, pp.y, pp.z); g.lookAt(pp);
    const f = g.combat.fatigue;
    assert.equal(g.pm.cast('TerraformPlanet', true), null);
    assert.match(g.said.at(-1), /далеко/);
    assert.equal(g.combat.fatigue, f);
    // the Earth / Venus: never
    const ep = planetPosition(reg.get('earth'), S.T, { x: 0, y: 0, z: 0 }, reg);
    g.at(ep.x + 3000, ep.y, ep.z); g.lookAt(ep);
    assert.equal(g.pm.cast('EnlargePlanet', true), null);
});

test('«Wingardium Leviosa Super Maxima»: the planet follows the hand, stops short of another, stays on its new orbit; mana a second', () => {
    const g = heroInSpace(), S = g.space, reg = S.planets;
    const mars = reg.get('mars'), p0 = planetPosition(mars, S.T, { x: 0, y: 0, z: 0 }, reg);
    g.at(p0.x + 3000, p0.y, p0.z); g.lookAt(p0);
    assert.equal(g.pm.cast('LevitationSuperMaxima', true), 'LevitationSuperMaxima');
    assert.ok(g.pm.busy);
    const f0 = g.combat.fatigue;
    // the hand turns: the planet goes after it (slowly)
    g._dir.set(-1, 0, 0.3).normalize();
    for (let i = 0; i < 40; i++) g.pm.update(0.1);
    const p1 = planetPosition(mars, S.T, { x: 0, y: 0, z: 0 }, reg);
    assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 500, 'it moved');
    assert.ok(g.combat.fatigue < f0 - 10, 'mana while held');
    g.pm.stop('stop');
    assert.ok(!g.pm.busy);
    assert.ok(Math.abs(mars.a - Math.round(Math.hypot(p1.x, p1.z))) < 2, 'its orbit through where it was let go');
    assert.equal(mars.incl, 0);
    // never through another body: dragged at Jupiter it stops at its edge
    const jup = reg.get('jupiter');
    const t = S.T;
    const jp = planetPosition(jup, t, { x: 0, y: 0, z: 0 }, reg);
    const fix = g.pm._keepClear(mars, jp.x, jp.y, jp.z, t);
    assert.ok(fix && Math.hypot(fix.x - jp.x, fix.y - jp.y, fix.z - jp.z) >= jup.radius + mars.radius + PMAGIC.GAP - 1);
    const sun = g.pm._keepClear(mars, 100, 0, 0, t);
    assert.ok(Math.hypot(sun.x, sun.y, sun.z) >= SPACE.SUN_R + mars.radius + PMAGIC.SUN_GAP - 1, 'never into the Sun');
});

test('+100 cells: Creative gives none; death takes them into the body, «Give Me My Power» gives them back, else earned again', () => {
    const c = heroInSpace('creative');
    c.combat.enabled = false;
    assert.equal(c.mana.success('TerraformPlanet'), 0);
    const g = heroInSpace();
    g.bonus = { hp: 0, fatigue: 0, spells: { TerraformPlanet: true } };
    g.books = { learned: new Set() };
    const m0 = g.combat.maxFatigue;
    assert.equal(g.mana.success('TerraformPlanet'), 100);
    assert.equal(g.mana.success('TerraformPlanet'), 0, 'once');
    const lg = captureLegacy(g);
    g.mana.onDeath(); wipeHero(g);
    assert.equal(g.combat.maxFatigue, Math.max(30, m0 - 0), 'the cells gone with the death');
    assert.ok(!g.bonus.spells?.TerraformPlanet, 'the spell too');
    assert.ok(lg.mana.spells.includes('TerraformPlanet') && lg.mana.growth >= 100, 'in the body');
    absorbLegacy(g, lg);
    assert.equal(g.combat.maxFatigue, m0 + 100, 'back');
    assert.equal(g.mana.success('TerraformPlanet'), 0, 'counted already');
    // a death without taking it back: it can be earned again
    g.mana.onDeath(); wipeHero(g);
    assert.equal(g.mana.success('TerraformPlanet'), 100);
});
