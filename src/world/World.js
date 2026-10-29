/**
 * World.js — everything static in a level: lights, sky, ground/terrain,
 * decorations (grass cubes, trees), tables and custom-map walls.
 *
 * Visual parameters are copied 1:1 from the original World.js / main.js so the
 * game looks the same; the internals are instanced, seeded and destructible.
 */

import * as THREE from 'three';
import { createRng } from '../core/math.js';
import { BLOCK } from './Terrain.js';
import { Terrain } from './TerrainView.js';
import { collapseAfter } from './Collapse.js';
import { ruinArea } from './Ruin.js';

const _sun = new THREE.Vector3();
const _nightFog = new THREE.Color();
const _moon = new THREE.Color();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _stormFog = new THREE.Color(0x2b3038);
const _caveFog = new THREE.Color(0x020203); // (deep in a cave: black beyond the light)

/** The night is the last quarter of the day: 6 of the 24 hours (18 hours of daylight). */
export const NIGHT_START = 0.75;
// Dusk and dawn are long (≈1.7 game hours either side of the night's edge: golden hour,
// sunset, blue twilight). The darkening is centred a little before the night / after it so
// «night» (darker than 0.6) is still exactly 6 hours.
const DUSK = 0.07;
const EDGE = 0.1342 * DUSK; // (smoothstep = 0.6 at 0.567 of its way)
const DUSK_AT = NIGHT_START - EDGE, DAWN_AT = EDGE;
// The sun touches the horizon ≈35 game minutes before the night falls, and is up as long after dawn
export const SUNSET = DUSK_AT - 0.025;
export const SUNRISE = DAWN_AT + 0.025;
const DAY_LEN = SUNSET - SUNRISE;
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How dark it is at day phase `phase` (0 = dawn … 1): 0 by day, 1 by night, soft dusk and dawn. */
export function nightAt(phase) {
    const p = ((phase % 1) + 1) % 1, e = DUSK;
    const k = p < 0.5 ? 1 - ss(DAWN_AT - e, DAWN_AT + e, p) : ss(DUSK_AT - e, DUSK_AT + e, p) * (1 - ss(1 + DAWN_AT - e, 1 + DAWN_AT + e, p));
    return Math.max(0, Math.min(1, k));
}

/**
 * Where the sun is at day phase `phase`: it rises in the east (+x), crosses the sky,
 * sets in the west and goes on under the horizon at night — never jumps. `elev` is the
 * height of the direction (sin of the angle above the horizon, < 0 below it); `dir` the unit
 * direction. The moon rises as the sun sets and crosses the night sky.
 */
export function sunAt(phase, dir = new THREE.Vector3(), moon = null) {
    const p = ((phase % 1) + 1) % 1;
    const t = ((p - SUNRISE) % 1 + 1) % 1; // time since sunrise
    let elev, az;
    if (t < DAY_LEN) {
        const arc = (t / DAY_LEN) * Math.PI; // 0 → π
        elev = 0.94 * Math.sin(arc);
        az = arc;
    } else {
        const u = (t - DAY_LEN) / (1 - DAY_LEN); // 0 → 1 under the horizon
        elev = -0.55 * Math.sin(Math.PI * u);
        az = Math.PI + Math.PI * u;
    }
    horizontalDir(dir, az, elev);
    if (moon) {
        const u = t < DAY_LEN ? 0 : (t - DAY_LEN) / (1 - DAY_LEN);
        horizontalDir(moon, Math.PI * u, Math.max(0.06, 0.8 * Math.sin(Math.PI * u)));
    }
    return elev;
}
function horizontalDir(out, az, elev) {
    const hx = Math.cos(az) * 0.9, hz = 0.35, hl = Math.hypot(hx, hz), r = Math.sqrt(1 - elev * elev);
    return out.set((hx / hl) * r, elev, (hz / hl) * r);
}

/** How strong the sunset / sunrise colours are for the sun at height `elev` (0..1). */
export function sunsetGlow(elev) {
    return ss(-0.3, -0.01, elev) * (1 - ss(0.06, 0.42, elev));
}
// Spawn-area trees (instanced, vertex-coloured green / brown): tint multipliers per kind
// (oak, birch, spruce, cherry, dark oak) — the same kinds as the voxel trees further out
const SPAWN_TREE_TINTS = [
    { leaf: [1, 1, 1], trunk: [1, 1, 1] },
    { leaf: [1.45, 1.2, 0.75], trunk: [1.6, 3.2, 10.7] }, // white bark (brown × these ≈ white)
    { leaf: [0.55, 0.62, 0.8], trunk: [0.68, 0.75, 0.8] },
    { leaf: [5.2, 1.2, 4.2], trunk: [0.82, 0.62, 0.72] }, // pink blossom
    { leaf: [0.75, 0.62, 0.55], trunk: [0.48, 0.45, 0.42] },
];
const CHUNK_MARGIN = 32; // load terrain one chunk beyond the fog
const SHADOW_EXTENT = 45; // m around the player that receive the sun's shadows (on the ground)
const _defaultSun = new THREE.Vector3(50, 100, 50).normalize();
const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _c = new THREE.Vector3();
const _tm = new THREE.Matrix4();
const _pm = new THREE.Matrix4(), _pc = new THREE.Color(); // (the pedestals' copies)
import { CollisionWorld } from './Collision.js';
import { Flora } from './Flora.js';
import { WorldTrees } from './Trees.js';
import { Sky, SKY_DAY, SKY_NIGHT } from './Sky.js';
import { applyTreeDetail, applySkyComp, SKY_LIGHT } from './VoxelShading.js';
import { lightBoost, fogBoost, caveDim, darkness } from '../game/SightRules.js';
import '../core/Shadows.js'; // (the sun shadow's soft edge: patched into the shaders before they compile)

const GRASS_COLORS = [0x4CAF50, 0x66BB6A, 0x43A047, 0x81C784, 0x388E3C];
export const MAP_CELL = 5; // metres per editor cell (original: 2.5x bigger than 2m)
export const MAP_WALL_HEIGHT = 8;

export class VoxelWorld {
    /**
     * @param {THREE.Scene} scene
     * @param {object} opts {seed, mountains, map, seas}
     */
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.seed = opts.seed ?? 1;
        this.terrainWidth = 240;
        this.terrainDepth = 240;
        this.collision = new CollisionWorld();
        this.terrain = null;
        this.trees = [];
        this.tables = [];
        this.isMap = !!opts.map;
        this.destructible = !opts.map;

        this.textureLoader = new THREE.TextureLoader();
        this.createLights();

