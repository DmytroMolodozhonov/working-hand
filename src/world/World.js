/**
 * World.js — everything static in a level: lights, sky, ground/terrain,
 * decorations (grass cubes, trees), tables and custom-map walls.
 *
 * Visual parameters are copied 1:1 from the original World.js / main.js so the
 * game looks the same; the internals are instanced, seeded and destructible.
 */

import * as THREE from 'three';
import { createRng } from '../core/math.js';
import { Terrain, BLOCK } from './Terrain.js';

const _sun = new THREE.Vector3();
const _nightFog = new THREE.Color();
const _moon = new THREE.Color();
const _stormFog = new THREE.Color(0x2b3038);
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
const SHADOW_EXTENT = 45; // m around the player that receive the sun's shadows
import { CollisionWorld } from './Collision.js';
import { Sky, SKY_DAY, SKY_NIGHT } from './Sky.js';
import { applyTreeDetail } from './VoxelShading.js';

const GRASS_COLORS = [0x4CAF50, 0x66BB6A, 0x43A047, 0x81C784, 0x388E3C];
export const MAP_CELL = 5; // metres per editor cell (original: 2.5x bigger than 2m)
export const MAP_WALL_HEIGHT = 8;

export class VoxelWorld {
    /**
     * @param {THREE.Scene} scene
     * @param {object} opts {seed, mountains, map}
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
            this.createTerrain(!!opts.mountains);
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
        if ((this.storm || 0) > 0 || (this.cave || 0) > 0) this.setStorm(this.storm || 0);
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
        const cave = 1 - 0.78 * (this.cave || 0);
        const ind = this.indoor || 0;
        // indoors: the sun is outside, the rooms are lit (brighter at night than the dark outside)
        const lamp = 1 + ind * (b.night > 0.5 ? 2.6 : 1.1);
        this.ambientLight.intensity = b.amb * (1 - 0.5 * k) * cave * lamp;
        this.dirLight.intensity = b.dir * (1 - 0.8 * k) * (1 - 0.95 * (this.cave || 0)) * (1 - 0.6 * ind);
        this.hemiLight.intensity = b.hemi * (1 - 0.5 * k) * cave * (1 + ind * 0.8);
        if (this.scene.fog) {
            this.scene.fog.color.copy(b.fog).lerp(_stormFog, 0.75 * k);
            if (this.scene.background && this.scene.background.isColor) this.scene.background.copy(this.scene.fog.color);
        }
        this.sky?.setNightAmount(Math.max(b.night, 0.72 * k));
        this.sky?.setClouds((this._cloudsWanted ?? true) || k > 0.1);
    }

    /**
     * Day and night, smoothly. `phase` 0..1 over the whole cycle: 0–0.5 day
     * (the sun crosses the sky), 0.5–1 night (the moon); dusk and dawn blend.
     */
    setDayPhase(phase) {
        const p = ((phase % 1) + 1) % 1;
        // night amount: 0 by day, 1 by night, ~1.5 min blends around sunset (0.5) and sunrise (0/1)
        const edge = 0.045;
        const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        const night = p < 0.5 ? ss(0.5 - edge, 0.5 + edge, p) + (1 - ss(-edge, edge, p)) : ss(0.5 - edge, 0.5 + edge, p) * (1 - ss(1 - edge, 1 + edge, p));
        const k = Math.max(0, Math.min(1, night));
        if (Math.abs(k - (this._night ?? -1)) < 0.002 && Math.abs(p - (this._phase ?? -1)) < 0.0005) return;
        this._night = k;
        this._phase = p;
        // Sun (by day) or moon (by night) moves across the sky
        const arc = (p < 0.5 ? p / 0.5 : (p - 0.5) / 0.5) * Math.PI; // 0 → π
        const elev = Math.max(0.12, Math.sin(arc));
        this.sunDir = (this.sunDir || new THREE.Vector3()).set(Math.cos(arc) * 0.9, elev, 0.35).normalize();
        this.sky?.setNightAmount(k);
        this.sky?.setSunDirection(this.sunDir);
        const fogCol = (this._fogCol || (this._fogCol = new THREE.Color())).set(SKY_DAY.fog).lerp(_nightFog.set(SKY_NIGHT.fog), k);
        if (!this.scene.fog) this.scene.fog = new THREE.Fog(fogCol, 25, 90);
        this.scene.fog.color.copy(fogCol);
        if (this.scene.background && this.scene.background.isColor) this.scene.background.copy(fogCol);
        else this.scene.background = fogCol.clone();
        this.fogNear = 25 + (10 - 25) * k;
        this.fogFar = 90 + (50 - 90) * k;
        this.scene.fog.near = this.fogNear;
        this.ambientLight.intensity = 0.3 + (0.15 - 0.3) * k;
        this.dirLight.intensity = (0.85 + (0.18 - 0.85) * k) * (0.6 + 0.4 * elev);
        this.dirLight.color.set(0xfff0d8).lerp(_moon.set(0x9fb6ff), k);
        this.hemiLight.intensity = 0.35 + (0.08 - 0.35) * k;
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
    createTerrain(mountains) {
        const rng = createRng(this.seed);
        this.terrain = new Terrain(this.scene, { seed: this.seed, mountains });
        this.collision.setTerrain(this.terrain);

        // Decorative grass cubes (1000, instanced) — same look as before.
        const grassCount = 1000;
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshPhongMaterial({ color: 0x4CAF50 });
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
        const trunkMat = applyTreeDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), 'bark');
        const leafMat = applyTreeDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), 'leaf');
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
            this.trees.push({ x, z, alive: true, index: placed, boxId, kind });
            placed++;
        }
        for (let i = 0; i < placed; i++) { const tk = SPAWN_TREE_TINTS[this.trees[i].kind].trunk; this.trunkMesh.setColorAt(i, tint.setRGB(tk[0], tk[1], tk[2])); }
        this.trunkMesh.count = placed;
        this.leafMesh.count = placed;
        if (this.leafMesh.instanceColor) this.leafMesh.instanceColor.needsUpdate = true;
        this.scene.add(this.trunkMesh);
        this.scene.add(this.leafMesh);
    }

    /** A tree burnt down: the crown is gone, the trunk is charred (it still blocks the way). */
    /** «Gather»: a spawn-area tree is taken away whole. */
    removeTree(t) {
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

    burnTree(t) {
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
    createPedestal(x, z) {
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        const stone = new THREE.MeshLambertMaterial({ color: 0x6d6a75 });
        const stoneLight = new THREE.MeshLambertMaterial({ color: 0x8e8a99 });
        const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.9 });
        const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
        add(new THREE.CylinderGeometry(1.35, 1.6, 0.45, 8), stone, -0.25);
        add(new THREE.CylinderGeometry(1.05, 1.2, 0.3, 8), stoneLight, 0.12);
        add(new THREE.CylinderGeometry(0.55, 0.7, 1.4, 8), stoneLight, 0.97);
        add(new THREE.CylinderGeometry(0.95, 0.6, 0.3, 8), stone, 1.82);
        const rim = add(new THREE.TorusGeometry(0.95, 0.05, 6, 24), gold, 1.97);
        rim.rotation.x = Math.PI / 2;
        // magic: a glowing disc and a slowly turning rune ring above the top
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x9b7bff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), glowMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 1.99;
        g.add(disc);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.035, 6, 32), new THREE.MeshBasicMaterial({ color: 0x7fe7ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.position.y = 2.6;
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
        this.scene.add(g);
        const surfaceY = 1.97;
        this.collision.addBox({ minX: x - 1.4, maxX: x + 1.4, minY: -0.5, maxY: surfaceY, minZ: z - 1.4, maxZ: z + 1.4, kind: 'table' });
        this.pedestals = this.pedestals || [];
        this.pedestals.push({ ring, disc, t: Math.random() * 6 });
        return surfaceY;
    }

    /** Rune rings turn and breathe. */
    _animatePedestals(dt) {
        for (const p of this.pedestals || []) {
            p.t += dt;
            p.ring.rotation.z += dt * 0.8;
            p.ring.position.y = 2.6 + Math.sin(p.t * 1.6) * 0.08;
            p.disc.material.opacity = 0.35 + Math.sin(p.t * 2.2) * 0.12;
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
    explode(center, radius) {
        const out = { blocks: [], props: [], tables: [] };
        if (!this.destructible) return out;
        if (this.terrain) out.blocks = this.terrain.removeSphere(center.x, center.y, center.z, radius);

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

        // Trees: destroyed when the blast reaches the trunk.
        if (this.trunkMesh) {
            const dummy = new THREE.Object3D();
            let changed = false;
            for (const t of this.trees) {
                if (!t.alive) continue;
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
            // In flight the view opens up so the land below is visible
            const far = this.fogFar * (this.viewScale ?? 1) * (1 + viewBoost * 1.2) * (1 - 0.4 * (this.storm || 0));
            this.scene.fog.far = far;
            this.scene.fog.near = Math.min(this.fogNear + viewBoost * 40, far * 0.5);
            if (this.terrain) this.terrain.viewDistance = far + CHUNK_MARGIN;
        }
        if (this.sky && focus) this.sky.position.set(focus.x, focus.y, focus.z);
        if (this.sky) this.sky.update(1 / 60);
        if (this.terrain) this.terrain.update(focus);
    }

    /** Keep the sun's shadow box centred on the player. */
    followShadow(pos) {
        // Move in whole shadow-map texels so the shadow edges don't shimmer
        const texel = (SHADOW_EXTENT * 2) / this.dirLight.shadow.mapSize.width;
        const x = Math.round(pos.x / texel) * texel, z = Math.round(pos.z / texel) * texel;
        if (x === this._shadowX && z === this._shadowZ) return;
        this._shadowX = x; this._shadowZ = z;
        const s = this.sunDir;
        if (s) this.dirLight.position.set(x + s.x * 120, s.y * 120, z + s.z * 120);
        else this.dirLight.position.set(x + 50, 100, z + 50);
        this.dirLight.target.position.set(x, 0, z);
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
