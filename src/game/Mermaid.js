/**
 * Mermaid.js — «Зелье русалки» (the author 05.11: «Русалка (12 мин): хвост, дышит под водой, ×2 скорость при «рыбьих» движениях с
 * поднятыми руками, не ходит; «стоп» не снимает: хвост магического водного существа + груша Баксади»). The effect's clock is
 * PotionEffects ('mermaid', 12 min — «Обнуление» and death end it, «стоп» does not: it is no spell); here is what it does:
 *   - the legs are gone: a fish's tail grows from the hips (the model below), seen by everyone (the pose packet's px bit 8);
 *   - under the water the air never runs out (Swimming);
 *   - in the water: the TORSO swaying side to side, the way a fish wriggles (the author 05.11, the second time: «не нужно руки вверх
 *     поднимать… достаточно просто туловищем туда-сюда водить… ещё сильнее ускоряться, до 5 раз больше… при условии, что он немало
 *     времени потратил на то, чтобы петлять») — the tail drives the body on: at once twice the swimmer's top speed, and the longer the
 *     wriggling goes on, the faster — up to TAIL_TOP (five times that); the old way (the raised hands waving) works too; the arms'
 *     strokes push as always;
 *   - on the land: it does not walk — it drags itself slowly on the tail (LAND_K of the walking pace), no jumping;
 *   - the tail sweeps up and down in the water, faster the faster it swims; out of the water it lies still and only twitches.
 * What may go wrong: drunk on a horse / a broom / in flight — the tail is there, the riding goes on (no walking is the only rule); in the
 * dragon's form — the dragon goes on (the tail shows when he is a man again, if the time is left); dead — it ends (PotionEffects).
 */
import * as THREE from 'three';
import { MODEL_KIT as K } from './AnimalModels.js';
import { finGeo } from './SeaModels.js';
import { SWIM } from './SwimStroke.js';
import { changeHurt, painRed } from './TransformPain.js';

const _sp = new THREE.Vector3(), _sv = new THREE.Vector3();

export const MERMAID = {
    LAND_K: 0.18, // × the walking pace on the land (it drags itself)
    TAIL_MAX: 2, // × the swimmer's top speed with the tail, from the first strokes of it
    TAIL_TOP: 10, // × the swimmer's top speed: the tail at full rhythm (FLOW 1) — five times the start (the author: «до 5 раз больше»)
    FLOW_UP: 0.03, // 1/s the rhythm builds while the wriggling goes on (× how fast: ~25–35 s of it to the top — «немало времени петлять»)
    FLOW_DOWN: 0.45, // 1/s it falls away when the waves stop (slow ones: it eases off a little at a time)
    THRUST: 3.2, // m/s² the tail adds while the fish's movement goes on (more at a higher rhythm)
    WAVE: 0.55, // m/s: the raised hands going up and down together at least this fast — the fish's movement (the old way)
    SWAY: 0.55, // shoulder-widths a second: the torso swaying side to side at least this fast — the wriggle
    SWAY_TURN: 1.6, // s: a turn of the sway (left ↔ right) at least this recent — it is a wriggle, not one step aside
    LEN: 6.75, // m from the hips to the fluke's root (the author 05.11: «в 3 раза больше» than the first, 2.25; the legs were 1.95)
    // the change (the author 05.11: «как с крыльями… анимация какое-то время длилась… страдания… минус 1 хп… красное вокруг экрана,
    // замыливание, а через секунд 10 — хвост»)
    CHANGE_S: 10, // s from the potion to the tail
    PAIN: 1, // HP lost to it
    TAIL_GROW_S: 3, // s: the last of the change — the legs grow together into the tail
};

