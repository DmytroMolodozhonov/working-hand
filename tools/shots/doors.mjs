// The door styles in one picture: rows of poor / common / rich / banded doors, shut (green lamp) and locked (red lamp), one cracked and one with a chunk knocked out.
//   node tools/shot.mjs doors --mode creative
export default async function (h) {
    const g = h.g, T = h.THREE;
    g.dayPhase = () => 0.3;
    await h.frames(40);
    await h.go(g.character.group.position.x + 55, g.character.group.position.y, g.character.group.position.z + 10, false);
    for (const z of g.zombies || []) { z.stunT = 1e9; }
    const base = g.character.group.position.clone();
    const gy = g.collision.groundY(base.x, base.z - 14);
    const styles = ['poor', 'common', 'rich', 'banded'];
    const ids = [];
    let n = 0;
    const put = (style, x, z, locked, wear) => {
        const id = 'demo' + (n++);
        g.doors._place({ id, x: base.x + x, y: gy, z: base.z + z, ry: 0, color: style === 'rich' ? 0x6b3f22 : style === 'poor' ? 0x9a7a52 : 0x8a5a2e, a: 0, w: 2.2, h: 4.6, style, gen: true });
        if (locked) g.locks.doorLocks.set(id, true);
        ids.push(id);
        const d = g.doors.list.get(id);
        if (wear >= 1) g.doors.hurt(d, 0.28, { x: base.x + x + 3, y: gy + 2, z: base.z + z + 3 });
        if (wear >= 2) g.doors.hurt(d, 0.3, { x: base.x + x - 2, y: gy + 1, z: base.z + z + 4 });
        return d;
    };
    // front row: shut, not locked (green); behind: locked (red); the last pair: worn
    styles.forEach((s, i) => { put(s, -7.5 + i * 5, -12, false, 0); put(s, -7.5 + i * 5, -22, true, 0); });
    put('common', 12.5, -12, false, 1); put('rich', 12.5, -22, true, 2);
    await h.frames(40);
    for (const grp of g.plants?.groups?.values() || []) for (const p of grp?.plants || []) if (p.root) p.root.visible = false; // (nothing in front of the doors)
    for (const id of ids) { const d = g.doors.list.get(id); d.model.userData.lock && (d.model.userData.lock.seen = false); }
    await h.frames(30);
    h.log('doors', ids.length, 'locked', ids.filter((i) => g.locks.doorLocked(g.doors.list.get(i))).length);
    h.bare?.();
    h.cam([base.x + 2, gy + 5.5, base.z - 1], [base.x + 2.5, gy + 2.8, base.z - 17]);
    await h.frames(30);
    await h.shot('doors', { settle: 10 });
    // a close view of the latch and the hole
    const d0 = g.doors.list.get('demo1');
    h.cam([base.x - 2.5, gy + 3.3, base.z - 17.5], [base.x - 2.5, gy + 3, base.z - 22]);
    await h.frames(20);
    await h.shot('latch-locked', { settle: 5 });
}
