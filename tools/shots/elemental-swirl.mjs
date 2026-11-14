// The elemental mages winding their element round themselves, the air mage's whirl and lash, and the water mage's new wet band.   node tools/shot.mjs elemental-swirl --mode creative
export default async function (h) {
    const g = h.g, L = g.castleLife;
    h.bare(); g.paused = true;
    const step = (v, n) => { for (let i = 0; i < n; i++) { L._think(v, 1 / 60); g.spells.update(1 / 60); g.waves?.update?.(1 / 60); g.elementalMages.update(1 / 60); g.fx?.update?.(1 / 60); v.group.position.set(v.x, v.y + 1.95, v.z); v.group.rotation.y = v.yaw; v.model.update(1 / 60, { mode: v.mode, speed: v.speed || 0 }); g.scene.updateMatrixWorld(true); } };
    for (const el of ['air', 'fire', 'water']) {
        const def = L.extra.get('creative-' + el); const cs = L._runtime(def); if (!cs.awake) L._wake(cs);
        const v = L.byId.get('creative-' + el + ':1'); v.foe = g.localId;
        g.character.group.position.set(v.x, v.y + 1.95, v.z - 18);
        step(v, 40);
        const want = el === 'air' ? ['airSpin', 'airLash', 'airCoil'] : el === 'fire' ? ['fireChamber'] : ['waterGather'];
        for (let f = 0, shots = 0; f < 1500 && shots < (el === 'air' ? 4 : 2); f++) {
            step(v, 1);
            if (want.includes(v.mode) && (v.elemental.t > 0.3) && f % 25 === 0) { h.cam([v.x + 6, v.y + 4, v.z - 7], [v.x, v.y + 2.2, v.z]); await h.shot(el + '-' + v.mode + shots++, { settle: 0 }); }
        }
        h.log(el, 'fx', v.fx, 'mode', v.mode);
    }
}
