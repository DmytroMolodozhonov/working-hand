// The seven titans' portraits for the Codex («Боссы божественного уровня»): each made in the world by Titans._build (its mind held still),
// posed (a walker mid-stride with a fist raised; the sandworm risen, its mouth open; the storm turning), shot → assets/bosses/titan-<id>.png.
//   node tools/shot.mjs titans [--args '{"only":["mars"]}']      (then .webp: ffmpeg -i x.png -vf scale=800:-2 -c:v libwebp -quality 78 x.webp)
export default async function (h, args) {
    const g = h.g, Ti = g.titans, THREE = h.THREE;
    if (!Ti) { h.log('no titans'); return; }
    Ti._think = () => {}; // (no mind: they stand for the picture)
    Ti.update = () => {}; // (and not dropped: we are not on their planets — they are drawn by hand below)
    const ids = args?.only || ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    const me = g.character.group.position.clone();
    h.time(0.36);
    for (const id of ids) {
        for (const k of [...Ti.active.keys()]) Ti._drop(k);
        const def = (await import('/src/game/TitanRules.js')).TITANS[id];
        const far = def.look === 'storm' ? 420 : def.look === 'worm' ? 330 : def.height * 2.1;
        const x = me.x, z = me.z - far * 0.55;
        Ti._build(id, { x, y: 0, z });
        const T = Ti.active.get(id);
        T.yaw = 0; // (facing the camera: the models look along −z, the camera stands at +z)
        T.ph = 0.9; T.speed = def.walk; T.blowT = 0.35; T.t = 3;
        if (def.look === 'worm') { T.wm = 'up'; T.up = 1; T.yaw = 0.5; }
        if (def.look === 'shade') T.lit = 1;
        for (let i = 0; i < 6; i++) { Ti._draw(T, 0.05); await h.frames(1); }
        const cy = T.pos.y + (def.look === 'worm' ? def.height * 0.2 : def.height * 0.45);
        h.cam([x + far * 0.18, T.pos.y + def.height * (def.look === 'storm' ? 0.35 : 0.3), z + far], [x, cy, z]);
        g.character.group.visible = false;
        await h.frames(30);
        Ti._draw(T, 0.05);
        await h.shot('titan-' + id, { to: `assets/bosses/titan-${id}.png`, settle: 10 });
        h.log(id, 'h', def.height, 'pos', [T.pos.x, T.pos.y, T.pos.z].map(Math.round));
        void THREE;
    }
}
