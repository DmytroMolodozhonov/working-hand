// A short film of a sea battle, shot in the game itself: an ordinary galleon with its crew meets Captain Black
// Moustache's black ship — the broadsides, the grapnels and the plank, the skeletons boarding, the fight on her
// deck, and whoever wins (nothing is decided here: the game's own AI and dice).
//
// The game is not changed. In the page, only for the shooting:
//  - the clock is virtual (1/30 s a frame, whatever the speed of this machine): every frame is one game step;
//  - the black ship hunts the galleon (its lookout is pointed at her: in the game it hunts only ships with a player
//    aboard), and its boarders fight her sailors (and they fight back) by the crews' own tactics — the foe is a
//    sailor instead of a player (Sailors._playerLocal/_aboard/_strike/_share are wrapped on this page's objects);
//  - the galleon's own guns answer once (loaded and lit, as the black ship's gunners do — Cannons.light);
//  - the camera: a director picks the shots as the battle goes (the moments come when they come: a shot rolls
//    into a buffer and the last seconds of it are kept when its moment is over); the HUD is not in the picture
//    (only the game's canvas), the player's body and the speech bubbles are hidden.
// Then ffmpeg: H.264 1280×720 30 fps → docs/video/sea-battle.mp4, and stills → docs/video/sea-battle-*.webp.
//
// Usage: node tools/sea-battle-video.mjs [--out docs/video] [--port 8797] [--keep-frames]
//   (from the repo root; ffmpeg must be installed; takes ~10–20 minutes on the software renderer)
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from '../tests/e2e/harness.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', 'docs/video'));
const port = Number(arg('--port', 8797));
const keepFrames = process.argv.includes('--keep-frames');
const W = 1280, H = 720, FPS = 30;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zns-film-'));
fs.mkdirSync(out, { recursive: true });

