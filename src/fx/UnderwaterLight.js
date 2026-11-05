/**
 * UnderwaterLight.js — how the light goes under the water (the author 05.11: «под водой свет для игрока очень однотипный… посмотри,
 * как в реальности свет под водой идёт»). From what is known of real water (underwater photographers' and divers' notes: the red is
 * absorbed first — gone within a few metres —, then orange and yellow; the blue goes deepest, so the deep is blue and dark; the
 * scattering makes the far things fade into a haze):
 *   - the water's colour by the depth of the eyes (`waterTint`): bright turquoise-green under the surface, a clear blue a few metres
 *     down, a deep dark blue in the depths; dimmer at dusk, nearly black at night; how far one sees — less the deeper and murkier;
 *   - the sun's shafts (god rays): beams of light falling slantwise from the waves' lenses, swaying and breathing as the surface moves,
 *     brightest just under it, fading with the depth (one draw: an InstancedMesh of long soft shafts turned to the eye about their axis);
 *   - the marine snow: fine specks hanging in the water, drifting slowly, lit (one draw of points round the eyes, wrapped as one swims);
 *   - the caustics: the dancing net of light on the bottom — the land's own shader (VoxelShading.UNDERSEA), driven from here.
 * Only while the eyes are under the sea's / a lake's water; nothing kept, nothing grows; shaders made at the loading (Game.prewarm).
 */
import * as THREE from 'three';
import { UNDERSEA } from '../world/VoxelShading.js';
import { WATER_LEVEL_Y } from '../world/Terrain.js';

export const UWL = {
    SHAFTS: 49, // sun shafts round the eyes: one place each of the 7×7 cells round them…
    SHAFT_CELL: 11, // m: …of this size — each shaft stands at its OWN place in the world (moving on, none jumps: they never blink)
    SHAFT_LEN: 46, // m long (from the surface down)
    SNOW: 900, // specks of marine snow
    SNOW_BOX: 22, // m: the box of them round the eyes
    CLEAR: 75, // m one sees just under the surface by day (clear azure water, as divers see it — the author 05.11)…
    DEEP_SEE: 40, // …and in the depths
    DEEP: 45, // m: «the depths» (the colour and the haze at their deepest)
    MERMAID_SEE: 1.35, // × as far for a mermaid (her eyes are made for the water), and the water brighter for her
};

const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _c = new THREE.Color(), _c2 = new THREE.Color();
const SHALLOW = new THREE.Color(0x3fc6d4), MID = new THREE.Color(0x1f9ccc), DEEPC = new THREE.Color(0x0d5a8e), NIGHT = new THREE.Color(0x020c18);

/**
 * The water's colour seen at `depth` m under the surface (`day` 0 night … 1 noon), into `out`; and how far one sees (m).
 * The red goes first: the shallow water is green-turquoise, deeper blue, the depths dark blue. Pure (tests).
 */
export function waterTint(depth, day, out = new THREE.Color(), mermaid = false) {
    const d = Math.max(0, depth);
    out.copy(SHALLOW).lerp(MID, ss(0, 9, d)).lerp(DEEPC, ss(8, UWL.DEEP, d));
    out.lerp(NIGHT, 1 - Math.max(0, Math.min(1, day)) * 0.92);
    const see = UWL.DEEP_SEE + (UWL.CLEAR - UWL.DEEP_SEE) * (1 - ss(0, UWL.DEEP, d));
    if (mermaid) out.lerp(SHALLOW, 0.3).multiplyScalar(1.12);
    return { color: out, far: see * (0.55 + 0.45 * Math.max(0, Math.min(1, day))) * (mermaid ? UWL.MERMAID_SEE : 1) };
}

