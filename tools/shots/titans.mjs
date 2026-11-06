// The seven titans' portraits for the Codex («Боссы божественного уровня»), each ON ITS OWN PLANET (the author 06.11: «фоткать на своих
// планетах»): the hero is put on the planet's surface by the titan's home (Titans.home — the same spot as in the game), the land is waited
// for, the titan made there (its mind held still), posed — a walker mid-stride, a fist raised; the sandworm risen, its mouth open; the
// storm turning — and shot under that planet's sky → assets/bosses/titan-<id>.png (then .webp — ffmpeg).
//   node tools/shot.mjs titans [--args '{"only":["mars"]}']
export default async function (h, args) {
    const g = h.g, Ti = g.titans;
    if (!Ti) { h.log('no titans'); return; }
    Ti._think = () => {}; // (no mind: they stand for the picture)
    const keepUpdate = Ti.update.bind(Ti);
    Ti.update = () => {}; // (not dropped, not moved — drawn by hand below)
    void keepUpdate;
    const { TITANS } = await import('/src/game/TitanRules.js');
    const ids = args?.only || ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    for (const id of ids) {
        for (const k of [...Ti.active.keys()]) Ti._drop(k);
        const def = TITANS[id], home = Ti.home(id);
        if (!home) { h.log(id, 'no home (planet?)'); continue; }
        const far = def.look === 'storm' ? 300 : def.look === 'worm' ? 230 : def.height * 1.35;
        // the hero on that planet's ground, where the camera will stand (the land round the home is made meanwhile)
        await h.go(home.x + far * 0.18, 400, home.z + far, true);
        await h.go(home.x, 400, home.z, true);
        await h.until(() => g.space?.realm === def.planet, 20000);
        await h.frames(60);
        Ti._build(id, { x: home.x, y: 0, z: home.z });
        const T = Ti.active.get(id);
        if (!T) { h.log(id, 'not built'); continue; }
        T.yaw = 0; // (facing the camera: the models look along −z, the camera stands at +z)
        T.ph = 0.9; T.speed = def.walk; T.blowT = 0.35; T.t = 3;
        if (def.look === 'worm') { T.wm = 'up'; T.up = 1; T.yaw = 0.5; }
        if (def.look === 'shade') T.lit = 1;
        const gy = T.pos.y;
        const cam = [home.x + far * 0.18, gy + def.height * (def.look === 'storm' ? 0.35 : 0.3), home.z + far];
        window.__pin = [cam[0], cam[1] - 2, cam[2]]; // (the hero hangs by the camera: the world stays loaded round it)
        for (let i = 0; i < 6; i++) { Ti._draw(T, 0.05); await h.frames(1); }
        h.cam(cam, [home.x, gy + (def.look === 'worm' ? def.height * 0.2 : def.height * 0.45), home.z]);
        g.character.group.visible = false;
        h.bare();
        const fog = g.scene.fog; g.scene.fog = null; // (no haze between: a portrait — the planet's own fog is put back after)
        await h.frames(30);
        Ti._draw(T, 0.05);
        await h.shot('titan-' + id, { to: `assets/bosses/titan-${id}.png`, settle: 10 });
        g.scene.fog = fog;
        h.log(id, 'on', g.space?.realm, 'h', def.height, 'ground', Math.round(gy));
    }
}
