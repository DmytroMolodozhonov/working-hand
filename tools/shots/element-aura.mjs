// The element rings round the mages (NPC) and round the hero (an element mage); the fire mage's hanging beam.   node tools/shot.mjs element-aura --mode creative
export default async function (h) {
    const g = h.g, L = g.castleLife, T = h.THREE;
    await h.frames(60);
    for (const el of ['air', 'fire', 'water']) {
        const def = L.extra.get('creative-' + el); if (!def) { h.log(el, 'no site'); continue; }
        const cs = L._runtime(def); if (!cs.awake) L._wake(cs);
        const v = L.byId.get('creative-' + el + ':1'); if (!v) { h.log(el, 'no mage'); continue; }
        g.character.group.position.set(v.x, v.y + 1.95, v.z + 12);
        await h.frames(50);
        h.cam([v.x + 3, v.y + 3.2, v.z + 7], [v.x, v.y + 2.2, v.z]);
        await h.shot('mage-' + el, { settle: 5 });
        h.log(el, 'aura draws', JSON.stringify(g.elementAura.cnt));
    }
    for (const el of ['air', 'fire', 'water', 'earth']) {
        g.heroElement.set(el, { say: false });
        const p = g.character.group.position;
        await h.frames(40);
        h.cam([p.x + 2.5, p.y + 0.8, p.z - 5], [p.x, p.y + 0.4, p.z]);
        await h.shot('hero-' + el, { settle: 5 });
        h.log('hero', el, JSON.stringify(g.elementAura.cnt));
    }
    h.log('done');
}
