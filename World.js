/**
 * World.js - 3D Voxel World with Green Terrain
 */

class VoxelWorld {
    constructor(scene) {
        this.scene = scene;
        this.voxelSize = 1;
        this.terrainWidth = 240; // 30 * 8
        this.terrainDepth = 240; // 30 * 8

        this.createTerrain();
        this.createLights(); // Fixed name
        this.createSkybox();

        // Texture Loading
        this.textureLoader = new THREE.TextureLoader();
        this.floorTexture = this.textureLoader.load('assets/textures/floor.png');
        this.wallTexture = this.textureLoader.load('assets/textures/wall.png');

        // Setup Tiling
        this.floorTexture.wrapS = this.floorTexture.wrapT = THREE.RepeatWrapping;
        this.wallTexture.wrapS = this.wallTexture.wrapT = THREE.RepeatWrapping;
    }

    createTerrain() {
        // Green voxel terrain
        const geometry = new THREE.BoxGeometry(this.voxelSize, this.voxelSize, this.voxelSize);

        // Different shades of green for variety
        const colors = [
            0x4CAF50, // Green
            0x66BB6A, // Light green
            0x43A047, // Dark green
            0x81C784, // Pale green
            0x388E3C  // Forest green
        ];

        // OPTIMIZATION: Large ground plane instead of thousands of individual voxels
        const groundGeo = new THREE.PlaneGeometry(this.terrainWidth, this.terrainDepth);
        const groundMat = new THREE.MeshPhongMaterial({ color: 0x4CAF50 }); // Changed to Phong
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.5;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // OPTIMIZATION: Use InstancedMesh for 1000 grass blocks
        const grassCount = 1000;
        const grassMat = new THREE.MeshPhongMaterial({ color: 0x4CAF50 }); // Changed to Phong
        const grassMesh = new THREE.InstancedMesh(geometry, grassMat, grassCount);
        grassMesh.receiveShadow = true;
        grassMesh.castShadow = true;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < grassCount; i++) {
            const x = (Math.random() - 0.5) * this.terrainWidth;
            const z = (Math.random() - 0.5) * this.terrainDepth;
            const colorIndex = Math.floor(Math.random() * colors.length);

            dummy.position.set(Math.floor(x), 0.5, Math.floor(z)); // y=0.5 for 1x1x1 box on ground
            dummy.updateMatrix();
            grassMesh.setMatrixAt(i, dummy.matrix);
            grassMesh.setColorAt(i, new THREE.Color(colors[colorIndex]));
        }
        this.scene.add(grassMesh);

