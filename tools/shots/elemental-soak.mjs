// Long fights of each elemental mage against a player who stands still: when does one go quiet (no cast, no new phase) — and what state is he in then?
//   node tools/shot.mjs elemental-soak --mode creative --args '{"minutes":6}'
export default async function (h, args) {
    const g = h.g, L = g.castleLife, minutes = args?.minutes || 6;
    h.bare(); g.paused = true;
    if (g.combat) g.combat.enabled = false; // (the hero is not hurt: the fight goes on)
    const out = [];
    for (const el of (args?.only ? [args.only] : ['air', 'fire', 'water', 'earth'])) {
        const def = L.extra.get('creative-' + el); if (!def) continue;
        const cs = L._runtime(def); if (!cs.awake) L._wake(cs);
        const v = L.byId.get('creative-' + el + ':1'); if (!v) continue;
        let casts = 0;
        const wrap = (obj, name) => { const f = obj?.[name]; if (typeof f !== 'function') return; obj[name] = function (...a) { if (a.includes?.(v.id) || (a[0] && a[0].by === v.id)) casts++; return f.apply(this, a); }; };
        wrap(g.spells, 'cast'); wrap(g.duel, '_addBolt'); wrap(g.vortex, '_addFlight'); wrap(g.waves, 'npcRaise'); wrap(g.groundVortex, '_volley'); wrap(g.hellfire, 'npcStart');
        const me = g.character.group.position;
        const place = () => { me.set(v.x, v.y + 1.95, v.z - 15); };
        place(); v.foe = g.localId;
        let lastAct = 0, lastCasts = 0, lastKey = '', quiet = 0, worst = 0, reports = 0;
        const N = minutes * 60 * 60;
        for (let f = 0; f < N; f++) {
            const t = f / 60;
            if (v.dead) { h.log(el, 'DIED at', t.toFixed(0), 's'); break; }
            if (!v.foe) v.foe = g.localId; // (only to keep the test going: the real game has its own losing of a foe)
            if (f % 600 === 0) place();
            L._think(v, 1 / 60); g.spells.update(1 / 60); g.vortex?.update?.(1 / 60); g.waves?.update?.(1 / 60); g.elementalMages?.update?.(1 / 60); g.earthMages?.update?.(1 / 60); g.groundVortex?.update?.(1 / 60); g.levMax?.update?.(1 / 60); g.hellfire?.update?.(1 / 60);
            const key = v.mode + '|' + (v.elemental?.phase || v.earth?.phase) + '|' + Math.round(v.x) + ',' + Math.round(v.z);
            if (casts !== lastCasts || key !== lastKey) { if (casts !== lastCasts) quiet = 0; lastCasts = casts; }
            if (casts === lastCasts) quiet += 1 / 60;
            lastKey = key;
            worst = Math.max(worst, quiet);
            if (quiet > 14 && reports < 3 && Math.round(quiet * 60) % 600 === 0) {
                reports++;
                const a = v.elemental || v.earth || {};
                h.log(el, 'QUIET', quiet.toFixed(0), 's at t=', t.toFixed(0), JSON.stringify({ mode: v.mode, phase: a.phase, mana: Math.round(v.mana), hp: Math.round(v.hp), recover: a.recover, hopping: a.hopping, swat: !!a.swat, liftT: a.liftT, capture: !!a.capture, wave: a.wave?.phase, guard: a.guard, fly: v.fly, vy: v.vy, stunT: v.stunT, lev: !!v.lev, slab: !!a.slab, stitch: a.stitchPose, speed: v.speed, pos: [v.x, v.y, v.z].map((n) => +n.toFixed(1)), foe: v.foe, dist: Math.hypot(me.x - v.x, me.z - v.z).toFixed(1), hop: v.hop && { go: v.hop.go, wait: +v.hop.wait.toFixed(2), shut: v.hop.shut }, watchT: a.watch?.t }));
            }
        }
        h.log(el, 'done: casts', casts, 'longest quiet', worst.toFixed(0), 's, mana', Math.round(v.mana), 'mode', v.mode);
        out.push([el, casts, worst]);
    }
    h.log('SUMMARY', JSON.stringify(out));
}
