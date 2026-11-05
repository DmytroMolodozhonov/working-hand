/**
 * TornadoSummonFx.js — the calling of «Tornado» (the author 05.11: «анимация вызова — какой-то луч, примитивный… чтобы небо
 * развернулось и так далее, чтобы реально эпично было»; then, seeing it in the game: «должен быть луч… электрический, как будто я
 * заклинание электро кидаю… потихоньку небеса разверзнутся… чувствуется мощь, звуки интересные… палочка чуть-чуть подёргивается»).
 * Every computer plays it from the spell's packet; the spout itself comes down at its end (OceanStorm.summon with a delay of DESCEND s).
 *
 *   0 – BEAM s  the call: a branching ELECTRIC beam crackles out of the wand tip up into the sky — first along the wand, then bent
 *               up to the clouds over the place — re-struck many times a second (never the same path twice), side branches
 *               forking off it, sparks spitting from the tip, the light flickering blue-white; a rising electric whine, crackles
 *               every fraction of a second, thunder answering from above; the caster's wand shudders in the hand (Items.tremble)
 *               and the view trembles a little;
 *   0.9 – 6     the heavens open SLOWLY where the beam strikes: a glowing tear in the cloud widens into a vast vortex (up to RADIUS m) —
 *               dark spiral arms wheeling round an eye that glows from within, lightning flickering inside it, its edge torn; the world
 *               darkens and it rains (Storm.start); a low rumble swells;
 *   3 – 8       the sea answers: under the eye the water begins to turn — a disc of foam spiralling in, a ring of spray racing round
 *               and closing in, bolts striking the sea round it;
 *   DESCEND     the funnel comes down out of the eye (WaterspoutFx — the spout of OceanStorm), the vortex cloud thins into the spout's
 *               own wall cloud over the next seconds.
 * Two meshes a calling (the cloud vortex, the foam disc), shared geometries, shaders compiled at the loading screen (samples()); the
 * beam is the shared bolt pool (Effects.bolts) — no new meshes.
 */
import * as THREE from 'three';
import { WATER_LEVEL_Y } from '../world/Terrain.js';

export const TORNADO_FX = {
    DESCEND: 6, LIFE: 14, RADIUS: 260, HEIGHT: 150, MAX: 2, DARK_R: 700,
    BEAM: 2.8, // s: the electric beam from the wand into the sky
    RESTRIKE: 0.07, // s between the beam's new paths (it crackles, never the same twice)
    OPEN_AT: 0.9, OPEN_T: 5, // s: the heavens start opening where the beam strikes, and take this long to open wide
    TREMBLE: 0.05, // rad: how much the caster's wand shudders while the beam goes
};

const NOISE = /* glsl */ `
float tH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(tH(i), tH(i + vec2(1.0, 0.0)), f.x), mix(tH(i + vec2(0.0, 1.0)), tH(i + vec2(1.0, 1.0)), f.x), f.y); }
float tF(vec2 p) { return tN(p) * 0.5 + tN(p * 2.03 + 3.1) * 0.3 + tN(p * 4.1 - 7.7) * 0.2; }
`;

let _disc = null, _flat = null;
// (rings of vertices, not a fan: the vortex cloud sags down in the middle — the wall cloud lowering towards the sea)
const disc = () => _disc || (_disc = (() => { const g = new THREE.RingGeometry(0.004, 1, 96, 28); g.rotateX(-Math.PI / 2); return g; })());
const flat = () => _flat || (_flat = (() => { const g = new THREE.CircleGeometry(1, 72); g.rotateX(-Math.PI / 2); return g; })());

