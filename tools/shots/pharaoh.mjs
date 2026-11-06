// Pharaoh Sandy for the Codex: risen in the burial chamber, before his golden sarcophagus; his portrait → assets/bosses/pharaoh.png
//   node tools/shot.mjs pharaoh
export default async function (h) {
    const g = h.g, Ph = g.pharaoh, P = Ph?.plan;
    if (!P) { h.log('no pyramids in this world'); return; }
    await h.go(P.pharaoh.x + 6, P.pharaoh.y + 2.2, P.pharaoh.z, true);
    await h.until(() => Ph.pharaoh, 40000);
    const c = Ph.pharaoh;
    h.log({ on: Ph.on, mode: c?.mode });
    Ph.wakePharaoh('guest', g.localId);
    await h.frames(10);
    c.mode = 'fight'; c.foe = null; c.cool = 1e9; c.waveCool = c.locustCool = c.curseCool = 1e9;
    Ph._thinkPharaoh = () => {}; // (he stands still while the pictures are taken)
    c.model.group.visible = true;
    c.pos.set(P.pharaoh.x + Math.cos(c.yaw) * 2.8, P.pharaoh.y - 2.0 + 1.5, P.pharaoh.z - Math.sin(c.yaw) * 2.8);
    await h.frames(30);
    h.bare();
    // the camera on the far side of him from the sarcophagus (the lid would be in front of his face), the chamber lit a little for the picture
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), sx = fz, sz = -fx, hp = c.pos; // (his front is -Z of the model; s — to his side)
    h.cam([hp.x + fx * 5.4 + sx * 0.9, hp.y + 3.3, hp.z + fz * 4.6 + sz * 0.9], [hp.x, hp.y + 2.7, hp.z]);
    await h.shot('1-pharaoh', { settle: 20, light: 1.2 });
    await h.shot('portrait', { to: 'assets/bosses/pharaoh.png', settle: 1, light: 1.2 });
    h.cam([hp.x + fx * 9 + sx * 3, hp.y + 5, hp.z + fz * 9 + sz * 3], [hp.x, hp.y + 2.2, hp.z]);
    await h.shot('2-wide', { settle: 20, light: 1.2 });
}
