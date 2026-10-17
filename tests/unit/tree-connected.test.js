// Every tree kind is one piece: the trunk touches its crown face to face (the cherry's bend once left a gap).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, TREE_KINDS, isLeaves } from '../../src/world/Terrain.js';

test('trees have no gap between trunk and crown', () => {
    for (let kind = 0; kind < TREE_KINDS.length; kind++) {
        const m = new Map();
        TerrainData.prototype._tree((x, L, z, t, only) => { const k = `${x},${L},${z}`; if (!(only && m.has(k))) m.set(k, t); }, 0, 0, 0, kind);
        const seen = new Set(), st = [];
        for (const [k, t] of m) if (!isLeaves(t) && k.split(',')[1] === '1') { st.push(k); seen.add(k); }
        while (st.length) {
            const [x, L, z] = st.pop().split(',').map(Number);
            for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
                const k = `${x + a},${L + b},${z + c}`;
                if (m.has(k) && !seen.has(k)) { seen.add(k); st.push(k); }
            }
        }
        assert.equal(seen.size, m.size, `tree kind ${kind} has loose blocks`);
    }
});