        // Add some decorative blocks (trees)
        this.createTrees();
    }

    createTrees() {
        this.trees = []; // Store positions for minimap

        // Trees 2x bigger
        const trunkGeometry = new THREE.BoxGeometry(2, 6, 2);
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });

        const leafGeometry = new THREE.BoxGeometry(6, 6, 6);
        const leafMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });

        // Generate 50 random trees across the map
        for (let i = 0; i < 50; i++) {
            const x = (Math.random() - 0.5) * (this.terrainWidth - 10);
            const z = (Math.random() - 0.5) * (this.terrainDepth - 10);

            // Store for minimap
            this.trees.push({ x, z });

            // Trunk (2x bigger)
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.set(x, 2.5, z); // Fixed: Lowered from 3.5 to 2.5 to touch ground (-0.5)
            trunk.castShadow = true;
            this.scene.add(trunk);

            // Leaves (2x bigger)
            const leaves = new THREE.Mesh(leafGeometry, leafMaterial);
            leaves.position.set(x, 8, z); // Lowered from 9
            leaves.castShadow = true;
            this.scene.add(leaves);
        }
    }

    createLights() {
        // Store lights to toggle them
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.dirLight.position.set(50, 100, 50);
        this.dirLight.castShadow = true;

        // Shadow properties
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 500;
        // Enable Layer 1 for shadows (to cast shadow from invisible FPV body)
        this.dirLight.shadow.camera.layers.enable(1);
        this.dirLight.shadow.camera.left = -100;
        this.dirLight.shadow.camera.right = 100;
        this.dirLight.shadow.camera.top = 100;
        this.dirLight.shadow.camera.bottom = -100;

        this.scene.add(this.dirLight);

        // Hemisphere light for sky/ground color blend
        this.hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x4CAF50, 0.3);
        this.scene.add(this.hemiLight);
    }

    setNightMode(isNight) {
        if (isNight) {
            this.scene.background = new THREE.Color(0x050505);
            this.scene.fog = new THREE.Fog(0x000000, 10, 50); // Relaxed dark fog (was 5, 25)
            this.ambientLight.intensity = 0.15; // Slightly up from 0.1
            this.dirLight.intensity = 0.15; // Slightly up from 0.1
            this.hemiLight.intensity = 0.08; // Slightly up from 0.05
        } else {
            this.scene.background = new THREE.Color(0x87CEEB);
            this.scene.fog = new THREE.Fog(0x87CEEB, 20, 80);
            this.ambientLight.intensity = 0.6;
            this.dirLight.intensity = 0.8;
            this.hemiLight.intensity = 0.3;
        }
    }

    createSkybox() {
        // Gradient sky using a large sphere
        const skyGeometry = new THREE.SphereGeometry(100, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x87CEEB,
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);
    }

    /**
     * Clear existing terrain (for custom maps)
     */
    clearTerrain() {
        // Remove all meshes from scene except lights and camera
        const toRemove = [];
        this.scene.traverse((obj) => {
            if (obj.isMesh) {
                toRemove.push(obj);
            }
        });
        toRemove.forEach(obj => this.scene.remove(obj));
    }

    /**
     * Load world from map editor data (for custom maps - simple floor only)
     * @param {Object} mapData - Data from MapEditor
     * @returns {Object} - Spawn, win, zombies, chests, and walls for collision
     */
    loadFromMap(mapData) {
        // First clear the default terrain
        this.clearTerrain();

        const cellSize = 5; // 2.5x bigger (was 2m)
        const wallHeight = 8; // 4x bigger (was 2m)

        const result = {
            playerSpawn: null,
            winPoint: null,
            zombieSpawns: [],
            chests: [],
            walls: [] // For collision detection
        };

        // Calculate map bounds for floor
        let minX = 0, maxX = 20, minZ = 0, maxZ = 20;
        if (mapData.walls && mapData.walls.length > 0) {
            minX = Math.min(...mapData.walls.map(w => w.x)) - 2;
            maxX = Math.max(...mapData.walls.map(w => w.x)) + 3;
            minZ = Math.min(...mapData.walls.map(w => w.z)) - 2;
            maxZ = Math.max(...mapData.walls.map(w => w.z)) + 3;
        }

        // Simple dark floor with texture
        const floorWidth = (maxX - minX) * cellSize + 100;
        const floorDepth = (maxZ - minZ) * cellSize + 100;

        // Clone texture for specific tiling if needed, but for floor we can just set it
        this.floorTexture.repeat.set(floorWidth / cellSize, floorDepth / cellSize);

        const floorGeo = new THREE.PlaneGeometry(floorWidth, floorDepth);
        const floorMat = new THREE.MeshPhongMaterial({
            map: this.floorTexture,
            color: 0xcccccc // Lighter tint to see texture
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set((maxX + minX) / 2 * cellSize, 0, (maxZ + minZ) / 2 * cellSize);
        floor.receiveShadow = true;
        this.scene.add(floor);

        // Create walls (Instanced for performance)
        if (mapData.walls && mapData.walls.length > 0) {
            const wallGeo = new THREE.BoxGeometry(cellSize, wallHeight, cellSize);
            // Wall texture repeat 
            this.wallTexture.repeat.set(1, wallHeight / cellSize); // Tile vertically
            const wallMat = new THREE.MeshPhongMaterial({
                map: this.wallTexture,
                color: 0xcccccc
            });
            const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, mapData.walls.length);
            wallMesh.castShadow = true;
            wallMesh.receiveShadow = true;
            wallMesh.userData.isWall = true;

            const dummy = new THREE.Object3D();
            mapData.walls.forEach((w, i) => {
                const posX = w.x * cellSize;
                const posZ = w.z * cellSize;
                dummy.position.set(posX, wallHeight / 2, posZ);
                dummy.updateMatrix();
                wallMesh.setMatrixAt(i, dummy.matrix);

                // Store for collision
                result.walls.push({
                    x: posX,
                    z: posZ,
                    size: cellSize,
                    height: wallHeight
                });
            });
            this.scene.add(wallMesh);
        }

        // Player spawn
        if (mapData.playerSpawn) {
            result.playerSpawn = new THREE.Vector3(
                mapData.playerSpawn.x * cellSize,
                1.5,
                mapData.playerSpawn.z * cellSize
            );
        }

        // Win point (bigger platform)
        if (mapData.winPoint) {
            const winGeo = new THREE.BoxGeometry(cellSize * 0.9, 0.3, cellSize * 0.9);
            const winMat = new THREE.MeshBasicMaterial({ color: 0xFFD700 });
            const winMesh = new THREE.Mesh(winGeo, winMat);
            winMesh.position.set(
                mapData.winPoint.x * cellSize,
                0.15,
                mapData.winPoint.z * cellSize
            );
            this.scene.add(winMesh);

            result.winPoint = new THREE.Vector3(
                mapData.winPoint.x * cellSize,
                0,
                mapData.winPoint.z * cellSize
            );
        }

        // Zombie spawns (support multiple per cell via count property)
        if (mapData.zombieSpawns) {
            mapData.zombieSpawns.forEach(s => {
                const count = s.count || 1;
                for (let i = 0; i < count; i++) {
                    // Slight offset for multiple zombies in same cell
                    const offset = i * 0.5;
                    result.zombieSpawns.push(new THREE.Vector3(
                        s.x * cellSize + offset,
                        0.5,
                        s.z * cellSize + offset
                    ));
                }
            });
        }

        // Chests (bigger positions)
        if (mapData.chests) {
            mapData.chests.forEach(c => {
                result.chests.push({
                    position: new THREE.Vector3(c.x * cellSize, 0, c.z * cellSize),
                    item: c.item
                });
            });
        }

        return result;
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.VoxelWorld = VoxelWorld;
}
