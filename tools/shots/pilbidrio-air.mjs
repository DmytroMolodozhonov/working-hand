// A Pilbidrio burst on each elemental mage: dead? hidden? still thinking?   node tools/shot.mjs pilbidrio-air --mode creative
export default async function (h) {
    const g = h.g, L = g.castleLife;
    h.bare(); g.paused = true;
    for (const el of ['air', 'fire', 'water', 'earth']) {
        const def = L.extra.get('creative-' + el); if (!def) { h.log(el, 'no site'); continue; }
        const cs = L._runtime(def); if (!cs.awake) L._wake(cs);
        const v = L.byId.get('creative-' + el + ':1'); if (!v) { h.log(el, 'no mage'); continue; }
        v.foe = g.localId; g.character.group.position.set(v.x, v.y + 1.95, v.z - 12);
        const step = (n) => { for (let i = 0; i < n; i++) { L._think(v, 1 / 60); g.spells.update(1 / 60); g.elementalMages?.update?.(1 / 60); g.earthMages?.update?.(1 / 60); } };
        step(60);
        const hp0 = v.hp;
        g.strong.burst('v', v, g.localId);
        const snap = (t) => h.log(el, t, 'dead', !!v.dead, 'hp', Math.round(v.hp), 'burst', !!v.burst, 'groupVisible', v.group?.visible, 'mode', v.mode, 'mana', Math.round(v.mana), 'fly', !!v.fly);
        snap('right after (hp was ' + Math.round(hp0) + ')');
        step(120); snap('2 s later');
        const shown = []; g.scene.traverse((o) => { if (o.isMesh && o.visible) { let p = o, vis = true; while (p) { if (!p.visible) vis = false; p = p.parent; } if (vis) { const w = new h.THREE.Vector3(); o.getWorldPosition(w); if (Math.hypot(w.x - v.x, w.z - v.z) < 2.5 && Math.abs(w.y - v.y) < 6) shown.push(o.name || o.type); } } });
        h.log(el, 'visible meshes within 2.5 m of where he stood:', shown.length, shown.slice(0, 8).join(','));
    }
}
