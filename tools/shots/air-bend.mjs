// Charges thrown at the air mage: how many are bent aside, how many hit?   node tools/shot.mjs air-bend --mode creative --args '{"n":10}'
export default async function (h, args) {
    const g = h.g, L = g.castleLife, T = h.THREE, N = args?.n || 10;
    h.bare(); g.paused = true; if (g.combat) g.combat.enabled = false;
    const cs = L._runtime(L.extra.get('creative-air')); if (!cs.awake) L._wake(cs);
    const v = L.byId.get('creative-air:1');
    const me = g.character.group.position; const res = { hit: 0, bent: 0, other: 0 };
    for (let i = 0; i < N; i++) {
        v.foe = g.localId; v.hp = v.maxHp; v.mana = v.maxMana; v.stunT = 0; v.vy = 0; v.fly = false; v.y = g.collision.groundAt(v.x, v.z, v.y + 2);
        me.set(v.x, v.y + 1.95, v.z - 14);
        const step = (n) => { for (let k = 0; k < n; k++) { L._think(v, 1 / 60); v.group.position.set(v.x, v.y + 1.95, v.z); v.group.rotation.y = v.yaw; g.duel.update?.(1 / 60); g.spells.update(1 / 60); g.elementalMages.update(1 / 60); } };
        step(20 + i * 13);
        const aimO = new T.Vector3(me.x, me.y + 0.6, me.z), aimD = new T.Vector3(v.x, v.y + 2.2, v.z).sub(aimO).normalize();
        g.duel._myRay = (side, o, d) => { o.copy(aimO); d.copy(aimD); }; g.duel.myStart = (side, o) => o.copy(aimO);
        g._interimCast = null; g._lastDuelCast = 0;
        g._castDuel('Jolt', 'Jolt', true, { side: 'right', t: { kind: 'v', id: v.id } }, 'right');
        const b = [...g.duel.bolts.values()].find((x) => x.by === g.localId && x.spell === 'Jolt'); const id = b?.id;
        let result = null, bent = false; const end = g.duel._end.bind(g.duel); g.duel._end = (bolt, r, ...a) => { if (bolt.id === id) { result = r; bent = !!bolt.bent; } return end(bolt, r, ...a); };
        step(70); g.duel._end = end;
        const k = result === 'hit' ? 'hit' : bent ? 'bent' : 'other'; res[k]++;
        h.log('trial', i, 'result', result, 'bent', bent, 'mageCycle', v.elemental.cycle, 'phase', v.elemental.phase);
    }
    h.log('SUMMARY', JSON.stringify(res));
}