        if (opts.map) {
            this.mapResult = this.loadFromMap(opts.map);
        } else {
            this.meshTrees = !!opts.meshTrees; // (a world of real trees, not blocks — `realTrees`, Trees.js)
            this.createTerrain(!!opts.mountains, !!opts.seas, !!opts.testGround, !!opts.deepCaves, !!opts.lush, !!opts.slopes, !!opts.wizHuts, !!opts.furnish, !!opts.bigArena, !!opts.apart, !!opts.bigHouses, !!opts.dungeons, !!opts.arenaEntries, !!opts.buildings);
            this.createSkybox();
        }
    }

    // ------------------------------------------------------------------ lights
    createLights() {
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(this.ambientLight);

        // Warm sunlight + cool sky light: simple, but reads as daylight
        this.dirLight = new THREE.DirectionalLight(0xfff0d8, 0.85);
        this.dirLight.position.set(50, 100, 50);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 500;
        // Layer 1 = player's own head/body in first person: invisible, but casts a shadow.
        this.dirLight.shadow.camera.layers.enable(1);
        // The shadow covers the area around the player (see followShadow), not
        // the whole 240 m map: far mountains are not re-drawn into the shadow
        // map every frame, and nearby shadows get sharper.
        this.dirLight.shadow.camera.left = -SHADOW_EXTENT;
        this.dirLight.shadow.camera.right = SHADOW_EXTENT;
        this.dirLight.shadow.camera.top = SHADOW_EXTENT;
        this.dirLight.shadow.camera.bottom = -SHADOW_EXTENT;
        this.scene.add(this.dirLight);
        this.scene.add(this.dirLight.target);

        this.hemiLight = new THREE.HemisphereLight(0xbfe3ff, 0x6a8f4e, 0.35);
        this.scene.add(this.hemiLight);
    }

    setNightMode(isNight) {
        if (isNight) {
            this.scene.background = new THREE.Color(0x050505);
            this.scene.fog = new THREE.Fog(this.sky ? SKY_NIGHT.fog : 0x000000, 10, 50);
            this.sky?.setNight(true);
            this.fogFar = 50;
            this.fogNear = 10;
            this.ambientLight.intensity = 0.15;
            this.dirLight.intensity = 0.15;
            this.hemiLight.intensity = 0.08;
        } else {
            this.scene.background = new THREE.Color(this.sky ? SKY_DAY.fog : 0x87CEEB);
            // the fog is the colour of the horizon: far land melts into the sky
            this.scene.fog = new THREE.Fog(this.sky ? SKY_DAY.fog : 0x87CEEB, this.sky ? 25 : 20, this.sky ? 90 : 80);
            this.fogFar = this.sky ? 90 : 80;
            this.fogNear = this.sky ? 25 : 20;
            this.sky?.setNight(false);
            this.ambientLight.intensity = 0.3;
            this.dirLight.intensity = 0.85;
            this.hemiLight.intensity = 0.35;
        }
        this._rememberBase(isNight ? 1 : 0);
    }

    /** The light without a storm (day/night), so a storm can darken it and give it back. */
    _rememberBase(night) {
        this._base = {
            amb: this.ambientLight.intensity, dir: this.dirLight.intensity, hemi: this.hemiLight.intensity,
            fog: this.scene.fog ? this.scene.fog.color.clone() : new THREE.Color(0x87ceeb),
            far: this.fogFar ?? 90, night,
        };
        // (every change of day and night writes the base light again: the storm's, the cave's and the rooms' light go on it
        // at once — else the room's light is wiped every ~0.7 s by the day's tick and shows again: a blink)
        if ((this.storm || 0) > 0 || (this.cave || 0) > 0 || (this.indoor || 0) > 0 || (this.nightVision || 0) > 0) this.setStorm(this.storm || 0);
    }

    /** The night gift («Pentagranium Noctis»): 0…1 — the dark is 50 % brighter and seen 1.5 times as far (SightRules.js). */
    setNightVision(k) {
        if (Math.abs(k - (this.nightVision || 0)) < 0.002) return;
        this.nightVision = k;
        if (this._base) this.setStorm(this.storm || 0);
    }

    /** Inside a cave it is dark (0 = outside, 1 = deep inside). */
    setCave(k) {
        if (Math.abs(k - (this.cave || 0)) < 0.01) return;
        this.cave = k;
        if (!this._base) this._rememberBase(this._night ?? 0);
        this.setStorm(this.storm || 0);
    }

    /** Inside a castle / house (0..1): no sun, but warm light from lanterns and windows. */
    setIndoor(k) {
        if (Math.abs(k - (this.indoor || 0)) < 0.01) return;
        this.indoor = k;
        if (!this._base) this._rememberBase(this._night ?? 0);
        this.setStorm(this.storm || 0);
    }

    /** «Lightning Strike»: a storm darkens the world (0 = clear, 1 = full storm). */
    setStorm(k) {
        this.storm = k;
        const b = this._base;
        if (!b) return;
        // deep in a cave the daylight doesn't reach the player: their hands, the things by them are
        // dark («Люмос» shows the way) — the land itself keeps the daylight that gets to each block
        // (VoxelShading SKY_LIGHT: the cave's mouth lit, the meadow outside bright as ever)
        const cv = this.cave || 0, nv = this.nightVision || 0, dim = caveDim(cv, nv); // (the night gift: the cave 50 % less dark — SightRules.js)
        SKY_LIGHT.comp.value = 1 / dim;
        const ind = this.indoor || 0;
        // indoors: the sun is outside; by day the light of the windows and the door fills the rooms (the walls away from
        // the sun as lit as the others), by night only a faint glow: the rooms are as dark as the night, what lights them
        // is a real light (lantern, torch, fire, «Люмос» — FireLights). Smooth with the night (`b.night` 0…1).
        const lamp = 1 + ind * (0.8 - 0.65 * b.night), fill = 1 + ind * (0.5 - 0.4 * b.night);
        const boost = lightBoost(nv, darkness(b.night, cv)); // (the night gift: ×1…1.5 as dark as it is — the same lights, no new ones)
        this.ambientLight.intensity = b.amb * (1 - 0.5 * k) * dim * lamp * boost;
        this.dirLight.intensity = b.dir * (1 - 0.8 * k) * dim * (1 - 0.6 * ind) * (1 + (boost - 1) * 0.6);
        this.hemiLight.intensity = b.hemi * (1 - 0.5 * k) * dim * fill * boost;
        if (this.scene.fog) {
            this.scene.fog.color.copy(b.fog).lerp(_stormFog, 0.75 * k);
            if (this.scene.background && this.scene.background.isColor) this.scene.background.copy(this.scene.fog.color);
            this.scene.fog.color.lerp(_caveFog, 0.7 * cv); // (far down a tunnel: the dark, not a bright haze)
        }
        this.sky?.setNightAmount(Math.max(b.night, 0.72 * k));
        this.sky?.setOvercast?.(k); // (the clouds cover the sunset and the stars)
        this.sky?.setClouds((this._cloudsWanted ?? true) || k > 0.1);
    }

    /**
     * Day and night, smoothly. `phase` 0..1 over the whole cycle: 0–0.5 day
     * (the sun crosses the sky), 0.5–1 night (the moon); dusk and dawn blend.
     */
    setDayPhase(phase) {
        const p = ((phase % 1) + 1) % 1;
        // night amount: 0 by day, 1 by night (the last quarter: 6 of 24 hours), soft around sunset and sunrise
        const k = nightAt(p);
        if (Math.abs(k - (this._night ?? -1)) < 0.002 && Math.abs(p - (this._phase ?? -1)) < 0.0005) return;
        this._night = k;
        this._phase = p;
        // The sun moves across the sky and on under the horizon; the moon crosses the night
        const sun = (this._sunTrue || (this._sunTrue = new THREE.Vector3()));
        const moon = (this._moonDir || (this._moonDir = new THREE.Vector3()));
        const elev = sunAt(p, sun, moon);
        const glow = sunsetGlow(elev);
        this.sky?.setNightAmount(k);
        this.sky?.setSunDirection(sun, moon);
        // the light comes from the sun while it is up (low and long-shadowed at sunset), from the moon at night
        const sunW = ss(-0.02, 0.1, elev);
        const lightFrom = sunW > 0.001 ? sun : moon;
        this.sunDir = (this.sunDir || new THREE.Vector3()).copy(lightFrom);
        if (this.sunDir.y < 0.1) { this.sunDir.y = 0.1; this.sunDir.normalize(); } // (shadows not endless)
        const fogCol = (this._fogCol || (this._fogCol = new THREE.Color())).set(SKY_DAY.fog).lerp(_nightFog.set(SKY_NIGHT.fog), k);
        // the haze at the horizon takes the sunset's warm colour, then the twilight's violet
        fogCol.lerp(_c1.setRGB(0.86, 0.54, 0.46), 0.65 * glow * (1 - k * 0.6));
        fogCol.lerp(_c1.setRGB(0.16, 0.18, 0.34), 0.5 * ss(0.2, 0.55, k) * (1 - ss(0.75, 1, k)));
        if (!this.scene.fog) this.scene.fog = new THREE.Fog(fogCol, 25, 90);
        this.scene.fog.color.copy(fogCol);
        if (this.scene.background && this.scene.background.isColor) this.scene.background.copy(fogCol);
        else this.scene.background = fogCol.clone();
        this.fogNear = 25 + (10 - 25) * k;
        this.fogFar = 90 + (50 - 90) * k;
        this.scene.fog.near = this.fogNear;
        // (the low sun lights the land less: evening comes before the night)
        const eve = 1 - 0.25 * glow * ss(0.3, 1, 1 - ss(0, 0.4, elev));
        this.ambientLight.intensity = (0.3 + (0.15 - 0.3) * k) * eve;
        // sunlight: white by day, golden in the golden hour, orange-red as the sun touches the horizon
        const low = 1 - ss(0.0, 0.4, elev);
        const sunCol = _c1.set(0xfff0d8).lerp(_c2.set(0xffb768), ss(0, 0.7, low)).lerp(_c2.set(0xff6a3c), ss(0.6, 1, low));
        const sunI = 0.85 * sunW * (0.55 + 0.45 * Math.min(1, Math.max(0, elev) / 0.5));
        const moonI = 0.18 * ss(0.45, 0.85, k);
        this.dirLight.intensity = sunI + moonI;
        this.dirLight.color.copy(sunW > 0.001 ? sunCol : _moon.set(0x9fb6ff));
        // the sky's light on everything: warm at sunset, cool blue-violet in the twilight
        this.ambientLight.color.setRGB(1, 1, 1).lerp(_c2.setRGB(1, 0.72, 0.62), 0.55 * glow * (1 - k)).lerp(_c2.setRGB(0.72, 0.74, 1), 0.35 * k);
        this.hemiLight.color.set(0xbfe3ff).lerp(_c2.setRGB(1, 0.7, 0.55), 0.55 * glow * (1 - k));
        this.hemiLight.intensity = (0.35 + (0.08 - 0.35) * k) * eve;
        this._shadowX = null; // re-aim the shadow
        this._rememberBase(k);
    }

    get nightAmount() {
        return this._night ?? 0;
    }

    createSkybox() {
        // Painted sky (gradient, sun, drifting clouds, stars at night); travels with the player
        this.sky = new Sky(this.scene);
        this.sky.setSunDirection(_sun.copy(this.dirLight.position).sub(this.dirLight.target.position));
    }

    // ----------------------------------------------------------------- terrain
    createTerrain(mountains, seas = false, test = false, deepCaves = false, lush = false, slopes = false, wizHuts = false, furnish = false, bigArena = false, apart = false, bigHouses = false, dungeons = false, arenaEntries = false, buildings = false) {
        const rng = createRng(this.seed);
        this.terrain = new Terrain(this.scene, { seed: this.seed, mountains, seas, test, deepCaves, lush, slopes, wizHuts, furnish, bigHouses, bigArena, apart, dungeons, arenaEntries, buildings, meshTrees: !!this.meshTrees });
        if (this.terrain.data.lush) this.terrain.flora = new Flora(this.terrain); // (tall grass and flowers)
        if (this.terrain.data.meshTrees) this.forest = new WorldTrees(this); // (real trees — drawn, hit, burnt like the start area's always were)
        this.collision.setTerrain(this.terrain);

        // Decorative grass cubes (1000, instanced) — same look as before.
        const grassCount = 1000;
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = applySkyComp(new THREE.MeshPhongMaterial({ color: 0x4CAF50 }));
        this.grass = new THREE.InstancedMesh(geo, mat, grassCount);
        this.grass.receiveShadow = true;
        this.grass.castShadow = false; // tiny cubes: their shadows cost more than they show
        this.grassData = [];
        const dummy = new THREE.Object3D();
        const color = new THREE.Color();
        for (let i = 0; i < grassCount; i++) {
            const x = Math.floor((rng() - 0.5) * this.terrainWidth);
            const z = Math.floor((rng() - 0.5) * this.terrainDepth);
            const ci = Math.floor(rng() * GRASS_COLORS.length);
            // (cubes that would land in a lake sit hidden under the ground instead)
            const wet = this.terrain.data.get(x, 0, z) === BLOCK.WATER;
            const y = wet ? -3 : this.terrain.surfaceY(x, z) + 1.0; // original: 0.5 above ground at -0.5
            dummy.position.set(x, y, z);
            dummy.updateMatrix();
            this.grass.setMatrixAt(i, dummy.matrix);
            this.grass.setColorAt(i, color.setHex(GRASS_COLORS[ci]));
            this.grassData.push({ x, y, z, color: GRASS_COLORS[ci], alive: true });
        }
        // (no longer shown: the scattered green cubes cluttered the meadows; they are still
        // generated so the random sequence — and with it every tree's place — stays the same)
        this.grass.visible = false;

        this.createTrees(rng);
    }

    createTrees(rng) {
        const count = 50;
        if (this.forest) { this._createRealTrees(rng, count); return; }
        // Voxel trees: a darker trunk and a crown built from several boxes in
        // different greens (instead of one green cube on a stick).
        const trunkGeo = mergeBoxes([
            { size: [1.6, 6, 1.6], pos: [0, 0, 0], color: 0x7a4a24 },
            { size: [1.0, 0.8, 1.0], pos: [1.1, 1.8, 0.2], color: 0x6b3f1e }, // branch stubs
            { size: [0.9, 0.7, 0.9], pos: [-0.9, 2.6, -0.4], color: 0x6b3f1e },
        ]);
        const crownGeo = mergeBoxes([
            { size: [6.2, 2.6, 6.2], pos: [0, 6.6, 0], color: 0x2f8a2f },
            { size: [5.0, 2.2, 5.0], pos: [0.3, 8.8, -0.2], color: 0x3a9a35 },
            { size: [3.2, 1.6, 3.2], pos: [-0.2, 10.5, 0.3], color: 0x46a83c },
            { size: [2.4, 2.0, 2.4], pos: [2.6, 7.6, 1.8], color: 0x2a7d2a },
            { size: [2.2, 1.8, 2.2], pos: [-2.7, 8.0, -1.6], color: 0x338f30 },
            { size: [1.8, 1.4, 1.8], pos: [1.2, 9.9, 2.0], color: 0x3f9f38 },
        ]);
        const trunkMat = applySkyComp(applyTreeDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), 'bark'));
        const leafMat = applySkyComp(applyTreeDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), 'leaf'));
        this.trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
        this.leafMesh = new THREE.InstancedMesh(crownGeo, leafMat, count);
        this.trunkMesh.castShadow = true;
        this.leafMesh.castShadow = true;
        this.leafMesh.receiveShadow = true;
        const dummy = new THREE.Object3D();
        const tint = new THREE.Color();
        let placed = 0, attempts = 0;
        while (placed < count && attempts < 2000) {
            attempts++;
            const x = (rng() - 0.5) * (this.terrainWidth - 10);
            const z = (rng() - 0.5) * (this.terrainDepth - 10);
            // Keep trees on flat ground (not inside mountains) and off the spawn tables.
            if (this.terrain && !this._flatAround(x, z, 1)) continue;
            if (this.terrain?.data?.sites?.landAt(Math.round(x), Math.round(z))) continue; // (not in a village)
            if (Math.abs(x) < 11 && z > -9 && z < 1) continue;
            const turn = Math.floor(rng() * 4) * (Math.PI / 2);
            const scale = 0.9 + rng() * 0.25;
            dummy.position.set(x, 2.5, z);
            dummy.rotation.set(0, turn, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            this.trunkMesh.setMatrixAt(placed, dummy.matrix);
            dummy.position.set(x, 0, z);
            dummy.scale.set(scale, scale, scale);
            dummy.updateMatrix();
            this.leafMesh.setMatrixAt(placed, dummy.matrix);
            // five kinds of trees: crown (and trunk, below) tinted per kind, each a little different
            const kind = Math.floor(rng() * 5);
            const v = 0.88 + rng() * 0.24;
            const lt = SPAWN_TREE_TINTS[kind];
            this.leafMesh.setColorAt(placed, tint.setRGB(v * lt.leaf[0] * (0.95 + rng() * 0.1), v * lt.leaf[1], v * lt.leaf[2] * (0.95 + rng() * 0.1)));
            const boxId = this.collision.addBox({ minX: x - 1, maxX: x + 1, minY: -0.5, maxY: 5.5, minZ: z - 1, maxZ: z + 1, kind: 'tree', noSupport: true });
            // the crown's bulk (crownGeo × scale; it turns in 90° steps, so the box stays the same):
            // leaves are solid for flying spells, as the voxel trees' leaves are further out
            const crown = { minX: x - 3.1 * scale, maxX: x + 3.1 * scale, minY: 5.3 * scale, maxY: 11.3 * scale, minZ: z - 3.1 * scale, maxZ: z + 3.1 * scale };
            this.trees.push({ x, z, alive: true, index: placed, boxId, kind, crown, turn, scale, y: -0.5 }); // (y: the ground under it)
            placed++;
        }
        for (let i = 0; i < placed; i++) { const tk = SPAWN_TREE_TINTS[this.trees[i].kind].trunk; this.trunkMesh.setColorAt(i, tint.setRGB(tk[0], tk[1], tk[2])); }
        this.trunkMesh.count = placed;
        this.leafMesh.count = placed;
        if (this.leafMesh.instanceColor) this.leafMesh.instanceColor.needsUpdate = true;
        this.scene.add(this.trunkMesh);
        this.scene.add(this.leafMesh);
    }

    /**
     * A world of real trees: the start area's trees are real trees too (Trees.js) — the same places as the block-look ones of
     * older worlds (flat ground, not on the tables, not in a village), ids 0…count−1 (a save keeps which are gone).
     */
    _createRealTrees(rng, count) {
        const list = [];
        let attempts = 0;
        while (list.length < count && attempts < 2000) {
            attempts++;
            const x = (rng() - 0.5) * (this.terrainWidth - 10);
            const z = (rng() - 0.5) * (this.terrainDepth - 10);
            if (this.terrain && !this._flatAround(x, z, 1)) continue;
            if (this.terrain?.data?.sites?.landAt(Math.round(x), Math.round(z))) continue; // (not in a village)
            if (Math.abs(x) < 13 && z > -11 && z < 3) continue; // (the crowns not over the spawn's tables)
            if (list.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) continue; // (wide crowns: not trunk to trunk)
            const kind = Math.floor(rng() * 5);
            list.push({ id: list.length, x, z, y: this.terrain ? this.terrain.surfaceY(x, z) : -0.5, kind, v: Math.floor(rng() * 12), s: 0.88 + rng() * 0.24, turn: rng() * Math.PI * 2, tint: 0.9 + rng() * 0.2 });
        }
        this.forest.addFixed(list);
    }

    /**
     * A tree's own model as it is drawn — [{geometry, material, matrix, color, depth}], the trunk, then the crown —
     * for a copy of it (carried by «Левиоса Максима», come alive). `at`: {x, y, z} to stand it elsewhere (standing).
     */
    treeParts(t, at = null) {
        if (t.mesh) return this.forest.parts(t, at ? this.forest.matrixAt(t, at.x, at.y, at.z) : t.matrix);
        const [tm, lm] = this.treeMatrices(at ? { ...t, x: at.x, y: at.y, z: at.z, fallen: null } : t);
        const col = (src) => { if (!src.instanceColor) return null; const c = new THREE.Color(); src.getColorAt(t.index, c); return c; };
        return [
            { geometry: this.trunkMesh.geometry, material: this.trunkMesh.material, matrix: tm, color: col(this.trunkMesh) },
            { geometry: this.leafMesh.geometry, material: this.leafMesh.material, matrix: lm, color: col(this.leafMesh) },
        ];
    }

    /** A tree went down by dy with the ground under it («Drawdown»). */
    sinkTree(t, dy) {
        if (t.mesh) { this.forest.shift(t, dy); return; }
        for (const mesh of [this.trunkMesh, this.leafMesh]) {
            if (!mesh) continue;
            mesh.getMatrixAt(t.index, _tm);
            _tm.elements[13] += dy;
            mesh.setMatrixAt(t.index, _tm);
            mesh.instanceMatrix.needsUpdate = true;
        }
        if (t.y != null) t.y += dy;
        if (t.crown) { t.crown.minY += dy; t.crown.maxY += dy; }
    }

    /** The ids of the trees taken away (a save, a friend joining): the ones here and the ones whose land went away. */
    treesGoneList() {
        const out = new Set();
        for (const t of this.trees || []) if (!t.alive) out.add(t.index);
        if (this.forest) for (const id of this.forest.gone) out.add(id);
        return [...out];
    }

    /** A tree gone by its id (a save, the host's word): one not here yet stays gone when its land comes. */
    treeGoneById(i) {
        const t = this.trees?.find((x) => x.index === i);
        if (t && t.alive) this.removeTree(t);
        else if (!t && this.forest) this.forest.goneById(i);
    }

    /** A tree burnt down: the crown is gone, the trunk is charred (it still blocks the way). */
    /** «Gather»: a spawn-area tree is taken away whole. */
    removeTree(t) {
        if (t?.mesh) { this.forest.removeTree(t); return; }
        if (!this.trunkMesh || !t || !t.alive) return;
        t.alive = false;
        const dummy = new THREE.Object3D();
        dummy.position.set(t.x, -1000, t.z);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        this.trunkMesh.setMatrixAt(t.index, dummy.matrix);
        this.leafMesh.setMatrixAt(t.index, dummy.matrix);
        this.trunkMesh.instanceMatrix.needsUpdate = true;
        this.leafMesh.instanceMatrix.needsUpdate = true;
        this.collision.removeBox(t.boxId);
    }

    /**
     * A spawn-area tree put down somewhere else — the same tree (its own model, turn, size and tint) — standing
     * on the ground at y, or lying felled towards `dir` ('x', '-x', 'z', '-z'): «Левиоса Максима» carried it.
     */
    placeTree(t, x, y, z, dir = null) {
        if (t?.mesh) { this.forest.placeTree(t, x, y, z, dir); return; }
        if (!this.trunkMesh || !t) return;
        if (t.alive) this.collision.removeBox(t.boxId);
        Object.assign(t, { x, y, z, fallen: dir || null, alive: true, moved: true });
        const [tm, lm] = this.treeMatrices(t);
        this.trunkMesh.setMatrixAt(t.index, tm);
        this.leafMesh.setMatrixAt(t.index, lm);
        this.trunkMesh.instanceMatrix.needsUpdate = true;
        this.leafMesh.instanceMatrix.needsUpdate = true;
        const s = t.scale ?? 1, dx = dir === 'x' ? 1 : dir === '-x' ? -1 : 0, dz = dir === 'z' ? 1 : dir === '-z' ? -1 : 0;
        const along = (a0, a1, w) => (dx ? { minX: x + Math.min(a0 * dx, a1 * dx), maxX: x + Math.max(a0 * dx, a1 * dx), minZ: z - w, maxZ: z + w }
            : { minX: x - w, maxX: x + w, minZ: z + Math.min(a0 * dz, a1 * dz), maxZ: z + Math.max(a0 * dz, a1 * dz) });
        if (dir) {
            t.boxId = this.collision.addBox({ ...along(-0.5, 5.5, 0.8), minY: y, maxY: y + 1.6, kind: 'tree', noSupport: true });
            t.crown = { ...along(5.3 * s, 11.3 * s, 3.1 * s), minY: y, maxY: y + 0.8 + 3.1 * s };
        } else {
            t.boxId = this.collision.addBox({ minX: x - 1, maxX: x + 1, minY: y, maxY: y + 6, minZ: z - 1, maxZ: z + 1, kind: 'tree', noSupport: true });
            t.crown = { minX: x - 3.1 * s, maxX: x + 3.1 * s, minY: y + 0.5 + 5.3 * s, maxY: y + 0.5 + 11.3 * s, minZ: z - 3.1 * s, maxZ: z + 3.1 * s };
        }
    }

    /** A spawn-area tree's model where it is now: [trunk, crown] matrices (standing, or felled towards t.fallen). */
    treeMatrices(t) {
        const x = t.x, y = t.y ?? -0.5, z = t.z, s = t.scale ?? 1, dir = t.fallen;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.turn || 0);
        const fell = new THREE.Matrix4();
        if (dir) {
            // (turned over round its foot: the crown lies towards dir, the trunk on the ground)
            const dx = dir === 'x' ? 1 : dir === '-x' ? -1 : 0, dz = dir === 'z' ? 1 : dir === '-z' ? -1 : 0;
            const R = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(dz, 0, -dx), Math.PI / 2);
            fell.makeTranslation(x, y + 0.8, z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
        }
        const trunk = fell.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 3, z), q, new THREE.Vector3(1, 1, 1)));
        const leaf = fell.multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.5, z), q, new THREE.Vector3(s, s, s)));
        return [trunk, leaf];
    }

    /** The trees put somewhere else (for the save / a friend joining): [index, x, y, z, dir]. */
    movedTrees() {
        const r = (v) => Math.round(v * 100) / 100;
        return (this.trees || []).filter((t) => t.moved && t.alive).map((t) => [t.index, r(t.x), r(t.y), r(t.z), t.fallen || 0]);
    }

    restoreMovedTrees(list) {
        for (const [i, x, y, z, dir] of list || []) {
            const t = this.trees?.find((q) => q.index === i);
            if (t) this.placeTree(t, +x, +y, +z, dir || null);
            else this.forest?.movedById(i, +x, +y, +z, dir || null); // (its land not here yet: put down when it comes)
        }
    }

    burnTree(t) {
        if (t?.mesh) { this.forest.burnTree(t); return; }
        if (!this.trunkMesh || !t.alive) return;
        const dummy = new THREE.Object3D();
        dummy.position.set(t.x, -1000, t.z);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        this.leafMesh.setMatrixAt(t.index, dummy.matrix);
        this.leafMesh.instanceMatrix.needsUpdate = true;
        this.trunkMesh.setColorAt(t.index, new THREE.Color(0x3a3029));
        if (this.trunkMesh.instanceColor) this.trunkMesh.instanceColor.needsUpdate = true;
    }

    _flatAround(x, z, r) {
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
            if (this.terrain.topLayer(Math.round(x) + dx, Math.round(z) + dz) !== 0) return false;
        }
        return true;
    }

    // --------------------------------------------------------------- pedestals
    /**
     * A stone pedestal with a glowing rune ring; a weapon floats above it as
     * if held by magic. Returns the top surface Y.
     */
    createPedestal(x, z, { y = 0, godGift = true } = {}) {
        // (all the pedestals are drawn together: each of their 7 parts is ONE instanced mesh for every pedestal — the stone foot,
        // step, column, head, the gold rim, the glowing disc and the turning rune ring; Creative's 20 pedestals were 140 draws
        // and 100 shadow casters — now 7 and 5. The group stays: their place, the gift of the gods' mark)
        const g = new THREE.Group();
        g.position.set(x, y, z);
        const K = this._pedestalKit || (this._pedestalKit = this._makePedestalKit());
        const i = K.n++;
        if (K.n > K.cap) this._growPedestalKit(K);
        if (godGift) g.userData.godGift = true;
        this.scene.add(g);
        const surfaceY = 1.97;
        // the wide stone foot is a low step one can stand on; the column and its top are as wide as they look
        // (a hand can reach what floats over it)
        const b1 = this.collision.addBox({ minX: x - 1.4, maxX: x + 1.4, minY: y - 0.5, maxY: y - 0.03, minZ: z - 1.4, maxZ: z + 1.4, kind: 'table', godGift });
        const b2 = this.collision.addBox({ minX: x - 1.0, maxX: x + 1.0, minY: y - 0.5, maxY: y + surfaceY, minZ: z - 1.0, maxZ: z + 1.0, kind: 'table', godGift });
        this.pedestals = this.pedestals || [];
        // (a gift of the gods — CLAUDE.md «Дары богов»: no spell breaks or moves it; it is no block: blasts,
        //  fire, «Inspirius», «Total Destruction», quakes, «Gather» take the ground round it, never it — it stands as it was)
        const p = { i, t: Math.random() * 6, spin: 0, x, z, y, group: g, boxes: [b1, b2], godGift: true };
        this.pedestals.push(p);
        this._placePedestal(p);
        for (const m of K.meshes) m.count = K.n;
        return surfaceY;
    }

    /** The pedestals' shared parts: one instanced mesh each (made once; grown ×2 when full). */
    _makePedestalKit() {
        const K = {
            n: 0, cap: 0,
            stone: new THREE.MeshLambertMaterial({ color: 0x6d6a75 }),
            stoneLight: new THREE.MeshLambertMaterial({ color: 0x8e8a99 }),
            gold: new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.9 }),
            // (the glow: additive, so a copy's colour times its brightness is exactly the old opacity's look)
            glow: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
            runes: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
            parts: null, meshes: [],
        };
        const rx = new THREE.Matrix4().makeRotationX(Math.PI / 2), rxn = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
        K.parts = [
            { geo: new THREE.CylinderGeometry(1.35, 1.6, 0.45, 8), mat: K.stone, y: -0.25, shadow: true },
            { geo: new THREE.CylinderGeometry(1.05, 1.2, 0.3, 8), mat: K.stoneLight, y: 0.12, shadow: true },
            { geo: new THREE.CylinderGeometry(0.55, 0.7, 1.4, 8), mat: K.stoneLight, y: 0.97, shadow: true },
            { geo: new THREE.CylinderGeometry(0.95, 0.6, 0.3, 8), mat: K.stone, y: 1.82, shadow: true },
            { geo: new THREE.TorusGeometry(0.95, 0.05, 6, 24).applyMatrix4(rx), mat: K.gold, y: 1.97, shadow: true },
            { geo: new THREE.CircleGeometry(0.85, 24).applyMatrix4(rxn), mat: K.glow, y: 1.99, glow: 0x9b7bff, disc: true },
            { geo: new THREE.TorusGeometry(0.7, 0.035, 6, 32).applyMatrix4(rx), mat: K.runes, y: 2.6, glow: 0x7fe7ff, ring: true },
        ];
        this._growPedestalKit(K);
        return K;
    }

    _growPedestalKit(K) {
        const cap = Math.max(32, K.cap * 2, K.n);
        const old = K.meshes;
        K.meshes = K.parts.map((part, k) => {
            const m = new THREE.InstancedMesh(part.geo, part.mat, cap);
            m.frustumCulled = false; // (spread over the place: drawn as one)
            m.castShadow = !!part.shadow;
            m.receiveShadow = !!part.shadow;
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            if (part.glow) { m.setColorAt(0, _pc.setHex(part.glow)); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
            m.userData.godGift = true;
            m.userData.shared = true;
            m.name = 'pedestals';
            const was = old[k];
            if (was) {
                m.instanceMatrix.array.set(was.instanceMatrix.array.subarray(0, Math.min(was.instanceMatrix.array.length, m.instanceMatrix.array.length)));
                if (was.instanceColor) m.instanceColor.array.set(was.instanceColor.array.subarray(0, Math.min(was.instanceColor.array.length, m.instanceColor.array.length)));
                this.scene.remove(was);
                was.dispose();
            }
            m.count = K.n;
            this.scene.add(m);
            return m;
        });
        K.cap = cap;
    }

    /** One pedestal's copies put in place (its ring turned and lifted, its glow as bright as now). */
    _placePedestal(p) {
        const K = this._pedestalKit;
        K.parts.forEach((part, k) => {
            const m = K.meshes[k];
            let yy = p.y + part.y;
            if (part.ring) { yy = p.y + 2.6 + Math.sin(p.t * 1.6) * 0.08; _pm.makeRotationY(-p.spin).setPosition(p.x, yy, p.z); } else _pm.makeTranslation(p.x, yy, p.z);
            m.setMatrixAt(p.i, _pm);
            m.instanceMatrix.needsUpdate = true;
            if (part.glow) {
                const k2 = part.disc ? (0.35 + Math.sin(p.t * 2.2) * 0.12) / 0.45 : 1; // (the disc breathes: its brightness, as its opacity did)
                m.setColorAt(p.i, _pc.setHex(part.glow).multiplyScalar(k2));
                m.instanceColor.needsUpdate = true;
            }
        });
    }

    /** Take away the pedestals standing at these points (the temple leaving with its planet). */
    removePedestals(points) {
        const K = this._pedestalKit;
        for (const p of [...(this.pedestals || [])]) {
            if (!points.some((q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.z - p.z) < 0.01)) continue;
            this.scene.remove(p.group);
            for (const id of p.boxes) this.collision.removeBox(id);
            this.pedestals.splice(this.pedestals.indexOf(p), 1);
        }
        if (!K) return;
        // (the copies packed again: the ones left, in order)
        K.n = this.pedestals.length;
        this.pedestals.forEach((p, i) => { p.i = i; this._placePedestal(p); });
        for (const m of K.meshes) m.count = K.n;
    }

    /** Rune rings turn and breathe. */
    _animatePedestals(dt) {
        if (!this._pedestalKit) return;
        for (const p of this.pedestals || []) {
            p.t += dt;
            p.spin += dt * 0.8;
            this._placePedestal(p);
        }
    }

    // ------------------------------------------------------------------ tables
    /** Original createTable(): returns the surface Y (top of the table). */
    createTable(x, z) {
        const tableGroup = new THREE.Group();
        tableGroup.position.set(x, 0, z);
        const topHeight = 1.75, topWidth = 5.0, topDepth = 4.0;
        const top = new THREE.Mesh(
            new THREE.BoxGeometry(topWidth, 0.6, topDepth),
            new THREE.MeshLambertMaterial({ color: 0x5D4037 }),
        );
        top.position.y = topHeight;
        top.receiveShadow = true;
        top.castShadow = true;
        tableGroup.add(top);
        const legGeo = new THREE.BoxGeometry(0.8, topHeight, 0.8);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x3E2723 });
        const ox = topWidth / 2 - 0.5, oz = topDepth / 2 - 0.5;
        for (const [lx, lz] of [[-ox, -oz], [ox, -oz], [-ox, oz], [ox, oz]]) {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(lx, topHeight / 2, lz);
            leg.castShadow = true;
            tableGroup.add(leg);
        }
        this.scene.add(tableGroup);
        const surfaceY = topHeight + 0.3;
        const boxId = this.collision.addBox({
            minX: x - topWidth / 2, maxX: x + topWidth / 2,
            minY: -0.5, maxY: surfaceY,
            minZ: z - topDepth / 2, maxZ: z + topDepth / 2,
            kind: 'table',
        });
        this.tables.push({ x, z, group: tableGroup, boxId, alive: true, surfaceY });
        return surfaceY;
    }

    // -------------------------------------------------------------- custom map
    loadFromMap(mapData) {
        const cellSize = MAP_CELL, wallHeight = MAP_WALL_HEIGHT;
        const result = { playerSpawn: null, winPoint: null, zombieSpawns: [], chests: [], walls: [], gridSize: mapData.gridSize || 20 };

        const floorTexture = this.textureLoader.load('assets/textures/floor.png');
        const wallTexture = this.textureLoader.load('assets/textures/wall.png');
        floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
        wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;

        // Border walls are always solid (the original added them at runtime).
        const gridSize = result.gridSize;
        const wallCells = (mapData.walls || []).map((w) => ({ x: w.x, z: w.z }));
        const has = new Set(wallCells.map((w) => w.x + ',' + w.z));
        for (let x = 0; x < gridSize; x++) {
            for (let z = 0; z < gridSize; z++) {
                if ((x === 0 || z === 0 || x === gridSize - 1 || z === gridSize - 1) && !has.has(x + ',' + z)) {
                    result.borderOnly = result.borderOnly || [];
                    result.borderOnly.push({ x, z });
                }
            }
        }

        let minX = 0, maxX = 20, minZ = 0, maxZ = 20;
        if (wallCells.length > 0) {
            minX = Math.min(...wallCells.map((w) => w.x)) - 2;
            maxX = Math.max(...wallCells.map((w) => w.x)) + 3;
            minZ = Math.min(...wallCells.map((w) => w.z)) - 2;
            maxZ = Math.max(...wallCells.map((w) => w.z)) + 3;
        }
        const floorWidth = (maxX - minX) * cellSize + 100;
        const floorDepth = (maxZ - minZ) * cellSize + 100;
        floorTexture.repeat.set(floorWidth / cellSize, floorDepth / cellSize);
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(floorWidth, floorDepth),
            new THREE.MeshPhongMaterial({ map: floorTexture, color: 0xcccccc }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set((maxX + minX) / 2 * cellSize, 0, (maxZ + minZ) / 2 * cellSize);
        floor.receiveShadow = true;
        this.scene.add(floor);

        if (wallCells.length > 0) {
            wallTexture.repeat.set(1, wallHeight / cellSize);
            const wallMesh = new THREE.InstancedMesh(
                new THREE.BoxGeometry(cellSize, wallHeight, cellSize),
                new THREE.MeshPhongMaterial({ map: wallTexture, color: 0xcccccc }),
                wallCells.length,
            );
            wallMesh.castShadow = true;
            wallMesh.receiveShadow = true;
            const dummy = new THREE.Object3D();
            wallCells.forEach((w, i) => {
                dummy.position.set(w.x * cellSize, wallHeight / 2, w.z * cellSize);
                dummy.updateMatrix();
                wallMesh.setMatrixAt(i, dummy.matrix);
            });
            this.scene.add(wallMesh);
            this.wallMesh = wallMesh;
        }

        const collisionWalls = wallCells.concat(result.borderOnly || []).map((w) => ({ x: w.x * cellSize, z: w.z * cellSize }));
        result.walls = collisionWalls;
        this.collision.setWalls(collisionWalls, cellSize, wallHeight);
        this.collision.floorY = 0;
        this.wallCellSet = new Set(wallCells.concat(result.borderOnly || []).map((w) => w.x + ',' + w.z));

        if (mapData.playerSpawn) {
            result.playerSpawn = new THREE.Vector3(mapData.playerSpawn.x * cellSize, 1.5, mapData.playerSpawn.z * cellSize);
        }
        if (mapData.winPoint) {
            const winMesh = new THREE.Mesh(
                new THREE.BoxGeometry(cellSize * 0.9, 0.3, cellSize * 0.9),
                new THREE.MeshBasicMaterial({ color: 0xFFD700 }),
            );
            winMesh.position.set(mapData.winPoint.x * cellSize, 0.15, mapData.winPoint.z * cellSize);
            this.scene.add(winMesh);
            result.winPoint = new THREE.Vector3(mapData.winPoint.x * cellSize, 0, mapData.winPoint.z * cellSize);
        }
        for (const s of mapData.zombieSpawns || []) {
            const count = s.count || 1;
            for (let i = 0; i < count; i++) {
                const offset = i * 0.5;
                result.zombieSpawns.push(new THREE.Vector3(s.x * cellSize + offset, 0.5, s.z * cellSize + offset));
            }
        }
        for (const c of mapData.chests || []) {
            result.chests.push({
                position: new THREE.Vector3(c.x * cellSize, 0, c.z * cellSize),
                item: c.item,
                cell: { x: c.x, z: c.z },
                facing: chestFacing(c.x, c.z, this.wallCellSet, mapData),
            });
        }
        return result;
    }

    // ------------------------------------------------------------- destruction
    /**
     * Blow up everything destructible inside a sphere.
     * Returns {blocks, props} for debris effects; also reports destroyed tables.
     */
    /** A living start-area tree whose crown (leaves) is at this point, or null. */
    leavesAt(x, y, z) {
        for (const t of this.trees) {
            const c = t.crown;
            if (!t.alive || !c) continue;
            if (t.mesh) { if (this.forest.leavesHit(t, x, y, z)) return t; continue; } // (a real crown: its leaf clusters)
            if (x >= c.minX && x <= c.maxX && y >= c.minY && y <= c.maxY && z >= c.minZ && z <= c.maxZ) return t;
        }
        return null;
    }

    /**
     * «Total Destruction»: everything built around `center` falls apart (Ruin.js) —
     * no crater; the start area's trees, grass and tables just break.
     */
    ruin(center, radius, keep = null, ring = null) {
        const out = { blocks: [], props: [], tables: [], falls: [], removed: [], rubble: [] };
        if (!this.destructible) return out;
        const terrain = this.terrain;
        if (terrain) Object.assign(out, ruinArea(terrain.data, center.x, center.y, center.z, radius, keep, ring)); // (ring: one band of a wave — Ruin.js)
        this.terrain = null; // (the props only: the ground is not blown away)
        try { const p = this.explode(center, radius); out.props = p.props; out.tables = p.tables; } finally { this.terrain = terrain; }
        return out;
    }

    /** keep(x, y, z): blocks it may not break (a house's sphere of protection, HouseWards.js). */
    explode(center, radius, keep = null) {
        const out = { blocks: [], props: [], tables: [], falls: [] };
        if (!this.destructible) return out;
        if (this.terrain) {
            const data = this.terrain.data;
            data.settling?.flush(); // (the checks of the buildings after the changes before it: done first — the same order everywhere)
            out.blocks = this.terrain.removeSphere(center.x, center.y, center.z, radius, keep);
            // what is left hanging in the air falls down (a roof without walls, a piece of floor); then what the
            // building round it can no longer hold (Structure.js — worked out a little each frame)
            out.falls = collapseAfter(data, center.x, center.y, center.z, radius, 0, out.blocks, keep);
        }

        // Grass cubes
        if (this.grass) {
            const dummy = new THREE.Object3D();
            let changed = false;
            const r2 = (radius + 0.5) ** 2;
            for (let i = 0; i < this.grassData.length; i++) {
                const g = this.grassData[i];
                if (!g.alive) continue;
                const dx = g.x - center.x, dy = g.y - center.y, dz = g.z - center.z;
                if (dx * dx + dy * dy + dz * dz > r2) continue;
                g.alive = false;
                dummy.position.set(g.x, -1000, g.z);
                dummy.scale.setScalar(0.0001);
                dummy.updateMatrix();
                this.grass.setMatrixAt(i, dummy.matrix);
                out.props.push({ x: g.x, y: g.y, z: g.z, color: g.color, size: 1 });
                changed = true;
            }
            if (changed) this.grass.instanceMatrix.needsUpdate = true;
        }

        // Real trees: broken when the blast reaches the trunk or the crown — splinters and leaves fly
        if (this.forest) {
            for (const t of this.trees) {
                if (!t.mesh || !t.alive) continue;
                const dx = t.x - center.x, dz = t.z - center.z;
                const dy = Math.max(0, Math.max(t.y - 0.5 - center.y, center.y - (t.y + t.h))); // trunk+crown span
                const reach = radius + t.r + (center.y > t.y + t.c0 ? Math.min(3, (t.h - t.c0) * 0.25) : 0.6);
                if (dx * dx + dz * dz + dy * dy > reach * reach) continue;
                if (this.forest.godGift?.(t)) continue;
                this.forest.removeTree(t);
                out.trees = out.trees || [];
                out.trees.push(t);
                const bark = [0x6b4a2e, 0xd9d4ca, 0x5a3d29, 0x6a3a34, 0x3d2b1d][t.kind] ?? 0x6b4a2e;
                const leaf = [0x3f8a30, 0x6a9f3a, 0x2f6238, 0xf2a6c8, 0x335c26][t.kind] ?? 0x3f8a30;
                const n = Math.min(8, Math.max(4, Math.round(t.c0)));
                for (let k = 0; k < n; k++) out.props.push({ x: t.x + (Math.random() - 0.5) * t.r * 2, y: t.y + 0.5 + (k / n) * t.c0, z: t.z + (Math.random() - 0.5) * t.r * 2, color: bark, size: Math.max(0.6, t.r * 1.4) });
                if (!t.burnt) for (let k = 0; k < 14; k++) {
                    const a = (k / 14) * Math.PI * 2, rr = (t.crown ? (t.crown.maxX - t.crown.minX) / 2 : 4) * (0.3 + 0.6 * ((k * 37) % 10) / 10);
                    out.props.push({ x: t.x + Math.cos(a) * rr, y: t.y + t.c0 + ((k * 53) % 10) / 10 * (t.h - t.c0), z: t.z + Math.sin(a) * rr, color: leaf, size: 1.3 });
                }
            }
        }

        // Trees: destroyed when the blast reaches the trunk.
        if (this.trunkMesh) {
            const dummy = new THREE.Object3D();
            let changed = false;
            for (const t of this.trees) {
                if (!t.alive || t.mesh) continue;
                const dx = t.x - center.x, dz = t.z - center.z;
                const dy = Math.max(0, Math.max(-0.5 - center.y, center.y - 11)); // trunk+crown span
                if (dx * dx + dz * dz + dy * dy > (radius + 1.2) ** 2) continue;
                t.alive = false;
                dummy.position.set(t.x, -1000, t.z);
                dummy.scale.setScalar(0.0001);
                dummy.updateMatrix();
                this.trunkMesh.setMatrixAt(t.index, dummy.matrix);
                this.leafMesh.setMatrixAt(t.index, dummy.matrix);
                this.collision.removeBox(t.boxId);
                for (let k = 0; k < 6; k++) out.props.push({ x: t.x, y: 0.5 + k, z: t.z, color: 0x8B4513, size: 1 });
                for (let k = 0; k < 10; k++) out.props.push({ x: t.x + (k % 3 - 1) * 2, y: 6 + Math.floor(k / 3) * 2, z: t.z + ((k >> 1) % 3 - 1) * 2, color: 0x228B22, size: 1.6 });
                changed = true;
            }
            if (changed) {
                this.trunkMesh.instanceMatrix.needsUpdate = true;
                this.leafMesh.instanceMatrix.needsUpdate = true;
            }
        }

        // Tables
        for (const t of this.tables) {
            if (!t.alive) continue;
            const dx = t.x - center.x, dz = t.z - center.z, dy = Math.max(0, center.y - 2.05);
            if (dx * dx + dz * dz + dy * dy > (radius + 1.5) ** 2) continue;
            t.alive = false;
            this.scene.remove(t.group);
            t.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
            this.collision.removeBox(t.boxId);
            for (let k = 0; k < 8; k++) out.props.push({ x: t.x + (k % 4 - 1.5), y: 1.5, z: t.z + (k > 3 ? 1 : -1), color: k < 4 ? 0x5D4037 : 0x3E2723, size: 0.8 });
            out.tables.push(t);
        }
        return out;
    }

    /**
     * @param {{x,y,z}} [focus]  player position: the endless terrain loads around it
     * @param {number} [viewBoost]  0..1 — see further (in flight)
     */
    update(focus, viewBoost = 0) {
        const now = performance.now();
        if (this.pedestals) this._animatePedestals(Math.min(0.1, (now - (this._lastUpdate || now)) / 1000));
        this._lastUpdate = now;
        if (this.scene.fog && this.fogFar) {
            // How far is drawn (settings) × what the graphics level allows; in flight the
            // view opens up by the same metres at every distance, so the land below is visible
            const q = this.viewScale ?? 1, d = this.viewDistance ?? 1;
            let far = this.fogFar * q * (d + viewBoost * 1.2) * (1 - 0.4 * (this.storm || 0)) * fogBoost(this.nightVision || 0, darkness(this._night, this.cave)); // (the night gift: the dark is seen farther)
            if (this.duelFar) far = Math.min(far, this.duelFar); // (the duel-only start: the arena and a little round it, nothing else is made)
            this.scene.fog.far = far;
            this.scene.fog.near = Math.min(this.fogNear * d + viewBoost * 40, far * 0.5);
            if (this.terrain) this.terrain.viewDistance = far + CHUNK_MARGIN;
        }
        if (this.sky && focus) this.sky.position.set(focus.x, focus.y, focus.z);
        if (this.sky) this.sky.update(1 / 60);
        if (this.terrain) this.terrain.update(focus);
    }

    /**
     * Keep the sun's shadow box on the player. On the ground it is centred on
     * him; in flight (`flying` 0..1 = the view boost, `look` = where the camera
     * looks) the box grows (per graphics level, `shadowFlyExtent`) and moves
     * ahead, so a village is already in the shadow long before it is reached.
     * The box's edge fades (core/Shadows.js) — no line sweeping over the land.
     */
    followShadow(pos, flying = 0, look = null) {
        const shadow = this.dirLight.shadow;
        const fly = this.shadowFlyExtent || SHADOW_EXTENT;
        // (one jump on take-off / landing, not a slow growth: a changing size would shimmer every frame)
        const ext = flying > 0.5 && fly > SHADOW_EXTENT ? fly : SHADOW_EXTENT;
        const cam = shadow.camera;
        if (cam.right !== ext) {
            cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
            cam.updateProjectionMatrix();
            this._shadowX = null;
        }
        let cx = pos.x, cz = pos.z;
        if (ext > SHADOW_EXTENT && look) {
            const l = Math.hypot(look.x, look.z);
            if (l > 1e-3) { cx += (look.x / l) * ext * 0.45; cz += (look.z / l) * ext * 0.45; }
        }
        // Move in whole shadow-map texels — counted along the shadow map's own
        // axes (it looks along the sun, not straight down) — so edges don't shimmer.
        const s = this.sunDir || _defaultSun;
        const texel = (ext * 2) / shadow.mapSize.width;
        _ax.set(0, 1, 0).cross(s);
        if (_ax.lengthSq() < 1e-6) _ax.set(1, 0, 0); else _ax.normalize();
        _ay.copy(s).cross(_ax).normalize();
        _c.set(cx, 0, cz);
        const a = _c.dot(_ax), b = _c.dot(_ay);
        _c.addScaledVector(_ax, Math.round(a / texel) * texel - a).addScaledVector(_ay, Math.round(b / texel) * texel - b);
        if (_c.x === this._shadowX && _c.z === this._shadowZ && _c.y === this._shadowY) return;
        this._shadowX = _c.x; this._shadowY = _c.y; this._shadowZ = _c.z;
        // (the light far enough back that mountains and a high-flying player are inside its depth range)
        this.dirLight.position.copy(_c).addScaledVector(s, 200);
        this.dirLight.target.position.copy(_c);
        this.dirLight.target.updateMatrixWorld();
    }

    groundY(x, z) {
        return this.collision.groundY(x, z);
    }
}

