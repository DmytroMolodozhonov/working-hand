import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Many sessions push to the same branch at once: a merge left half-done (conflict
 * markers) or a file that doesn't parse stops the whole game from starting — every
 * module the page imports must be whole.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tracked = () => execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);

test('no leftover merge conflict markers in the game\'s text files', () => {
    const text = /\.(m?js|html|css|json|md|py|ps1|bat|command|pyw)$/i;
    const bad = [];
    for (const f of tracked()) {
        if (!text.test(f) || f.startsWith('vendor/')) continue;
        const p = path.join(ROOT, f);
        if (!fs.existsSync(p)) continue;
        const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
        lines.forEach((l, i) => {
            if (/^(<{7}|>{7})( |$)/.test(l) || /^={7}$/.test(l)) bad.push(`${f}:${i + 1}`);
        });
    }
    assert.deepEqual(bad, [], 'conflict markers left in: ' + bad.join(', '));
});

test('no game script has a name an ad blocker refuses to run (e.g. «Branding.js» kept the whole menu dead)', () => {
    // Blockers (uBlock, AdBlock, AdGuard, antivirus web shields) refuse scripts whose path looks
    // like ads or tracking — while a plain download of the same file still works.
    const risky = /(brand|banner|advert|(^|[/_.-])ads?([/_.-]|$)|sponsor|promo|popup|analytic|beacon|pixel|telemetr)/i;
    const bad = tracked().filter((f) => /\.m?js$/.test(f) && (f.startsWith('src/') || f === 'index.html') && risky.test(f));
    assert.deepEqual(bad, [], 'rename: ' + bad.join(', '));
});

test('every game script parses (a syntax error in one file stops the whole game)', () => {
    const files = tracked().filter((f) => f.startsWith('src/') && /\.m?js$/.test(f) && fs.existsSync(path.join(ROOT, f)));
    assert.ok(files.length > 50);
    const bad = [];
    for (const f of files) {
        try {
            execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' });
        } catch (e) {
            bad.push(f + ': ' + String(e.stderr || e.message).split('\n').find((l) => /Error/.test(l)));
        }
    }
    assert.deepEqual(bad, []);
});
