// A hero never gets stuck on a market counter («запрыгнула на прилавок и не может слезть… идёт на месте»): where a roof is lower
// than the hero over the counter top (the shady buyer's shed) the body is put off it; city stalls (a canopy 7 m up) can be stood on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';
import { CastleTalk } from '../../src/game/CastleTalk.js';

const R = 0.48;
function* sites(t) {
    for (let gz = -4; gz <= 4; gz++) for (let gx = -4; gx <= 4; gx++) { const d = t.castles.cellOf(gx, gz); if (d) yield d; }
}
test('counter: low roof over a counter → put off it; a city stall counter stays walkable', () => {
    const t = new TerrainData(); t.generate({ seed: 4242, mountains: true, lush: true, slopes: true, wizHuts: true, seas: true });
    const talk = Object.create(CastleTalk.prototype);
    const castles = new Map();
    talk.game = { terrain: t };
    talk.life = { castles };
    let low = 0, high = 0;
    for (const d of sites(t)) {
        castles.clear(); castles.set(d.id, { awake: true, def: d });
        for (const st of d.stalls) {
            const c = st.counter, pos = { x: (c.x0 + c.x1) / 2, y: c.top + 2, z: (c.z0 + c.z1) / 2 }, was = { ...pos };
            const moved = talk.keepOffCounters(pos, R, c.top);
            if (st.fence) {
                low++;
                assert.ok(moved, `${d.id}: the shed's counter is no place to stand`);
                assert.ok(pos.x < c.x0 - 0.5 || pos.x > c.x1 + 0.5 || pos.z < c.z0 - 0.5 || pos.z > c.z1 + 0.5, `${d.id}: put outside the counter`);
            } else if (!st.pawn && !st.potions && !st.magic && !st.trade) {
                high++;
                assert.ok(!moved && pos.x === was.x && pos.z === was.z, `${d.id}: a city counter can be stood on`);
            }
        }
    }
    assert.ok(low >= 5 && high >= 20, `checked ${low} sheds, ${high} city stalls`);
});
