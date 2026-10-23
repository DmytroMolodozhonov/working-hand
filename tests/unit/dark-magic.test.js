import test from 'node:test';
import assert from 'node:assert/strict';
import { DARK, isDark, darkStage, darkLevel, addDark, onDarkCast, darkNotice, DarkHero, wizardDetects, shopRefuses, expelled, attitude, tolerance, teaches, darkMageLevel, darkLook } from '../../src/game/DarkMagic.js';

{
    test('which spells are dark (Imperius Maxima is not)', () => {
        for (const k of ['Alive', 'AliveMaxima', 'AvadaKedavra', 'Imperius', 'GiveMyPower']) assert.equal(isDark(k), true);
        assert.equal(isDark('ImperiusMaxima'), false);
        assert.equal(isDark('Lumos'), false);
    });
    test('stages', () => {
        assert.deepEqual([0, 1, 40, 41, 80, 81, 100].map(darkStage), ['clean', 'hidden', 'hidden', 'scorned', 'scorned', 'outcast', 'outcast']);
    });
    test('a cast gives +1 with chance 50 %, never above 100', () => {
        const g = { dark: new DarkHero(null) };
        assert.equal(onDarkCast(g, 'Alive', () => 0.49), 1);
        assert.equal(onDarkCast(g, 'Alive', () => 0.5), 0);
        assert.equal(onDarkCast(g, 'Lumos', () => 0), 0);
        assert.equal(onDarkCast(g, 'GiveMyPower', () => 0.99), 1);
        assert.equal(g.dark.level, 2);
        addDark(g.dark, 500, 'x');
        assert.equal(darkLevel(g), 100);
    });
    test('the player is told only at 11, 41, 81', () => {
        assert.equal(darkNotice(0, 10), null);
        assert.ok(darkNotice(10, 11));
        assert.equal(darkNotice(11, 40), null);
        assert.ok(darkNotice(40, 41));
        assert.ok(darkNotice(80, 81));
        const said = []; const h = new DarkHero({ hud: { setVoice: (t) => said.push(t) } });
        for (let i = 0; i < 10; i++) addDark(h, 1); assert.equal(said.length, 0);
        addDark(h, 1); assert.equal(said.length, 1);
    });
    test('only wizards detect, from 41', () => {
        assert.equal(wizardDetects(40), false);
        assert.equal(wizardDetects(41), true);
    });
    test('shops of towers / tower: 50 % scorned, never outcast', () => {
        assert.equal(shopRefuses(40, 'tower', () => 0), false);
        assert.equal(shopRefuses(60, 'tower', () => 0.4), true);
        assert.equal(shopRefuses(60, 'tower', () => 0.6), false);
        assert.equal(shopRefuses(90, 'town', () => 0.99), true);
        assert.equal(expelled(90, 'tower'), true);
        assert.equal(expelled(60, 'tower'), false);
        assert.equal(expelled(100, 'small'), false);
        assert.equal(teaches(90, 'tower'), false);
    });
    test('small settlements are mixed: each mage has a fixed tolerance', () => {
        let sells = 0;
        for (let i = 0; i < 400; i++) { if (!shopRefuses(100, 'small', Math.random, 'm' + i)) sells++; assert.equal(shopRefuses(100, 'small', Math.random, 'm' + i), shopRefuses(100, 'small', Math.random, 'm' + i)); }
        assert.ok(sells / 400 > 0.45); assert.ok(sells / 400 < 0.65);
        assert.equal(attitude(100, 'lone', 'x'), tolerance('x') < 0.55 ? 'tolerant' : 'scorn');
    });
    test('dark mages are deterministic and not everybody', () => {
        let n = 0;
        for (let i = 0; i < 1000; i++) { const l = darkMageLevel('w' + i, 'lone'); assert.equal(darkMageLevel('w' + i, 'lone'), l); if (l) { n++; assert.ok(l >= DARK.DARK_MAGE_MIN); assert.ok(l <= DARK.DARK_MAGE_MAX); } }
        assert.ok(n > 100); assert.ok(n < 320);
        assert.equal(darkMageLevel('t', 'tower'), 0);
    });
    test('look: stepped cache, nearly invisible low, black at 100', () => {
        assert.equal(darkLook(3), darkLook(5));
        assert.ok(darkLook(10).spots < 0.15);
        assert.equal(darkLook(10).veins, 0);
        assert.equal(darkLook(100).black, 1);
        assert.ok(darkLook(100).magicCrack < darkLook(100).crack);
    });
    test('save / death', () => {
        const h = new DarkHero(null); addDark(h, 30);
        const s = h.snapshot(); h.onDeath(); assert.equal(h.level, 0); h.restore(s); assert.equal(h.level, 30);
    });
}
