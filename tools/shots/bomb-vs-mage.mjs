// A Bombardo thrown at each elemental mage, several times: does it burst on him, is it parried, does it fly THROUGH him?   node tools/shot.mjs bomb-vs-mage --mode creative --args '{"n":6}'
export default async function (h, args) {
    const g = h.g, L = g.castleLife, T = h.THREE, N = args?.n || 6;
    h.bare(); g.paused = true; if (g.combat) g.combat.enabled = false;
    for (const el of (args?.only ? [args.only] : ['air', 'fire', 'water', 'earth'])) {
        const def = L.extra.get('creative-' + el); const cs = L._runtime(def); if (!cs.awake) L._wake(cs);
        const v = L.byId.get('creative-' + el + ':1'); if (!v) continue;
        const res = { burst: 0, parried: 0, through: 0, other: 0 };
        for (let trial = 0; trial < N; trial++) {
            v.foe = g.localId; v.hp = v.maxHp; v.mana = v.maxMana; v.stunT = 0; v.vy = 0;
            const me = g.character.group.position; me.set(v.x, v.y + 1.95, v.z - 14);
            let bursts = [], fromMage = 0;
            const ex = g.explode; g.explode = function (p, r, by, power) { bursts.push({ p: p.clone ? p.clone() : p, by }); return ex.apply(this, arguments); };
            const sc = g.spells.cast.bind(g.spells); const castsOfMage = []; g.spells.cast = function (name, o, d, side, by) { if (by === v.id) castsOfMage.push(name); return sc(name, o, d, side, by); };
            const step = (n) => { for (let i = 0; i < n; i++) { L._think(v, 1 / 60); v.group.position.set(v.x, v.y + 1.95, v.z); v.group.rotation.y = v.yaw; // (the game moves the model after the think: the bodies are the model's)
 g.spells.update(1 / 60); g.elementalMages.update(1 / 60); g.earthMages?.update?.(1 / 60); g.groundVortex?.update?.(1 / 60); } };
            step(30 + trial * 17); // (a different moment of his cycle each time)
            const o = new T.Vector3(me.x, me.y + 0.6, me.z), tgt = new T.Vector3(v.x, v.y + 2.2, v.z), d = tgt.clone().sub(o).normalize();
            const phase = (v.elemental || v.earth || {}).phase, fly = !!v.fly;
            g.spells.cast('Bombardo', o, d, 'right', g.localId);
            step(120);
            g.explode = ex; g.spells.cast = sc;
            const mine = bursts.filter((b) => b.by === g.localId);
            const nearMage = mine.some((b) => Math.hypot(b.p.x - v.x, b.p.z - v.z) < 4);
            const behind = mine.some((b) => b.p.z > v.z + 3);
            const back = castsOfMage.length > 0 && bursts.some((b) => b.by === v.id);
            const kind = nearMage ? 'burst' : behind ? 'through' : castsOfMage.includes('Bombardo') ? 'parried' : mine.length ? 'other' : 'nothing';
            res[kind] = (res[kind] || 0) + 1;
            h.log(el, 'trial', trial, 'phase', phase, 'fly', fly, '->', kind, JSON.stringify(mine.map((b) => [+b.p.x.toFixed(1), +b.p.y.toFixed(1), +(b.p.z - v.z).toFixed(1)])), 'mage cast', castsOfMage.join(','), 'hp', Math.round(v.hp), 'swat', !!v.elemental?.swat);
            if (v.dead) break;
        }
        h.log(el, 'SUMMARY', JSON.stringify(res));
    }
}
