// The water mage's wave and its traces, from the real NPC.   node tools/shot.mjs water-mage-wave --mode creative
export default async function (h) {
    const g = h.g;
    h.bare(); g.paused = true;
    const L = g.castleLife, def = L.extra.get('creative-water'); if (!def) throw Error('no water site');
    const cs = L._runtime(def); if (!cs.awake) L._wake(cs);
    const v = L.byId.get('creative-water:1'); if (!v) throw Error('no water mage');
    v.foe = g.localId; g.character.group.position.set(v.x, v.y + 1.95, v.z - 16);
    const step = (n) => { for (let i = 0; i < n; i++) { L._think(v, 1 / 60); g.waves?.update?.(1 / 60); g.vortex?.update?.(1 / 60); g.spells.update(1 / 60); g.elementalMages?.update?.(1 / 60); v.group.position.set(v.x, v.y + 1.95, v.z); v.group.rotation.y = v.yaw; v.model.update(1 / 60, { mode: v.mode, speed: v.speed || 0 }); g.scene.updateMatrixWorld(true); } };
    let shots = 0, frames = 0;
    while (shots < 8 && frames < 3000) {
        step(20); frames += 20;
        const w = g.waves?.list?.[0];
        h.log('t', (frames / 60).toFixed(1), 'mode', v.mode, 'phase', v.elemental?.phase, 'wave', w ? w.phase + ' s=' + w.s.toFixed(1) : '-', 'guard', v.fx, 'mana', Math.round(v.mana));
        if (w && frames % 40 === 0) { h.cam([v.x + 10, v.y + 6, v.z - 8], [(v.x + g.character.group.position.x) / 2, v.y + 1, (v.z + g.character.group.position.z) / 2]); await h.shot('wave' + shots++, { settle: 0 }); }
    }
}
