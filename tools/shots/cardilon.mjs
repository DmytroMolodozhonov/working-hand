// Real capture, paused only for inspecting the shield's reversal and closure.
export default async function (h) {
    const g = h.g, T = h.THREE, p = g.character.group.position.clone();
    h.log('scene-start', { paused: g.paused, frame: g.frameCount, errors: g._errors || 0 });
    h.bare(); h.time(0.65);
    g.paused = false;
    g.character.group.position.y += 18;
    window.__pin = g.character.group.position.toArray();
    g.character.group.updateMatrixWorld(true);
    const center = g.combat.center(new T.Vector3());
    g.combat.shield = { type: 1, side: 'left', left: 100, drain: 0.5 };
    g.spells.castBombardo(center.clone().add(new T.Vector3(0, 0, -15)), new T.Vector3(0, 0, 1), 'shot-attacker', 3);
    const result = g.cardilon.cast(true);
    if (result !== 'Cardilon') throw new Error('Actual capture failed: ' + result);
    const look = g.cardilon.look, update = look.update;
    try {
        look.update = () => {};
        const e = look.pool.find(e => e.active);
        const midpoint = e.from.clone().lerp(e.to, 0.5);
        for (const [name, t] of [['shield-reverses', 0.15], ['shield-encloses', 0.43], ['bomb-contained', 0.82]]) {
            e.t = t; look._draw(e);
            h.cam([e.root.position.x + 5, e.root.position.y + 2, e.root.position.z + 5], e.root.position.toArray());
            await h.shot(name, { settle: 1 });
        }
        h.log('capture', result, 'shield spent', !g.combat.shield, 'effect meshes', e.root.children.length,
            'shell triangles', e.shell.geometry.index.count / 3, 'texture count', 0);
        e.root.visible = false;
        // The actual duel shader and bolt registry render the white variant too.
        const origin = midpoint.clone().add(new T.Vector3(-5, 0, 0)), end = midpoint.clone().add(new T.Vector3(5, 0, 0));
        const duelUpdate = g.duel.update;
        try {
            g.duel.update = function () { this._drawBolt('NihilisDuel', origin, end, g.localId); };
            h.cam([midpoint.x, midpoint.y + 3, midpoint.z + 9], midpoint.toArray());
            await h.shot('nihilis-duel', { settle: 1 });
        } finally { g.duel.update = duelUpdate; }
    } finally { look.update = update; }
}
