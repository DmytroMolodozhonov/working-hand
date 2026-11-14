// The fire mage's handstand throw, side view at several moments of the move.   node tools/shot.mjs fire-vault-pose --mode creative
export default async function (h) {
    const g = h.g;
    h.bare(); g.paused = true;
    const L = g.castleLife, cs = L._runtime(L.extra.get('creative-fire')); if (!cs.awake) L._wake(cs);
    const v = L.byId.get('creative-fire:1'); if (!v) throw Error('no fire mage');
    v.x = 0; v.z = 0; v.y = g.collision.groundAt(0, 0, 20); v.yaw = 0;
    v.group.position.set(v.x, v.y + 1.95, v.z); v.group.rotation.y = v.yaw;
    g.character.group.position.set(v.x, v.y + 1.95, v.z - 14);
    const times = (h.args?.times) || [0.45, 0.56, 0.64, 0.72, 0.8, 0.88, 1.0];
    for (const u of times) {
        v.mode = h.args?.mode || 'fireVault'; v.model.elementPoseT = u;
        for (let i = 0; i < 30; i++) v.model.update(1 / 60, { mode: v.mode, speed: 0 });
        for (const [tag, c] of [['a', [v.x + 9, v.y + 3.5, v.z]], ['b', [v.x, v.y + 3.5, v.z + 9]]]) {
            h.cam(c, [v.x, v.y + 2.5, v.z]);
            await h.shot('u' + String(Math.round(u * 100)).padStart(3, '0') + tag, { settle: 0 });
        }
    }
}
