// The hero as an element mage: the four guards, the air vortex (hover / climb), the half price.   node tools/shot.mjs element-hero --mode creative
export default async function (h) {
    const g = h.g, ch = g.character;
    await h.frames(40);
    const p0 = ch.group.position.clone();
    for (const el of ['water', 'earth', 'fire', 'air']) {
        g.heroElement.set(el, { say: false, rite: true });
        h.log(el, 'cost Waterball', g.combat.costOf('Waterball'), 'Fireball', g.combat.costOf('Fireball'), 'Protection', g.combat.costOf('Protection'));
        g.combat.shield = null; const msg = g.combat.castProtection(false); h.log(el, 'protection →', msg);
        await h.frames(40);
        h.cam([p0.x + 2, p0.y + 1.5, p0.z - 6], [p0.x, p0.y + 1.4, p0.z]);
        await h.shot('guard-' + el, { settle: 10 });
        g.combat.shield = null;
    }
    g.heroElement.set('air', { say: false });
    const y0 = ch.group.position.y; h.log('cast', g.airVortex.cast(true));
    await h.frames(90); const y1 = ch.group.position.y; h.log('hover: y before', y0.toFixed(2), 'after 1.5 s', y1.toFixed(2), 'on', g.airVortex.on, 'gravityK', ch.gravityK);
    g.camera.rotation.x = 1.0; // look up
    await h.frames(120); h.log('looking up 2 s: y', ch.group.position.y.toFixed(2));
    g.camera.rotation.x = 0;
    g.airVortex.stop('stop'); await h.frames(120); h.log('after stop: y', ch.group.position.y.toFixed(2), 'gravityK', ch.gravityK);
}
