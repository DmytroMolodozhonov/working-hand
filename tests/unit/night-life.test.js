import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';
import { nightPart, sleepTime, shopsClosed, crowdK, watchCount, wakesSleeper, bedPlace, NightLife, HOUR, dealHolds, DEAL_GRACE } from '../../src/game/NightLife.js';
import { VillagerModel, villagerLook, SLEEP_HALF } from '../../src/entities/VillagerModel.js';
import { MECHANICS } from '../../src/ui/Codex.js';

test('night: merchants pack an hour before, everybody home half an hour before, asleep all night, up at dawn', () => {
    assert.equal(nightPart(0.3), 'day');
    assert.equal(nightPart(0.75 - HOUR * 0.9), 'pack');
    assert.equal(nightPart(0.75 - HOUR * 0.3), 'home');
    assert.equal(nightPart(0.8), 'night');
    assert.equal(nightPart(0.99), 'night');
    assert.equal(nightPart(0.005), 'dawn');
    assert.ok(sleepTime('night') && sleepTime('home') && !sleepTime('dawn') && !sleepTime('pack'));
    assert.ok(shopsClosed('pack') && shopsClosed('night') && !shopsClosed('day'));
    assert.equal(crowdK('night'), 0, 'nobody walks the streets at night');
    assert.equal(crowdK('day'), 1);
    assert.deepEqual([watchCount(7), watchCount(40), watchCount(120)], [1, 2, 3], 'the watch: 1–3 knights');
});

test('night: a blast wakes the village, a zombie only the house it comes into, a far fire nobody', () => {
    assert.ok(wakesSleeper('blast', 60));
    assert.ok(!wakesSleeper('blast', 100));
    assert.ok(wakesSleeper('zombie', 4) && !wakesSleeper('zombie', 15));
    assert.ok(wakesSleeper('fire', 10) && !wakesSleeper('fire', 40));
    assert.ok(!wakesSleeper('nothing', 0));
});

test('night: two sleep in one bed, side by side, heads on the pillow', () => {
    const b = { x: 10, y: 5, z: 20, ry: 0.7 };
    const a = bedPlace(b, -1), c = bedPlace(b, 1);
    assert.ok(Math.abs(Math.hypot(a.x - c.x, a.z - c.z) - 1.24) < 1e-6, 'side by side');
    assert.equal(a.y, 6, 'on the mattress');
    // the head (the middle + SLEEP_HALF towards yaw) at the pillow end: the bed's −Z
    const hx = a.x + Math.sin(a.yaw) * SLEEP_HALF, hz = a.z + Math.cos(a.yaw) * SLEEP_HALF;
    const lz = (hx - b.x) * Math.sin(b.ry) + (hz - b.z) * Math.cos(b.ry);
    assert.ok(lz < -1.8 && lz > -2.75, `head at the pillow: ${lz}`);
});

test('night: a sleeper lies under a blanket, turns over, sits up and stands', () => {
    const m = new VillagerModel(villagerLook(5, 'farmer'), {});
    for (let i = 0; i < 40; i++) m.update(0.05, { mode: 'sleep' });
    assert.ok(Math.abs(m.root.rotation.x - Math.PI / 2) < 0.01, 'lying');
    assert.ok(m.blanket.visible && !m.mat.visible, 'a blanket, no mat on a bed');
    m.update(0.05, { mode: 'sleepMat' });
    assert.ok(m.mat.visible, 'a straw mat on the floor');
    m.update(0.05, { mode: 'situp' });
    assert.equal(m.root.rotation.x, 0, 'sat up');
    assert.ok(!m.blanket.visible);
    m.setTorch(true);
    assert.ok(m.torch);
    m.setTorch(false);
    assert.equal(m.torch, null);
});

test('night: spoken to asleep — a mumble first, the second word wakes; a blow wakes at once', () => {
    const said = [];
    const life = { game: { authority: true }, _say: (v, t) => said.push(t), byId: new Map() };
    const N = new NightLife(life);
    const place = { x: 0, y: 1, z: 0, yaw: 0, key: 'h0:0', floor: 0 };
    const v = { sleep: { phase: 'lie', place }, dead: false };
    assert.ok(N.rouse(v, 'p1'));
    assert.equal(v.sleep.phase, 'lie', 'still asleep after one word');
    N.rouse(v, 'p1');
    assert.equal(v.sleep.phase, 'up', 'awake after the second');
    assert.equal(said.length, 2);
    const w = { sleep: { phase: 'lie', place }, dead: false };
    N.wake(w, 'hit');
    assert.equal(w.sleep.phase, 'up');
    assert.ok(w.sleep.t < 1, 'a blow: up fast');
});

test('night: the castles have beds — bunks in the barracks, the king\'s bed — on solid beds', () => {
    const t = new TerrainData();
    t.generate({ seed: 4242, mountains: true });
    let c = null;
    for (let gz = -3; gz <= 3 && !c; gz++) for (let gx = -3; gx <= 3 && !c; gx++) c = t.castles.cellOf(gx, gz);
    assert.ok(c, 'a castle');
    const rooms = new Set(c.beds.map((b) => b.room));
    assert.ok(rooms.has('king'), 'the king\'s bed');
    assert.ok(c.beds.filter((b) => b.room === 'barracks').length >= 4, 'bunks and mats in the barracks');
    for (const b of c.beds) {
        const L = Math.round(b.y + 1.5);
        assert.ok(t.get(Math.round(b.x), L - 1, Math.round(b.z)) !== 0, `something to lie on under ${b.room}`);
    }
});

test('night: the guide tells about the night (Механика игры)', () => {
    const night = MECHANICS.find((m) => m.title === 'Сон и ночь');
    assert.ok(night.points.some((p) => /стража/.test(p) && /факел/.test(p)));
});

test('night: a deal under way keeps the stall open (up to the grace), then the goods go off the counter', () => {
    assert.ok(dealHolds(true, 5) && !dealHolds(false, 5) && !dealHolds(true, DEAL_GRACE + 1));
    let busy = true, uids = [1, 2, 3];
    const loose = new Set(uids);
    const stallState = { goods: uids, restockAt: 5 };
    const life = { talk: { stalls: new Map([['c:s0', stallState]]), _stallKey: (d, i) => d.id + ':s' + i, dealBusy: () => busy } };
    life.game = { items: { loose, removeLoose: (u) => loose.delete(u) }, sync: null, dayCycle: true, dayPhase: () => 0.8 };
    const n = new NightLife(life);
    const cs = { def: { id: 'c', stalls: [{}] }, active: new Map() };
    n._closeStalls(cs);
    assert.equal(loose.size, 3, 'night fell in the middle of a deal: the goods stay');
    n._t += 10; n._releaseHeld(cs);
    assert.equal(loose.size, 3, 'still paying');
    busy = false; n._t += 1; n._releaseHeld(cs);
    assert.equal(loose.size, 0, 'the deal is over: the stall closes');
    // a deal that never ends: closes after the grace
    busy = true; stallState.goods = [4]; loose.add(4);
    n._shut.clear(); n._closeStalls(cs);
    assert.equal(loose.size, 1);
    n._t += DEAL_GRACE + 1; n._releaseHeld(cs);
    assert.equal(loose.size, 0, 'no endless extension');
});
