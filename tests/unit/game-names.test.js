/**
 * The new look: the game is called «Волшебство только начинается» everywhere the
 * player sees it; the modes are Творческий / Хардкор / Выживание (+ «Карты»)
 * while the internal values stay 'creative' / 'survival' / 'freeworld'.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GAME_NAME, MODES, MODE_ORDER, MAPS_ENTRY, modeLabel, modeTitle, legacyMode } from '../../src/ui/GameNames.js';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('branding: the name and the mode labels; internal mode values unchanged', () => {
    assert.equal(GAME_NAME, 'Волшебство только начинается');
    assert.deepEqual(MODE_ORDER, ['creative', 'freeworld']);
    assert.equal(modeLabel('creative'), 'Творческий');
    assert.equal(modeLabel('survival'), 'Выживание', 'an old Хардкор world opens as Выживание');
    assert.equal(legacyMode('survival'), 'freeworld');
    assert.equal(legacyMode('survival', 'mapName'), 'survival', 'a map keeps its internal mode');
    assert.equal(modeLabel('freeworld'), 'Выживание');
    assert.equal(modeLabel('nope'), '');
    assert.match(modeTitle('freeworld'), /^\S+ Выживание$/);
    assert.equal(MAPS_ENTRY.label, 'Карты');
    for (const id of MODE_ORDER) assert.ok(MODES[id].hint.length > 10, id);
});

test('branding: the old name and the old mode names are gone from what the player sees', () => {
    const files = ['index.html', 'README.md', 'server.py', 'src/main.js', 'src/ui/Codex.js', 'src/ui/Hud.js',
        'src/game/Game.js', 'src/game/Duel.js', 'src/game/ItemTypes.js', 'install-windows.ps1'];
    // (code comments may still name the internal mode; the player never sees them)
    const visible = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1').replace(/^\s*#.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
    for (const f of files) {
        const text = visible(read(f));
        assert.doesNotMatch(text, /ЗОМБИ НЕ СПЯТ/, f);
        assert.doesNotMatch(text, /Свободн(ый|ом|ого) мир/i, f);
        assert.doesNotMatch(text, /Творчеств[оеа]/, f);
    }
    const html = read('index.html');
    assert.match(html, /<title>Волшебство только начинается<\/title>/);
    assert.match(html, /<option value="creative">[^<]*Творческий<\/option>/);
    assert.doesNotMatch(html, /Хардкор/);
    assert.match(html, /<option value="freeworld" selected>[^<]*Выживание<\/option>/);
    assert.match(read('README.md'), /^# Волшебство только начинается/);
});

test('branding: the logo files exist and the page uses no CDN for its look', () => {
    for (const f of ['logo.svg', 'logo.png', 'logo.ico', 'logo-32.png', 'logo-128.png', 'logo-256.png']) {
        assert.ok(fs.statSync(new URL('../../assets/logo/' + f, import.meta.url)).size > 200, f);
    }
    const css = read('theme.css');
    assert.doesNotMatch(css, /https?:\/\//, 'theme.css loads nothing from the internet');
    for (const m of css.matchAll(/url\('([^']+)'\)/g)) assert.ok(fs.existsSync(new URL('../../' + m[1], import.meta.url)), m[1]);
    assert.doesNotMatch(read('index.html'), /<link[^>]+href="https?:/, 'no stylesheet from a CDN');
});
