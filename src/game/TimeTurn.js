/**
 * TimeTurn.js — «Axis» («Аксис»): the gods' spell that turns the planet on its axis — day becomes night, night becomes day.
 *
 * The author 07.11: «2000 маны, божественное. Игрок поднимает палочку вверх, произносит заклинание — и меняется время суток: с дня на ночь или с ночи на день. Не быстро,
 * а около 10 секунд — как будто планета вертится и солнце садится (или поднимается); как будто заклинание поворачивает ось планеты.»
 *
 * How it plays: the wand raised to the sky + the word → 2000 mana, and for ~10 s the planet TURNS: the Sun runs down the sky and sets (it is day) / the night wheels away and the Sun
 * climbs (it is night) — the real sky does it (the sunset's glow, the stars, the shadows swinging), because the time of day itself is moved forward by the turn: on the Earth the shared
 * clock (`Game.dayStart`), on another planet its own spin (`def.spinShift`, saved with the planets; Space.localSun / toSpace add it). The same on every computer: the cast is an ordinary spell
 * packet carrying the turn (`d.x` — how much of the day, `d.y` — to night (1) or to day (−1), `d.z` — the planet's slot, −1 the Earth); each computer moves its own clock by the same amount
 * in the same 10 s (ease in – out); a late joiner gets the host's clock. The picture: a column of violet-gold light stands from the caster into the sky (the axis), rings of rune-light turn
 * round it, a great disc of star-trails wheels in the sky above in the direction of the turn, the ground shivers a little, a deep humming swells with the turning.
 *
 * The target time: day → deep NIGHT (the nearest forward), night → full DAY (the sun high) — `turnFraction`.
 * «А если»: cast in open space / in hell → not cast (no day there); no mana / wand not raised to the sky → not cast, nothing paid; a turn already running on this planet → «already», nothing paid; a
 * place where the Sun never sets or never rises (no solution) → «здесь день не сменяется», nothing paid; two casters at once → the turns add up (each moves the clock its own part); the game paused /
 * the caster leaves mid-turn → the turn goes on to its end (it is the world's clock now); sleeping in a bed at the same time → both move the clock, the end is where the sum lands; saved game: the Earth's
 * phase and the planet's spin are saved as always; fixed time of day (Creative) → the clock is set by the turn and stays at the new hour.
 */
import * as THREE from 'three';
import { castingHand } from './WandAim.js';
import { aimedAtSky } from '../fx/Storm.js';
import { sunAt, nightAt } from '../world/World.js';

export const TURN = {
    DUR: 10, // s the turn takes
    STEP: 1 / 720, // of a day: the resolution of the search
    DAY_CYCLE_MS: 24 * 60 * 1000, // Game.DAY_CYCLE_MS (not imported: a cycle)
    NIGHT: -0.35, // the Sun's height (sin) at the «deep night» the turn aims at (planets)
    DAY: 0.55, // …and at the full day
    SKY_AIM: 0.5, // the wand's height (sin) from which it points «at the sky»
    FIRST: 12, // cells of the mana maximum the first time it really turned a day (Mana.FIRST_SPELL.Axis)
    HEIGHT: 280, // m: the sky's disc above the caster
};

/** ON WHOM / ON WHAT (CLAUDE.md «кто/что × как действует»). Checked by tests/unit/time-turn.test.js. */
export const TURN_TARGETS = {
    world: { does: 'turn', why: 'время суток едет вперёд за ~10 с: на Земле — общий часы мира, на планете — её вращение (сохраняется)' },
    me: { does: 'cast', why: '2000 маны сразу; поднятая к небу палочка; больше ничего не держит (не концентрация)' },
    players: { does: 'turn', why: 'у всех на этой планете смена суток идёт одновременно (каждый компьютер двигает свои часы на столько же); никого не ранит' },
    zombies: { does: 'none', why: 'не действует на них прямо — но ночью их больше, днём они горят (обычные правила суток)' }, castlePeople: { does: 'none', why: 'не действует; люди ложатся спать / встают по обычным правилам суток' },
    animals: { does: 'none', why: 'не действует' }, sailors: { does: 'none', why: 'не действует' },
    titans: { does: 'none', why: 'не действует; но Железный титан раскаляется только под Солнцем, Титан-тень боится света (обычные правила суток планеты)' },
    sun: { does: 'none', why: 'само Солнце не двигается — поворачивается планета; «Helios» и «Sun Ray» работают по обычным правилам' },
    space: { does: 'none', why: 'в открытом космосе нет суток — не колдуется (Space.spaceSpellBlock)' },
    hell: { does: 'none', why: 'в аду вечные сумерки, суток нет — не колдуется (HellRules.hellSpellBlock)' },
    spells: { does: 'none', why: 'другие заклинания идут как обычно' },
};

