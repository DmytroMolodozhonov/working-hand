import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { Game } from '../../src/game/Game.js';
import { Storm, RAIN_SECONDS, aimedAtSky } from '../../src/fx/Storm.js';
import { rollKeyItem, describeItem, SCROLL_SPELL_COLOR, SCROLL_RIBBON_RU } from '../../src/game/ItemTypes.js';

test('«Let it rain»: its words (and the ones it must not take)', () => {
    for (const w of ['let it rain', 'Let it rain!', 'лет ит рейн', 'летит рейн', 'лед ит рэйн', 'лет ит рейна', 'let it reign', 'пусть идёт дождь'])
        assert.equal(matchSpell(w), 'LetItRain', w);
    assert.equal(matchSpell('брейнрот'), 'Brainrot');
    assert.equal(matchSpell('lightning strike'), 'LightningStrike');
    assert.equal(matchSpell('to the sun'), 'ToTheSun');
});

test('«Let it rain» costs 20 mana; only the hand / wand pointed up to the sky casts it', () => {
    assert.equal(SPELL_COST.LetItRain, 20);
    assert.equal(aimedAtSky(new THREE.Vector3(0, 1, 0)), true);
    assert.equal(aimedAtSky(new THREE.Vector3(0.5, 0.8, 0).normalize()), true, 'steeply up');
    assert.equal(aimedAtSky(new THREE.Vector3(1, 0.5, 0).normalize()), false, 'only a little up');
    assert.equal(aimedAtSky(new THREE.Vector3(0, 0, -1)), false, 'forward');
});

test('the rain is a thunderstorm of 2 game hours (2 minutes); «To the Sun» stops it', () => {
    assert.equal(RAIN_SECONDS, 120);
    const s = Object.create(Storm.prototype);
    s.until = 0; s.rainUntil = 0; s.k = 0;
    s.startRain();
    assert.ok(s.raining && s.thunder, 'lightning, and Thor\'s hammer works');
    assert.ok(Math.abs(s.rainLeft() - 120) <= 1);
    s.clearSky();
    assert.equal(s.raining, false);
});

test('the weather\'s storm: the clouds gather first (no rain), only then it rains', () => {
    const s = Object.create(Storm.prototype);
    s.until = 0; s.rainUntil = 0; s.k = 0;
    s.gatherThenRain(120, 90);
    assert.equal(s.raining, false, 'clouds only');
    assert.ok(s.gathering >= 0 && s.gathering < 0.05);
    s.gatherFrom -= 100000; s.gatherTo -= 100000; // (an hour and a half later)
    assert.equal(s.raining, true, 'now it rains');
    s.clearSky();
    assert.equal(s.raining, false);
});

test('«Let it rain» is learnt from a burnt scroll only (Creative knows it)', () => {
    const game = (mode, spells = {}) => Object.assign(Object.create(Game.prototype), { config: { mode }, bonus: { spells } });
    assert.equal(game('freeworld').knowsSpell('LetItRain'), false);
    assert.equal(game('freeworld').knowsSpell('LetItRain'), false);
    assert.equal(game('freeworld', { LetItRain: true }).knowsSpell('LetItRain'), true);
    assert.equal(game('creative').knowsSpell('LetItRain'), true);
    assert.ok(SCROLL_SPELL_COLOR.LetItRain && SCROLL_RIBBON_RU.LetItRain);
    // chests hold its scroll now and then
    let n = 0, r = 1;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for (let i = 0; i < 20000; i++) { const it = rollKeyItem(rnd); if (it.kind === 'scroll' && it.spell === 'LetItRain') n++; }
    assert.ok(n > 20 && n < 400, `${n} scrolls in 20000 chests`);
    assert.match(describeItem({ kind: 'scroll', stat: 'spell', spell: 'LetItRain' }).title, /Let it rain/);
});
