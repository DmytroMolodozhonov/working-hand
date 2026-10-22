/**
 * Ultra.js — «Ультра качество» (Настройки → Графика): an addition to the usual picture, switched on
 * and off at any moment, like the best shader packs of Minecraft. The usual mode is not touched at
 * all: with ultra off nothing of it is made, drawn or updated (the world's shaders carry its code
 * from the loading screen and skip it — UltraUniforms.js).
 *
 * With it on:
 *   - the soft lawn (UltraGrass.js), gusts rolling over the grass and flowers (Flora.js),
 *   - the picture (UltraPost.js): glow of the bright things, the sun's rays, low mist, a filmic tone
 *     with warm light and blue shadows, a blue night, smooth edges,
 *   - the sky (Sky.js): thick lit clouds, a burning sun, the moon's seas, many stars, the Milky Way,
 *   - water (UltraWater.js): the sky mirrored, ripples, the sun's path, rain rings,
 *   - rain (VoxelShading.js): the open ground wet and shining, puddles,
 *   - shadows: sharper map with soft edges; the picture at a higher resolution (Quality.js).
 * The number of lights in the scene stays the same (no light is added). If the computer cannot keep
 * a smooth frame rate with it, the settings say so honestly (#ultra-warn).
 */
import * as THREE from 'three';
import { ULTRA } from '../fx/UltraUniforms.js';
import { UltraPost } from '../fx/UltraPost.js';
import { UltraGrass } from '../world/UltraGrass.js';

export const ULTRA_FPS = {
    WARN_BELOW: 35, // the average FPS that is not smooth
    OK_ABOVE: 45,
    WINDOW: 4, // s
};