/**
 * Decide which way a chest on a map should face: towards open space, never
 * into a wall. Prefers the free side that points towards the player spawn.
 * Returns rotation.y (chest front is local +Z).
 */
export function chestFacing(cx, cz, wallSet, mapData) {
    const dirs = [
        { dx: 0, dz: 1, rot: 0 },
        { dx: 1, dz: 0, rot: Math.PI / 2 },
        { dx: 0, dz: -1, rot: Math.PI },
        { dx: -1, dz: 0, rot: -Math.PI / 2 },
    ];
    const spawn = mapData && mapData.playerSpawn;
    let best = null, bestScore = -Infinity;
    for (const d of dirs) {
        const blocked = wallSet.has((cx + d.dx) + ',' + (cz + d.dz));
        // Room in front matters most, then sides being open (approachable).
        let score = blocked ? -100 : 0;
        if (!blocked && wallSet.has((cx + 2 * d.dx) + ',' + (cz + 2 * d.dz))) score -= 3;
        if (spawn) {
            const sx = spawn.x - cx, sz = spawn.z - cz;
            const len = Math.hypot(sx, sz) || 1;
            score += 2 * ((sx / len) * d.dx + (sz / len) * d.dz);
        }
        if (score > bestScore) { bestScore = score; best = d; }
    }
    return best ? best.rot : 0;
}

/** One geometry from several coloured boxes (for instanced voxel props). */
function mergeBoxes(boxes) {
    const positions = [], normals = [], colors = [], indices = [];
    const c = new THREE.Color();
    for (const b of boxes) {
        const g = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
        g.translate(b.pos[0], b.pos[1], b.pos[2]);
        const base = positions.length / 3;
        const p = g.attributes.position.array, n = g.attributes.normal.array;
        c.setHex(b.color);
        for (let i = 0; i < p.length; i += 3) {
            positions.push(p[i], p[i + 1], p[i + 2]);
            normals.push(n[i], n[i + 1], n[i + 2]);
            // slightly darker underside, lighter top
            const k = n[i + 1] > 0.5 ? 1.12 : n[i + 1] < -0.5 ? 0.7 : 1.0;
            colors.push(c.r * k, c.g * k, c.b * k);
        }
        for (const i of g.index.array) indices.push(base + i);
        g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
}
