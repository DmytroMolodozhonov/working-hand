// A cow, a pig, a sheep and a horse die in a row — each falls as a rag doll (AnimalRagdoll.js).   node tools/shot.mjs animal-death
export default async function (h) {
    const g = h.g, THREE = h.THREE;
    await h.frames(20);
    h.time(0.3); h.bare();
    { const q = g.character.group.position; await h.go(q.x + 180, q.y + 25, q.z + 90); }
    const p = g.character.group.position;
    const gy = g.collision.groundAt ? g.collision.groundAt(p.x, p.z, p.y + 1) : g.collision.groundY(p.x, p.z);
    const kinds = ['cow', 'pig', 'sheep', 'horse'];
    const list = kinds.map((t, i) => { const a = g.animals._spawn(t, new THREE.Vector3(p.x - 9 + i * 6, gy + 0.5, p.z - 14), {}); a.group.rotation.y = 0.6; return a; });
    await h.frames(10);
    h.cam([p.x - 1, gy + 5, p.z + 2], [p.x, gy + 1.2, p.z - 14]);
    await h.frames(5);
    await h.shot('alive', { settle: 1 });
    list.forEach((a, i) => { a.vel = new THREE.Vector3(i % 2 ? 5 : -4, 3 + i, -3); g.animals._die(a, false, null); });
    for (const [t, tag] of [[0.35, 'fall'], [0.8, 'tumble'], [3.5, 'lying']]) { await h.until(() => performance.now() > 0, 50); await h.frames(Math.round(t * 30)); await h.shot(tag, { settle: 1 }); }
    h.log('rag', list.map((a) => a.type + ':' + g.creatureImpact.ragOf(a)).join(' '));
}