/** Smooth start and end: 0…1 → 0…1 (a heavy planet starts slowly and settles gently). Pure. */
export const easeTurn = (u) => { const x = Math.max(0, Math.min(1, u)); return x * x * x * (x * (x * 6 - 15) + 10); };

/**
 * The share of a day to turn forward from now so that `elevOf(f)` (the Sun's height f of a day later) reaches the night (`toNight`) or the day — the nearest such f in (0, 1], or null (never).
 * Pure: `elevOf` is a function of the fraction. The search is forward only: a planet turns the way it turns.
 */
export function solveTurn(elevOf, toNight) {
    const want = toNight ? (e) => e <= TURN.NIGHT : (e) => e >= TURN.DAY;
    for (let f = TURN.STEP; f <= 1 + 1e-9; f += TURN.STEP) if (want(elevOf(f))) return Math.min(1, f);
    return null;
}
/** The Earth: the turn from the day phase `p` (the clock's), using the real sun curve (World.sunAt) — null when impossible. Pure. */
export function earthTurn(p, toNight) {
    return solveTurn((f) => sunAt(p + f, _v), toNight);
}
/** Is it day at this phase? (the Sun above the horizon) Pure. */
export const earthIsDay = (p) => sunAt(p, _v) > 0.05;

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`;
const FLAT_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// the sky's disc: star-trails wheeling round the axis (long streaks along the spiral arms), a dim violet haze, a gold heart where the axis pierces it
const SKY_FS = `
uniform float uTime, uOpacity, uDir;
varying vec2 vUv;
${NOISE}
void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q);
    if (r > 1.0) discard;
    float a = atan(q.y, q.x) + uTime * 0.5 * uDir * (1.0 - r * 0.6);          // (the inner part turns faster: a vortex)
    float streak = 0.0;
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float rad = r * (28.0 + fi * 37.0);
        float ang = a * (1.0 + fi) * 6.0;
        float cell = floor(rad);
        float st = smoothstep(0.82, 0.98, h21(vec2(cell, fi * 5.0 + floor(ang / 6.2831 * 2.0))));
        float along = smoothstep(0.0, 0.5, fract(ang / 6.2831 * 3.0 + h21(vec2(cell, fi))));      // (a streak: a long arc, not a dot)
        streak += st * along * (1.0 - smoothstep(0.55, 0.62, abs(fract(rad) - 0.5)));
    }
    float haze = (0.3 + 0.7 * vn(vec2(a * 3.0, r * 7.0 - uTime * 0.4 * uDir))) * (1.0 - smoothstep(0.1, 1.0, r)) * 0.35;
    float heart = exp(-r * r * 40.0);
    float rim = smoothstep(0.7, 0.98, r) * (1.0 - smoothstep(0.98, 1.0, r)) * 0.25;
    vec3 col = vec3(0.55, 0.45, 1.0) * haze + vec3(1.0, 0.92, 0.7) * streak * 1.1 + vec3(1.0, 0.8, 0.4) * heart * 1.4 + vec3(0.7, 0.6, 1.0) * rim;
    float al = clamp(haze + streak * 0.9 + heart + rim, 0.0, 1.0) * (1.0 - smoothstep(0.88, 1.0, r));
    gl_FragColor = vec4(col, al * uOpacity);
}`;
// the axis: a tall column, rings of light sliding along it, spiralling threads, a shimmering edge
const AXIS_VS = `
uniform float uTime;
varying vec3 vN, vV;
varying float vY, vA;
${NOISE}
void main() {
    vec3 p = position;
    float a = atan(p.z, p.x);
    vY = p.y; vA = a;
    p.xz += normalize(p.xz + 1e-5) * (vn(vec2(p.y * 0.05 - uTime * 3.0, a * 2.0)) - 0.5) * 2.0;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
}`;
const AXIS_FS = `
uniform float uTime, uOpacity, uDir;
varying vec3 vN, vV;
varying float vY, vA;
${NOISE}
void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float body = pow(f, 1.6), core = pow(f, 5.0);
    float rings = pow(0.5 + 0.5 * sin(vY * 0.11 - uTime * 4.0 * uDir), 6.0);
    float thread = smoothstep(0.7, 0.96, vn(vec2(vA * 3.0 + vY * 0.03 * uDir + uTime * 1.6 * uDir, vY * 0.04 - uTime * 0.5)));
    vec3 col = mix(vec3(0.6, 0.45, 1.0), vec3(1.0, 0.9, 0.6), clamp(core + rings * 0.6, 0.0, 1.0)) + vec3(1.0, 0.95, 0.8) * thread * 0.5;
    float a = (body * 0.35 + core * 0.7 + rings * body * 0.8 + thread * body * 0.5) * smoothstep(0.0, 18.0, vY) * (1.0 - smoothstep(0.75, 1.0, vY / 560.0));
    gl_FragColor = vec4(col, clamp(a * uOpacity, 0.0, 1.0));
}`;
// the rune rings on the ground: the same recipe as «Helios»'s (thin circles, glyph-like marks between them, dots)
const RUNE_FS = `
uniform float uTime, uOpacity, uDir;
varying vec2 vUv;
${NOISE}
void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q), a = atan(q.y, q.x) + uTime * 0.4 * uDir;
    if (r > 1.0) discard;
    float l1 = smoothstep(0.985, 0.995, r) * (1.0 - smoothstep(0.995, 1.0, r)), l2 = smoothstep(0.80, 0.81, r) * (1.0 - smoothstep(0.81, 0.82, r));
    float band = smoothstep(0.81, 0.83, r) * (1.0 - smoothstep(0.975, 0.99, r));
    float cell = floor((a + 3.14159) / 6.28318 * 30.0), f = fract((a + 3.14159) / 6.28318 * 30.0);
    float glyph = step(0.2, f) * step(f, 0.8) * step(0.4, h21(vec2(cell, 11.0))) * (0.5 + 0.5 * step(0.5, fract((r - 0.81) * 20.0 + h21(vec2(cell, 5.0)) * 5.0)));
    float dots = smoothstep(0.9, 1.0, sin(a * 60.0)) * smoothstep(0.78, 0.8, r) * (1.0 - smoothstep(0.8, 0.82, r));
    float al = clamp(l1 + l2 + band * glyph * 0.9 + dots, 0.0, 1.0);
    gl_FragColor = vec4(mix(vec3(0.7, 0.55, 1.0), vec3(1.0, 0.95, 0.8), l1 + dots), al * uOpacity);
}`;

const shader = (vs, fs, uniforms) => { const m = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }); m.userData.shared = true; return m; };
let _geo = null;
function geos() {
    if (_geo) return _geo;
    const disc = new THREE.CircleGeometry(1, 64); disc.rotateX(-Math.PI / 2); disc.userData.shared = true;
    const col = new THREE.CylinderGeometry(1.6, 3.2, 560, 24, 24, true); col.translate(0, 280, 0); col.userData.shared = true;
    _geo = { disc, col };
    return _geo;
}

export class TimeTurn {
    constructor(game) {
        this.game = game;
        this.anims = []; // the turns going on: { realm, f, dir (±1: the night / the day), t, applied, at: {x, z}, by, mine }
        this._first = false;
        const G = geos();
        this.group = new THREE.Group(); this.group.visible = false;
        const u = (dir = 1) => ({ uTime: { value: 0 }, uOpacity: { value: 0 }, uDir: { value: dir } });
        this.skyMat = shader(FLAT_VS, SKY_FS, u());
        this.axisMat = shader(AXIS_VS, AXIS_FS, u());
        this.runeMats = [shader(FLAT_VS, RUNE_FS, u(1)), shader(FLAT_VS, RUNE_FS, u(-1))];
        this.sky = new THREE.Mesh(G.disc, this.skyMat); this.axis = new THREE.Mesh(G.col, this.axisMat);
        this.runes = this.runeMats.map((m) => new THREE.Mesh(G.disc, m));
        for (const m of [this.sky, this.axis, ...this.runes]) { m.frustumCulled = false; m.renderOrder = 8; this.group.add(m); }
        game.scene.add(this.group);
        this._fx = 0;
    }

    sampleModels() {
        const G = geos();
        const out = [new THREE.Mesh(G.disc, this.skyMat), new THREE.Mesh(G.col, this.axisMat), new THREE.Mesh(G.disc, this.runeMats[0])];
        for (const m of out) m.scale.setScalar(0.01);
        return out;
    }

    get turning() { return this.anims.length > 0; }

    /** The realm the hero is in: 'earth' or a planet id; null in space / hell. */
    realm() {
        const g = this.game, S = g.space, r = S?.realm || 'earth';
        if (g.hellGate?.inHell || r === 'space') return null;
        return r;
    }

    /** The turn from now on the hero's planet: { f (of a day), toNight } or null (no solution). */
    plan() {
        const g = this.game, S = g.space, r = this.realm();
        if (!r) return null;
        if (r === 'earth' || !S?.offEarth) {
            const p = g.dayPhase?.() ?? 0, toNight = earthIsDay(p), f = earthTurn(p, toNight);
            return f == null ? null : { f, toNight, realm: 'earth' };
        }
        const def = S.planets?.get?.(r), me = g.character.group.position;
        if (!def || !S.localSunSpun) return null;
        const t = S.now(), now = S.localSunSpun(def, me.x, me.z, t, 0).y, toNight = now > 0.05;
        const f = solveTurn((x) => S.localSunSpun(def, me.x, me.z, t, x * Math.abs(def.day || 1)).y, toNight);
        return f == null ? null : { f, toNight, realm: r };
    }

    // ============================================================ my side: the word
    /** Voice on my computer. → 'Axis' (cast) | null. */
    cast(isFinal) {
        const g = this.game, ch = g.character;
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (g.hellGate?.inHell) return hint('🌍 В аду вечные сумерки — суток нет, поворачивать нечего');
        if (g.space?.realm === 'space') return hint('🌍 В открытом космосе нет суток — встаньте на землю или на планету');
        if (g.imperius?.active || g.dragonForm?.active || g.monster?.active) return hint('🌍 В этом теле ось планеты не повернуть');
        const aim = castingHand(g);
        if (!aim || !ch.isArmRaised(aim.side)) return hint('🌍 Поднимите руку (палочку) к небу и скажите «Axis»');
        if (!aimedAtSky(aim.dir, TURN.SKY_AIM)) return hint('🌍 Направьте руку или палочку вверх, к небу — и скажите «Axis»');
        const r = this.realm();
        if (this.anims.some((a) => a.realm === r)) return hint('🌍 Планета уже поворачивается — подождите, пока закончится');
        const plan = this.plan();
        if (!plan) return hint('🌍 Здесь день не сменяется — поворачивать нечего');
        const tired = g.combat.check('Axis');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('Axis');
        const p = ch.group.position, o = _v.set(p.x, p.y - 1.9, p.z).clone();
        const slot = plan.realm === 'earth' ? -1 : (g.space.planets.get(plan.realm)?.slot ?? -1);
        const d = new THREE.Vector3(plan.f, plan.toNight ? 1 : -1, slot);
        g.spells.cast('Axis', o, d, aim.side, g.localId);
        g.sync?.spell('Axis', o, d, aim.side);
        g.hud.setVoice(plan.toNight ? '🌍 <span style="color:#c9b8ff">Axis!</span> Планета поворачивается — Солнце садится…' : '🌍 <span style="color:#ffe08a">Axis!</span> Планета поворачивается — Солнце поднимается…', true);
        return 'Axis';
    }

    // ============================================================ every computer
    /** The cast arrives (every computer, the caster's too): `d` = (f, ±1, slot). */
    start(o, d, casterId) {
        const g = this.game, by = casterId === 'local' || casterId == null ? g.localId : casterId;
        const f = Math.max(0, Math.min(1, d.x)), toNight = d.y > 0, slot = Math.round(d.z);
        let realm = 'earth';
        if (slot >= 0) { const def = g.space?.planets?.bySlot?.(slot); if (!def) return; realm = def.id; }
        const A = { realm, f, toNight, t: 0, applied: 0, x: o.x, y: o.y, z: o.z, by, mine: by === g.localId, burst: 0, rings: 0 };
        this.anims.push(A);
        this.group.visible = true;
        g.fx?.lightFlash?.(o, toNight ? 0xc9b8ff : 0xffe08a, 6, 0.8, 120);
        g.sound?.playSpellFx?.('fxAxisTurn', o, 1, 1);
    }

    update(dt) {
        const g = this.game;
        if (!this.anims.length) { if (this.group.visible) this.group.visible = false; return; }
        const now = this.realm();
        for (let i = this.anims.length - 1; i >= 0; i--) {
            const A = this.anims[i];
            A.t += dt;
            const u = easeTurn(A.t / TURN.DUR), step = A.f * (u - A.applied);
            A.applied = u;
            this._move(A, step);
            if (A.t >= TURN.DUR) {
                this.anims.splice(i, 1);
                if (A.mine && !this._first) { this._first = true; g.mana?.success?.('Axis'); }
                g.hud?.setVoice?.(A.toNight ? '🌙 Наступила ночь' : '☀️ Наступил день', A.mine);
                continue;
            }
            if (now === A.realm || (A.realm === 'earth' && now === 'earth')) this._drawFor(A, dt);
        }
        if (!this.anims.some((A) => A.realm === now)) { this.sky.visible = this.axis.visible = false; for (const r of this.runes) r.visible = false; }
        if (!this.anims.length) this.group.visible = false;
    }

    /** Move the clock by `frac` of a day: the Earth's (every computer's own dayStart), or a planet's spin. */
    _move(A, frac) {
        const g = this.game;
        if (!(frac > 0)) return;
        if (A.realm === 'earth') {
            g.dayStart -= frac * TURN.DAY_CYCLE_MS; // (the phase = (now − dayStart) / cycle: earlier start = later in the day)
            g.world?.setDayPhase?.(g.dayPhase());
        } else {
            const def = g.space?.planets?.get?.(A.realm);
            if (def) def.spinShift = (def.spinShift || 0) + frac * Math.abs(def.day || 0); // (seconds of the planet's own time forward: Space.localSun adds it to the spin)
        }
    }

    /** The picture while a turn goes on here: the axis, the rings, the wheeling sky, the humming ground. */
    _drawFor(A, dt) {
        const g = this.game, fx = g.fx, t = A.t, D = TURN.DUR;
        const env = Math.min(1, t / 1.2) * Math.min(1, (D - t) / 1.8); // (in 1.2 s, out over the last 1.8)
        const me = g.character.group.position;
        const dir = A.toNight ? 1 : -1;
        const ax = A.x, az = A.z, gy = A.y - 0.2;
        this.axis.visible = this.sky.visible = true;
        this.axis.position.set(ax, gy, az);
        const au = this.axisMat.uniforms; au.uTime.value = t; au.uOpacity.value = 0.8 * env; au.uDir.value = dir;
        this.sky.position.set(ax, gy + TURN.HEIGHT, az);
        const R = 120 + 330 * Math.min(1, t / 3);
        this.sky.scale.setScalar(R);
        const su = this.skyMat.uniforms; su.uTime.value = t; su.uOpacity.value = 0.85 * env; su.uDir.value = dir;
        for (let i = 0; i < 2; i++) {
            const r = this.runes[i];
            r.visible = true;
            r.position.set(ax, gy + 0.1 + i * 0.1, az);
            r.scale.setScalar((i ? 34 : 15) * (0.4 + 0.6 * Math.min(1, t / 1.6)));
            const ru = this.runeMats[i].uniforms; ru.uTime.value = t; ru.uOpacity.value = 0.9 * env;
        }
        if (fx) {
            // sparks wheeling up round the axis, and a low hum of the ground shaking near it
            A.burst += dt * 70 * env;
            while (A.burst >= 1) {
                A.burst -= 1;
                const h = Math.random() * 380, ang = h * 0.08 * dir + t * 2.2 * dir + Math.random() * 6.28, rad = 5 + Math.random() * 14;
                fx.spark(_c.set(ax + Math.cos(ang) * rad, gy + h, az + Math.sin(ang) * rad), Math.random() < 0.5 ? (A.toNight ? 0xc9b8ff : 0xffe08a) : 0xffffff, 0.12 + Math.random() * 0.16, _a.set(-Math.sin(ang) * 10 * dir, 6 + Math.random() * 8, Math.cos(ang) * 10 * dir), 1 + Math.random());
            }
            const near = Math.max(0, 1 - Math.hypot(me.x - ax, me.z - az) / 260);
            fx.shake = Math.max(fx.shake || 0, 0.09 * env * near);
        }
    }

    dispose() {
        this.anims.length = 0;
        this.game.scene.remove(this.group);
        for (const m of [this.skyMat, this.axisMat, ...this.runeMats]) m.dispose();
    }
}
