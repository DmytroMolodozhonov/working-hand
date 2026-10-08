/**
 * Character.js - LookAt-based arm tracking (from user's working code)
 * Arms oriented along Z axis, use lookAt for direction
 */

class VoxelCharacter {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();

        this.head = null;
        this.body = null;

        // Arm anchors (like user's rightArmAnchor, leftArmAnchor)
        this.leftArmAnchor = new THREE.Group();
        this.leftElbowAnchor = new THREE.Group();
        this.rightArmAnchor = new THREE.Group();
        this.rightElbowAnchor = new THREE.Group();

        this.leftLegPivot = new THREE.Group();
        this.rightLegPivot = new THREE.Group();

        this.skinColor = 0xFFDBB4;
        this.shirtColor = 0x3498db;
        this.pantsColor = 0x2c3e50;
        this.hairColor = 0x4a3728;

        this.runCycle = 0;
        this.isRunning = false;
        this.baseY = 1.5;

        // Bone lengths (from user's code)
        this.BONE_LENGTH_UPPER = 1.0;
        this.BONE_LENGTH_LOWER = 0.9;

        this.createCharacter();
        this.scene.add(this.group);
        this.group.position.set(0, this.baseY, 0);
    }

    createCharacter() {
        // Torso group (like user's torsoRef)
        const torso = new THREE.Group();
        torso.position.y = 0.75;
        this.group.add(torso);

        // Head
        const headGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        const headMat = new THREE.MeshLambertMaterial({ color: this.skinColor });
        this.head = new THREE.Mesh(headGeo, headMat);
        this.head.position.y = 1.35;
        this.head.castShadow = true;
        torso.add(this.head);

        // Hair
        const hairGeo = new THREE.BoxGeometry(1.3, 0.4, 1.3);
        const hairMat = new THREE.MeshLambertMaterial({ color: this.hairColor });
        const hair = new THREE.Mesh(hairGeo, hairMat);
        hair.position.y = 0.5;
        this.head.add(hair);

        // Eyes
        const eyeGeo = new THREE.BoxGeometry(0.2, 0.2, 0.1);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.25, 0.1, -0.6);
        this.head.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.25, 0.1, -0.6);
        this.head.add(rightEye);

        // Body
        const bodyGeo = new THREE.BoxGeometry(1.2, 1.5, 0.8);
        const bodyMat = new THREE.MeshLambertMaterial({ color: this.shirtColor });
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.position.y = 0;
        this.body.castShadow = true;
        torso.add(this.body);

        // ARM SETUP - like user's code, arms along Z axis
        const upperArmGeo = new THREE.BoxGeometry(0.4, 0.4, this.BONE_LENGTH_UPPER);
        const armMat = new THREE.MeshLambertMaterial({ color: this.shirtColor });
        const forearmGeo = new THREE.BoxGeometry(0.35, 0.35, this.BONE_LENGTH_LOWER);
        const skinMat = new THREE.MeshLambertMaterial({ color: this.skinColor });

        // LEFT ARM - anchor at shoulder
        this.leftArmAnchor.position.set(-0.7, 0.5, 0);
        torso.add(this.leftArmAnchor);

        // Upper arm mesh offset in Z (like user's code)
        const leftUpperArm = new THREE.Mesh(upperArmGeo, armMat);
        leftUpperArm.position.set(0, 0, this.BONE_LENGTH_UPPER / 2);
        leftUpperArm.castShadow = true;
        this.leftArmAnchor.add(leftUpperArm);

        // Elbow anchor at end of upper arm
        this.leftElbowAnchor.position.set(0, 0, this.BONE_LENGTH_UPPER);
        this.leftArmAnchor.add(this.leftElbowAnchor);

        // Forearm mesh
        const leftForearm = new THREE.Mesh(forearmGeo, skinMat);
        leftForearm.position.set(0, 0, this.BONE_LENGTH_LOWER / 2);
        leftForearm.castShadow = true;
        this.leftElbowAnchor.add(leftForearm);

        // RIGHT ARM
        this.rightArmAnchor.position.set(0.7, 0.5, 0);
        torso.add(this.rightArmAnchor);

        const rightUpperArm = new THREE.Mesh(upperArmGeo, armMat);
        rightUpperArm.position.set(0, 0, this.BONE_LENGTH_UPPER / 2);
        rightUpperArm.castShadow = true;
        this.rightArmAnchor.add(rightUpperArm);

        this.rightElbowAnchor.position.set(0, 0, this.BONE_LENGTH_UPPER);
        this.rightArmAnchor.add(this.rightElbowAnchor);

        const rightForearm = new THREE.Mesh(forearmGeo, skinMat);
        rightForearm.position.set(0, 0, this.BONE_LENGTH_LOWER / 2);
        rightForearm.castShadow = true;
        this.rightElbowAnchor.add(rightForearm);

        // Legs
        const legGeo = new THREE.BoxGeometry(0.5, 1.2, 0.5);
        const legMat = new THREE.MeshLambertMaterial({ color: this.pantsColor });
        this.leftLegPivot.position.set(-0.3, -0.75, 0);
        this.group.add(this.leftLegPivot);
        const leftLeg = new THREE.Mesh(legGeo, legMat);
        leftLeg.position.y = -0.6;
        this.leftLegPivot.add(leftLeg);
        this.rightLegPivot.position.set(0.3, -0.75, 0);
        this.group.add(this.rightLegPivot);
        const rightLeg = new THREE.Mesh(legGeo, legMat);
        rightLeg.position.y = -0.6;
        this.rightLegPivot.add(rightLeg);

        // ITEM ANCHORS (Hand positions at end of forearms)
        this.leftHandAnchor = new THREE.Group();
        this.leftHandAnchor.position.set(0, 0, this.BONE_LENGTH_LOWER);
        this.leftElbowAnchor.add(this.leftHandAnchor);

        this.rightHandAnchor = new THREE.Group();
        this.rightHandAnchor.position.set(0, 0, this.BONE_LENGTH_LOWER);
        this.rightElbowAnchor.add(this.rightHandAnchor);

        // DETAILED HANDS (New Voxel Implementation)
        // V2: DetailedHand - tracks exact MediaPipe landmarks
        // V3: SimplifiedHand - stable voxel hand with finger curl/rotation

        this.handVersion = 'v3'; // Default to V3 (stable)

        // Initialize V2 (DetailedHand)
        if (typeof DetailedHand !== 'undefined') {
            console.log("Initializing Detailed Hands V2 (Voxel-Based)...");

            this.leftDetailedHand = new DetailedHand(this.scene, 'left');
            this.leftDetailedHand.group.position.set(0, 0, this.BONE_LENGTH_LOWER);
            this.leftDetailedHand.group.scale.set(-1, 1, 1);
            this.leftDetailedHand.group.visible = false; // Hidden by default (V3 is default)
            this.leftElbowAnchor.add(this.leftDetailedHand.group);

            this.rightDetailedHand = new DetailedHand(this.scene, 'right');
            this.rightDetailedHand.group.position.set(0, 0, this.BONE_LENGTH_LOWER);
            this.rightDetailedHand.group.scale.set(-1, 1, 1);
            this.rightDetailedHand.group.visible = false;
            this.rightElbowAnchor.add(this.rightDetailedHand.group);
        } else {
            console.warn("DetailedHand (V2) class not defined!");
        }

        // Initialize V3 (SimplifiedHand)
        if (typeof SimplifiedHand !== 'undefined') {
            console.log("Initializing Simplified Hands V3 (Stable Voxel)...");

            this.leftSimplifiedHand = new SimplifiedHand(this.scene, 'left');
            this.leftSimplifiedHand.group.position.set(0, 0, this.BONE_LENGTH_LOWER);
            this.leftSimplifiedHand.group.visible = false; // Will be shown when hands enabled
            this.leftElbowAnchor.add(this.leftSimplifiedHand.group);

            this.rightSimplifiedHand = new SimplifiedHand(this.scene, 'right');
            this.rightSimplifiedHand.group.position.set(0, 0, this.BONE_LENGTH_LOWER);
            this.rightSimplifiedHand.group.visible = false;
            this.rightElbowAnchor.add(this.rightSimplifiedHand.group);
        } else {
            console.warn("SimplifiedHand (V3) class not defined!");
        }


    }

    equip(itemInstance, side = 'right', t = 0.5) {
        if (!itemInstance) return;
        const itemMesh = itemInstance.mesh;

        // Cleanup
        this.dropWeapon();

        this.currentWeaponInstance = itemInstance;
        this.currentWeapon = itemMesh;
        this.currentWeaponType = itemInstance.type;
        this.currentHandSide = side;

        // "Realistic Grab": attach to PALM precisely.
        const activeHands = this.getActiveHands();
        const activeHand = side === 'left' ? activeHands.left : activeHands.right;
        const targetAnchor = (activeHand && activeHand.palm) ? activeHand.palm : (side === 'left' ? this.leftHandAnchor : this.rightHandAnchor);

        // SNAP TO HAND POSITION
        // We move the item to the anchor origin, but offset it so the handle is gripped.
        const isPalm = targetAnchor && (targetAnchor.name === 'palm' || 
                       (activeHand && targetAnchor === activeHand.palm));
        
        const handleLength = itemInstance.type === 'axe' ? 3.2 : 1.0;
        
        if (isPalm) {
            const rotX = -Math.PI * 0.35; // 63 degrees up-forward angle
            const rotY = (side === 'left' ? -1 : 1) * Math.PI / 4;
            itemMesh.position.set(
                0, 
                -t * handleLength * Math.cos(rotX), 
                -t * handleLength * Math.sin(rotX)
            );
            itemMesh.rotation.set(0, 0, 0); // Reset
            itemMesh.rotation.copy(new THREE.Euler(rotX, rotY, 0, 'YXZ'));
        } else {
            itemMesh.position.set(0, 0, -t * handleLength);
            itemMesh.rotation.set(Math.PI / 2, 0, (side === 'left' ? -1 : 1) * Math.PI / 4);
        }

        targetAnchor.add(itemMesh);

        console.log("Realistic Grab Enacted:", itemInstance.type, "at", side, "offset ratio:", t);

        itemMesh.scale.set(4, 4, 4);
        itemInstance.onPickup();
    }

    dropWeapon() {
        if (this.currentWeaponInstance) {
            const item = this.currentWeaponInstance;
            const itemMesh = item.mesh;

            // Move back to world scene
            this.scene.attach(itemMesh);

            item.isPickedUp = false;
            item.isStatic = false; // "Wake up"
            item.grabState = 'free';

            // Apply slight "drop" velocity + tangential throw from rotation
            let throwVel = new THREE.Vector3(0, -2, -2).applyQuaternion(this.group.quaternion);

            const activeHands = this.getActiveHands();
            const activeHand = this.currentHandSide === 'left' ? activeHands.left : activeHands.right;
            if (activeHand && activeHand.worldVelocity) {
                // Add hand's velocity to throw. Limit to a reasonable magnitude to avoid extreme throws.
                const handVel = activeHand.worldVelocity.clone();
                handVel.clampLength(0, 15);
                throwVel.add(handVel);
            }
            item.velocity.copy(throwVel);

            this.currentWeaponInstance = null;
            this.currentWeapon = null;
            this.currentWeaponType = null;
        }
    }

    /**
     * Get world position of weapon tip (blade end) for collision detection
     */
    getWeaponTipPosition() {
        if (!this.currentWeapon) return null;

        // Tip is local to weapon. Weapon is scaled 3x.
        // Approx tip at +0.8 Y local.
        const tipLocal = new THREE.Vector3(0, 0.8 * 3, 0);

        // Transform to world
        const tipWorld = tipLocal.clone();
        this.currentWeapon.localToWorld(tipWorld);

        return tipWorld;
    }

    /**
     * Check if weapon collides with a target (zombie)
     * Returns true if weapon tip is within range of target
     */
    checkWeaponHit(targetPosition, hitRadius = 2.5) {
        const tipPos = this.getWeaponTipPosition();
        if (!tipPos) return false;

        const distance = tipPos.distanceTo(targetPosition);
        // console.log("Weapon dist:", distance); 
        return distance < hitRadius;
    }

    /**
     * Stabilize weapon: Sync position to hand, lock rotation to Body
     */
    stabilizeWeapon() {
        // No longer needed to sync position/rotation manually if parented to hand anchor.
        // We can keep the method for future fine-tuning or secondary stabilization if jitter returns.
        /*
        if (!this.currentWeapon || !this.rightHandAnchor) return;
        const handWorldPos = new THREE.Vector3();
        this.rightHandAnchor.getWorldPosition(handWorldPos);
        const localPos = this.group.worldToLocal(handWorldPos);
        localPos.y -= 0.2;
        localPos.z -= 0.2;
        this.currentWeapon.position.copy(localPos);
        this.currentWeapon.rotation.set(-0.3, 0, 0);
        */
    }

    updateHeadRotation(yaw, pitch) {
        if (this.head) {
            this.head.rotation.y = yaw;
            this.head.rotation.x = pitch;
        }
    }

    /**
     * getRelativeDirection - Updated for better close-range tracking
     * Converts 2D screen coords to 3D direction
     */
    getRelativeDirection(start, end) {
        // FIXED: Inverted Y (Up is +) AND Inverted X (Mirror effect)
        const dy = -(end.y - start.y);
        const dx = -(end.x - start.x);
        let len2d = Math.sqrt(dx * dx + dy * dy);

        // Stabilize jitter when hands are very close to body/camera
        if (len2d < 0.01) len2d = 0.01;

        const maxLen = 0.25;
        // Z-Factor: When arm is fully extended (len2d large), z is small.
        // When arm is foreshortened (len2d small), z is large (pointing forward).

        // RESTORED ORIGINAL LOGIC
        // Clamp zFactor to avoid "inverse" bending
        let zFactor = Math.sqrt(Math.max(0, 1 - (len2d / maxLen)));

        // LIMIT Z: If zFactor determines forward reach, limit it so it doesn't flip backward
        // This keeps arms generally in front of body 
        const dz = -zFactor * 2.0;

        // Multipliers (dx*8, dy*8) from original "good" logic
        return new THREE.Vector3(dx * 8, dy * 8, dz).normalize();
    }

    /**
     * Check if a hand is raised for spell casting
     * Returns 'left', 'right', or null
     */
    isHandRaised() {
        // ULTIMATE STABLE DETECTION
        // Use head-relative positioning. Wrist must be near or above cheek level.

        const getHandStats = (elbowAnchor) => {
            if (!elbowAnchor || !this.head) return null;

            // Wrist position in world
            elbowAnchor.updateMatrixWorld(true);
            const wristLocal = new THREE.Vector3(0, 0, this.BONE_LENGTH_LOWER);
            const wristWorld = wristLocal.applyMatrix4(elbowAnchor.matrixWorld);

            // Head position in world
            this.head.updateMatrixWorld(true);
            const headWorld = new THREE.Vector3();
            this.head.getWorldPosition(headWorld);

            // RELAXED DETECTION (Fix Request): 10% below center + extra permissive
            // Previous 1.2 was better, but 1.3 allows for very low hand positions.
            const threshold = 1.3;
            const heightRelHead = wristWorld.y - (headWorld.y - threshold);

            // Valid if wrist is above the relaxed threshold
            return { height: heightRelHead, valid: heightRelHead > 0 };
        };

        const leftStats = getHandStats(this.leftElbowAnchor);
        const rightStats = getHandStats(this.rightElbowAnchor);

        if (!leftStats || !rightStats) return null;

        const leftValid = leftStats.valid;
        const rightValid = rightStats.valid;

        if (!leftValid && !rightValid) return null;

        let side = 'right';
        if (leftValid && rightValid) {
            side = (leftStats.height >= rightStats.height) ? 'left' : 'right';
        } else if (leftValid) {
            side = 'left';
        }

        const heightDiff = Math.abs(leftStats.height - rightStats.height);
        const bothLevel = leftValid && rightValid && (heightDiff < 0.3);

        return { side, bothLevel };
    }

    getHandDirection(handSide) {
        // Return direction vector from hand for spell casting
        const anchor = handSide === 'left' ? this.leftElbowAnchor : this.rightElbowAnchor;

        const start = new THREE.Vector3();
        anchor.getWorldPosition(start); // Elbow

        const end = new THREE.Vector3(0, 0, this.BONE_LENGTH_LOWER);
        end.applyMatrix4(anchor.matrixWorld); // Wrist

        return end.sub(start).normalize();
    }

    getHandWorldPosition(handSide) {
        const anchor = handSide === 'left' ? this.leftElbowAnchor : this.rightElbowAnchor;
        // Ensure matrix is fresh for this frame
        anchor.updateMatrixWorld(true);

        const wristLocal = new THREE.Vector3(0, 0, this.BONE_LENGTH_LOWER);
        const wristWorld = wristLocal.applyMatrix4(anchor.matrixWorld);
        return wristWorld;
    }

    /**
     * Update arms using lookAt - Stabilized with custom UP vector
     */
    updateArmsLookAt(poseData) {
        if (!poseData.leftShoulder || !poseData.leftElbow || !poseData.leftWrist ||
            !poseData.rightShoulder || !poseData.rightElbow || !poseData.rightWrist) {
            return;
        }

        // Helper to adjust UP vector dynamically to avoid singularities
        // If direction is collinear with (1,0,0), switch to (0,1,0)
        const adjustUpVector = (anchor, direction) => {
            // RELIABLE BODY-UP ORIENTATION
            // Simply align arm UP with character's current world-UP
            const bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(bodyQuat);
            anchor.up.copy(bodyUp);
        };

        // Convert pose data to THREE.Vector3 - DIRECT MAPPING (Left->Left)
        const leftShoulder = new THREE.Vector3(poseData.leftShoulder.x, poseData.leftShoulder.y, poseData.leftShoulder.z);
        const leftElbow = new THREE.Vector3(poseData.leftElbow.x, poseData.leftElbow.y, poseData.leftElbow.z);
        const leftWrist = new THREE.Vector3(poseData.leftWrist.x, poseData.leftWrist.y, poseData.leftWrist.z);
        const rightShoulder = new THREE.Vector3(poseData.rightShoulder.x, poseData.rightShoulder.y, poseData.rightShoulder.z);
        const rightElbow = new THREE.Vector3(poseData.rightElbow.x, poseData.rightElbow.y, poseData.rightElbow.z);
        const rightWrist = new THREE.Vector3(poseData.rightWrist.x, poseData.rightWrist.y, poseData.rightWrist.z);

        // Get directions (from user's getRelativeDirection)
        const lArmDir = this.getRelativeDirection(leftShoulder, leftElbow);
        const lForearmDir = this.getRelativeDirection(leftElbow, leftWrist);
        const rArmDir = this.getRelativeDirection(rightShoulder, rightElbow);
        const rForearmDir = this.getRelativeDirection(rightElbow, rightWrist);

        // Get body quaternion for transforming directions
        const bodyQuat = new THREE.Quaternion();
        this.group.getWorldQuaternion(bodyQuat);

        // Helper to Smoothly LookAt
        const smoothLookAt = (obj, targetPos, speed = 0.15) => {
            const temp = new THREE.Object3D();
            temp.position.copy(obj.position);
            temp.rotation.copy(obj.rotation);
            temp.up.copy(obj.up);
            // Apply parent transforms if needed to emulate local rotation? 
            // Actually, we want to align `obj` to look at `targetPos`.
            // `obj.lookAt` sets local rotation.

            // We can just Compute Target Quaternion
            const originalQ = obj.quaternion.clone();
            obj.lookAt(targetPos);
            const targetQ = obj.quaternion.clone();
            obj.quaternion.copy(originalQ); // Revert

            obj.quaternion.slerp(targetQ, speed);
        };

        // LEFT ARM - lookAt
        if (this.leftArmAnchor.parent) {
            adjustUpVector(this.leftArmAnchor, lArmDir);
            const worldDir = lArmDir.clone().applyQuaternion(bodyQuat);
            const targetPos = this.leftArmAnchor.position.clone();
            const worldTarget = this.leftArmAnchor.parent.localToWorld(targetPos.clone());
            worldTarget.add(worldDir);
            // SMOOTH LOOKAT
            smoothLookAt(this.leftArmAnchor, worldTarget, 0.2);
        }

        // LEFT ELBOW
        {
            const worldDir = lForearmDir.clone().applyQuaternion(bodyQuat);
            adjustUpVector(this.leftElbowAnchor, worldDir);
            const leftElbowWorldPos = new THREE.Vector3();
            this.leftElbowAnchor.getWorldPosition(leftElbowWorldPos);
            const target = leftElbowWorldPos.clone().add(worldDir);
            smoothLookAt(this.leftElbowAnchor, target, 0.2);
        }

        // RIGHT ARM - lookAt
        if (this.rightArmAnchor.parent) {
            adjustUpVector(this.rightArmAnchor, rArmDir);
            const worldDir = rArmDir.clone().applyQuaternion(bodyQuat);
            const targetPos = this.rightArmAnchor.position.clone();
            const worldTarget = this.rightArmAnchor.parent.localToWorld(targetPos.clone());
            worldTarget.add(worldDir);
            smoothLookAt(this.rightArmAnchor, worldTarget, 0.2);
        }

        // RIGHT ELBOW
        {
            const worldDir = rForearmDir.clone().applyQuaternion(bodyQuat);
            adjustUpVector(this.rightElbowAnchor, worldDir);
            const rightElbowWorldPos = new THREE.Vector3();
            this.rightElbowAnchor.getWorldPosition(rightElbowWorldPos);
            const target = rightElbowWorldPos.clone().add(worldDir);
            smoothLookAt(this.rightElbowAnchor, target, 0.2);
        }
        // STABILIZE WEAPON (User Request: Blade always up)
        this.stabilizeWeapon();



        // UPDATE HANDS (V2 or V3 depending on active version)
        if (this.handVersion === 'v3') {
            // Update SimplifiedHand V3
            if (this.leftSimplifiedHand && this.leftSimplifiedHand.group.visible) {
                this.leftSimplifiedHand.update(poseData.leftHandLandmarks || null, this.group.rotation.y);
            }
            if (this.rightSimplifiedHand && this.rightSimplifiedHand.group.visible) {
                this.rightSimplifiedHand.update(poseData.rightHandLandmarks || null, this.group.rotation.y);
            }
        } else {
            // Update DetailedHand V2
            if (this.leftDetailedHand && this.leftDetailedHand.group.visible) {
                this.leftDetailedHand.update(poseData.leftHandLandmarks || null);
            }
            if (this.rightDetailedHand && this.rightDetailedHand.group.visible) {
                this.rightDetailedHand.update(poseData.rightHandLandmarks || null);
            }
        }
    }

    setIdlePose() {
        // Reset arms to a natural holding position (Arms down by sides)
        const idleTarget = new THREE.Vector3(0, -1, 0); // Point straight down relative to shoulder

        if (this.leftArmAnchor) {
            this.leftArmAnchor.rotation.set(0, 0, 0);
            // Slightly out to avoid clipping body
            this.leftArmAnchor.lookAt(this.leftArmAnchor.position.clone().add(new THREE.Vector3(-0.1, -1, 0)));
        }
        if (this.leftElbowAnchor) this.leftElbowAnchor.rotation.set(0, 0, 0);

        if (this.rightArmAnchor) {
            this.rightArmAnchor.rotation.set(0, 0, 0);
            this.rightArmAnchor.lookAt(this.rightArmAnchor.position.clone().add(new THREE.Vector3(0.1, -1, 0)));
        }
        if (this.rightElbowAnchor) this.rightElbowAnchor.rotation.set(0, 0, 0);

        // Ensure default UP vector
        if (this.leftArmAnchor) this.leftArmAnchor.up.set(0, 1, 0);
        if (this.rightArmAnchor) this.rightArmAnchor.up.set(0, 1, 0);
    }

    resetPose() {
        this.setIdlePose();
        this.isRunning = false;
        this.isCrouching = false;
        this.runCycle = 0;
        this.group.rotation.set(0, 0, 0);

        // Reset Hands Tracking State so they stop animating to old targets

    }

    setRunning(running, intensity = 0.5) {
        this.isRunning = running;
        // Clamp intensity 0-1
        this.runIntensity = Math.max(0, Math.min(1, intensity));
    }

    setCrouching(crouching) {
        this.isCrouching = crouching;
    }

    update(deltaTime) {
        // Track hand world velocities for velocity-based throwing
        const activeHands = this.getActiveHands();
        ['left', 'right'].forEach(side => {
            const hand = activeHands[side];
            if (hand && hand.group.visible) {
                const anchor = (hand && hand.palm) ? hand.palm : (side === 'left' ? this.leftHandAnchor : this.rightHandAnchor);
                const currentPos = new THREE.Vector3();
                anchor.getWorldPosition(currentPos);
                
                if (!hand.lastWorldPos) {
                    hand.lastWorldPos = currentPos.clone();
                    hand.worldVelocity = new THREE.Vector3();
                } else {
                    if (deltaTime > 0) {
                        const calculatedVel = new THREE.Vector3().subVectors(currentPos, hand.lastWorldPos).divideScalar(deltaTime);
                        // Simple low-pass filter to smooth out tracking jitter
                        hand.worldVelocity.lerp(calculatedVel, 0.3);
                    }
                    hand.lastWorldPos.copy(currentPos);
                }
            }
        });

        // Crouch Logic
        // Deeper crouch (User request)
        const targetY = this.isCrouching ? this.baseY - 1.0 : this.baseY;
        // Smooth crouch (lerp)
        this.group.position.y += (targetY - this.group.position.y) * 10 * deltaTime;

        // Visual leg bend for crouch
        const crouchAngle = this.isCrouching ? -0.8 : 0; // More angle too

        // HAND ANCHOR SPRING-BACK (Realistic Resistance)
        // If hands were pushed by collisions, they smoothly return to ideal wrist position.
        const springSpeed = 15 * deltaTime;
        const idealPos = new THREE.Vector3(0, 0, this.BONE_LENGTH_LOWER);

        if (this.leftHandAnchor) {
            this.leftHandAnchor.position.lerp(idealPos, springSpeed);
        }
        if (this.rightHandAnchor) {
            this.rightHandAnchor.position.lerp(idealPos, springSpeed);
        }

        if (this.isRunning) {
            // Speed based on intensity (Walking vs Running)
            const walkSpeed = 2.5; // Units per second (Reduced 2x)
            const runSpeed = 7.5; // Units per second (Reduced 2x)

            // Calculate final speed based on intensity (0.0 to 1.0)
            const speed = walkSpeed + (runSpeed - walkSpeed) * this.runIntensity;

            // Animation speed also scales
            const animSpeed = 8 + (this.runIntensity * 12);
            this.runCycle += deltaTime * animSpeed;

            // Leg swing amplitude scales slightly with intensity
            const swingAmplitude = 0.5 + (this.runIntensity * 0.3);
            const legSwing = Math.sin(this.runCycle) * swingAmplitude;

            this.leftLegPivot.rotation.x = legSwing + crouchAngle;
            this.rightLegPivot.rotation.x = -legSwing + crouchAngle;

            // Movement distance (FIXED: Added deltaTime for FPS independence)
            const moveDistance = speed * deltaTime;
            this.group.position.z -= Math.cos(this.group.rotation.y) * moveDistance;
            this.group.position.x -= Math.sin(this.group.rotation.y) * moveDistance;
        } else {
            // Idle / Standing / Crouch only
            // Lerp legs to crouch angle or 0 (FIXED: Added deltaTime)
            const lerpFactor = 10 * deltaTime;
            this.leftLegPivot.rotation.x += (crouchAngle - this.leftLegPivot.rotation.x) * lerpFactor;
            this.rightLegPivot.rotation.x += (crouchAngle - this.rightLegPivot.rotation.x) * lerpFactor;
        }
    }

    getPosition() { return this.group.position.clone(); }
    getRotation() { return this.group.rotation.clone(); }
    setBodyRotation(yaw) { this.group.rotation.y = yaw; }

    /**
     * FPV Support
     */
    /**
     * FPV Support
     */
    setFirstPerson(isFPV) {
        // Hide head and body (torso) in FPV but allow shadows.
        // We do this by moving them to Layer 1.
        // Camera sees Layer 0. Shadow Camera sees Layer 0 and 1.
        const layer = isFPV ? 1 : 0;

        if (this.head) {
            this.head.traverse(child => {
                child.layers.set(layer);
            });
        }
        if (this.body) {
            this.body.traverse(child => {
                child.layers.set(layer);
            });
        }
        // Arms should always be visible (Layer 0) - Default
    }

    getHeadPosition() {
        // Return world position of head
        const pos = new THREE.Vector3();
        if (this.head) {
            this.head.getWorldPosition(pos);
            // Updated User Preference: (0, -0.5, -0.4)
            const offset = new THREE.Vector3(0, -0.5, -0.4).applyQuaternion(this.head.getWorldQuaternion(new THREE.Quaternion()));
            pos.add(offset);
        } else {
            // Fallback
            pos.copy(this.group.position);
            pos.y += 1.8;
        }
        return pos;
    }

    getHeadQuaternion() {
        const q = new THREE.Quaternion();
        if (this.head) {
            this.head.getWorldQuaternion(q);
        }
        return q;
    }
    setShowHands(visible) {
        // Show/hide based on current version
        if (this.handVersion === 'v3') {
            if (this.leftSimplifiedHand) this.leftSimplifiedHand.group.visible = visible;
            if (this.rightSimplifiedHand) this.rightSimplifiedHand.group.visible = visible;
            if (this.leftDetailedHand) this.leftDetailedHand.group.visible = false;
            if (this.rightDetailedHand) this.rightDetailedHand.group.visible = false;
        } else {
            if (this.leftDetailedHand) this.leftDetailedHand.group.visible = visible;
            if (this.rightDetailedHand) this.rightDetailedHand.group.visible = visible;
            if (this.leftSimplifiedHand) this.leftSimplifiedHand.group.visible = false;
            if (this.rightSimplifiedHand) this.rightSimplifiedHand.group.visible = false;
        }
        this.handsVisible = visible;
    }

    setHandVersion(version) {
        // Switch between V2 and V3
        if (version !== 'v2' && version !== 'v3') {
            console.warn('Invalid hand version:', version);
            return;
        }
        this.handVersion = version;
        console.log('Hand version set to:', version);

        // Re-apply visibility
        if (this.handsVisible) {
            this.setShowHands(true);
        }
    }

    setHandQuality(mode) {
        if (this.leftDetailedHand) this.leftDetailedHand.setQuality(mode);
        if (this.rightDetailedHand) this.rightDetailedHand.setQuality(mode);
        if (this.leftSimplifiedHand) this.leftSimplifiedHand.setQuality(mode);
        if (this.rightSimplifiedHand) this.rightSimplifiedHand.setQuality(mode);
    }

    getActiveHands() {
        // Return currently active hand instances
        if (this.handVersion === 'v3') {
            return { left: this.leftSimplifiedHand, right: this.rightSimplifiedHand };
        } else {
            return { left: this.leftDetailedHand, right: this.rightDetailedHand };
        }
    }
}

if (typeof window !== 'undefined') {
    window.VoxelCharacter = VoxelCharacter;
}