const SHAFT_VS = `
attribute vec4 aShaft; // x, z (relative to the eyes' cell), phase, width
uniform float uTime; uniform vec3 uDir; uniform float uTop; uniform float uLen; uniform vec3 uEye;
varying float vV; varying float vU; varying float vSeed; varying float vFade;
void main(){
  vec3 axis = normalize(uDir);
  // the shaft's top on the surface (it sways a little with the waves), its body along the refracted sun
  vec3 top = vec3(aShaft.x + sin(uTime * 0.31 + aShaft.z * 7.0) * 1.2, uTop, aShaft.y + cos(uTime * 0.27 + aShaft.z * 5.0) * 1.2);
  float along = position.y; // 0 at the top … 1 at the bottom
  vec3 c = top + axis * (along * uLen);
  // turned to the eye about its own axis (a soft ribbon that always shows its face)
  vec3 toEye = normalize(uEye - c);
  vec3 side = normalize(cross(axis, toEye));
  float w = aShaft.w * (0.6 + 0.8 * along); // (it widens as it falls)
  vec3 p = c + side * position.x * w;
  vU = position.x; vV = along; vSeed = aShaft.z;
  vFade = 1.0 - smoothstep(18.0, 40.0, length(uEye.xz - c.xz));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const SHAFT_FS = `