let _tailMats = null;
function mats() {
    if (_tailMats) return _tailMats;
    // the scales drawn per pixel (the author 05.11 saw only stripes: a vertex colour per ring is too coarse): rows of overlapping
    // rounded scales hanging toward the fluke, each with a darker rim and a glint in its middle — over the colours of scalePaint
    const scales = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, shininess: 80, specular: 0x9fe4ff });
    scales.defines = { USE_UV: '' };
    scales.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        {
            vec2 sc = vec2(vUv.y * 24.0, vUv.x * 40.0); // (round the tail, along it)
            float rowi = floor(sc.y);
            sc.x += mod(rowi, 2.0) * 0.5;
            vec2 f = fract(sc) - vec2(0.5, 0.05);
            float d = length(vec2(f.x, f.y * 0.95));
            float rim = smoothstep(0.36, 0.52, d);
            float glint = 1.0 - smoothstep(0.0, 0.42, d);
            diffuseColor.rgb *= 0.74 + 0.26 * (1.0 - rim) + 0.16 * glint;
        }`);
    };
    scales.customProgramCacheKey = () => 'mermaid-scales';
    const fin = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.82, side: THREE.DoubleSide, emissive: new THREE.Color(0x1b6f8a), emissiveIntensity: 0.25 });
    _tailMats = { scales, fin };
    return _tailMats;
}

/** A tail's colours from its hue (random for every tail — the author 05.11: «цвет рандомный будет всегда»): along it from one shade to
 *  a neighbouring one, a play of a third, the belly paler. */
function tailPalette(hue) {
    const c = new THREE.Color(), rgb = (h, s, l) => { c.setHSL(((h % 1) + 1) % 1, s, l); return [c.r, c.g, c.b]; };
    return { top: rgb(hue, 0.62, 0.42), end: rgb(hue + 0.07, 0.58, 0.34), play: rgb(hue + 0.22, 0.5, 0.5), belly: rgb(hue, 0.35, 0.74), fin: rgb(hue + 0.03, 0.55, 0.72), glow: rgb(hue, 0.7, 0.3) };
}
function scalePaintOf(P) {
    return (t, ang) => {
        let c = K.mix(P.top, P.end, t);
        c = K.mix(c, P.play, 0.22 * (0.5 + 0.5 * Math.sin(t * 9 + ang * 2)));
        return K.mix(c, P.belly, 0.4 * Math.max(0, -Math.sin(ang))); // (the belly paler)
    };
}
const finPaint = (x, y, e) => { const k = 0.62 + 0.38 * Math.min(1, e * 1.1); const v = k * (0.92 + 0.08 * Math.sin(Math.atan2(y, x) * 18)); return [v, v, v]; }; // (veins, the rim lighter; the hue — the material)

/**
 * The tails (the author 05.11: «хвост больше… в 3 раза… но выходить из туловища, не стыкаться некрасиво… до 3 типов хвостов»), all ~3×
 * the first one (6.75 m from the hips), their top as wide as the torso and set INTO it (no seam), swelling below the hips:
 *   classic — a wide crescent fluke;  veil — long flowing see-through lobes and long hip fins;  shark — a forked uneven fluke and a
 *   fin along the back.
 */
export const TAIL_TYPES = {
    classic: { prof: [[0, 0.47, 0.34, 0], [0.08, 0.7, 0.5, 0.02], [0.26, 0.86, 0.62, 0.04], [0.5, 0.64, 0.47, 0.03], [0.75, 0.35, 0.27, 0.01], [0.92, 0.16, 0.13, 0], [1, 0.11, 0.09, 0]],
        fluke: [[0, 0.1], [0.25, -0.05], [0.62, -0.42], [0.72, -0.72], [0.4, -0.55], [0.08, -0.5], [0, -0.42], [-0.08, -0.5], [-0.4, -0.55], [-0.72, -0.72], [-0.62, -0.42], [-0.25, -0.05]], flukeK: 3.1, side: 1.9, opacity: 0.85 },
    veil: { prof: [[0, 0.47, 0.34, 0], [0.08, 0.64, 0.47, 0.02], [0.3, 0.76, 0.55, 0.03], [0.6, 0.5, 0.38, 0.02], [0.85, 0.22, 0.18, 0], [1, 0.1, 0.09, 0]],
        fluke: [[0, 0.1], [0.3, -0.1], [0.75, -0.6], [0.95, -1.35], [0.6, -1.15], [0.3, -1.5], [0.08, -0.9], [0, -1.05], [-0.08, -0.9], [-0.3, -1.5], [-0.6, -1.15], [-0.95, -1.35], [-0.75, -0.6], [-0.3, -0.1]], flukeK: 2.8, side: 2.1, opacity: 0.62 },
    shark: { prof: [[0, 0.47, 0.34, 0], [0.1, 0.72, 0.54, 0.02], [0.32, 0.84, 0.62, 0.04], [0.6, 0.55, 0.42, 0.03], [0.85, 0.25, 0.2, 0], [1, 0.13, 0.11, 0]],
        fluke: [[0, 0.12], [0.2, 0.0], [0.5, -0.35], [0.85, -0.95], [0.45, -0.5], [0.12, -0.38], [0, -0.3], [-0.1, -0.36], [-0.35, -0.48], [-0.6, -0.72], [-0.42, -0.28], [-0.18, -0.02]], flukeK: 2.7, side: 1.5, opacity: 0.9, dorsal: true },
};
const TYPE_IDS = Object.keys(TAIL_TYPES);

const BEND_N = 48;
/** The tail on a character (its legs hidden): {set(on, sweep, land), dispose(), type, hue}. It BENDS along its length as it sweeps (the
 *  fluke stays on its end); on the land it lies curved back along the ground. `opts`: {type, hue} (random when not given). */
export function attachTail(character, opts = {}) {
    const g = character?.group;
    if (!g) return null;
    const type = TAIL_TYPES[opts.type] ? opts.type : TYPE_IDS[(Math.random() * TYPE_IDS.length) | 0];
    const hue = Number.isFinite(opts.hue) ? opts.hue : Math.random();
    const T = TAIL_TYPES[type], PAL = tailPalette(hue);
    const { scales } = mats();
    const fin = new THREE.MeshLambertMaterial({ color: new THREE.Color(...PAL.fin), vertexColors: true, transparent: true, opacity: T.opacity, side: THREE.DoubleSide, emissive: new THREE.Color(...PAL.glow), emissiveIntensity: 0.3 });
    const root = new THREE.Group();
    root.name = 'mermaidTail';
    const L = MERMAID.LEN, TOP = 0.45; // (it starts inside the torso, 0.45 m above the hips: no seam where they meet)
    const base = K.cached('mermaidTail3' + type, () => {
        const k = K.keys(T.prof);
        return K.sweep([K.v3(0, TOP, 0), K.v3(0, -L * 0.3, 0.12), K.v3(0, -L * 0.68, -0.05), K.v3(0, -L, 0.08)], (t) => k(t), { rings: 44, sides: 28, side: new THREE.Vector3(1, 0, 0), uv: [1, 1] });
    });
    const geo = base.clone();
    // its own colours (its hue)
    const paint = scalePaintOf(PAL), uv = geo.attributes.uv, col = new Float32Array(uv.count * 3);
    for (let i = 0; i < uv.count; i++) { const c = paint(uv.getX(i), -Math.PI / 2 + uv.getY(i) * Math.PI * 2); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const P0 = Float32Array.from(base.attributes.position.array);
    const tail = new THREE.Mesh(geo, scales);
    tail.name = 'tailBody';
    root.add(tail);
    // the fluke on the tail's end (turned with it)
    const low = new THREE.Group();
    low.scale.setScalar(T.flukeK);
    root.add(low);
    const fluke = K.mesh(low, finGeo('mermaidFluke-' + type, T.fluke, 0.03, finPaint), fin, 0, 0.05, 0);
    fluke.rotation.x = -0.15;
    // the hip fins (long and flowing on the veil tail)
    for (const sx of [1, -1]) {
        const f = K.mesh(root, finGeo('mermaidSide-' + (type === 'veil' ? 'veil' : 'short'), type === 'veil' ? [[0, 0], [0.2, -0.1], [0.42, -0.55], [0.3, -0.75], [0.12, -0.5], [0, -0.15]] : [[0, 0], [0.18, -0.08], [0.3, -0.3], [0.12, -0.24], [0, -0.12]], 0.02, finPaint), fin, 0.62 * sx, -0.7, 0.08);
        f.scale.set(sx * T.side, T.side, T.side);
        f.rotation.y = 0.45 * sx;
    }
    // the shark tail: a fin along its back, bending with it (on the spine)
    let dorsal = null;
    if (T.dorsal) {
        dorsal = K.mesh(root, finGeo('mermaidDorsal', [[0, 0], [0.25, 0.05], [0.7, 0.55], [0.55, 0.62], [0.2, 0.22], [-0.3, 0.05], [-0.4, 0]], 0.025, finPaint), fin, 0, 0, 0);
        dorsal.scale.setScalar(1.5);
    }
    g.add(root);
    const legs = [character.leftLegPivot, character.rightLegPivot].filter(Boolean);
    // the bend: in the water the angle grows down the tail with the sweep (a(s) = sweep · 1.3 · (s/L)^1.6); on the land the tail curves
    // back from the hips and lies on the ground behind (a long tail can't stand on its end — the hips are ~2 m up)
    const py = new Float32Array(BEND_N + 1), pz = new Float32Array(BEND_N + 1), pa = new Float32Array(BEND_N + 1);
    let last = NaN, lastLand = null;
    const at = (s, out) => { const f = Math.max(0, Math.min(L, s)) / L * BEND_N, i = Math.min(BEND_N - 1, f | 0), u = f - i; out[0] = pa[i] + (pa[i + 1] - pa[i]) * u; out[1] = py[i] + (py[i + 1] - py[i]) * u; out[2] = pz[i] + (pz[i + 1] - pz[i]) * u; return out; };
    const q = [0, 0, 0];
    const bend = (sweep, land) => {
        if (Math.abs(sweep - last) < 0.004 && land === lastLand) return;
        last = sweep; lastLand = land;
        const ds = L / BEND_N;
        py[0] = 0; pz[0] = 0; pa[0] = 0;
        for (let i = 1; i <= BEND_N; i++) {
            const sn = i / BEND_N;
            const a = land ? Math.min(Math.PI / 2, (sn * L) / 2.9 * (Math.PI / 2)) + sweep * sn : sweep * 1.3 * Math.pow(sn, 1.6);
            pa[i] = a; py[i] = py[i - 1] - Math.cos(a) * ds; pz[i] = pz[i - 1] - Math.sin(a) * ds; // (back: the body faces +z)
        }
        const pos = geo.attributes.position.array;
        for (let v = 0; v < pos.length; v += 3) {
            const x = P0[v], y = P0[v + 1], z = P0[v + 2];
            at(-y, q);
            const over = y > 0 ? y : 0; // (the part inside the torso: unbent)
            pos[v] = x; pos[v + 1] = q[1] + over - z * Math.sin(q[0]); pos[v + 2] = q[2] + z * Math.cos(q[0]);
        }
        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();
        low.position.set(0, py[BEND_N] - 0.08 * Math.sin(pa[BEND_N]), pz[BEND_N] + 0.08 * Math.cos(pa[BEND_N]));
        low.rotation.x = pa[BEND_N];
        if (dorsal) { at(L * 0.3, q); const R = 0.55; dorsal.position.set(0, q[1] + R * Math.sin(q[0]), q[2] - R * Math.cos(q[0])); dorsal.rotation.set(q[0], Math.PI / 2, -Math.PI / 2); } // (on its back, along it, leaning to the fluke)
    };
    bend(0, false);
    return {
        root, type, hue,
        set(on, sweep = 0, land = false) {
            root.visible = on;
            for (const l of legs) l.visible = !on;
            root.rotation.x = land ? 0 : -0.2 * sweep;
            if (on) bend(sweep, land);
        },
        dispose() { root.parent?.remove(root); geo.dispose(); fin.dispose(); for (const l of legs) l.visible = true; },
    };
}

export class Mermaid {
    constructor(game) {
        this.game = game;
        this.tail = null;
        this.ph = 0;
        this._hy = null;
        this.wave = 0;
        this.change = null; // s into the change (≥ 0), −1 done, null: no potion
    }

    get active() { return !!this.game.potionFx?.has?.('mermaid'); }

    /** Every frame: the tail on / off, its sweep; on the land — the slow drag. */
    update(dt) {
        const g = this.game, ch = g.character;
        if (!ch) return;
        const on = this.active && !g.dragonForm?.active;
        if (on && !this.tail && this.change == null) {
            // drunk just now (its full time left): the change, ~10 s; loaded / come back to an old one: the tail at once
            const left = g.potionFx?.left?.mermaid || 0, full = 12 * 60;
            if (left > full - 2) this.change = 0;
            else { this.tail = attachTail(ch); this.change = -1; }
        }
        if (!on) { if (this.tail) { this.tail.dispose(); this.tail = null; } this.change = null; this._pain(-1); return; }
        if (this.change >= 0) { this._changing(dt); if (this.change >= 0) return; }
        const swimming = !!ch.swimming;
        const sp = swimming ? (g.swim?.motion?.speed || 0) : 0;
        this.ph += dt * (swimming ? 2 + sp * 1.6 : 0.8);
        this.tail.set(true, swimming ? Math.sin(this.ph) * (0.35 + 0.15 * Math.min(1, sp / 4)) : 0.06 * Math.sin(this.ph * 3), !swimming);
        // on the land: no walking — it drags itself
        if (!swimming && ch.swimY == null) { ch.speedScale = MERMAID.LAND_K; ch.jumpAir = false; }
    }

    /**
     * The change (every frame of it): the legs cramp and shake, scales glint on them, the picture swims and the edges of the eyes go red
     * with pain in waves, −1 HP; in the last seconds the legs grow together into the tail. The hero can still move (no lock: in the water
     * he might drown — the water's breath is the potion's from the first moment: Swimming).
     */
    _changing(dt) {
        const g = this.game, ch = g.character, M = MERMAID;
        const t0 = this.change, t = (this.change += dt);
        const k = Math.min(1, t / M.CHANGE_S);
        // the words
        if (t0 === 0) g.hud?.setVoice?.('🧜 Ноги сводит судорогой… кожа горит', true);
        if (t0 < 4 && t >= 4) g.hud?.setVoice?.('🧜 Ноги покрываются чешуёй — их стягивает вместе…', true);
        if (t0 < M.CHANGE_S - M.TAIL_GROW_S && t >= M.CHANGE_S - M.TAIL_GROW_S) g.hud?.setVoice?.('🧜 Ноги срастаются в хвост!', true);
        // the pain: −1 HP when it bites (the Creative's immortal: no harm)
        if (t0 < 1.2 && t >= 1.2) this._hurt(M.PAIN);
        // the picture swims (Knockdown's dizziness) and the pain's red at the edges, in waves
        if (g.knock) { const s = 0.5 + 0.5 * Math.sin(t * 1.7); if (!(g.knock.dizzyLeft > 1.5)) { g.knock.dizzyLeft = g.knock.dizzyDur = 2.5; } g.knock.dizzyS = 0.55 * (0.45 + 0.55 * s) * (1 - 0.6 * Math.max(0, k - 0.85) / 0.15); }
        this._pain(Math.min(1, t / 1.5) * (0.55 + 0.45 * Math.sin(t * 3.4) ** 2) * (1 - Math.max(0, (t - M.CHANGE_S + 0.8) / 0.8)));
        // the legs shake; scales glint over them (teal and violet sparks), more and more
        const legs = [ch.leftLegPivot, ch.rightLegPivot].filter(Boolean);
        const shake = 0.12 * Math.min(1, t / 2);
        legs.forEach((l, i) => { l.rotation.z = (i ? -1 : 1) * Math.max(0, k - 0.3) * 0.12 + Math.sin(t * 31 + i * 2) * shake; });
        const fx = g.fx, p = ch.group.position;
        if (fx?.spark && Math.random() < dt * (6 + 30 * k)) {
            const side = Math.random() < 0.5 ? -0.3 : 0.3, y = p.y - 2 + Math.random() * 1.9;
            const c = Math.cos(ch.group.rotation.y), s = Math.sin(ch.group.rotation.y);
            fx.spark(_sp.set(p.x + side * c, y, p.z - side * s), Math.random() < 0.6 ? 0x5fe0d0 : 0xa080ff, 0.06 + Math.random() * 0.05, _sv.set((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6), 0.7);
        }
        // the tail: grows over the last seconds, the legs fade into it
        const grow = (t - (M.CHANGE_S - M.TAIL_GROW_S)) / M.TAIL_GROW_S;
        if (grow > 0 && !this.tail) this.tail = attachTail(ch);
        if (this.tail) {
            const e = Math.min(1, grow);
            this.tail.root.visible = true;
            this.tail.root.scale.set(0.55 + 0.45 * e, 0.25 + 0.75 * e * e, 0.55 + 0.45 * e);
            for (const l of legs) l.visible = e < 0.6;
        }
        if (t >= M.CHANGE_S) {
            this.change = -1;
            if (this.tail) this.tail.root.scale.set(1, 1, 1);
            for (const l of legs) l.rotation.z = 0;
            this._pain(-1);
            g.hud?.setVoice?.('🧜 Вместо ног — хвост! В воде водите туловищем вправо-влево, как рыба: чем дольше петляете, тем быстрее плывёте. Под водой дышите', true);
            g.sound?.playSea?.(p, 'tail', 0.6);
        }
    }

    _hurt(n) { changeHurt(this.game, n, 'mermaid'); }

    /** The pain's red at the edges of the eyes (k 0…1; < 0: gone) — TransformPain. */
    _pain(k) { painRed(k); }

    /**
     * The torso's sway from the camera (shoulder-widths a second; 0: not seen): the middle of the shoulders going left and right and
     * the shoulders rolling (one up, the other down) — the fish's wriggle. Counts the turns (left ↔ right) to tell it from a step aside.
     */
    _sway(dt) {
        const p = this.game.currentPose, ls = p?.leftShoulder, rs = p?.rightShoulder;
        if (!ls || !rs || !(dt > 0)) { this.swayV = Math.max(0, (this.swayV || 0) - dt * 2); return this.swayV; }
        const a = p.aspect || 4 / 3;
        const sw = Math.max(0.04, Math.hypot((ls.x - rs.x) * a, ls.y - rs.y));
        const sig = ((ls.x + rs.x) / 2) * a / sw + 0.7 * (ls.y - rs.y) / sw;
        const prev = this._sig;
        this._sig = sig;
        if (prev == null) return this.swayV || 0;
        const d = (sig - prev) / dt;
        if (!Number.isFinite(d) || Math.abs(d) > 30) return this.swayV || 0; // (a lost frame: the body jumped)
        const dir = Math.sign(d);
        if (Math.abs(d) > 0.2 && dir && dir !== this._dir) { this._dir = dir; this._turnT = 0; }
        this._turnT = (this._turnT ?? 9) + dt;
        const v = this._turnT < MERMAID.SWAY_TURN ? Math.abs(d) : 0;
        this.swayV = (this.swayV || 0) + (v - (this.swayV || 0)) * Math.min(1, dt * 3);
        return this.swayV;
    }

    /** In the water (Swimming._swim calls it): the fish's wriggle (the torso, or the raised hands waving) — the tail drives the body on. */
    swim(M, dt) {
        const g = this.game, ch = g.character;
        const up = ch.areBothHandsUp?.() || false;
        const v = ch.handRelVelocity;
        const vy = v ? (Math.abs(v.left?.y || 0) + Math.abs(v.right?.y || 0)) / 2 : 0;
        this.wave += ((up ? vy : 0) - this.wave) * Math.min(1, dt * 3);
        // the rhythm (the author 05.11: «чем больше он делает туда-сюда движений… тем быстрее он ускоряется; зависит от того, как много он
        // уже сделал движений и как быстро; хочет остановиться — не делает движений; делает медленно — небольшое замедление»):
        // it builds while the wriggle goes on (quicker for a quick one) and falls away when it stops or slows down
        const r = Math.max(this.wave / MERMAID.WAVE, this._sway(dt) / MERMAID.SWAY);
        const on = r > 1;
        if (on) this.flow = Math.min(1, (this.flow || 0) + MERMAID.FLOW_UP * Math.min(2.5, r) * dt);
        else this.flow = Math.max(0, (this.flow || 0) - MERMAID.FLOW_DOWN * (r > 0.4 ? 0.35 : 1) * dt);
        const f = this.flow;
        const top = SWIM.MAX_SPEED * (MERMAID.TAIL_MAX + (MERMAID.TAIL_TOP - MERMAID.TAIL_MAX) * f * f); // (the last of the speed comes late: «немало времени»)
        // the speed the wriggle makes now: a slower one — a lower speed, eased down to it; none — the water slows her (SwimMotion's drag)
        const want = r > 0.4 ? top * Math.min(1, 0.35 + 0.65 * Math.min(1, (r - 0.4) / 1.2)) : 0;
        if (want > M.speed) M.speed = Math.min(want, M.speed + MERMAID.THRUST * (1 + 6 * f) * Math.min(2, Math.max(0.5, r)) * dt);
        else if (want > 0) M.speed = Math.max(want, M.speed * Math.exp(-SWIM.DRAG * 0.6 * dt)); // (slower waves: eased down, streamlined)
        M.fish = true; // (SwimMotion: her way follows the head, she hardly floats up)
        if (on && M.speed > 1) M.sinceStroke = 0;
    }
}
