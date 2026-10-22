/**
 * Herds appear by area: places fixed by the world's seed, woken by any player coming near (never in plain sight),
 * put to sleep when everybody is far, and refilled only after a quiet while. Other animals have no say.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Animals, HERDS, HERD_KINDS } from '../../src/game/Animals.js';
import { siteAt, sitesNear, SITES, HERD_DENSITY } from '../../src/game/HerdSites.js';
import { BLOCK } from '../../src/world/Terrain.js';

function world(me = [0, 0]) {
    const g = {
        config: { mode: 'freeworld' }, authority: true, localId: 'me', seed: 777, scene: new THREE.Scene(),
        character: { group: new THREE.Group() }, camera: null,
        collision: { groundY: () => 0, resolveCylinder() {} },
        terrain: { data: { topLayer: () => 1, get: (x, L) => (L === 1 ? BLOCK.GRASS : 0) } },
        remotes: new Map(), fx: { spark() {} }, hud: { setVoice() {} }, combat: { enabled: false },
    };
    g.character.group.position.set(me[0], 1.5, me[1]);
    g.character.group.rotation.y = 0; // (looks toward −z)
    const A = new Animals(g);
    A.enabled = true; A._treeT = 1e9;
    return { g, A };
}
const scan = (A, times = 1) => { for (let i = 0; i < times; i++) A._scanSites(HERDS.SCAN); };
const wild = (A) => A.list.filter((a) => !a.dead);

test('herd places depend only on the seed: same seed, same places; another seed, others', () => {
    const a = [], b = [], c = [];
    sitesNear(0, 0, 1500, 5, (s) => a.push(s)); sitesNear(0, 0, 1500, 5, (s) => b.push(s)); sitesNear(0, 0, 1500, 6, (s) => c.push(s));
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.map((s) => s.key + s.type), c.map((s) => s.key + s.type));
    for (const s of a) assert.ok(s.n >= 2 && s.n <= 5 && Math.floor(s.x / SITES.CELL) === s.gx);
});

test('density per area, kinds in the shares of HERD_KINDS, no two places closer than 40 m', () => {
    const all = [];
    sitesNear(0, 0, 6000, 42, (s) => all.push(s));
    const km2 = Math.PI * 6 * 6;
    const per = all.length / km2;
    assert.ok(Math.abs(per - HERD_DENSITY) < 8, `places per km²: ${per.toFixed(1)}`);
    const tot = Object.values(HERD_KINDS).reduce((x, y) => x + y, 0);
    for (const [k, w] of Object.entries(HERD_KINDS)) {
        const share = all.filter((s) => s.type === k).length / all.length;
        assert.ok(Math.abs(share - w / tot) < 0.03, `${k}: ${share.toFixed(3)} vs ${(w / tot).toFixed(3)}`);
    }
    for (let i = 0; i < 300; i++) for (let j = i + 1; j < 300; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) >= 39.9);
});

test('a place wakes when a player is near, one herd per look, not in plain sight; other animals do not matter', () => {
    const { g, A } = world([0, 0]);
    // 50 animals right around the player: no limit on herds
    for (let i = 0; i < 50; i++) A._spawn('sheep', new THREE.Vector3(i, 0.5, 5), {});
    const before = A.list.length;
    scan(A, 40);
    assert.ok(A.list.length > before, 'herds woke although 50 animals stand around');
    for (const a of A.list.slice(before)) {
        const p = a.site;
        assert.ok(p.awake);
        assert.ok(Math.hypot(p.x, p.z) <= HERDS.WAKE + 1);
    }
    // nothing woke where the player faces within SEE_D
    for (const r of A.sites.values()) if (r.awake) {
        const d = Math.hypot(r.x, r.z);
        if (d < HERDS.SEE_D) assert.ok(r.z > 0, 'near ones only behind the player');
    }
});

test('a guest far from the host: the herds wake around the guest', () => {
    const { g, A } = world([0, 0]);
    g.remotes.set('friend', { position: new THREE.Vector3(5000, 0, 5000), dead: false });
    scan(A, 60);
    const near = wild(A).filter((a) => Math.hypot(a.group.position.x - 5000, a.group.position.z - 5000) < HERDS.WAKE + 60);
    assert.ok(near.length > 0, 'the guest has herds around');
    for (const a of wild(A)) assert.ok(!(Math.hypot(a.group.position.x - 5000, a.group.position.z - 5000) < HERDS.SEE_D - 25), 'none in the guest\'s sight'); // (members spread a little around the place)
});

test('killed herd: the place stays empty until a quiet while, then full again; a sleeping one comes back at once', () => {
    const { g, A } = world([0, 0]);
    scan(A, 60);
    const r = [...A.sites.values()].find((x) => x.awake);
    assert.ok(r, 'a herd woke');
    const n = r.members.size;
    for (const id of [...r.members]) A.byId.get(id).dead = true; // (killed)
    scan(A);
    assert.ok(!r.awake && A.emptied.has(r.key), 'the place is emptied');
    g.character.group.position.set(r.x + 20, 1.5, r.z); // (the killer stays right there)
    scan(A, (HERDS.REFILL_T / HERDS.SCAN) + 10);
    assert.ok(A.emptied.has(r.key), 'with a player near it does not refill');
    g.character.group.position.set(r.x + 900, 1.5, r.z);
    scan(A, (HERDS.REFILL_T / HERDS.SCAN) + 10);
    assert.ok(!A.emptied.has(r.key), 'after a quiet while it is full again');
    g.character.group.position.set(r.x, 1.5, r.z + 150);
    scan(A, 60);
    assert.ok(r.awake && r.members.size === n, 'woke with the full herd');
});

test('the places emptied lately are saved; an old save without them has all places full', () => {
    const { A } = world();
    A.emptied.set('3,4', A.clock - 100);
    const snap = A.sitesSnapshot();
    assert.deepEqual(snap, { '3,4': 100 });
    const { A: B } = world(); B.clock = 5000; B.sitesRestore(snap);
    assert.equal(B.clock - B.emptied.get('3,4'), 100);
    B.sitesRestore(undefined);
    assert.equal(B.emptied.size, 1);
});
