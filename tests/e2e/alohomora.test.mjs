/**
 * «Алохомора» in a real browser: a house's chest is locked (walking up opens nothing), the word
 * said with the hand pointed at it unlocks it a crack, the hand lifts the lid — it opens; the
 * gates of the throne room stand shut for me, plain «Алохомора» doesn't take them, «Максима»
 * does; a blast breaks them. Run: node --test tests/e2e/alohomora.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8193;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('Alohomora: a locked chest, opened a crack by the word and lifted by the hand; the throne room\'s gates', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const c = g.world.terrain.data.castles.near(0, 0, 2500).filter((x) => x.throneGate).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        const hi = c.houses.findIndex((h) => h.doorRec && h.chests.length);
        const h = c.houses[hi];
        g.character.group.position.set(h.inside.x, h.inside.y + 2.2, h.inside.z);
        g.world.terrain.flushAround(h.inside.x, h.inside.z);
        await frames(40);
        const chest = g.chests.find((x) => x.id === h.id + 'c0');
        const cp = chest.getPosition();
        // right by it: a house's chest doesn't open by itself any more
        g.character.group.position.set(cp.x + 2, h.inside.y + 2.2, cp.z + 2);
        await frames(20);
        const closedNear = !chest.isOpen && chest.locked;
        // the hand pointed at its lock, the word said
        const edge = chest.lidEdge();
        const ch = g.character;
        const hand0 = ch.getHandWorldPosition.bind(ch), dir0 = ch.getHandDirection.bind(ch);
        const at = edge.clone().add({ x: 0, y: 0.4, z: 0 }).addScaledVector(edge.clone().sub(cp).setY(0).normalize(), 1.5);
        ch.getHandWorldPosition = (side, out) => (out || at.clone()).copy(at);
        ch.getHandDirection = (side, out) => (out || at.clone()).copy(edge).sub(at).normalize();
        g.combat.fatigue = 100; // (mana)
        const said = g.castLocalSpell('Алохомора', true);
        await frames(3);
        ch.getHandWorldPosition = hand0; ch.getHandDirection = dir0;
        const ajar = chest.picked && -chest.lidGroup.rotation.x > 0.1 && !chest.isOpen;
        // the hand under the lid's edge lifts it
        const hands = { left: null, right: null };
        g.doors.input = (side) => hands[side];
        const pose0 = g.currentPose;
        g.currentPose = pose0 || {};
        const hinge = chest.lidGroup.getWorldPosition(edge.clone());
        const r = edge.distanceTo(hinge);
        const out = edge.clone().sub(hinge).setY(0).normalize();
        for (let i = 0; i <= 24; i++) {
            const a = 0.15 + 1.2 * i / 24;
            hands.right = { G: hinge.clone().addScaledVector(out, r * Math.cos(a)).add({ x: 0, y: r * Math.sin(a), z: 0 }), curl: 0.6 };
            await frames(1);
            if (chest.isOpen) break;
        }
        await frames(10);
        g.doors.input = null;
        g.currentPose = pose0;
        const opened = chest.isOpen;
        // the throne room's gates
        const G = c.throneGate;
        g.character.group.position.set(G.x, G.y + 2.2, G.z);
        g.world.terrain.flushAround(G.x, G.z);
        // (go a few metres out in front of them)
        g.character.group.position.set(G.x + Math.sin(G.ry) * 6, G.y + 2.2, G.z + Math.cos(G.ry) * 6);
        await frames(40);
        const leaves = [c.id + 'gL', c.id + 'gR'].map((id) => g.doors.list.get(id));
        const gateUp = leaves.every(Boolean) && leaves.every((d) => d.boxId != null || d.a > 0.3);
        const lockedForMe = leaves.every((d) => g.locks.doorLocked(d));
        g.locks.apply({ k: 'gate', id: c.id, by: g.localId }, true);
        const unlocked = leaves.every((d) => !g.locks.doorLocked(d));
        g.locks.blast({ x: G.x, y: G.y + 3, z: G.z }, 3.6, 3);
        const broken = g.locks.gates.get(c.id).broken && !g.doors.list.has(c.id + 'gL');
        const saved = g.locks.snapshot();
        return { said, closedNear, ajar, opened, gateUp, lockedForMe, unlocked, broken, saved: saved.c.includes(chest.id) && saved.g.some(([id, s]) => id === c.id && s.broken) };
    });
    assert.ok(r.closedNear, 'a house\'s chest stays shut when I walk up to it');
    assert.equal(r.said, 'Alohomora');
    assert.ok(r.ajar, 'the lid springs up a crack');
    assert.ok(r.opened, 'the hand lifts the lid: it opens');
    assert.ok(r.gateUp, 'the gates stand in the throne room\'s doorway');
    assert.ok(r.lockedForMe, 'locked for a stranger');
    assert.ok(r.unlocked, '«Алохомора Максима» unlocks them');
    assert.ok(r.broken, 'a strong blast breaks them');
    assert.ok(r.saved, 'saved with the world');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
