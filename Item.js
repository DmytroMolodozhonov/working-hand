class Item {
    constructor(scene, type, position) {
        this.scene = scene;
        this.type = type;
        this.isPickedUp = false;
        this.isStatic = false;

        this.mesh = new THREE.Group();
        this.mesh.position.copy(position);

        // Physics
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.gravity = -12.0; // Stronger gravity for snappy feel

        // Grab Transition properties
        this.grabState = 'free'; // 'free', 'transition', 'grabbed'
        this.grabStartTime = 0;
        this.grabDuration = 250;
        this.grabStartWorldPos = new THREE.Vector3();
        this.grabStartWorldQuat = new THREE.Quaternion();
        this.gripOffsetT = 0.5;
        this.grabTargetSide = 'right';
        this.grabTargetHand = null;
        this.grabTargetAnchor = null;

        this.createModel();
        this.scene.add(this.mesh);
    }

    createModel() {
        if (this.type === 'axe') {
            this.createAxe();
        } else if (this.type === 'sword') {
            this.createSword();
        }
    }

    createAxe() {
        const handleGeo = new THREE.BoxGeometry(0.1, 0.8, 0.1);
        const handleMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const handle = new THREE.Mesh(handleGeo, handleMat);
        handle.position.y = 0.4;
        handle.userData.pPart = 'handle'; // Mark it
        this.mesh.add(handle);

        const headGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
        const headMat = new THREE.MeshLambertMaterial({ color: 0x808080 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 0.7;
        head.position.x = 0.15;
        this.mesh.add(head);

        const edgeGeo = new THREE.BoxGeometry(0.1, 0.25, 0.105);
        const edgeMat = new THREE.MeshLambertMaterial({ color: 0xC0C0C0 });
        const edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.position.y = 0.7;
        edge.position.x = 0.35;
        this.mesh.add(edge);
    }

    createSword() {
        const handleGeo = new THREE.BoxGeometry(0.06, 0.25, 0.06);
        const handleMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const handle = new THREE.Mesh(handleGeo, handleMat);
        handle.position.set(0, 0.125, 0);
        handle.userData.pPart = 'handle';
        this.mesh.add(handle);

        const guardGeo = new THREE.BoxGeometry(0.3, 0.05, 0.1);
        const guardMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
        const guard = new THREE.Mesh(guardGeo, guardMat);
        guard.position.set(0, 0.275, 0);
        this.mesh.add(guard);

        const bladeGeo = new THREE.BoxGeometry(0.12, 0.8, 0.05);
        const bladeMat = new THREE.MeshLambertMaterial({ color: 0xE0E0E0 });
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.position.y = 0.7;
        this.mesh.add(blade);
    }

    update(deltaTime, floors = []) {
        if (this.grabState === 'transition') {
            const progress = Math.min(1, (performance.now() - this.grabStartTime) / this.grabDuration);
            
            // Calculate target position and rotation in world space
            // Weapon local position is offset along the correct axis depending on whether it is attached to the palm or wrist
            const isPalm = this.grabTargetAnchor.name === 'palm' || 
                           (window.character && (this.grabTargetAnchor === window.character.leftSimplifiedHand?.palm || 
                                                this.grabTargetAnchor === window.character.rightSimplifiedHand?.palm));
            
            const handleLength = this.type === 'axe' ? 3.2 : 1.0;
            let localPos, localRot;
            
            if (isPalm) {
                const rotX = -Math.PI * 0.35; // 63 degrees up-forward angle
                const rotY = (this.grabTargetSide === 'left' ? -1 : 1) * Math.PI / 4;
                localPos = new THREE.Vector3(
                    0, 
                    -this.gripOffsetT * handleLength * Math.cos(rotX), 
                    -this.gripOffsetT * handleLength * Math.sin(rotX)
                );
                localRot = new THREE.Euler(rotX, rotY, 0, 'YXZ');
            } else {
                localPos = new THREE.Vector3(0, 0, -this.gripOffsetT * handleLength);
                localRot = new THREE.Euler(Math.PI / 2, 0, (this.grabTargetSide === 'left' ? -1 : 1) * Math.PI / 4);
            }
            const localQuat = new THREE.Quaternion().setFromEuler(localRot);

            // Compute target anchor's world matrix
            this.grabTargetAnchor.updateMatrixWorld(true);
            
            const targetWorldPos = localPos.clone().applyMatrix4(this.grabTargetAnchor.matrixWorld);
            
            const anchorWorldQuat = new THREE.Quaternion();
            this.grabTargetAnchor.getWorldQuaternion(anchorWorldQuat);
            const targetWorldQuat = localQuat.clone().premultiply(anchorWorldQuat);

            // Lerp/Slerp
            this.mesh.position.lerpVectors(this.grabStartWorldPos, targetWorldPos, progress);
            this.mesh.quaternion.slerpQuaternions(this.grabStartWorldQuat, targetWorldQuat, progress);

            if (progress >= 1.0) {
                // Finalize grab
                window.character.equip(this, this.grabTargetSide, this.gripOffsetT);
            }
            return;
        }

        if (this.isPickedUp || this.grabState === 'grabbed') {
            this.velocity.set(0, 0, 0);
            return;
        }

        if (!this.isStatic) {
            // Apply Gravity
            this.velocity.y += this.gravity * deltaTime;

            const nextY = this.mesh.position.y + this.velocity.y * deltaTime;
            const nextX = this.mesh.position.x + this.velocity.x * deltaTime;
            const nextZ = this.mesh.position.z + this.velocity.z * deltaTime;

            // FLOOR DETECTION (Ground + Tables)
            let groundLevel = 0.1;

            const floorPos = new THREE.Vector3();
            for (const floor of floors) {
                if (!floor.userData || !floor.userData.isWall) continue;

                floor.getWorldPosition(floorPos);
                const halfX = (floor.userData.sizeX || floor.userData.size || 5) / 2;
                const halfZ = (floor.userData.sizeZ || floor.userData.size || 5) / 2;

                const dx = Math.abs(nextX - floorPos.x);
                const dz = Math.abs(nextZ - floorPos.z);

                if (dx < halfX + 0.4 && dz < halfZ + 0.4) {
                    const surfaceY = floorPos.y + 0.3;
                    if (this.mesh.position.y >= surfaceY - 0.6) {
                        groundLevel = Math.max(groundLevel, surfaceY);
                    }
                }
            }

            if (nextY < groundLevel) {
                this.mesh.position.y = groundLevel;
                this.velocity.y = 0;
                this.velocity.x *= 0.6;
                this.velocity.z *= 0.6;
                if (Math.abs(this.velocity.x) < 0.1 && Math.abs(this.velocity.z) < 0.1) {
                    this.velocity.set(0, 0, 0);
                    this.isStatic = true;
                }
            } else {
                this.mesh.position.y = nextY;
                this.mesh.position.x = nextX;
                this.mesh.position.z = nextZ;
            }

            this.velocity.x *= 0.92;
            this.velocity.z *= 0.92;
        }
    }

    applyPush(pPos, power) {
        // Push away from point of contact (pPos)
        const dir = new THREE.Vector3().subVectors(this.mesh.position, pPos).normalize();
        dir.y = 0.1; // Minimal upwards pop
        // Power multiplier reduced for "heavy" feel
        this.velocity.add(dir.multiplyScalar(power * 1.5));
        this.isStatic = false; // "Wakes up" if hit
    }

    onPickup() {
        this.isPickedUp = true;
        this.grabState = 'grabbed';
        this.velocity.set(0, 0, 0);
    }

    startGrabTransition(hand, anchor, side, t) {
        this.grabState = 'transition';
        this.grabTargetHand = hand;
        this.grabTargetAnchor = anchor;
        this.grabTargetSide = side;
        this.gripOffsetT = t;
        this.grabStartTime = performance.now();
        
        this.grabStartWorldPos.copy(this.mesh.position);
        this.grabStartWorldQuat.copy(this.mesh.quaternion);
        
        this.isStatic = false;
        this.isPickedUp = false;
    }

    /**
     * Define the item as a collection of segments (capsules) for perfect collision.
     * Handle: Base to Guard
     * Blade: Guard to Tip
     */
    getSegments() {
        if (this.isPickedUp) return [];

        const segments = [];
        this.mesh.updateMatrixWorld(true);

        if (this.type === 'sword' || this.type === 'axe') {
            // Precise local positions (matching world scale 4x)
            // Handle Segment
            const hStart = new THREE.Vector3(0, 0, 0);
            const hEnd = new THREE.Vector3(0, 0.25, 0);

            // Blade Segment
            const bStart = new THREE.Vector3(0, 0.3, 0);
            const bEnd = new THREE.Vector3(0, 1.1, 0);

            // Transform to World
            this.mesh.localToWorld(hStart);
            this.mesh.localToWorld(hEnd);
            this.mesh.localToWorld(bStart);
            this.mesh.localToWorld(bEnd);

            segments.push({ start: hStart, end: hEnd, radius: 0.1, part: 'handle' });
            segments.push({ start: bStart, end: bEnd, radius: 0.15, part: 'blade' });
        } else {
            const center = new THREE.Vector3(0, 0, 0);
            this.mesh.localToWorld(center);
            segments.push({ start: center, end: center, radius: 0.4, part: 'body' });
        }
        return segments;
    }

    getCollisionBoxes() {
        // Return 1 point per segment to keep main.js detection loop running
        const points = [];
        const segs = this.getSegments();
        segs.forEach(s => {
            const mid = s.start.clone().lerp(s.end, 0.5);
            const box = new THREE.Box3().setFromCenterAndSize(mid, new THREE.Vector3(s.radius * 2, s.radius * 2, s.radius * 2));
            points.push({ box, object: { userData: { pPart: s.part } }, parentItem: this });
        });
        return points;
    }
}

if (typeof window !== 'undefined') {
    window.Item = Item;
}
