// Real player/NPC models, settled and carried by the same corpse physics.
export default async function (h) {
    const g = h.g, T = h.THREE, p = g.character.group.position;
    h.bare(); h.time(0.3);
    const x = p.x, z = p.z - 12, y = g.collision.groundAt(x, z, p.y + 20);
    const a = { id: 'shot-player', k: 'p', x: x - 3, y: y + 8, z, yaw: 0, age: 0 };
    const b = { id: 'shot-npc', k: 'v', x: x + 3, y: y + 8, z, yaw: 0, age: 0, moved: true };
    g.death.addBody(a, g.character.group); g.death.addBody(b);
    for (let i = 0; i < 600; i++) g.death.update(1 / 60);
    h.cam([x + 8, y + 7, z + 12], [x, y + 1, z]);
    await h.shot('lying', { settle: 1 });
    for (const body of [a, b]) {
        g.death.liftBody(body);
        for (let i = 0; i < 180; i++) g.death.levitateBody(body, new T.Vector3(body.x, y + 7, z), 1 / 60);
    }
    h.cam([x + 8, y + 9, z + 12], [x, y + 5, z]);
    await h.shot('levitated', { settle: 1 });
    for (const body of [a, b]) g.death.dropBody(body, new T.Vector3(1, 0, 0));
    for (let i = 0; i < 600; i++) g.death.update(1 / 60);
    h.cam([x + 8, y + 7, z + 12], [x, y + 1, z]);
    await h.shot('released', { settle: 1 });
    h.log('dolls asleep', a.doll.doll.asleep, b.doll.doll.asleep);
}