/** Everything that runs in the page: the virtual clock, the battle's wiring and the director. */
function setup() {
    const g = window.__zns.game, THREE = window.__zns.THREE;
    const S = g.ships, C = S.crew, B = g.blackbeard, K = S.cannons;
    const FPS = 30, DT = 1000 / FPS;
    const WATER = 0; // (replaced below by the sea level: the black ship's pose at rest)
    // ------------------------------------------------------------------ the virtual clock
    const real = performance.now.bind(performance);
    let vt = real();
    const d0 = Date.now(), v0 = vt, realDate = Date.now;
    performance.now = () => vt;
    Date.now = () => d0 + (vt - v0);
    void realDate;
    g.config.fpsLimit = 1e-6; // (the game's own loop stands: every frame is stepped from here)
    g.lastTime = vt;
    const DAY = 24 * 60 * 1000;
    const phase = (ph) => { g.dayStart = Date.now() - DAY * ph; if (g.frameCount) g.world.setDayPhase(g.dayPhase()); };
    g.world.viewDistance = 7; // (the battle is seen from far: the sea's haze further off — «Прорисовка мира»)
    // ------------------------------------------------------------------ the two ships
    const s = B._ensure();
    const P = B.spot;
    const sea = WATER + s.pose.y;
    // the galleon: towards the middle of the black ship's sea from it, sailing at it, a little off its line
    const dx0 = s.st.x - P.cx, dz0 = s.st.z - P.cz, d0m = Math.hypot(dx0, dz0);
    const tx = s.st.x - (dx0 / d0m) * 175, tz = s.st.z - (dz0 / d0m) * 175;
    const T = S.spawn('galleon', tx, tz, Math.atan2(-(s.st.x - tx), -(s.st.z - tz)) + 0.45, { id: 'film-galleon', name: 'Надежда', color: 0x2a5aa0 });
    S.setSails(T, 'all', 1, null);
    const crewOf = (ship) => C.crews.get(ship.id) || [];
    // ------------------------------------------------------------------ the black ship hunts her
    let huntOn = true;
    B._lookout = () => (huntOn && T.state !== 'sinking' && T.state !== 'wreck' ? { id: 'film', kind: 'ship', ship: T, x: T.st.x, y: T.pose.y + T.layout.deck, z: T.st.z } : null);
    // the «players» it fights: her sailors (aboard her)
    B._players = function () {
        const o = this._pl || (this._pl = []);
        o.length = 0;
        for (const v of crewOf(T)) if (!v.dead && !v.overboard && v.ship === T) o.push({ id: v.id, x: v.x, y: v.y + 2, z: v.z, ship: T });
        return o;
    };
    // ------------------------------------------------------------------ a sailor as a foe (both sides)
    const pl0 = C._playerLocal.bind(C), ab0 = C._aboard.bind(C), st0 = C._strike.bind(C), sh0 = C._share.bind(C);
    C._playerLocal = (ship, id, o) => {
        const v = C.byId.get(id);
        if (!v) return pl0(ship, id, o);
        if (v.dead || v.overboard) return null;
        if (v.ship === ship) { o.x = v.l.x; o.y = v.l.y; o.z = v.l.z; return o; }
        return ship.pose.toLocal(v.x, v.y, v.z, o);
    };
    C._aboard = (ship, id) => { const v = C.byId.get(id); return v ? !v.dead && !v.overboard && v.ship === ship : ab0(ship, id); };
    C._strike = (v, ship, id) => {
        const f = C.byId.get(id);
        if (!f) return st0(v, ship, id);
        const dx = f.x - v.x, dz = f.z - v.z, l = Math.hypot(dx, dz) || 1;
        C.hit(f, v.dmg, { x: dx / l, z: dz / l }, v.id, { weapon: true });
    };
    C._share = (ship, list) => { if (!list.some((v) => v.pirate)) sh0(ship, list); }; // (her sailors share the boarders out; the boarders go for the nearest)
    // her sailors see a boarder on her deck as their foe
    const watchDeck = () => {
        const now = performance.now();
        for (const v of crewOf(s)) if (!v.dead && !v.overboard && v.ship === T) T.hostile.set(v.id, now + 60000);
    };
    // ------------------------------------------------------------------ her helm and her guns
    const ang = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const _l = { x: 0, y: 0, z: 0 }, _o = { x: 0, y: 0, z: 0 };
    let beam = false;
    const helm = () => {
        if (T.lashTo) return;
        const st = T.st;
        const d = Math.hypot(s.st.x - st.x, s.st.z - st.z);
        const bearing = Math.atan2(-(s.st.x - st.x), -(s.st.z - st.z));
        let want = bearing + 0.45;
        if (beam && d < 260) { const a1 = bearing + Math.PI / 2, a2 = bearing - Math.PI / 2; want = Math.abs(ang(a1 - st.yaw)) < Math.abs(ang(a2 - st.yaw)) ? a1 : a2; }
        const err = ang(want - st.yaw);
        T.wheel = -Math.max(-1, Math.min(1, err * 2.2 - st.r * 3)) * 0.75 * Math.PI;
        if (st.u < 3.5) st.u += 0.04;
    };
    /** Her guns on the side that bears on the black ship: loaded, the barrels raised to reach, the fuses lit. */
    const answer = () => {
        T.pose.toLocal(s.st.x, T.pose.y, s.st.z, _l);
        const side = _l.x >= 0 ? 1 : -1;
        let i = 0;
        for (const c of T.layout.cannons) {
            if (c.side !== side) continue;
            const G = K.gunOf(T, c.id);
            if (!G || G.st.fuse > 0) continue;
            T.pose.toWorld(c.muzzle.x, c.muzzle.y, c.muzzle.z, _o);
            const D = Math.hypot(s.st.x - _o.x, s.st.z - _o.z) - s.layout.B * 0.3, h = s.pose.y + s.layout.deck * 0.5 - _o.y;
            const v = 70, gr = 9.8, v2 = v * v, disc = v2 * v2 - gr * (gr * D * D + 2 * h * v2);
            G.st.loaded = true;
            G.st.pitch = (disc < 0 ? Math.PI / 4 : Math.atan2(v2 - Math.sqrt(disc), gr * D)) + (Math.random() - 0.5) * 0.01;
            K.light(G, 'film');
            G.st.fuse += i * 0.3;
            i++;
        }
        const cap = crewOf(T).find((v) => v.role === 'captain' && !v.dead);
        if (cap) C._say(cap, 'Огонь!');
        return i;
    };
    const bears = () => {
        T.pose.toLocal(s.st.x, T.pose.y, s.st.z, _l);
        return Math.atan2(Math.abs(_l.z), Math.abs(_l.x)) < 0.3;
    };
    // ------------------------------------------------------------------ the camera
    const cam = { p: new THREE.Vector3(), at: new THREE.Vector3(), fov: 50, ok: false };
    const W = (ship, x, y, z) => { const st = ship.st, c = Math.cos(st.yaw), sn = Math.sin(st.yaw); return new THREE.Vector3(st.x + x * c + z * sn, sea + y, st.z - x * sn + z * c); }; // (ship-local, level: no roll)
    const D = (ship, x, y, z) => { ship.pose.toWorld(x, y, z, _o); return new THREE.Vector3(_o.x, _o.y, _o.z); }; // (on her deck: rolls with her)
    const mid = () => new THREE.Vector3((s.st.x + T.st.x) / 2, sea, (s.st.z + T.st.z) / 2);
    const lerp = (a, b, k) => a + (b - a) * k;
    const ease = (k) => k * k * (3 - 2 * k);
    const orig = g._updateCamera.bind(g);
    let shake = 0;
    g._updateCamera = (dt) => {
        orig(dt);
        if (!cam.ok) return;
        g.camera.position.copy(cam.p);
        if (shake > 0.01) g.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
        shake *= 0.85;
        g.camera.lookAt(cam.at);
        if (g.camera.fov !== cam.fov) { g.camera.fov = cam.fov; g.camera.updateProjectionMatrix(); }
        g.character.group.visible = false;
        // (only the picture: the words over the heads are not in it — glows and sparks are)
        g.scene.traverse((o) => { if (o.isSprite && o.material?.blending !== THREE.AdditiveBlending) o.visible = false; });
    };
    // the player: out of the way, high over the camera (the world, the shadows and the crews' detail load round him)
    const pin = () => {
        const ch = g.character;
        ch.group.position.set(cam.ok ? cam.p.x : (s.st.x + T.st.x) / 2, 140, cam.ok ? cam.p.z : (s.st.z + T.st.z) / 2);
        ch.verticalVelocity = 0;
    };
    // ------------------------------------------------------------------ a camera that sees: nothing solid between
    const ray = new THREE.Raycaster();
    let frameNo = 0;
    const _d = new THREE.Vector3();
    const solid = (h) => h.object.isMesh && h.object.visible && !(h.object.material?.transparent && h.object.material.opacity < 0.6);
    /** Nothing of the two ships (hulls, masts, sails) between the eye and what it looks at. */
    const clear = (p, at) => {
        const roots = [T.model?.group, s.model?.group].filter(Boolean);
        for (const [ox, oy] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.6]]) {
            const from = _d.set(at.x + ox, at.y + oy, at.z);
            const dir = p.clone().sub(from), len = dir.length();
            ray.set(from, dir.normalize());
            ray.far = len;
            if (ray.intersectObjects(roots, true).some(solid)) return false;
        }
        return true;
    };
    /** The first clear one of the candidate places (a stable choice: it keeps its place while that stays clear). */
    const choose = (memo, at, cands) => {
        if (memo.i != null && memo.i < cands.length && clear(cands[memo.i], at)) { memo.bad = 0; return cands[memo.i]; }
        if (memo.i != null && (++memo.bad < 6 || frameNo - (memo.scan || -99) < 15)) return cands[memo.i]; // (a new look round: not every frame — the rays are not free)
        memo.bad = 0; memo.scan = frameNo;
        for (let i = 0; i < cands.length; i++) if (clear(cands[i], at)) { memo.i = i; return cands[i]; }
        memo.i = memo.i ?? 0;
        return cands[memo.i];
    };
    /** Places round a point on her deck (local x, z): rings at r m, h m over the deck, starting at angle a0. */
    const ringOn = (ship, x, z, a0, rs, hs) => {
        const out = [];
        const L = ship.layout;
        for (const r of rs) for (const h of hs) for (let j = 0; j < 12; j++) {
            const a = a0 + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.45;
            out.push(D(ship, x + Math.cos(a) * r, L.deck + h, z + Math.sin(a) * r));
        }
        return out;
    };
    // ------------------------------------------------------------------ the story: who is where
    const alive = (ship, on) => crewOf(ship).filter((v) => !v.dead && (!on || (v.ship === on && !v.overboard)));
    const captain = () => crewOf(s).find((v) => v.role === 'blackbeard');
    let hero = null;
    /** The thick of it: one boarder (the captain if he is over) and the sailor he fights — the middle of the two. */
    const centroid = () => {
        const cap = captain();
        const engaged = (v) => v && !v.dead && v.ship === T && !v.overboard && v.foe && C.byId.get(v.foe) && !C.byId.get(v.foe).dead;
        if (engaged(cap) && hero !== cap) hero = cap;
        if (!engaged(hero)) hero = alive(s, T).find(engaged) || null;
        if (hero) { const f = C.byId.get(hero.foe); return { x: (hero.l.x + f.l.x) / 2, z: (hero.l.z + f.l.z) / 2 }; }
        const L = [...alive(T, T), ...alive(s, T)];
        const c = { x: 0, z: 0 };
        for (const v of L) { c.x += v.l.x; c.z += v.l.z; }
        if (L.length) { c.x /= L.length; c.z /= L.length; }
        return c;
    };
    const near = () => {
        const cap = captain();
        const pirates = alive(s).filter((v) => v.ship === T || v.overboard?.leap).length + (cap && !cap.dead && cap.ship !== T ? 1 : 0);
        return alive(T, T).length <= 2 || pirates <= 2 || (cap && !cap.dead && cap.ship === T && cap.hp <= 22);
    };
    const outcome = () => {
        if (T.state === 'sinking' || T.state === 'wreck') return 'sunk'; // (her holes: the sea came in)
        if (!alive(T, T).length) return 'pirates';
        if (captain()?.dead) return 'sailors'; // (the boss is down: Captain Black Moustache fell to her sailors)
        return null;
    };
    // ------------------------------------------------------------------ the shots
    const F = {}; // what happened when (s, story time)
    const PH = 0.655; // the time of day: the evening, the sun low (the end: towards the sunset)
    const fight = (side) => {
        // low on her deck, a few metres from the thick of it; the place is chosen so nothing stands between
        const memo = {};
        let f = null;
        return () => {
            const c = centroid();
            const L = T.layout;
            if (!f) f = { cx: c.x, cz: c.z, p: null };
            f.cx = lerp(f.cx, c.x, 0.08); f.cz = lerp(f.cz, c.z, 0.08);
            const at = D(T, f.cx, L.deck + 1.5, f.cz);
            const a0 = side > 0 ? (f.cz > 0 ? -Math.PI / 2 : Math.PI / 2) + 0.5 : (f.cz > 0 ? -Math.PI / 2 : Math.PI / 2) - 0.6; // (along her length, towards the open deck)
            const want = choose(memo, at, ringOn(T, f.cx, f.cz, a0, [7, 9.5, 5.5], [2.3, 3.6]));
            f.p = f.p ? f.p.lerp(want, 0.12) : want.clone();
            return { p: f.p.clone(), at, fov: 55 };
        };
    };
    const deck = fight(-1);
    /** She goes down: from the water on her far side, the black ship behind her. */
    const sinking = () => {
        const sd = Math.sign(T.pose.toLocal(s.st.x, T.pose.y, s.st.z, _l).x) || 1;
        const at = W(T, 0, 7, 0);
        const p = W(T, -sd * 40, 7, -22);
        F.sinkP = F.sinkP || p.clone();
        return { p: F.sinkP, at, fov: 52 };
    };
    const SHOTS = [
        {
            name: 'intro', start: (t) => t > 0.3, end: (t, t0) => t - t0 >= 5.0, keep: 5.0,
            cam: (k) => {
                // off the galleon's side, low over the water and rising: she near, the black ship coming over the sea
                const dx = s.st.x - T.st.x, dz = s.st.z - T.st.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
                const e = ease(k), side = F.introSide || (F.introSide = 1);
                const p = new THREE.Vector3(T.st.x - ux * lerp(60, 80, e) - uz * side * lerp(75, 95, e), sea + lerp(5, 22, e), T.st.z - uz * lerp(60, 80, e) + ux * side * lerp(75, 95, e));
                const at = new THREE.Vector3(T.st.x + ux * l * 0.5, sea + lerp(14, 10, e), T.st.z + uz * l * 0.5);
                return { p, at, fov: 46 };
            },
            on: () => { beam = true; },
        },
        {
            // the black ship's broadside: from beside its guns, along its hull
            name: 'broadside', start: () => s.layout.cannons.some((c) => K.gunOf(s, c.id)?.st.fuse > 0), end: (t, t0) => t - t0 >= 3.6, keep: 3.4, wait: 90,
            on: () => { F.side = Math.sign(s.pose.toLocal(T.st.x, s.pose.y, T.st.z, _l).x) || 1; },
            cam: (k) => {
                // close by its gunports, a little ahead of them: the muzzles flash towards the camera's side
                const sd = F.side, L = s.layout;
                const guns = L.cannons.filter((c) => c.side === sd).sort((a, b) => a.z - b.z);
                const gz = guns.length ? guns[Math.floor(guns.length / 2)].z : 0;
                return { p: W(s, sd * (L.B / 2 + lerp(9, 11, k)), L.deck + lerp(0.5, 1.5, k), gz - 16), at: W(s, sd * (L.B / 2 + 1), L.deck + 0.5, gz + 3), fov: 55 };
            },
            frame: () => { if (K.flying.some((b) => b.t < 0.05 && b.ship === s)) shake = Math.max(shake, 0.5); },
        },
        {
            // the balls arrive: by the galleon, her side to them
            name: 'hits', start: () => true, end: (t, t0) => t - t0 >= 3.4 || (F.hitT && t - F.hitT > 1.6 && t - t0 > 2.4), keep: 2.4,
            cam: (k) => {
                const sd = Math.sign(T.pose.toLocal(s.st.x, T.pose.y, s.st.z, _l).x) || 1, L = T.layout;
                const p = W(T, sd * (L.B / 2 + 16), lerp(8, 9, k), -L.L / 2 + 2);
                return { p, at: W(T, sd * 2, L.deck - 1, 6), fov: 52 };
            },
            frame: (t) => { if (!F.hitT && T.holes.length + T.fires.length > (F.dmg0 ?? (F.dmg0 = T.holes.length + T.fires.length))) F.hitT = t; },
        },
        {
            // her answer: from behind her guns, towards the black ship — its barrier flashes
            name: 'answer', start: () => bears() || (F.waitA = (F.waitA || 0) + 1) > 30 * 14, end: (t, t0) => t - t0 >= 4.6, keep: 4.2, wait: 40,
            on: () => { F.answered = answer(); F.aSide = Math.sign(T.pose.toLocal(s.st.x, T.pose.y, s.st.z, _l).x) || 1; },
            cam: (k) => {
                const sd = F.aSide, L = T.layout;
                const gun = T.layout.cannons.find((c) => c.side === sd) || T.layout.cannons[0];
                const p = D(T, sd * (L.B / 2 - 4.5 - k * 0.6), L.deck + 3.9, gun.z + 7 - k * 2);
                const at = new THREE.Vector3().lerpVectors(D(T, sd * (L.B / 2 + 10), L.deck + 1, gun.z - 2), new THREE.Vector3(s.st.x, sea + 10, s.st.z), ease(Math.min(1, k * 1.4)));
                return { p, at, fov: 52 };
            },
            frame: () => { if (K.flying.some((b) => b.t < 0.05 && b.ship === T)) shake = Math.max(shake, 0.35); },
        },
        {
            // the second broadside, low over the water between them: both ships in it
            name: 'broadside2', start: () => s.layout.cannons.some((c) => K.gunOf(s, c.id)?.st.fuse > 0), end: (t, t0) => t - t0 >= 4.2, keep: 3.4, wait: 60, optional: true,
            cam: (k) => {
                const m = mid(), dx = T.st.x - s.st.x, dz = T.st.z - s.st.z, l = Math.hypot(dx, dz) || 1;
                const nx = -dz / l, nz = dx / l, r = Math.max(50, l * 0.65);
                return { p: new THREE.Vector3(m.x + nx * r + (dx / l) * lerp(-10, 10, k), sea + lerp(3.5, 5, k), m.z + nz * r + (dz / l) * lerp(-10, 10, k)), at: new THREE.Vector3(m.x, sea + 9, m.z), fov: 50 };
            },
        },
        {
            // the grapnels: from high, the two hulls hauled together
            name: 'grapple', start: () => !!B.lash, end: (t, t0) => B.lash?.planks || t - t0 > 12, keep: 3.2, wait: 120,
            on: () => { beam = false; },
            cam: (k) => {
                const m = mid();
                return { p: W(s, -F.lash.side * 26, 34 - k * 3, 38 - k * 6), at: new THREE.Vector3(m.x, sea + 4, m.z), fov: 50 };
            },
        },
        {
            // the boarders leap across: low on her deck, looking up at the black ship's rail
            name: 'leap', start: () => B.lash?.planks, end: (t, t0) => (F.leapT && t - F.leapT > 2.4) || t - t0 > 20, keep: 3.6, wait: 30,
            frame: (t) => { if (!F.leapT && alive(s).some((v) => v.overboard?.leap)) F.leapT = t; },
            cam: () => {
                const gw = B._gangways(F.lash, {}), sT = gw.sT;
                const at = D(s, gw.a.x, s.layout.deck + 2.5, gw.a.z).lerp(D(T, gw.b.x, T.layout.deck + 2, gw.b.z), 0.6);
                const a0 = (sT > 0 ? Math.PI : 0) + 0.7;
                return { p: choose(F.leapMemo || (F.leapMemo = {}), at, ringOn(T, gw.b.x, gw.b.z, a0, [10, 13, 7], [1.5, 3.2])), at, fov: 58 };
            },
        },
        { name: 'melee', start: () => true, end: (t, t0) => t - t0 >= 3.6 || !!outcome(), keep: 3.6, cam: fight(1) },
        {
            // Captain Black Moustache comes over: in front of him, low
            name: 'captain', start: () => { const c = captain(); return !!c && !c.dead && (c.ship === T || !!c.overboard?.leap); }, end: (t, t0) => t - t0 >= 3.4 || !!outcome(), keep: 3.2, wait: 40, optional: true,
            cam: () => {
                const c = captain();
                const p = c.group.position;
                const yaw = c.leapYaw ?? (T.st.yaw + (c.lyaw || 0));
                const at = new THREE.Vector3(p.x, p.y + 1.8, p.z);
                const cands = [];
                for (const r of [5.5, 7.5]) for (const h of [1.4, 2.6]) for (let j = 0; j < 12; j++) {
                    const a = yaw + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.4 + 0.3; // (in front of him, a little to the side first)
                    cands.push(new THREE.Vector3(p.x - Math.sin(a) * r, p.y + h, p.z - Math.cos(a) * r));
                }
                const want = choose(F.capMemo || (F.capMemo = {}), at, cands);
                F.capP = F.capP ? F.capP.lerp(want, 0.15) : want.clone();
                return { p: F.capP.clone(), at, fov: 55 };
            },
        },
        // the decisive moments: the fight rolls until it is decided, the last seconds are kept
        { name: 'decisive', start: (t) => near() || !!outcome() || t > 400, end: (t, t0) => (F.endT && t - F.endT > (F.winner === 'sunk' ? 2.6 : 1.0)) || t - t0 > 45, keep: 3.6, frame: (t) => { if (!F.endT && outcome()) { F.endT = t; F.winner = outcome(); } }, cam: (k, t) => (T.state === 'sinking' || T.state === 'wreck' ? sinking() : deck(k, t)) },
        {
            // the end: slowly up and away, the evening coming
            // (she goes down: the final shot a few seconds on, when it shows)
            name: 'final', start: (t) => F.winner !== 'sunk' || t - F.endT > 8, end: (t, t0) => t - t0 >= 6.5, keep: 6.5,
            on: () => { F.ph0 = g.dayPhase(); },
            cam: (k) => {
                const H = Number.isFinite(T.st.x) ? T : s;
                const m = W(H, 0, 0, 0);
                const e = ease(k);
                const a = H.st.yaw + 0.9 + e * 0.5, r = lerp(30, 120, e);
                return { p: new THREE.Vector3(m.x + Math.sin(a) * r, sea + lerp(14, 60, e), m.z + Math.cos(a) * r), at: new THREE.Vector3(m.x, sea + lerp(8, 4, e), m.z), fov: 50 };
            },
            frame: (t, t0) => { F.ph = F.ph0 + (t - t0) * 0.004; },
        },
    ];
    // ------------------------------------------------------------------ the step
    let t = 0, si = 0, shot = null, rolling = [], idle = 0;
    frameNo = 0;
    const emitted = [];
    const log = [];
    const realRender = g.renderer.render.bind(g.renderer);
    const film = {
        T, s, log, F,
        phase,
        /** Up to `n` frames of the game; the frames of shots that are over come back (JPEG data URLs). */
        run(n) {
            for (let i = 0; i < n && emitted.length < 40; i++) {
                if (si >= SHOTS.length && !shot) return { frames: emitted.splice(0), done: true, log: log.splice(0), winner: F.winner || null };
                const def = SHOTS[si];
                if (!shot && def) {
                    idle++;
                    // (a shot that may not come: let go of it as soon as the next one's moment is here)
                    if (def.optional && SHOTS[si + 1]?.start(t)) { log.push(`${t.toFixed(1)} s ${def.name}: passed over`); si++; idle = 0; continue; }
                    if (def.start(t)) { shot = { def, t0: t }; rolling = []; idle = 0; def.on?.(t); log.push(`${t.toFixed(1)} s ${def.name}`); }
                    else if (def.wait && idle > def.wait * FPS) { log.push(`${t.toFixed(1)} s ${def.name}: not this time`); si++; idle = 0; continue; }
                }
                helm();
                watchDeck();
                if (B.lash) F.lash = B.lash;
                else if (F.lash && !F.lashLost) { F.lashLost = t; log.push(`${t.toFixed(1)} s the lines are off: taken=${B.taken} owner=${s.owner} awake=${s.awake} lashTo=${T.lashTo} T=${T.state} s=${s.state} phase=${B.phase} sailors=${alive(T, T).length}`); }
                { const ph = F.ph ?? PH; g.dayStart = Date.now() - DAY * ph; if (Math.abs(ph - (F.lastPh ?? -1)) > 0.0005) { g.world.setDayPhase(ph); F.lastPh = ph; } }
                vt += DT;
                if (shot) {
                    const k = Math.min(1, (t - shot.t0) / shot.def.keep);
                    const c = shot.def.cam(k, t);
                    const ok = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
                    if (ok(c.p) && ok(c.at)) { cam.p.copy(c.p); cam.at.copy(c.at); cam.fov = c.fov || 50; cam.ok = true; }
                    else if (!F.nanLog) { F.nanLog = true; log.push(`${t.toFixed(1)} s ${shot.def.name}: no camera (T ${T.st.x},${T.st.z},${T.st.yaw} s ${s.st.x},${s.st.z})`); }
                    g.renderer.render = realRender;
                } else { cam.ok = false; g.renderer.render = () => {}; }
                pin();
                g.frame();
                frameNo++;
                t += DT / 1000;
                if (shot) {
                    shot.def.frame?.(t, shot.t0);
                    rolling.push(g.renderer.domElement.toDataURL('image/jpeg', 0.93));
                    const max = Math.round(shot.def.keep * FPS);
                    if (rolling.length > max) rolling.shift();
                    if (shot.def.end(t, shot.t0)) {
                        emitted.push(...rolling);
                        log.push(`${t.toFixed(1)} s ${shot.def.name}: ${rolling.length} frames`);
                        rolling = []; shot = null; si++;
                    }
                }
            }
            const cap = captain();
            return { frames: emitted.splice(0), done: false, log: log.splice(0), t, shot: shot?.def.name || SHOTS[si]?.name, bb: B.phase, sailors: alive(T, T).length, onT: alive(s, T).length, cap: cap?.dead ? 'dead' : cap?.ship === T ? 'aboard ' + cap.hp : 'home', holes: T.holes.length };
        },
    };
    window.__film = film;
    g.renderer.render = () => {};
    return { sea, black: [s.st.x, s.st.z], galleon: [T.st.x, T.st.z] };
}

