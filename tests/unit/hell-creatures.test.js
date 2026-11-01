// Who lives in hell (the author: «in hell there is an OWL — take it away; only the creatures agreed on»): Diabolos, the Tarons, hell's gargoyle patrol
// and the players. Every other system of creatures is not born there (earthly / offEarth) and, if one got there (flew after the hero), the host takes it away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HELL_CREATURES, HELL_SYSTEMS, hellForeign, hellSweep } from '../../src/game/HellRules.js';
import { HELL, hellPlan } from '../../src/world/HellMap.js';
import { earthly, realmAt } from '../../src/world/Planets.js';
import { Owls } from '../../src/game/Owls.js';

const S = hellPlan(1).spawn;
const at = (x, z) => ({ model: { position: { x, y: 30, z } } });

test('the white list: Diabolos, the Tarons, hell\'s gargoyles and the players — nothing else', () => {
    assert.deepEqual(Object.keys(HELL_CREATURES).sort(), ['diabolos', 'hellGargoyle', 'players', 'taron']);
    for (const k of ['owls', 'phoenixes', 'animals', 'spencers', 'spiders', 'dragons', 'zombies', 'books', 'runner', 'travelers', 'canaries', 'ghosts', 'castleLife', 'wizards', 'sailors']) assert.ok(HELL_SYSTEMS[k], k);
});

test('the owl\'s fault: past the planets realmAt says «earth» — the owl took hell for the Earth; now it does not', () => {
    assert.equal(realmAt(S.x, 30, S.z), 'earth', '(why the owl came: realmAt alone)');
    assert.equal(earthly({ x: S.x, y: 30, z: S.z }), false);
    const fake = { game: { space: null } };
    assert.equal(Owls.prototype._earth.call(fake, { x: S.x, y: 30, z: S.z }), false, 'no owl is born round a hero in hell, none leads him there');
    assert.equal(Owls.prototype._earth.call(fake, { x: 10, y: 30, z: 10 }), true, 'on the Earth as before');
});

test('the sweep (host): every wild creature in hell is taken away; the Earth\'s stay; the hero\'s horse and his tame dragon stay', () => {
    const g = { animals: null };
    const mk = (items) => { const sys = { list: items.slice(), gone: [], _remove(c) { this.gone.push(c); this.list.splice(this.list.indexOf(c), 1); } }; return sys; };
    const hell = () => at(S.x + 20, S.z), earth = () => at(5, 5);
    for (const k of Object.keys(HELL_SYSTEMS).filter((k) => HELL_SYSTEMS[k].sweep)) g[k] = mk([hell(), earth(), hell()]);
    const horse = hell(), tame = { ...hell(), tame: { by: 'me' } };
    g.animals.list.push(horse); g.animals.riding = horse; g.dragons.list.push(tame);
    const out = hellSweep(g);
    for (const k of Object.keys(HELL_SYSTEMS).filter((k) => HELL_SYSTEMS[k].sweep)) {
        assert.equal(out[k], 2, k + ': both wild ones in hell gone');
        assert.ok(g[k].list.some((c) => c.model.position.x === 5), k + ': the Earth\'s one stays');
    }
    assert.ok(g.animals.list.includes(horse), 'the hero\'s own horse stays');
    assert.ok(g.dragons.list.includes(tame), 'a tame dragon stays');
    assert.equal(hellForeign('owls', { ...hell(), dead: true }), false, 'a dead one is left to its system');
});

test('every system of creatures checks the realm where it is born (the Earth only)', () => {
    const files = { owls: 'Owls', phoenixes: 'Phoenixes', animals: 'Animals', spencers: 'SpencerBirds', spiders: 'Spider', dragons: 'Dragons', zombies: 'ZombieSpawn', books: 'BookBirds', runner: 'RunningBook', travelers: 'Travelers', canaries: 'Canaries', ghosts: 'Ghosts' };
    for (const [k, f] of Object.entries(files)) {
        const src = readFileSync(new URL(`../../src/game/${f}.js`, import.meta.url), 'utf8');
        assert.match(src, /earthly|offEarth/, `${k} (${f}.js): born only on the Earth`);
    }
    assert.ok(HELL.X0 > 400000 && !earthly({ x: HELL.X0, y: 20, z: 0 }), 'the whole of hell is off the Earth');
});
