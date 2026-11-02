// Windows and macOS do not tell «BodyGuard.js» from «Bodyguard.js»: two such files are ONE file there — one overwrites the other,
// the game fails to start («does not provide an export named …») and the update breaks (found in the author's game).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('no two files of the repository differ only in letter case (they would be one file on Windows)', () => {
    const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const seen = new Map(), clash = [];
    for (const f of files) { const k = f.toLowerCase(); if (seen.has(k)) clash.push(`${seen.get(k)} ↔ ${f}`); else seen.set(k, f); }
    assert.deepEqual(clash, []);
});
