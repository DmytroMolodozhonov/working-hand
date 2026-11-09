// The real persistent white drawing and the mark that remains on a player's corpse.
export default async function (h) {
    const g = h.g, p = g.character.group.position;
    h.bare(); h.time(0.65);
    const x = p.x + 22, z = p.z - 16, floor = g.collision.groundAt(x, z, p.y + 20);
    const b = { id: 'shot-sealed-life', k: 'p', who: 'shot-hero', x, y: floor + 2, z, age: 0, yaw: 0, lg: { owner: 'shot-owner', dark: { level: 5, skin: 0 } } };
    g.death.addBody(b, g.character.group);
    for (let i = 0; i < 600; i++) g.death.update(1 / 60);
    const say = g.castleLife._say; let m;
    try { g.castleLife._say = () => {}; m = g.soulSeal.draw({ id: 'shot-witness', mana: 200, yaw: 0 }, b); }
    finally { g.castleLife._say = say; }
    for (let i = 0; i < 360; i++) g.pentagranium._markStep(m, 1 / 60);
    h.cam([b.x + 6, floor + 7, b.z + 7], [b.x, floor + 0.3, b.z]);
    await h.shot('drawing-under-body', { settle: 1 });
    g.soulSeal.finish(b, 'shot-witness', m.id);
    await h.shot('sealed-body', { settle: 1 });
    h.log('seal', !!b.seal, 'drawing remains', g.pentagranium.marks.has(m.id), 'body remains', !!b.model);
}
