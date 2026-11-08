// Preview the real «Stronghands» circle and its carnivorous-head offering.
export default async function (h) {
    const g = h.g, T = h.THREE;
    await h.frames(10); h.time(0.3); h.bare();
    const p = g.character.group.position;
    const x = p.x + 16, z = p.z + 12;
    await h.go(x, p.y + 8, z);
    const y = g.collision.groundY(x, z);
    const m = g.pentagranium._place('strong-hands-preview', g.localId, 'grip', x, y + 0.08, z, 3.5, 0, true);
    m.t = 20; m.fade = 1; m.life = 480; m.anim = null;
    g.pentagranium.fx.set(m.id, 1, 0, 20);
    g.items.spawnLoose({ kind: 'carnivoreHead', uid: 'grip-preview-head' }, new T.Vector3(x, y + 0.2, z));
    h.cam([x + 7, y + 10, z + 10], [x, y, z]);
    await h.shot('strong-hands-circle', { settle: 4 });
}
