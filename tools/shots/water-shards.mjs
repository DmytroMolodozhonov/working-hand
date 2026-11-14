// The water mage's ice shards: freezing into a ring, then the volley.   node tools/shot.mjs water-shards --mode creative
export default async function (h) {
    const g = h.g, L = g.castleLife;
    h.bare(); g.paused = true; if (g.combat) g.combat.enabled = false;
    const def = L.extra.get('creative-water'); const cs = L._runtime(def); if (!cs.awake) L._wake(cs);
    const v = L.byId.get('creative-water:1'); v.foe = g.localId; v.mana = v.maxMana;
    g.character.group.position.set(v.x, v.y + 1.95, v.z - 16);
    const step = (n) => { for (let i = 0; i < n; i++) { L._think(v, 1 / 60); g.spells.update(1 / 60); g.elementalMages.update(1 / 60); g.fx?.update?.(1 / 60); v.group.position.set(v.x, v.y + 1.95, v.z); v.group.rotation.y = v.yaw; v.model.update(1 / 60, { mode: v.mode, speed: v.speed || 0 }); g.scene.updateMatrixWorld(true); } };
    step(30);
    const a = v.elemental; a.cycle = 1;
    let started = false, shots = 0;
    for (let f = 0; f < 2400 && shots < 5; f++) {
        if (!a.shard && !started) { a.cycle = 1; if (!g.elementalMages.waterAttack(v, { x: g.character.group.position.x, y: g.character.group.position.y, z: g.character.group.position.z })) { step(10); continue; } }
        started = true; step(1);
        const t = a.shard?.t ?? 9;
        if ((t > 0.45 && shots === 0) || (t > 0.9 && shots === 1) || (t > 1.3 && shots === 2) || (shots >= 3 && g.elementalMages.shards.flying.length > 0 && f % 12 === 0)) {
            h.cam([v.x + 7, v.y + 4, v.z - 6], [v.x, v.y + 2.4, v.z - 6]);
            await h.shot('shards' + shots++, { settle: 0 });
        }
        if (!a.shard && shots >= 3 && g.elementalMages.shards.flying.length === 0) break;
    }
    h.log('shots', shots, 'cycle', a.cycle);
}
