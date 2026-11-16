// Плотоядная голова: смерть от взрыва / огня / удара.   node tools/shot.mjs carnivore-death --mode creative
export default async function (h) {
    const g = h.g, T = h.THREE, pl = g.plants;
    await h.frames(30);
    const hp = g.character.group.position;
    const gy = g.collision?.groundAt ? g.collision.groundAt(hp.x, hp.z - 14, hp.y) : hp.y - 2;
    let n = 0;
    for (const style of (h.args?.only ? [h.args.only] : ['blast', 'fire', 'cut'])) {
        const x = hp.x + (n - 1) * 3, z = hp.z - 14 - n * 0.01; n++;
        const grp = pl._load('carnivore', 900 + n, 900 + n, [{ x, z, y: gy, yaw: Math.PI, h: 0.6, i: 0, id: 'cd' + n }]);
        pl.groups.set('carnivore|' + (900 + n) + ',' + (900 + n), grp);
        pl._rebuildNear(new T.Vector3(x, gy, z));
        const p = grp.plants[0];
        h.log(style, 'plant', !!p, p && { y: p.y, vis: p.root.visible, parent: !!p.root.parent, H: p.H, near: pl.near.includes(p) }, 'hero', hp.x | 0, hp.y | 0, hp.z | 0, 'plant', x | 0, gy | 0, z | 0);
        h.cam([x + 9, gy + 7, z + 11], [x, gy + 5, z]);
        await h.frames(30);
        await h.shot(style + '-0');
        if (style === 'blast') pl.hitAt(new T.Vector3(x, gy + 3, z + 1), 6, 9999, 'Bombarda');
        else if (style === 'fire') { pl.ignite(p); p.hp = 1; }
        else pl.die(p, 'sword', null);
        for (const t of [8, 20, 40]) { await h.frames(t); await h.shot(style + '-' + t); }
        h.log(style, 'dead', p.dead, 'style', p.deathStyle);
        await h.frames(150);
    }
}
