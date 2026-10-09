/**
 * Quality.js — keeps the game fluid on any computer.
 *
 * Watches the real frame rate and adjusts what costs the most on the
 * graphics card: rendering resolution, the size and refresh rate of the sun
 * shadow, and how far the world is drawn. «Авто» moves between the levels by
 * itself (down quickly when it stutters, up slowly when there is headroom);
 * the settings can also pin a level.
 *
 * On a real graphics card the cost is mostly per pixel (not per object): the
 * sky's clouds, soft shadows and the number of pixels. The low levels switch
 * those off first.
 */

import * as THREE from 'three';

export const QUALITY_LEVELS = [
    { name: 'очень низкая', pixelRatio: 0.6, shadowSize: 512, shadowEvery: 3, view: 0.65, shadows: false, soft: false, clouds: false },
    { name: 'низкая', pixelRatio: 0.8, shadowSize: 1024, shadowEvery: 2, view: 0.8, shadows: true, soft: false, clouds: false },
    { name: 'средняя', pixelRatio: 1.0, shadowSize: 1024, shadowEvery: 1, view: 1.0, shadows: true, soft: false, clouds: true },
    { name: 'высокая', pixelRatio: 1.5, shadowSize: 2048, shadowEvery: 1, view: 1.0, shadows: true, soft: true, clouds: true },
];

export class QualityManager {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {string|number} setting 'auto' or a level index
     */
    constructor(renderer, setting = 'auto') {
        this.renderer = renderer;
        this.auto = setting === 'auto' || setting === undefined || setting === null;
        const fixed = parseInt(setting, 10);
        this.level = this.auto ? QualityManager.lastLevel() : Math.max(0, Math.min(3, Number.isFinite(fixed) ? fixed : 2));
        this.maxLevel = 3;
        this.world = null;
        this._acc = 0;
        this._frames = 0;
        this._goodFor = 0;
        this._sinceChange = 0;
        this._frame = 0;
        this._bad = 0;
        this._drops = 0;
        this.fps = 60;
        this._shadowsFixed = null; // shadows on/off and their kind are decided once (a change recompiles every shader)
    }

    /** The level auto mode settled on last time (so a weak computer doesn't start with stutters). */
    static lastLevel() {
        try {
            const v = parseInt(localStorage.getItem('zns-quality-level'), 10);
            return Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 2;
        } catch (e) { return 2; }
    }

    get current() {
        return QUALITY_LEVELS[this.level];
    }

    /** Apply the current level to the renderer and the world. */
    apply(world = this.world) {
        this.world = world;
        const q = this.current;
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        this.renderer.setPixelRatio(Math.min(dpr, q.pixelRatio));
        const sun = world && world.dirLight;
        if (sun && sun.shadow.mapSize.width !== q.shadowSize) {
            sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
            if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
        }
        // The sun shadow is redrawn every frame only when there is time for it
        this.renderer.shadowMap.autoUpdate = q.shadowEvery === 1;
        this.renderer.shadowMap.needsUpdate = true;
        // Shadows on/off and soft/hard change the shader of every material: switching them in
        // the middle of the game freezes it (all shaders are rebuilt). Decide once, at the start;
        // later only the cheap things change (pixels, shadow size and how often it is drawn).
        const first = this._shadowsFixed === null;
        if (first) this._shadowsFixed = { on: q.shadows, soft: q.soft };
        const fixed = this._shadowsFixed;
        if (sun) sun.castShadow = fixed.on;
        const type = fixed.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
        if (this.renderer.shadowMap.type !== type) {
            this.renderer.shadowMap.type = type;
            world?.scene?.traverse((o) => {
                if (!o.material) return;
                for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
            });
        }
        if (world) { world._cloudsWanted = q.clouds; world.sky?.setClouds(q.clouds || (world.storm || 0) > 0.1); }
        if (world) world.viewScale = q.view;
        if (this.auto) { try { localStorage.setItem('zns-quality-level', String(this.level)); } catch (e) { /* not remembered */ } }
    }

    /** Call once per frame with the real frame time (seconds). */
    update(deltaTime) {
        const q = this.current;
        this._frame++;
        if (q.shadowEvery > 1 && this._frame % q.shadowEvery === 0) this.renderer.shadowMap.needsUpdate = true;
        if (!this.auto || !(deltaTime > 0) || deltaTime > 1) return;
        this._acc += deltaTime;
        this._frames++;
        this._sinceChange += deltaTime;
        if (this._acc < 2) return;
        this.fps = this._frames / this._acc;
        this._acc = 0;
        this._frames = 0;
        // (two slow windows in a row — or one very slow — before stepping down: one hiccup is not a slow computer)
        this._bad = this.fps < 40 ? this._bad + 1 : 0;
        if ((this._bad >= 2 || this.fps < 25) && this.level > 0 && this._sinceChange > 4) {
            // Stutters: step down (and after the second time, never climb back: no see-saw)
            this.level--;
            this._drops++;
            this.maxLevel = Math.min(this.maxLevel, this._drops >= 2 ? this.level : this.level + 1);
            this._goodFor = 0;
            this._bad = 0;
            this._sinceChange = 0;
            this.apply();
        } else if (this.fps > 57) {
            this._goodFor += 2;
            if (this._goodFor >= 20 && this.level < this.maxLevel && this._sinceChange > 30) {
                this.level++;
                this._goodFor = 0;
                this._sinceChange = 0;
                this.apply();
            }
        } else {
            this._goodFor = 0;
        }
    }
}
