// The ghosts of the Castle of Ghosts: what every spell does to them (GhostRules) and that every «who / what» table decides them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GHOST_SPELLS, ghostSpell } from '../../src/game/GhostRules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('every GHOST_SPELLS row says what it does and why', () => {
    for (const [k, r] of Object.entries(GHOST_SPELLS)) assert.ok(r.does && r.why, k);
});

test('ghostSpell: wind blows, Nihilis drives out, Overgrown does nothing, the unknown does nothing, the gods scatter', () => {
    assert.equal(ghostSpell('Wind').does, 'blown');
    assert.equal(ghostSpell('WindMaxima').does, 'blown');
    assert.equal(ghostSpell('Nihilis').does, 'exorcise');
    assert.equal(ghostSpell('Overgrown').does, 'none');
    assert.equal(ghostSpell('SomethingNew').does, 'none');
    assert.equal(ghostSpell('Boom', { divine: true }).does, 'scatter');
    assert.equal(ghostSpell('CircleAttack').does, 'scared');
});

test('every table with a row for the invisible bird has a row for the ghosts (same file, `ghost`/`ghosts`/`G`)', () => {
    const dir = path.join(ROOT, 'src/game');
    const missing = [];
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.js') || /^(Spencer|Ghost|Invisibles|SecondSight|SightRules|Imperius)/.test(f)) continue;
        const t = fs.readFileSync(path.join(dir, f), 'utf8');
        const rows = (t.match(/^ {4}(spencers?|S): [\{']/gm) || []).length;
        const ghosts = (t.match(/^ {4}(ghosts?|G): [\{']/gm) || []).length;
        if (rows && ghosts < rows) missing.push(`${f}: ${rows} spencer rows, ${ghosts} ghost rows`);
    }
    // (ImperiusFlyers/WorldSave-style lists are not tables: only the files above are read)
    assert.deepEqual(missing, []);
});

test('Nihilis table: the ghosts are exorcised; Imperius cannot take them', async () => {
    const { NIHILIS_TARGETS } = await import('../../src/game/NihilisRules.js');
    assert.equal(NIHILIS_TARGETS.ghosts.does, 'exorcise');
    const { IMPERIUS_NO, canTake, IMPERIUS_TARGETS } = await import('../../src/game/Imperius.js');
    assert.ok(IMPERIUS_NO.ghost?.why);
    assert.equal(IMPERIUS_TARGETS.ghost, undefined, 'no adapter, no row among the takeable');
    assert.equal(canTake('ghost', true).ok, false);
});

test('the places spells look for targets call the ghosts', () => {
    const d = src('src/game/Duel.js');
    assert.match(d, /put\('G', o\.id\)/);
    assert.match(d, /c\.isGhost \? 'G'/);
    assert.match(d, /g\.ghosts\?\.boltHit\(c, spell, byId\)/);
    const g = src('src/game/Game.js');
    assert.match(g, /this\.ghosts\?\.hitAt\(pos, radius/, 'blasts');
    assert.match(g, /this\.ghosts\?\.hitRay\(o, d, len, width/, 'rays');
    assert.match(g, /this\.ghosts\?\.hitAt\(point, 3, LIGHTNING/, 'lightning');
    assert.match(src('src/fx/SpellManager.js'), /hooks\.windGhosts/, 'wind');
    assert.match(src('src/game/MagicWave.js'), /case 'ghost'/, 'Circle Attack / Inspirius / Boom');
    assert.match(src('src/game/ThunderWave.js'), /case 'G'/);
    assert.match(src('src/game/Gear.js'), /g\.ghosts\?\.targets/, 'arrows');
    assert.match(src('src/game/WandMagic.js'), /ghosts\?\.scare/, 'Lumos');
});