const _c = new THREE.Color();
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Ultra {
    constructor(game) {
        this.game = game;
        this.on = false;
        this.post = null;
        this.grass = game.world?.terrain ? new UltraGrass(game.world.terrain) : null;
        this._acc = 0;
        this._frames = 0;
        this._slow = 0;
        this._since = 0;
        this.fps = 0;
        this._mistBase = null;
    }

    static wanted(setting) {
        return setting === true || setting === 'on' || setting === '1';
    }

    /** On / off (the settings, during the game too). */
    set(on) {
        on = !!on;
        const g = this.game;
        if (on && !this.post && g.renderer) this.post = new UltraPost(g.renderer);
        this.on = on;
        ULTRA.on.value = on ? 1 : 0;
        this.grass?.setVisible(on);
        g.quality?.setUltra?.(on);
        const sun = g.world?.dirLight;
        if (sun) sun.shadow.radius = on ? 3 : 1; // (soft edges of the sharper shadow)
        this._acc = 0; this._frames = 0; this._slow = 0; this._since = 0;
        this._warn(null);
    }

    /** Things to compile on the loading screen (Game.prewarm). */
    sampleModels() {
        return this.grass ? [this.grass.sampleModel()] : [];
    }

    /** The picture's shaders, compiled now (Game.prewarm, behind the loading screen). */
    prewarm() {
        const g = this.game;
        if (!g.renderer) return;
        if (!this.post) this.post = new UltraPost(g.renderer);
        const was = ULTRA.on.value;
        ULTRA.on.value = 1;
        try { this.post.prewarm(g.scene, g.camera); } finally { ULTRA.on.value = was; }
    }

    /** Each frame (before drawing): only while on. */
    update(dt) {
        if (!this.on) return;
        const g = this.game, w = g.world;
        ULTRA.time.value = (ULTRA.time.value + dt) % 3600;
        const sky = w?.sky?.uniforms;
        const storm = g.storm, raining = !!storm?.raining;
        const overcast = sky ? sky.uOvercast.value : 0;
        const night = w?.nightAmount ?? 0;
        const off = !!(g.space?.offEarth || g.space?.inSpace);
        if (sky) {
            ULTRA.zenith.value.copy(sky.uZenith.value);
            ULTRA.horizon.value.copy(sky.uHorizon.value);
            const sd = sky.uSunDir.value;
            if (sd.y > -0.03) {
                ULTRA.sunDir.value.copy(sd);
                ULTRA.sunCol.value.copy(w.dirLight.color);
                ULTRA.sunVis.value = ss(-0.03, 0.1, sd.y) * (1 - overcast);
            } else {
                ULTRA.sunDir.value.copy(sky.uMoonDir.value);
                ULTRA.sunCol.value.setRGB(0.55, 0.65, 0.95);
                ULTRA.sunVis.value = 0.6 * night * (1 - overcast);
            }
        }
        // the land soaks in the rain fast and dries slowly after it
        const wet = ULTRA.wet.value, want = raining && !off ? 1 : 0;
        ULTRA.wet.value = want > wet ? Math.min(1, wet + dt / 8) : Math.max(0, wet - dt / 45);
        const p = g.character?.group?.position;
        if (p) ULTRA.player.value.set(p.x, p.y - 0.3, p.z);
        // the picture
        if (this.post) {
            const L = this.post.look, cave = w?.cave || 0, ind = w?.indoor || 0, under = !!g.swim?.underwater;
            const sunUp = sky ? ss(-0.03, 0.1, sky.uSunDir.value.y) : 1;
            L.night = night;
            L.wet = ULTRA.wet.value;
            if (g.scene.fog) L.fog.copy(g.scene.fog.color);
            L.sunDir.copy(ULTRA.sunDir.value);
            L.sunCol.copy(ULTRA.sunCol.value);
            // the bright things glow — far more at night (fires, lanterns, «Люмос», the spells)
            L.bloom = 0.08 + 0.22 * night + 0.06 * ind;
            L.threshold = this.post.hdr ? 0.92 - 0.38 * night : 0.8 - 0.25 * night;
            const clearSky = (1 - overcast) * (1 - cave) * (1 - ind) * (under || off ? 0 : 1);
            L.rays = clearSky * (sunUp > 0.01 ? 0.45 * sunUp : 0.2 * night);
            _c.copy(ULTRA.sunCol.value).lerp(L.fog, 0.2);
            L.rayCol.copy(_c);
            // low mist: thin by day, thicker at dawn and dusk, at night and in the rain
            const dawn = sky ? 1 - ss(0.05, 0.3, Math.abs(sky.uSunDir.value.y)) : 0;
            L.mist = off || under ? 0 : (0.0012 + 0.005 * dawn + 0.003 * night + 0.007 * ULTRA.wet.value) * (1 - cave) * (1 - 0.7 * ind);
            if (p) {
                const gy = g.collision?.groundY ? g.collision.groundY(p.x, p.z) : p.y - 1;
                const base = Math.min(p.y - 1, Number.isFinite(gy) ? gy : p.y) - 4;
                this._mistBase = this._mistBase == null || Math.abs(this._mistBase - base) > 60 ? base : this._mistBase + (base - this._mistBase) * Math.min(1, dt / 20);
                L.mistBase = this._mistBase;
            }
        }
        if (p) this.grass?.update(p);
        this._watchFps(dt);
    }

    /** Draw the frame with the ultra picture; false when off (the usual drawing then). */
    render() {
        if (!this.on || !this.post) return false;
        const g = this.game;
        this.post.render(g.scene, g.camera, ULTRA.time.value);
        return true;
    }

    dispose() {
        this.post?.dispose();
        this.post = null;
        this.grass?.dispose();
        this.grass = null;
        ULTRA.on.value = 0;
    }

    /** Is it smooth? A too slow average for a while: the settings say so. */
    _watchFps(dt) {
        if (!(dt > 0) || dt > 1) return;
        this._since += dt;
        if (this._since < 6) return; // (the first seconds after switching: the new things are being made)
        this._acc += dt;
        this._frames++;
        if (this._acc < ULTRA_FPS.WINDOW) return;
        this.fps = this._frames / this._acc;
        this._acc = 0; this._frames = 0;
        const limit = this.game.config?.fpsLimit || 0;
        const low = limit > 0 && limit < ULTRA_FPS.OK_ABOVE ? limit * 0.8 : ULTRA_FPS.WARN_BELOW;
        if (this.fps < low) { if (++this._slow >= 2) this._warn(this.fps); }
        else if (this.fps > Math.min(ULTRA_FPS.OK_ABOVE, low + 8)) { this._slow = 0; this._warn(null); }
    }

    _warn(fps) {
        this.slowFps = fps;
        if (typeof document === 'undefined') return;
        const el = document.getElementById('ultra-warn');
        if (!el) return;
        const weak = typeof window !== 'undefined' && window.__zns?.gpu?.weak;
        if (fps != null) {
            el.textContent = `⚠️ На этом компьютере «Ультра» идёт рывками (≈${Math.round(fps)} FPS). Для плавной игры лучше выключить.`;
            el.classList.remove('hidden');
        } else if (weak && this.on) {
            el.textContent = '⚠️ Игра рисует на слабой встроенной видеокарте — «Ультра» может тормозить.';
            el.classList.remove('hidden');
        } else el.classList.add('hidden');
    }
}