function cloudMat() {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uT: { value: 0 }, uOpen: { value: 0 }, uFade: { value: 1 }, uFlash: { value: 0 }, uLight: { value: 1 }, uSpin: { value: 1 } },
        vertexShader: /* glsl */ `
uniform float uT, uOpen, uSpin;
varying vec2 vP;
varying float vSag;
${NOISE}
void main() {
    vP = position.xz;
    float r = length(position.xz), a = atan(position.z, position.x);
    // the cloud is no flat lid: it sags into a lowering bowl round the eye (the wall cloud), lumpy and turning; the edge billows up
    float lumps = tF(vec2(a * 2.5 + uT * 0.3 * uSpin, r * 6.0 - uT * 0.2)) - 0.5;
    float sag = (1.0 - smoothstep(0.0, 0.55, r)) * 0.32 * smoothstep(0.1, 0.8, uOpen) + lumps * 0.07;
    vSag = sag;
    vec3 p = position; p.y -= sag;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`,
        fragmentShader: /* glsl */ `
uniform float uT, uOpen, uFade, uFlash, uLight, uSpin;
varying float vSag;
varying vec2 vP;
${NOISE}
void main() {
    float r = length(vP), a = atan(vP.y, vP.x);
    if (r > uOpen) discard;
    // spiral arms wheeling in: a log spiral, turning faster near the eye
    float turn = uT * uSpin * (0.35 + 1.4 * (1.0 - r));
    // (the arms broken up by the noise — even bands read as a target painted on the sky)
    float wob = tF(vec2(a * 1.5, r * 4.0) + uT * 0.07) * 2.5;
    float arm = sin(a * 3.0 + log(r + 0.03) * 7.0 * uSpin - turn * 3.0 + wob);
    vec2 q = vec2(a * 2.0 + turn, r * 9.0 - uT * 0.4);
    float lump = tF(q * 1.4) * 0.6 + tF(vP * 7.0 + uT * 0.05) * 0.25 + tF(vP * 19.0 - uT * 0.1) * 0.15;
    float dense = smoothstep(-0.6, 1.1, arm * 0.55 + (lump - 0.5) * 2.4);
    // the edge torn and ragged as it opens; the eye clear
    float edge = 1.0 - smoothstep(uOpen * (0.72 + 0.18 * lump), uOpen, r);
    float eye = smoothstep(0.035, 0.11, r);
    float alpha = (0.62 + 0.36 * dense) * edge * eye * uFade;
    vec3 dark = vec3(0.07, 0.08, 0.1), mid = vec3(0.24, 0.27, 0.32);
    vec3 col = mix(dark, mid, dense * (0.6 + 0.4 * lump)) * uLight * (1.0 - 1.2 * vSag); // (the sagging middle darker: thicker cloud)
    // the eye glows from within; lightning lights the cloud's underside
    col += vec3(0.55, 0.68, 0.9) * (1.0 - smoothstep(0.03, 0.22, r)) * (0.5 + 0.5 * sin(uT * 3.0)) * 0.7;
    col += vec3(0.7, 0.8, 1.0) * uFlash * (0.4 + 0.6 * lump) * (1.0 - r);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.96));
}`,
    });
}

function foamMat() {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uT: { value: 0 }, uK: { value: 0 }, uSpin: { value: 1 }, uLight: { value: 1 } },
        vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
