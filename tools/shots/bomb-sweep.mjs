// A Bombardo at the AIR mage in the middle of his Sweep: where does the orb go relative to his body?   node tools/shot.mjs bomb-sweep --mode creative
export default async function (h, args) {
    const g = h.g, L = g.castleLife, T = h.THREE;
    h.bare(); g.paused = true; if (g.combat) g.combat.enabled = false;
    const def = L.extra.get('creative-air'); const cs = L._runtime(def); if (!cs.awake) L._wake(cs);
    const v = L.byId.get('creative-air:1');
    for (let trial = 0; trial < (args?.n || 6); trial++) {
        v.foe = g.localId; v.hp = v.maxHp; v.mana = v.maxMana; v.stunT = 0; v.vy = 0; v.fly = false; v.y = g.collision.groundAt(v.x, v.z, v.y + 2);
        const me = g.character.group.position; me.set(v.x, v.y + 1.95, v.z - 14);
        const step = (n) => { for (let i = 0; i < n; i++) { L._think(v, 1 / 60); v.group.position.set(v.x, v.y + 1.95, v.z); v.group.rotation.y = v.yaw; g.spells.update(1 / 60); g.elementalMages.update(1 / 60); } };
        const a = v.elemental; a.phase = 'Sweep'; a.t = 0.05; a.fired = false; a.parryCd = 0; a.recover = false; step(1);
        const o = new T.Vector3(me.x, me.y + 0.6, me.z), d = new T.Vector3(v.x, v.y + 2.2, v.z).sub(o).normalize();
        g.spells.cast('Bombardo', o, d, 'right', g.localId);
        const task = g.spells.spells.find((t) => t.orb && t.orb.by === g.localId);
        let minD = 1e9, hit = null; const bursts = []; const ex = g.explode; g.explode = function (p, r, by) { bursts.push([+p.x.toFixed(1), +p.y.toFixed(1), +(p.z - v.z).toFixed(1)]); return ex.apply(this, arguments); };
        const body = g.duel._bodyOf('v', v.id, { a: new T.Vector3(), b: new T.Vector3(), r: 0 });
        for (let i = 0; i < 80; i++) { step(1); if (task?.orb) { const dd = Math.hypot(task.orb.p.x - v.x, task.orb.p.y - (v.y + 2), task.orb.p.z - v.z); minD = Math.min(minD, dd); } }
        g.explode = ex;
        h.log('trial', trial, 'minDist', minD.toFixed(2), 'bursts', JSON.stringify(bursts), 'phaseNow', a.phase, 'mode', v.mode, 'body', body && [body.a.y.toFixed(1), body.b.y.toFixed(1), body.r.toFixed(2)].join('/'), 'mageY', v.y.toFixed(1), 'cast', a.cycle);
    }
}