const srv = await startServer(port);
const browser = await launch();
let winner = null, n = 0;
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: W, height: H } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    // the black ship's sea: the player there first, the world loaded round it (in real time)
    await page.evaluate(async () => {
        const g = window.__zns.game, s = g.blackbeard._ensure(), ch = g.character;
        g.config.mode = 'creative';
        const sp = g.blackbeard.spot;
        for (let i = 0; i < 200; i++) { ch.group.position.set(sp.cx, 140, sp.cz); ch.verticalVelocity = 0; await new Promise((r) => setTimeout(r, 25)); }
        void s;
    });
    console.log('setup', JSON.stringify(await page.evaluate(`(${setup.toString()})()`)));
    for (;;) {
        const r = await page.evaluate(() => window.__film.run(30));
        for (const f of r.frames) fs.writeFileSync(path.join(tmp, `f${String(n++).padStart(5, '0')}.jpg`), Buffer.from(f.split(',')[1], 'base64'));
        for (const l of r.log) console.log('  ' + l);
        if (r.done) { winner = r.winner; break; }
        if (Math.floor(r.t / 5) !== Math.floor((r.t - 1) / 5)) console.log(`t=${r.t.toFixed(1)} shot=${r.shot} bb=${r.bb} sailors=${r.sailors} boarders=${r.onT} captain=${r.cap} holes=${r.holes} frames=${n}`);
        await new Promise((res) => setTimeout(res, 5)); // (the workers' messages: the world loads in real time)
    }
    console.log('page errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
} finally {
    await browser.close();
    srv.stop();
}
console.log('frames', n, 'winner', winner);
// the film: a fade in and out; H.264, 30 fps
const mp4 = path.join(out, 'sea-battle.mp4');
const dur = n / FPS;
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(tmp, 'f%05d.jpg'),
    '-vf', `fade=t=in:st=0:d=0.6,fade=t=out:st=${(dur - 1.0).toFixed(2)}:d=1.0,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-maxrate', '4500k', '-bufsize', '9000k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(FPS), mp4]);
console.log(mp4, (fs.statSync(mp4).size / 1e6).toFixed(2), 'MB', dur.toFixed(1), 's');
// the stills: one from each act
for (const [name, at] of [['approach', 0.12], ['cannons', 0.3], ['boarding', 0.58], ['finale', 0.93]]) {
    const f = path.join(tmp, `f${String(Math.min(n - 1, Math.round(n * at))).padStart(5, '0')}.jpg`);
    const webp = path.join(out, `sea-battle-${name}.webp`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', f, '-vf', 'scale=960:-2', '-c:v', 'libwebp', '-quality', '80', webp]);
    console.log(webp);
}
if (!keepFrames) fs.rmSync(tmp, { recursive: true, force: true });
else console.log('frames kept in', tmp);