uniform float uTime; uniform float uK; uniform vec3 uCol;
varying float vV; varying float vU; varying float vSeed; varying float vFade;
void main(){
  float edge = 1.0 - smoothstep(0.15, 1.0, abs(vU)); // (soft sides)
  float breathe = 0.55 + 0.45 * sin(uTime * (0.6 + vSeed * 0.9) + vSeed * 31.0) * sin(uTime * 0.37 + vSeed * 13.0);
  float fall = (1.0 - smoothstep(0.0, 1.0, vV)) * smoothstep(0.0, 0.04, vV); // (brightest under the surface, gone below)
  float streak = 0.75 + 0.25 * sin(vU * 9.0 + vSeed * 20.0 + uTime * 0.4);
  float a = edge * edge * fall * breathe * streak * vFade * uK;
  gl_FragColor = vec4(uCol * a, a);
}`;
const SNOW_VS = `
attribute float aSeed;
uniform float uTime; uniform vec3 uEye; uniform float uBox; uniform float uSize;
varying float vA;
void main(){
  // each speck drifts slowly (down a little, swaying), wrapped into the box round the eyes
  vec3 p = position + vec3(sin(uTime * 0.21 + aSeed * 40.0) * 0.6, -uTime * (0.04 + 0.05 * fract(aSeed * 7.0)), cos(uTime * 0.17 + aSeed * 23.0) * 0.6);
  vec3 rel = mod(p - uEye + 0.5 * uBox, uBox) - 0.5 * uBox;
  vec4 mv = viewMatrix * vec4(uEye + rel, 1.0);
  float d = -mv.z;
  vA = (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, length(rel))) * smoothstep(0.3, 1.2, d);
  gl_PointSize = uSize * (0.6 + fract(aSeed * 13.0)) / max(1.0, d);
  gl_Position = projectionMatrix * mv;
}`;
const SNOW_FS = `
uniform vec3 uCol; uniform float uK;
varying float vA;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float a = (1.0 - smoothstep(0.15, 0.5, length(q))) * vA * uK;
  gl_FragColor = vec4(uCol * a, a);
}`;

export class UnderwaterLight {
    constructor(game) {
        this.game = game;
        this.k = 0; // 0 above the water … 1 under it (eased: no blink when the waves cross the eyes)
        this.depth = 0;
        this.t = 0;
        if (!game.scene) return;
        // the shafts
        const quad = new THREE.PlaneGeometry(2, 1, 1, 6);
        quad.translate(0, -0.5, 0);
        quad.scale(1, -1, 1); // (y: 0 at the top … 1 down)
        const g = new THREE.InstancedBufferGeometry().copy(quad);
        g.instanceCount = UWL.SHAFTS;
        const sh = new Float32Array(UWL.SHAFTS * 4);
        g.setAttribute('aShaft', new THREE.InstancedBufferAttribute(sh, 4));
        this._shaftData = sh;
        this.shaftU = { uTime: { value: 0 }, uDir: { value: new THREE.Vector3(0, -1, 0) }, uTop: { value: 0 }, uLen: { value: UWL.SHAFT_LEN }, uEye: { value: new THREE.Vector3() }, uK: { value: 0 }, uCol: { value: new THREE.Color(0xd8fff4) } };
        this.shafts = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.shaftU, vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        this.shafts.frustumCulled = false;
        g.userData.keep = true; // (Game.prewarm's sample shares it)
        this.shafts.renderOrder = 4;
        this.shafts.visible = false;
        game.scene.add(this.shafts);
        // the marine snow
        const N = UWL.SNOW, pos = new Float32Array(N * 3), seed = new Float32Array(N);
        let s = 12345;
        const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
        for (let i = 0; i < N; i++) { pos[i * 3] = rnd() * 1000; pos[i * 3 + 1] = rnd() * 1000; pos[i * 3 + 2] = rnd() * 1000; seed[i] = rnd(); }
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
        this.snowU = { uTime: { value: 0 }, uEye: { value: new THREE.Vector3() }, uBox: { value: UWL.SNOW_BOX }, uSize: { value: 26 }, uCol: { value: new THREE.Color(0xcfe9e6) }, uK: { value: 0 } };
        this.snow = new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: this.snowU, vertexShader: SNOW_VS, fragmentShader: SNOW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        this.snow.frustumCulled = false;
        this.snow.renderOrder = 4;
        this.snow.visible = false;
        game.scene.add(this.snow);
        this._placeShafts(0, 0);
    }

    /** The shafts round the cell of the eyes: each cell of the world has its own shaft (or none) at its own place — the same whenever seen. */
    _placeShafts(cx, cz) {
        this._cell = [cx, cz];
        const S = this._shaftData, C = UWL.SHAFT_CELL;
        let i = 0;
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++, i++) {
            const gx = cx + dx, gz = cz + dz;
            const h = (k) => { const v = Math.sin(gx * 127.1 + gz * 311.7 + k * 19.3) * 43758.5453; return v - Math.floor(v); };
            S[i * 4] = (gx + h(1)) * C; S[i * 4 + 1] = (gz + h(2)) * C;
            S[i * 4 + 2] = h(3); S[i * 4 + 3] = h(5) < 0.6 ? 0.6 + h(4) * 2.2 : 0; // (some cells: no shaft)
        }
        this.shafts.geometry.attributes.aShaft.needsUpdate = true;
    }

    /** Each frame, after Swimming decided where the eyes are (Game: before the fog is set). */
    update(dt) {
        const g = this.game, sw = g.swim;
        this.t = (this.t + dt) % 3600;
        const under = !!(sw?.eyeUnder ?? sw?.underwater); // (the camera's judgement — the same as the haze's: never one on and the other off)
        this.k += ((under ? 1 : 0) - this.k) * Math.min(1, dt * (under ? 10 : 14));
        const cam = g.camera?.position || g.character?.group?.position;
        if (!cam) return;
        const surf = sw?._eyeSurface ?? WATER_LEVEL_Y;
        // (smoothed: the waves over the head move the surface every frame — the water's colour followed them and the whole picture
        //  shimmered, the author: «под водой мигает мир»; tools/under-flicker.mjs showed the haze's colour jumping frame to frame)
        const raw = Math.max(0, surf - cam.y);
        this.depth = this.depth == null || Math.abs(raw - this.depth) > 6 ? raw : this.depth + (raw - this.depth) * Math.min(1, dt * 1.5);
        // the day: the sun's height and the clouds (the shafts need the sun; the colour dims at dusk and night)
        const sky = g.world?.sky?.uniforms;
        const sd = sky?.uSunDir?.value;
        const night = g.world?.nightAmount ?? 0;
        const overcast = sky?.uOvercast?.value ?? 0;
        const day = Math.max(0.04, (1 - night) * (1 - 0.45 * overcast));
        this.day = day;
        const sun = sd ? ss(0.0, 0.35, sd.y) * (1 - 0.8 * overcast) * (1 - night) : 0.6;
        // the caustics on the bottom (every frame: the land's shader reads them; a shallow sea seen from above shows them too)
        UNDERSEA.t.value = this.t;
        UNDERSEA.k.value = 0.85 * sun;
        UNDERSEA.y.value = WATER_LEVEL_Y + 0.5;
        // the sky dome: not seen from under the water (the surface's underside is the ceiling, Snell's window in it — SeaSurface)
        const dome = g.world?.sky?.mesh;
        if (dome && under) { if (dome.visible) { dome.visible = false; this._hidSky = true; } }
        else if (dome && this._hidSky) { dome.visible = true; this._hidSky = false; } // (only what it hid: space and the rest decide the sky themselves)
        // (…and past the surface's edge, far off, the background is the water itself, not the white of an empty sky)
        const sc = g.scene;
        if (sc && this._hidSky) {
            if (this._bg === undefined) this._bg = sc.background ?? null;
            if (!sc.background?.isColor || sc.background === this._bg) sc.background = this._waterBg || (this._waterBg = new THREE.Color()); // (one colour kept: no new one a frame)
            if (sc.fog) sc.background.copy(sc.fog.color);
        } else if (sc && this._bg !== undefined) { sc.background = this._bg; this._bg = undefined; }
        const on = this.k > 0.01 && !!this.shafts;
        if (this.shafts) { this.shafts.visible = on && sun > 0.02; this.snow.visible = on; }
        if (!on) return;
        // the shafts: the sun refracted into the water (steeper: n = 1.33), from the surface over the eyes down
        const cx = Math.floor(cam.x / UWL.SHAFT_CELL), cz = Math.floor(cam.z / UWL.SHAFT_CELL);
        if (!this._cell || Math.abs(cx - this._cell[0]) > 0 || Math.abs(cz - this._cell[1]) > 0) this._placeShafts(cx, cz);
        const U = this.shaftU;
        U.uTime.value = this.t;
        if (sd) {
            const hx = -sd.x / 1.33, hz = -sd.z / 1.33, hl = Math.hypot(hx, hz);
            U.uDir.value.set(hx, -Math.sqrt(Math.max(0.05, 1 - hl * hl)), hz).normalize();
        }
        U.uTop.value = surf;
        U.uEye.value.copy(cam);
        U.uK.value = 0.16 * sun * this.k * (1 - ss(6, 40, this.depth) * 0.85);
        waterTint(Math.max(0, this.depth - 2), day, _c);
        U.uCol.value.copy(_c2.set(0xe8fff6)).lerp(_c, 0.35);
        // the snow: lit by what light there is
        const S = this.snowU;
        S.uTime.value = this.t;
        S.uEye.value.copy(cam);
        S.uK.value = this.k * (0.25 + 0.55 * day) * (g.renderer?.getPixelRatio?.() > 1.5 ? 1 : 0.8);
        S.uCol.value.copy(_c).lerp(_c2.set(0xffffff), 0.55);
    }

    /**
     * After the haze took the water's colour (Game: right after Swimming.applyFog): the background past the surface's edge is that very
     * colour — before, it was copied from the haze BEFORE the water's colour was set, so it was the sky's air (the author: «под водой мигает мир»).
     */
    afterFog() {
        const sc = this.game.scene;
        if (this._hidSky && sc?.fog && sc.background?.isColor) sc.background.copy(sc.fog.color);
    }

    /** Shader samples for Game.prewarm (made at the loading). */
    samples() {
        if (!this.shafts) return [];
        const a = this.shafts.clone(), b = this.snow.clone();
        a.visible = b.visible = true;
        return [a, b];
    }

    dispose() {
        for (const m of [this.shafts, this.snow]) if (m) { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); }
    }
}
