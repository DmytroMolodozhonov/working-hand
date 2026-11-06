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
        const def = TITANS[id], home0 = Ti.home(id);
        if (!home0) { h.log(id, 'no home (planet?)'); continue; }
        // (each planet turns: its day is where the Sun is up now — the portrait is taken on the day side of the same planet, the
        //  longitude runs along x: the first spot from the home where the Sun stands high)
        const pdef = g.space.planets.get(def.planet), now = g.space.now();
        let home = home0, best = -2;
        const { slotRect } = await import('/src/world/Planets.js');
        const R = slotRect(pdef);
        for (let k = 0; k < 32; k++) {
            const x = R.x0 + 2000 + ((home0.x - R.x0 - 2000 + k * 1024) % (R.w - 4000) + (R.w - 4000)) % (R.w - 4000); // (round the planet, never over its seam)
            const el = g.space.localSun(pdef, x, home0.z, now).y;
            if (el > best) { best = el; home = { x, z: home0.z }; }
            if (el > 0.55) break;
        }
        h.log(id, 'sun elevation', best.toFixed(2));
        const far = def.look === 'storm' ? 300 : def.look === 'worm' ? 230 : def.height * 1.35;
        // the hero on that planet's ground, where the camera will stand (the land round the home is made meanwhile)
        await h.go(home.x + far * 0.18, 400, home.z + far, true);
        await h.go(home.x, 400, home.z, true);
        await h.until(() => g.space?.realm === def.planet, 20000);
        await h.frames(60);
        Ti._build(id, { x: home.x, y: 0, z: home.z });
        const T = Ti.active.get(id);
        if (!T) { h.log(id, 'not built'); continue; }
        // the camera on the sun's side (the light on its face, not behind it): the world's sun light's direction, flattened
        let sx = 0, sz = 1;
        g.scene.traverse((o) => { if (o.isDirectionalLight && o.intensity > 0.05 && o.castShadow) { const dx = o.position.x - o.target.position.x, dz = o.position.z - o.target.position.z, l = Math.hypot(dx, dz); if (l > 1e-3) { sx = dx / l; sz = dz / l; } } });
        const side = 0.35, ca = Math.cos(side), sa = Math.sin(side);
        const vx = sx * ca - sz * sa, vz = sz * ca + sx * sa; // (a little to the side of the sun: the form shaded)
        T.yaw = Math.atan2(-vx, -vz); // (facing the camera: the models look along −z)
        T.ph = 0.9; T.speed = 0; T.t = 3; T.mode = 'fight';
        if (def.look !== 'worm' && def.look !== 'storm') T.act = { name: 'roar', t: 0.45, dur: 3, ev: [] }; // (its roar: the chest thrown back, the arms spread)
        if (def.look === 'worm') { T.wm = 'up'; T.up = 1; T.yaw += 0.5; }
        if (def.look === 'shade') T.lit = 1;
        const gy = T.pos.y;
        const cam = [home.x + vx * far, gy + def.height * (def.look === 'storm' ? 0.35 : 0.3), home.z + vz * far];
        window.__pin = [cam[0], cam[1] - 2, cam[2]]; // (the hero hangs by the camera: the world stays loaded round it)
        for (let i = 0; i < 6; i++) { Ti._draw(T, 0.05); await h.frames(1); }
        h.cam(cam, [home.x, gy + (def.look === 'worm' ? def.height * 0.2 : def.height * 0.45), home.z]);
        g.character.group.visible = false;
        h.bare();
        await h.frames(30);
        Ti._draw(T, 0.05);
        // (no haze between: the planet's dust and mist are put back every frame by Space — so they are taken away at the very moment of the
        //  picture, after the last frame: a portrait, the game's own fog stays as it is)
        const fog = g.scene.fog; g.scene.fog = null;
        await h.shot('titan-' + id, { to: `assets/bosses/titan-${id}.png`, settle: 0 });
        g.scene.fog = fog;
        h.log(id, 'on', g.space?.realm, 'h', def.height, 'ground', Math.round(gy));
    }
}
