/**
 * DetailedHand.js
 * Ported from "Рабочая рука" (HandScene.tsx)
 * Uses InstancedMesh to render a voxel-based hand from raw MediaPipe landmarks.
 */

class DetailedHand {
    constructor(scene, side = 'right') {
        this.scene = scene;
        this.side = side;
        this.group = new THREE.Group();

        // Constants from HandScene.tsx
        this.VOXEL_SIZE = 0.02;
        this.MAX_INSTANCES = 1500; // Increased buffer
        this.VOXEL_DENSITY = side === 'right' ? 1.5 : 1.5; // Base
        this.HAND_PHYSICAL_SIZE = 2.5;
        this.DEPTH_SENSITIVITY = 8.0;

        // PERSISTENCE STATE
        this.lastLandmarks = null;

        // SMOOTHING STATE (Moving Average)
        this.landmarkHistory = [];
        this.HISTORY_LENGTH = 5; // Average over last 5 frames

        // Voxel Color (Cyan/Blue style from new code)
        // Adjust for Left/Right differentiation if needed, or keep uniform
        this.voxelColor = side === 'right' ? 0x00efff : 0xff00ef;

        // Setup InstancedMesh
        const geometry = new THREE.BoxGeometry(this.VOXEL_SIZE, this.VOXEL_SIZE, this.VOXEL_SIZE);
        const material = new THREE.MeshStandardMaterial({
            color: this.voxelColor,
            roughness: 0.2,
            metalness: 0.8,
            emissive: 0x0044aa,
            emissiveIntensity: 0.2
        });

        this.mesh = new THREE.InstancedMesh(geometry, material, this.MAX_INSTANCES);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.count = 0; // Start invisible
        this.group.add(this.mesh);

        // Dummy for Matrix calculations
        this.dummy = new THREE.Object3D();

        // Skeleton Connections (Indices)
        this.CONNECTIONS = [
            [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
            [0, 5], [5, 6], [6, 7], [7, 8], // Index
            [0, 9], [9, 10], [10, 11], [11, 12], // Middle
            [0, 13], [13, 14], [14, 15], [15, 16], // Ring
            [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
            [5, 9], [9, 13], [13, 17], [0, 17] // Palm Base (Added loop)
        ];
        // ROTATION OFFSET (User Loop Correction)
        // User says ~30 degrees. Axis depends on "clock/counter-clock".
        // Let's assume Z-axis roll.
        // ROTATION OFFSET (User Loop Correction)
        // User requesting +30 deg MORE CCW. Previous logic might have been -30 (CW).
        // Let's set a base offset of 60 degrees (approx 1.05 rad).
        // And ensure Left Hand applies it positively (CCW).
        this.rotationOffset = 60 * (Math.PI / 180);

        this.quality = 'high'; // 'high' or 'low'
    }

    setQuality(mode) {
        this.quality = mode;
        this.VOXEL_DENSITY = mode === 'high' ? 1.5 : 0.8;
        console.log(`DetailedHand quality set to: ${mode} (Density: ${this.VOXEL_DENSITY})`);
    }

    /**
     * Convert raw MediaPipe landmark to Local 3D position
     */
    getWorldPosition(l, wrist, scaleFactor) {
        // 1. Center relative to wrist
        const relX = l.x - wrist.x;
        const relY = l.y - wrist.y;
        const relZ = l.z; // MediaPipe Z

        // 2. Normalization
        const normX = relX * scaleFactor * this.HAND_PHYSICAL_SIZE;
        const normY = relY * scaleFactor * this.HAND_PHYSICAL_SIZE;
        const normZ = relZ * scaleFactor * this.HAND_PHYSICAL_SIZE;

        // 3. Map to Three.js coords (Negate to match orientation)
        const v = new THREE.Vector3(-normX, -normY, -normZ);


        // 4. PRE-APPLY ROTATION OFFSET (Fix Twist)
        // Rotate around Z axis (Roll)
        // User reported Right Hand was also "missing 30 deg CCW".
        // So we apply Positive (CCW) rotation to BOTH hands.
        // It seems the "Zero" pose for both hands requires a CCW twist to potential align with the arm.
        const rot = this.rotationOffset;
        v.applyAxisAngle(new THREE.Vector3(0, 0, 1), rot);

        return v;
    }

    placeVoxel(x, y, z, instanceIdx) {
        if (instanceIdx >= this.MAX_INSTANCES) return instanceIdx;

        this.dummy.position.set(x, y, z);
        // Optimization: Skip identity scale/rotation updates if possible, 
        // but InstancedMesh requires full matrix. 
        // We can use a pre-computed identity quaternion to speed up updateMatrix.
        if (!this.identityQuat) this.identityQuat = new THREE.Quaternion();
        this.dummy.matrix.compose(this.dummy.position, this.identityQuat, new THREE.Vector3(1, 1, 1));

        this.mesh.setMatrixAt(instanceIdx, this.dummy.matrix);
        return instanceIdx + 1;
    }

    fillTriangle(p1, p2, p3, instanceIdx) {
        if (this.quality === 'low') return instanceIdx; // Skip palm filling in low quality

        const density = 6;
        let idx = instanceIdx;

        for (let i = 0; i <= density; i++) {
            const t = i / density;
            const edge1 = new THREE.Vector3().lerpVectors(p1, p2, t);
            const edge2 = new THREE.Vector3().lerpVectors(p1, p3, t);

            const dist = edge1.distanceTo(edge2);
            const innerSteps = Math.ceil(dist / (this.VOXEL_SIZE / 1.5));

            for (let j = 0; j <= innerSteps; j++) {
                const k = j / (innerSteps || 1);
                // Basic lerp
                const vx = THREE.MathUtils.lerp(edge1.x, edge2.x, k);
                const vy = THREE.MathUtils.lerp(edge1.y, edge2.y, k);
                const vz = THREE.MathUtils.lerp(edge1.z, edge2.z, k);

                idx = this.placeVoxel(vx, vy, vz, idx);
            }
        }
        return idx;
    }

    update(landmarks) {
        // PERSISTENCE LOGIC (Fix flickering)
        // PERSISTENCE LOGIC (Fix flickering)
        try {
            if (!landmarks || landmarks.length < 21) {
                if (this.lastLandmarks) {
                    landmarks = this.lastLandmarks; // Use last known
                } else {
                    // Create Default "Open Palm" Pose if never tracked
                    landmarks = this.createDefaultPose();
                    this.lastLandmarks = landmarks;
                }
            } else {
                this.lastLandmarks = landmarks;
            }

            const wrist = landmarks[0];
            const middleMCP = landmarks[9];

            // --- STABLE SCALE LOGIC ---
            // Distance wrist to middle finger knuckle
            const dx = wrist.x - middleMCP.x;
            const dy = wrist.y - middleMCP.y;

            const currentApparentSize = Math.sqrt(dx * dx + dy * dy);

            // CONSTANT HAND SIZE (approx 15cm)
            const TARGET_SIZE = 0.15;
            const scaleFactor = TARGET_SIZE / Math.max(currentApparentSize, 0.001);

            // Calculate vectors relative to wrist
            // Calculate vectors relative to wrist
            const targetVectors = landmarks.map(l => {
                return this.getWorldPosition(l, wrist, scaleFactor);
            });

            // Initialize currentVectors if first run
            if (!this.currentVectors) {
                this.currentVectors = targetVectors.map(v => v.clone());
            }

            // SMOOTHING (Lerp)
            const lerpFactor = 0.3; // Adjust for speed vs smoothness
            this.currentVectors.forEach((v, i) => {
                v.lerp(targetVectors[i], lerpFactor);
            });

            let idx = 0;

            // 1. Fill Fingers
            this.CONNECTIONS.forEach(([start, end]) => {
                const vStart = this.currentVectors[start];
                const vEnd = this.currentVectors[end];
                const dist = vStart.distanceTo(vEnd);
                const steps = Math.ceil(dist / (this.VOXEL_SIZE / this.VOXEL_DENSITY));

                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    const vx = THREE.MathUtils.lerp(vStart.x, vEnd.x, t);
                    const vy = THREE.MathUtils.lerp(vStart.y, vEnd.y, t);
                    const vz = THREE.MathUtils.lerp(vStart.z, vEnd.z, t);

                    idx = this.placeVoxel(vx, vy, vz, idx);
                }
            });

            // 2. Fill Palm (Triangles)
            idx = this.fillTriangle(this.currentVectors[0], this.currentVectors[5], this.currentVectors[17], idx);
            idx = this.fillTriangle(this.currentVectors[5], this.currentVectors[9], this.currentVectors[17], idx);
            idx = this.fillTriangle(this.currentVectors[9], this.currentVectors[13], this.currentVectors[17], idx);

            this.mesh.count = idx;
            this.mesh.instanceMatrix.needsUpdate = true;
        } catch (e) {
            console.warn("DetailedHand update error:", e);
        }
    }

    createDefaultPose() {
        // Generate a flat open palm relative to wrist (0,0,0)
        // MediaPipe coords: 0.5 is center.
        const base = [];
        for (let i = 0; i < 21; i++) {
            base.push({ x: 0, y: 0, z: 0 });
        }
        // Just return zeros, it will render a clump at the wrist but won't crash/disappear
        // Better: Small spread to see "something"
        // TODO: Proper coords if needed, but "clump" is better than invisible/crash
        return base;
    }
    getCollisionBoxes() {
        const boxes = [];
        if (!this.group.visible || !this.currentVectors) return boxes;

        // For detailed hand, we treat each landmark as a collision point
        this.currentVectors.forEach((v, i) => {
            const worldPos = v.clone();
            this.mesh.localToWorld(worldPos);

            // Size 0.15 makes landmarks overlap slightly for a solid feel
            const size = 0.15;
            const box = new THREE.Box3().setFromCenterAndSize(worldPos, new THREE.Vector3(size, size, size));
            boxes.push({ box, type: 'landmark', index: i });
        });

        return boxes;
    }
}

// Global Export
if (typeof window !== 'undefined') {
    window.DetailedHand = DetailedHand;
}
