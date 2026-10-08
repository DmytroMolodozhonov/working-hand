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

const CHUNK_MARGIN = 32; // load terrain one chunk beyond the fog
const SHADOW_EXTENT = 45; // m around the player that receive the sun's shadows
import { CollisionWorld } from './Collision.js';

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
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
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

        this.hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x4CAF50, 0.3);
        this.scene.add(this.hemiLight);
    }

    setNightMode(isNight) {
        if (isNight) {
            this.scene.background = new THREE.Color(0x050505);
            this.scene.fog = new THREE.Fog(0x000000, 10, 50);
            this.fogFar = 50;
            this.fogNear = 10;
            this.ambientLight.intensity = 0.15;
            this.dirLight.intensity = 0.15;
            this.hemiLight.intensity = 0.08;
        } else {
            this.scene.background = new THREE.Color(0x87CEEB);
            this.scene.fog = new THREE.Fog(0x87CEEB, 20, 80);
            this.fogFar = 80;
            this.fogNear = 20;
            this.ambientLight.intensity = 0.6;
            this.dirLight.intensity = 0.8;
            this.hemiLight.intensity = 0.3;
        }
    }

    createSkybox() {
        const sky = new THREE.Mesh(
            // Big enough for the long view in flight; it travels with the player
            new THREE.SphereGeometry(450, 32, 32),
            new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide, depthWrite: false }),
        );
        this.scene.add(sky);
        this.sky = sky;
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
        this.grass.castShadow = true;
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
        this.scene.add(this.grass);

        this.createTrees(rng);
    }

    createTrees(rng) {
        const count = 50;
        const trunkGeo = new THREE.BoxGeometry(2, 6, 2);
        const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const leafGeo = new THREE.BoxGeometry(6, 6, 6);
        const leafMat = new THREE.MeshLambertMaterial({ color: 0x228B22 });
        this.trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
        this.leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, count);
        this.trunkMesh.castShadow = true;
        this.leafMesh.castShadow = true;
        const dummy = new THREE.Object3D();
        let placed = 0, attempts = 0;
        while (placed < count && attempts < 2000) {
            attempts++;
            const x = (rng() - 0.5) * (this.terrainWidth - 10);
            const z = (rng() - 0.5) * (this.terrainDepth - 10);
            // Keep trees on flat ground (not inside mountains) and off the spawn tables.
            if (this.terrain && !this._flatAround(x, z, 1)) continue;
            if (Math.abs(x) < 11 && z > -9 && z < 1) continue;
            dummy.position.set(x, 2.5, z);
            dummy.updateMatrix();
            this.trunkMesh.setMatrixAt(placed, dummy.matrix);
            dummy.position.set(x, 8, z);
            dummy.updateMatrix();
            this.leafMesh.setMatrixAt(placed, dummy.matrix);
            const boxId = this.collision.addBox({ minX: x - 1, maxX: x + 1, minY: -0.5, maxY: 5.5, minZ: z - 1, maxZ: z + 1, kind: 'tree', noSupport: true });
            this.trees.push({ x, z, alive: true, index: placed, boxId });
            placed++;
        }
        this.trunkMesh.count = placed;
        this.leafMesh.count = placed;
        this.scene.add(this.trunkMesh);
        this.scene.add(this.leafMesh);
    }

    _flatAround(x, z, r) {
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
            if (this.terrain.topLayer(Math.round(x) + dx, Math.round(z) + dz) !== 0) return false;
        }
        return true;
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
        if (this.scene.fog && this.fogFar) {
            // In flight the view opens up so the land below is visible
            const far = this.fogFar * (1 + viewBoost * 1.2);
            this.scene.fog.far = far;
            this.scene.fog.near = Math.min(this.fogNear + viewBoost * 40, far * 0.5);
            if (this.terrain) this.terrain.viewDistance = far + CHUNK_MARGIN;
        }
        if (this.sky && focus) this.sky.position.set(focus.x, focus.y, focus.z);
        if (this.terrain) this.terrain.update(focus);
    }

    /** Keep the sun's shadow box centred on the player. */
    followShadow(pos) {
        // Move in whole shadow-map texels so the shadow edges don't shimmer
        const texel = (SHADOW_EXTENT * 2) / this.dirLight.shadow.mapSize.width;
        const x = Math.round(pos.x / texel) * texel, z = Math.round(pos.z / texel) * texel;
        if (x === this._shadowX && z === this._shadowZ) return;
        this._shadowX = x; this._shadowZ = z;
        this.dirLight.position.set(x + 50, 100, z + 50);
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
