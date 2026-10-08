/**
 * Quality.js — keeps the game fluid on any computer.
 *
 * Watches the real frame rate and adjusts what costs the most on the
 * graphics card: rendering resolution, the size and refresh rate of the sun
 * shadow, and how far the world is drawn. «Авто» moves between the levels by
 * itself (down quickly when it stutters, up slowly when there is headroom);
 * the settings can also pin a level.
 */

export const QUALITY_LEVELS = [
    { name: 'очень низкая', pixelRatio: 0.6, shadowSize: 512, shadowEvery: 3, view: 0.65 },
    { name: 'низкая', pixelRatio: 0.8, shadowSize: 1024, shadowEvery: 2, view: 0.8 },
    { name: 'средняя', pixelRatio: 1.0, shadowSize: 1024, shadowEvery: 1, view: 1.0 },
    { name: 'высокая', pixelRatio: 1.5, shadowSize: 2048, shadowEvery: 1, view: 1.0 },
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
        this.fps = 60;
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
        if (this.fps < 40 && this.level > 0 && this._sinceChange > 2.5) {
            // Stutters: step down right away (and don't climb back above this level soon)
            this.level--;
            this.maxLevel = Math.min(this.maxLevel, this.level + 1);
            this._goodFor = 0;
            this._sinceChange = 0;
            this.apply();
        } else if (this.fps > 57) {
            this._goodFor += 2;
            if (this._goodFor >= 8 && this.level < this.maxLevel && this._sinceChange > 10) {
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