uniform float uT, uK, uSpin, uLight;
varying vec2 vP;
${NOISE}
void main() {
    float r = length(vP), a = atan(vP.y, vP.x);
    if (r > 1.0) discard;
    // foam spiralling in to the middle; the water darker in the middle (it sinks into a funnel)
    float sp = sin(a * 5.0 + log(r + 0.02) * 9.0 * uSpin - uT * 5.0 * uSpin);
    float n = tF(vec2(a * 3.0 - uT * 2.0 * uSpin, r * 14.0));
    float foam = smoothstep(0.35, 0.95, sp * 0.6 + n * 0.8 - 0.1) * (1.0 - smoothstep(0.7, 1.0, r));
    float ring = smoothstep(0.08, 0.0, abs(r - 0.85 + 0.15 * sin(uT * 0.7)));
    vec3 col = mix(vec3(0.06, 0.18, 0.24), vec3(0.92, 0.97, 1.0), foam) * uLight;
    float alpha = (0.35 * (1.0 - r) + 0.85 * foam + 0.6 * ring * n) * uK;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
}`,
    });
}

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Vector3();
const _tip = new THREE.Vector3(), _dir = new THREE.Vector3(), _sky = new THREE.Vector3(), _mid = new THREE.Vector3();

export class TornadoSummonFx {
    /** game: the Game (its fx sparks, light flash, the storm, the sound, the spells' bolts). */
    constructor(game) {
        this.game = game;
        this.slots = [];
        for (let i = 0; i < TORNADO_FX.MAX; i++) {
            const cloud = new THREE.Mesh(disc(), cloudMat()), foam = new THREE.Mesh(flat(), foamMat());
            cloud.visible = foam.visible = false;
            cloud.frustumCulled = foam.frustumCulled = false;
            cloud.renderOrder = 2; foam.renderOrder = 1;
            game.scene.add(cloud); game.scene.add(foam);
            this.slots.push({ cloud, foam, on: false });
        }
    }

    /** How dark the sky is made by the callings now at `me` (0…1: Storm.seaK — the world darkens, it pours, as the vortex opens). */
    darkAt(me) {
        let k = 0;
        for (const S of this.slots) {
            if (!S.on) continue;
            const d = Math.hypot(me.x - S.at.x, me.z - S.at.z);
            k = Math.max(k, Math.min(1, S.t / 2.5) * Math.max(0, 1 - d / TORNADO_FX.DARK_R));
        }
        return k;
    }

    samples() { const s = this.slots[0]; return [new THREE.Mesh(s.cloud.geometry, s.cloud.material), new THREE.Mesh(s.foam.geometry, s.foam.material)]; }

    /** A calling starts: from the caster at `from` (the wand), the spout's place `at` {x, z}; `by` the caster's id, `side` the hand. */
    start(from, at, spin = 1, by = null, side = null) {
        const S = this.slots.find((s) => !s.on) || this.slots[0];
        Object.assign(S, { on: true, t: 0, ended: false, from: from.clone(), at: { x: at.x, z: at.z }, spin, bolts: 0, sparkT: 0, by, side, strikeT: 0, zapT: 0.15, thunderAt: 0.6 + Math.random() * 0.5, rumbled: false });
        S.cloud.visible = S.foam.visible = true;
        S.cloud.position.set(at.x, WATER_LEVEL_Y + TORNADO_FX.HEIGHT, at.z);
        S.cloud.scale.setScalar(TORNADO_FX.RADIUS);
        S.foam.position.set(at.x, WATER_LEVEL_Y + 0.35, at.z);
        S.foam.scale.setScalar(30);
        const g = this.game;
        g.storm?.start?.(new THREE.Vector3(at.x, 0, at.z), 30); // (the sky darkens, it rains — near: Storm.start)
        const me = g.character?.group?.position;
        g.sound?.playInspiriusCast?.(from, me); // (the rising electric whine as the beam leaves the wand)
        g.sound?.playSea?.(from, 'tail', 0.6);
        if (this._mine(S)) g.items?.tremble?.(S.side, TORNADO_FX.BEAM + 0.4, TORNADO_FX.TREMBLE);
    }

    /** Is this calling mine (my wand shudders, my view trembles)? */
    _mine(S) { const g = this.game; return S.by == null || S.by === 'local' || S.by === g.localId; }

    /** Where the beam starts now: the caster's live wand tip and where it points (it follows the hand), else where it was cast. */
    _tip(S, out, dir) {
        const hp = S.side ? this.game.spells?.hooks?.handPose?.(S.by ?? 'local', S.side) : null;
        if (hp?.origin) { out.copy(hp.origin); if (hp.dir) dir.copy(hp.dir).normalize(); else dir.set(0, 1, 0); }
        else { out.copy(S.from); dir.set(0, 1, 0); }
        if (dir.y < 0.25) { dir.y = 0.25; dir.normalize(); } // (it goes up into the sky whatever)
        return out;
    }

    /**
     * One path of the electric beam: from the wand tip along the wand, then bent up to where it strikes the clouds (over the place,
     * a little towards the caster) — jagged, with forks. Shared bolt pool (Effects.bolts): only segments, no meshes.
     */
    _beam(S, k) {
        const g = this.game, sm = g.spells, fx = g.fx;
        if (!sm?._jagged || !fx) return;
        const tip = this._tip(S, _tip, _dir);
        const sky = _sky.set(S.at.x + (tip.x - S.at.x) * 0.25, WATER_LEVEL_Y + TORNADO_FX.HEIGHT - 6, S.at.z + (tip.z - S.at.z) * 0.25);
        // the first leg along the wand (14 m), then up to the clouds
        const mid = _mid.copy(tip).addScaledVector(_dir, 14);
        sm._jagged(tip.clone(), mid.clone(), 7, 0.55, TORNADO_FX.RESTRIKE * 1.6);
        sm._jagged(mid.clone(), sky.clone(), 14, 6 + 4 * k, TORNADO_FX.RESTRIKE * 1.6);
        if (Math.random() < 0.7) sm._jagged(tip.clone(), sky.clone(), 18, 4, TORNADO_FX.RESTRIKE * 1.3); // (a second strand twisting round the first)
        // forks: short branches off the beam into the air
        for (let f = 0; f < 2; f++) {
            const u = 0.15 + Math.random() * 0.6;
            _p.lerpVectors(mid, sky, u);
            _v.copy(_p).add(_c.set((Math.random() - 0.5) * 24, -4 - Math.random() * 10, (Math.random() - 0.5) * 24));
            sm._jagged(_p.clone(), _v.clone(), 5, 2, TORNADO_FX.RESTRIKE * 1.2);
        }
        // the tip spits sparks; the light flickers blue-white at the wand and up in the clouds where it strikes
        for (let i = 0; i < 6; i++) {
            _v.set((Math.random() - 0.5) * 7, Math.random() * 5, (Math.random() - 0.5) * 7);
            fx.spark?.(tip, i % 3 ? 0xffffff : 0x8fd0ff, 0.12 + Math.random() * 0.1, _v, 0.35);
        }
        fx.lightFlash?.(tip, 0xbfe0ff, 3 + Math.random() * 3, 0.1, 40);
    }

    update(dt) {
        const g = this.game, fx = g.fx;
        const light = 1 - 0.7 * (g.world?.nightAmount || 0);
        let any = false;
        for (const S of this.slots) {
            if (!S.on) continue;
            any = true;
            S.t += dt;
            const t = S.t, cu = S.cloud.material.uniforms, fu = S.foam.material.uniforms;
            // the sky turns: the vortex opens, wheels, flickers; thins out at the end into the spout's own cloud
            cu.uT.value = t; cu.uSpin.value = S.spin; cu.uLight.value = light;
            // (slowly: a glowing tear where the beam strikes, widening — «потихоньку небеса разверзнутся»)
            const op = Math.min(1, Math.max(0, (t - TORNADO_FX.OPEN_AT) / TORNADO_FX.OPEN_T));
            cu.uOpen.value = op * op * (3 - 2 * op) * 0.94 + 0.06 * Math.min(1, Math.max(0, (t - TORNADO_FX.OPEN_AT) * 2));
            cu.uFade.value = Math.max(0, Math.min(1, (TORNADO_FX.LIFE - t) / 4));
            cu.uFlash.value = Math.max(0, cu.uFlash.value - dt * 5);
            // the beam: re-struck many times a second while it goes, then dies in a last great crack
            if (t < TORNADO_FX.BEAM) {
                const k = Math.min(1, t / TORNADO_FX.BEAM);
                S.strikeT -= dt;
                if (S.strikeT <= 0) { S.strikeT = TORNADO_FX.RESTRIKE * (0.7 + Math.random() * 0.6); this._beam(S, k); cu.uFlash.value = Math.max(cu.uFlash.value, 0.35 + 0.5 * k); }
                S.zapT -= dt;
                if (S.zapT <= 0) { S.zapT = 0.18 + Math.random() * 0.22; g.sound?.playInspiriusZap?.(this._tip(S, _tip, _dir)); }
                if (S.thunderAt && t > S.thunderAt) { S.thunderAt = t < 1.6 ? t + 0.9 + Math.random() * 0.6 : 0; g.sound?.playThunder?.(0.4 + 0.4 * k); }
                if (this._mine(S) && fx) fx.shake = Math.max(fx.shake || 0, 0.25 + 0.35 * k); // (the power felt: the view trembles a little)
            } else if (!S.ended) {
                S.ended = true; // (the last crack: the whole beam at once, a flash, the thunder rolls — the sky is open)
                for (let i = 0; i < 2; i++) this._beam(S, 1);
                cu.uFlash.value = 1.6;
                _p.set(S.at.x, WATER_LEVEL_Y + TORNADO_FX.HEIGHT - 8, S.at.z);
                fx?.lightFlash?.(_p, 0xdde8ff, 12, 0.5, 320);
                g.sound?.playThunder?.(0.9);
            }
            if (!S.rumbled && t > 1.4) { S.rumbled = true; const me = g.character?.group?.position; if (me) g.sound?.playRumble?.(_p.set(S.at.x, me.y, S.at.z), me); }
            if (t > TORNADO_FX.BEAM && t < TORNADO_FX.LIFE - 2 && Math.random() < dt * 2.2) {
                cu.uFlash.value = 0.8 + Math.random() * 0.6;
                _p.set(S.at.x + (Math.random() - 0.5) * 80, S.cloud.position.y - 5, S.at.z + (Math.random() - 0.5) * 80);
                fx?.lightFlash?.(_p, 0xcfe0ff, 6, 0.25, 260);
                if (Math.random() < 0.5) setTimeout(() => g.sound?.playThunder?.(0.35), 300 + Math.random() * 700);
            }
            // the sea answers: the foam disc spins up, the spray ring closes in
            fu.uT.value = t; fu.uSpin.value = S.spin; fu.uLight.value = light;
            fu.uK.value = Math.max(0, Math.min(1, (t - 3) / 2.5)) * Math.max(0, Math.min(1, (TORNADO_FX.LIFE - t) / 3));
            S.foam.scale.setScalar(30 - Math.min(14, Math.max(0, t - 3) * 3));
            if (fx?.spark) {
                // the call: wind spiralling up from the wand (the first 2 s)
                S.sparkT += dt * 70;
                while (S.sparkT >= 1) {
                    S.sparkT -= 1;
                    if (t < TORNADO_FX.BEAM) {
                        // (the air round the caster pulled up along the beam, and a ring of dust and spray from the feet)
                        if (Math.random() < 0.35) {
                            const a = t * 9 + Math.random() * 6.28, r = 0.6 + Math.random() * 1.6;
                            _p.set(S.from.x + Math.cos(a) * r, S.from.y + Math.random() * 2, S.from.z + Math.sin(a) * r);
                            _v.set(-Math.sin(a) * 6 * S.spin, 10 + Math.random() * 10, Math.cos(a) * 6 * S.spin);
                            fx.spark(_p, Math.random() < 0.5 ? 0xd6ecff : 0x9cc6ff, 0.1, _v, 1.2);
                        }
                        if (t < 1.2 && Math.random() < 0.4) { // (the ring of dust and spray from the feet)
                            const b = Math.random() * 6.28;
                            _p.set(S.from.x + Math.cos(b) * 0.8, S.from.y - 1.6, S.from.z + Math.sin(b) * 0.8);
                            _v.set(Math.cos(b) * 12, 1.5, Math.sin(b) * 12);
                            fx.spark(_p, 0xd8e2e8, 0.18, _v, 0.9);
                        }
                    }
                    // the spray racing round the place and closing in (from 2 s on)
                    if (t > 3 && t < TORNADO_FX.LIFE - 1) {
                        const b = Math.random() * 6.28, r = Math.max(6, 26 - (t - 3) * 4) * (0.85 + Math.random() * 0.3);
                        _p.set(S.at.x + Math.cos(b) * r, WATER_LEVEL_Y + 0.4, S.at.z + Math.sin(b) * r);
                        _v.set(-Math.sin(b) * 16 * S.spin - Math.cos(b) * 3, 2 + Math.random() * 6, Math.cos(b) * 16 * S.spin - Math.sin(b) * 3);
                        fx.spark(_p, Math.random() < 0.5 ? 0xffffff : 0xdff2ff, 0.16 + Math.random() * 0.1, _v, 1.4);
                    }
                }
            }
            // bolts into the sea round the place (only drawn: the storm's own bolts do the harm)
            if (t > TORNADO_FX.BEAM + 0.4 && S.bolts < 5 && Math.random() < dt * 1.4) {
                S.bolts++;
                const b = Math.random() * 6.28, r = 20 + Math.random() * 50;
                _p.set(S.at.x + Math.cos(b) * r, WATER_LEVEL_Y, S.at.z + Math.sin(b) * r);
                const sky = _v.copy(_p).add({ x: (Math.random() - 0.5) * 20, y: TORNADO_FX.HEIGHT - 10, z: (Math.random() - 0.5) * 20 });
                const sm = g.spells;
                if (sm?._jagged) for (let k = 0; k < 3; k++) sm._jagged(sky.clone(), _p.clone(), 16, 2.6 - k * 0.7, 0.4);
                fx?.lightFlash?.(_p, 0xdde8ff, 10, 0.35, 180);
                g.sound?.playThunder?.(0.7);
            }
            if (t >= TORNADO_FX.LIFE) { S.on = false; S.cloud.visible = S.foam.visible = false; }
        }
        return any;
    }
}
