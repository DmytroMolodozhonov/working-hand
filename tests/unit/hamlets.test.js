/**
 * The hamlets (src/world/Hamlets.js, src/game/HamletLife.js): lone wizards' houses, hermits' huts,
 * small villages of wizards and of folk — the same on every computer, never on another site's land,
 * the right people in them (weak and middling wizards only, every seller weak, a watchman).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';
import { HAMLET_TYPES } from '../../src/world/Hamlets.js';
import { hamletRoster, magicStallGood } from '../../src/game/HamletLife.js';

const OPTS = { seed: 20261015, mountains: true, seas: true, lush: true };
const make = () => { const d = new TerrainData(); d.generate(OPTS); return d; };
const around = (d, n = 3) => { const out = []; for (let gx = -n; gx < n; gx++) for (let gz = -n; gz < n; gz++) out.push(...d.hamlets.cellOf(gx, gz)); return out; };

test('hamlets: every kind is found, the same on every computer', () => {
    const a = around(make()), b = around(make());
    assert.deepEqual(a.map((h) => [h.id, h.type, h.x, h.z, h.F, h.houses.length]), b.map((h) => [h.id, h.type, h.x, h.z, h.F, h.houses.length]));
    for (const t of HAMLET_TYPES) assert.ok(a.some((h) => h.type === t), `no ${t}`);
    for (const h of a) {
        if (h.type === 'magevillage' || h.type === 'village') assert.ok(h.houses.length >= 4 && h.houses.length <= 9, `${h.id}: ${h.houses.length} houses`);
        if (h.type === 'magevillage') assert.ok(h.stalls.length >= 4 && h.stalls.length <= 5 && h.stalls.filter((s) => s.magic).length >= 3 && h.stalls.filter((s) => s.pawn).length === 1) // (3–4 sellers and the buyer);
        if (h.type === 'magehut' || h.type === 'hermit') assert.equal(h.houses.length, 1);
        assert.ok(h.houses.every((x) => x.chests.length >= 1), `${h.id}: a chest in every house`);
        if (!h.fire) assert.ok(h.type === 'magehut' || h.type === 'hermit');
    }
});

test('hamlets: never on a castle\'s, a tower\'s land or each other; their ground is levelled; ids found again', () => {
    const d = make();
    const list = around(d);
    for (const h of list) {
        assert.equal(d.castles.near(h.x, h.z, h.zone).length, 0, `${h.id} on a castle's land`);
        assert.equal(d.towers.near(h.x, h.z, h.zone).length, 0, `${h.id} on a tower's land`);
        for (const o of list) if (o !== h) assert.ok(Math.max(Math.abs(o.x - h.x), Math.abs(o.z - h.z)) > o.zone + h.zone, `${h.id} on ${o.id}`);
        assert.equal(d.heightAt(h.x, h.z), h.F);
        assert.equal(d.sites.landAt(h.x, h.z)?.castle, h);
        assert.equal(d.sites.byId(h.id), h);
        assert.ok(!h.id.includes(':')); // (a villager's id is «site:n»)
    }
});

test('hamlets\' people: wizards only weak or middling, every seller weak; a folk village has its watchman', () => {
    const list = around(make());
    const mage = list.find((h) => h.type === 'magevillage'), folk = list.find((h) => h.type === 'village'), hut = list.find((h) => h.type === 'magehut');
    const ranks = { novice: 0, adept: 0 };
    for (const h of list.filter((x) => x.mage)) {
        for (let idx = 1; idx < h.population; idx++) {
            const e = hamletRoster(h, idx);
            assert.ok(e.wizard && (e.rank === 'novice' || e.rank === 'adept'), `${h.id}:${idx} ${e.rank}`);
            ranks[e.rank]++;
            if (e.role === 'seller') assert.equal(e.rank, 'novice');
            if (e.stranger) assert.equal(e.home, -1); else assert.ok(e.home >= 0 && e.home < h.houses.length);
        }
    }
    assert.ok(ranks.novice > ranks.adept && ranks.adept > 0, JSON.stringify(ranks));
    assert.equal(hamletRoster(mage, 1).role, 'seller');
    assert.equal(hamletRoster(folk, 1).role, 'knight');
    assert.equal(folk.knights, 1);
    assert.equal(hamletRoster(hut, 1).role, 'mage');
    assert.deepEqual(hamletRoster(folk, 5), hamletRoster(folk, 5)); // (the same every time)
});

test('a wizards\' seller\'s goods: a scroll, a flask or a crystal, something more — every one with a price', () => {
    for (let n = 0; n < 40; n++) for (let k = 0; k < 3; k++) {
        const g = magicStallGood(n, k);
        assert.ok(g.item?.kind && g.item.uid && g.price > 0, JSON.stringify(g));
    }
});

test('a wizards\' village: 1 or 2 wizards a house, the sellers among them; 0–2 strangers who never defend', async () => {
    const { WizardFight } = await import('../../src/game/WizardFight.js');
    const d = make();
    const list = []; for (let gx = -8; gx < 8; gx++) for (let gz = -8; gz < 8; gz++) list.push(...d.hamlets.cellOf(gx, gz));
    const mages = list.filter((h) => h.type === 'magevillage');
    assert.ok(mages.length >= 3, `${mages.length} villages`);
    const sizes = new Set(), visitors = new Set();
    for (const h of mages) {
        const live = new Map(), sellers = [], strangers = [];
        for (let idx = 1; idx < h.population; idx++) {
            const e = hamletRoster(h, idx);
            if (e.stranger) { strangers.push(e); assert.equal(e.home, -1); assert.equal(WizardFight.fights({ W: {}, role: e.role, entry: e }), false); continue; }
            assert.equal(strangers.length, 0, 'strangers come after the residents');
            live.set(e.home, (live.get(e.home) || 0) + 1);
            if (e.role === 'seller') sellers.push(e);
        }
        assert.equal(sellers.length, h.stalls.length);
        assert.equal(live.size, h.houses.length, `${h.id}: every house lived in`);
        for (const n of live.values()) { assert.ok(n === 1 || n === 2, `${h.id}: ${n} in a house`); sizes.add(n); }
        assert.equal(h.population, 1 + [...live.values()].reduce((a, b) => a + b, 0) + strangers.length, 'sellers are not counted apart');
        assert.ok(strangers.length <= 2); visitors.add(strangers.length);
    }
    assert.ok(sizes.has(1) && sizes.has(2), [...sizes].join());
});
