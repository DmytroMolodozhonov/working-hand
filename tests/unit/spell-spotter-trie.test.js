// spotAll (every spell phrase at once over one tree of their letters) must give exactly what spot gives each phrase —
// bit for bit: same cost, same start, same end — on the network's real rows, whole phrases and looks cut inside them.
// And it must be cheap: a look is read on the page's own thread (CLAUDE.md «Производительность»: nothing over 2–3 ms in a frame).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { unpack, prepare, spot, spotAll, hear, VOCAB } from '../../src/audio/SpellSpotter.js';

const rows = JSON.parse(fs.readFileSync(new URL('../fixtures/voice-spells.json', import.meta.url), 'utf8'));
const OPENS = [{}, { openStart: false }, { openEnd: false }, { openStart: false, openEnd: false }];

test('spotAll = spot for every phrase, bit for bit', () => {
    let checked = 0;
    for (const r of rows.filter((_, i) => i % 3 === 0)) {
        const lp = unpack(r.lp, r.T);
        for (const T of [r.T, Math.min(r.T, 29), Math.min(r.T, 12)]) {
            const P = prepare(lp.subarray(0, T * 34), T);
            for (const open of OPENS) {
                const all = spotAll(P, VOCAB, open);
                VOCAB.forEach((w, k) => {
                    const one = spot(P, w.toks, open);
                    assert.ok(Object.is(all[k].pen, one.pen) && all[k].a === one.a && all[k].b === one.b, `${w.phrase} T=${T} ${JSON.stringify(open)}`);
                    checked++;
                });
            }
        }
    }
    assert.ok(checked > 100000);
});

test('a look of 1.2 s is read in a few ms', () => {
    const looks = rows.filter((r) => r.T >= 29).map((r) => unpack(r.lp, r.T).slice(0, 29 * 34));
    for (const lp of looks.slice(0, 20)) hear(lp, 29, { final: false });
    const t0 = performance.now();
    for (const lp of looks) hear(lp, 29, { final: false });
    const ms = (performance.now() - t0) / looks.length;
    // (was 14.6 ms with one spot per phrase; ~1.5 ms now — a slow test machine gets room)
    assert.ok(ms < 6, `hear: ${ms.toFixed(2)} ms per look`);
});
