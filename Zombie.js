/**
 * Zombie.js - Simple enemy AI
 * Extends VoxelCharacter concepts but simplified for enemy
 */

class Zombie {
    constructor(scene, startPos, id) {
        this.scene = scene;
        this.id = id; // For Audio Manager tracking
        this.group = new THREE.Group();
        // Lower spawn position to match character (0.5 for legs on ground)
        startPos.y = 0.5;
        this.group.position.copy(startPos);

        // TALLER ZOMBIE (User Request) - Reduced by 20%
        this.group.scale.set(1, 1.12, 1);
        this.baseSpeed = 3.5;
        this.health = 5;
        this.isDead = false;

        // Physics
        this.velocity = new THREE.Vector3();
        this.rotVelocity = new THREE.Vector3();

        // Visuals
        this.bodyParts = [];
        this.createBody();

        this.scene.add(this.group);

        // AI State
        this.speed = this.baseSpeed; // Init speed
        this.target = null;
        this.damageCooldown = 0;
        this.hitFlashTimer = 0;
        this.walkCycle = 0;
        this.isSleeping = false; // Custom Maps feature

        // Status Effects
        this.isFrozen = false;
        this.frozenTimer = 0;
        this.freezeProgress = 0; // 0 to 1
        this.isStunned = false;
        this.stunTimer = 0;

        // Ice Crystals Group
        this.iceCrystals = new THREE.Group();
        this.group.add(this.iceCrystals);

        this.lastAttackTime = 0; // Cooldown for player damage
        this.isAttacking = false;
        this.attackAnimProgress = 0;
        this.animVariation = Math.random() * 10; // Individual variety
    }

    setSleeping(sleeping) {
        this.isSleeping = sleeping;
    }

    createBody() {
        // Greenish skin for zombie
        const skinColor = 0x6DA36D;
        const shirtColor = 0x5D4037; // Ripped brown shirt
        const pantsColor = 0x212121; // Dark grey pants

        // Head
        const headGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        const headMat = new THREE.MeshLambertMaterial({ color: skinColor });
        this.head = new THREE.Mesh(headGeo, headMat);
        this.head.position.y = 2.1;
        this.group.add(this.head);
        this.bodyParts.push(this.head);

        // Eyes (Red)
        const eyeGeo = new THREE.BoxGeometry(0.2, 0.2, 0.1);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.25, 0.1, 0.6); // Face forward (Z positive)
        this.head.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.25, 0.1, 0.6);
        this.head.add(rightEye);

        // Arms (outstretched mostly)
        const armGeo = new THREE.BoxGeometry(0.4, 1.2, 0.4);
        const armMat = new THREE.MeshLambertMaterial({ color: shirtColor });

        this.leftArm = new THREE.Mesh(armGeo, armMat);
        this.leftArm.position.set(-0.7, 1.4, 0.5);
        this.leftArm.rotation.x = -Math.PI / 2; // Arms out
        this.group.add(this.leftArm);
        this.bodyParts.push(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, armMat);
        this.rightArm.position.set(0.7, 1.4, 0.5);
        this.rightArm.rotation.x = -Math.PI / 2;
        this.group.add(this.rightArm);
        this.bodyParts.push(this.rightArm);

        // Body
        const bodyGeo = new THREE.BoxGeometry(1.2, 1.5, 0.8);
        const bodyMat = new THREE.MeshLambertMaterial({ color: shirtColor });
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.position.y = 0.75;
        this.group.add(this.body);
        this.bodyParts.push(this.body);

        // Legs
        const legGeo = new THREE.BoxGeometry(0.5, 1.2, 0.5);
        const legMat = new THREE.MeshLambertMaterial({ color: pantsColor });

        this.leftLeg = new THREE.Mesh(legGeo, legMat);
        this.leftLeg.position.set(-0.3, 0, 0);
        this.group.add(this.leftLeg);
        this.bodyParts.push(this.leftLeg);

        this.rightLeg = new THREE.Mesh(legGeo, legMat);
        this.rightLeg.position.set(0.3, 0, 0);
        this.group.add(this.rightLeg);
        this.bodyParts.push(this.rightLeg);
    }

    update(deltaTime, playerPosition, camera) {
        // --- OPTIMIZATION: CACHE DISTANCE ---
        const distSq = playerPosition ? this.group.position.distanceToSquared(playerPosition) : 10000;
        this.lastDistSq = distSq;

        // 1. TIMERS & DAMAGE LOGIC (Always update, even if stunned/frozen/dead)
        if (this.damageCooldown > 0) this.damageCooldown -= deltaTime;

        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= deltaTime;
            if (this.hitFlashTimer <= 0) {
                this.bodyParts.forEach(part => {
                    if (part.userData.origColor !== undefined) {
                        part.material.color.setHex(part.userData.origColor);
                    }
                });
            }
        }

        // DYING ANIMATION (Falling)
        if (this.isDying) {
            this.deathAnimTimer -= deltaTime;

            // Smoother fall rotation
            const targetRot = -Math.PI / 2;
            this.group.rotation.x += (targetRot - this.group.rotation.x) * 5 * deltaTime;

            // Ground clamp during dying
            if (this.group.position.y > 0.3) {
                this.group.position.y -= deltaTime * 2;
            } else {
                this.group.position.y = 0.3;
            }

            // Apply pushback during fall
            this.group.position.add(this.velocity.clone().multiplyScalar(deltaTime));
            this.velocity.multiplyScalar(0.95);

            if (this.deathAnimTimer <= 0) {
                this.isDying = false;
                this.group.rotation.x = targetRot; // Snap to final
                this.group.position.y = 0.3;
            }
            return;
        }

        if (this.isDead) return;

        // FROZEN STATE
        if (this.isFrozen) {
            this.frozenTimer -= deltaTime;
            if (this.frozenTimer <= 0) {
                this.unfreeze();
            }
            return; // No movement/updates while frozen
        }

        // SLEEPING STATE CHECK
        if (this.isSleeping) {
            const dist = this.group.position.distanceTo(playerPosition);
            if (dist < 15) { // 15 meters wake up radius
                this.isSleeping = false;
            } else {
                return false; // Stay sleeping
            }
        }

        // --- OPTIMIZATION: UPDATE THROTTLING (Only if distance is large) ---
        // If > 40m, update logic only every 5 frames
        if (distSq > 1600 && (Math.floor(Date.now() / 16) % 5 !== 0)) {
            return;
        }

        // STUNNED (DIZZY) STATE
        if (this.isStunned) {
            this.stunTimer -= deltaTime;
            if (this.stunTimer <= 0) {
                this.isStunned = false;
            } else {
                // Dizzy Animation: SPIN HEAD
                this.head.rotation.y += deltaTime * 15; // Fast spin
                this.head.rotation.z = Math.sin(Date.now() * 0.01) * 0.3; // Wobble

                // Stop legs and arms
                this.leftLeg.rotation.x *= 0.9;
                this.rightLeg.rotation.x *= 0.9;
                this.leftArm.rotation.x *= 0.9;
                this.rightArm.rotation.x *= 0.9;

                // Apply knockback decay even when stunned
                this.group.position.add(this.velocity.clone().multiplyScalar(deltaTime));
                this.velocity.multiplyScalar(0.9);
                return; // Skip AI movement
            }
        }

        // Apply physics (Knockback decay)
        this.group.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        this.velocity.multiplyScalar(0.9); // Friction

        // GROUND CLAMP: Prevent falling through floor
        // STRICT GROUND CLAMP: Prevent jumping/sticking on walls or player
        if (Math.abs(this.group.position.y - 0.5) > 0.01) {
            this.group.position.y = 0.5;
        }

        // Rotation physics (wobble on hit)
        this.group.rotation.z += this.rotVelocity.z * deltaTime;
        this.group.rotation.x += this.rotVelocity.x * deltaTime;
        this.rotVelocity.multiplyScalar(0.9); // Damping

        // Recovery (Spring back to upright)
        if (this.velocity.length() < 0.1) {
            this.group.rotation.z *= 0.9;
            this.group.rotation.x *= 0.9;
            this.head.rotation.x *= 0.9;
            this.body.rotation.x *= 0.9;
        }

        if (playerPosition && this.velocity.length() < 0.5) { // Only move if not flying back from punch
            // Seek Player
            const direction = new THREE.Vector3().subVectors(playerPosition, this.group.position);
            direction.y = 0;
            const distance = direction.length();

            // Safety check for NaN
            if (isNaN(distance)) return;

            if (distance > 1.8) { // Increased from 1.2 to approach for bite without clipping cam
                if (distance > 0.1) direction.normalize();
                this.group.position.add(direction.multiplyScalar(this.speed * deltaTime));

                // Rotate ONLY on Y axis to prevent tipping/clipping
                this.group.lookAt(playerPosition.x, this.group.position.y, playerPosition.z);
                this.group.rotation.x = 0;
                this.group.rotation.z = 0;

                // Walk anim + variety
                this.walkCycle += deltaTime * 10;
                const swing = Math.sin(this.walkCycle + this.animVariation) * 0.5;
                this.leftLeg.rotation.x = swing;
                this.rightLeg.rotation.x = -swing; // Alternate

                // Arms swaying + variety
                this.leftArm.rotation.x = -Math.PI / 2 + Math.sin(this.walkCycle * 0.8) * 0.2;
                this.rightArm.rotation.x = -Math.PI / 2 + Math.cos(this.walkCycle * 0.8) * 0.2;

                // Head wobble
                this.head.rotation.y = Math.sin(this.walkCycle * 0.5) * 0.1;
            } else {
                // VERY CLOSE: stop legs
                this.leftLeg.rotation.x *= 0.9;
                this.rightLeg.rotation.x *= 0.9;
            }
        }

        // --- CLIPPING PREVENTION (Fix user request) ---
        // If head is too close to camera, hide it or make it transparent
        if (camera) {
            const headWorldPos = new THREE.Vector3();
            this.head.getWorldPosition(headWorldPos);
            const distToCam = headWorldPos.distanceTo(camera.position);

            // If closer than 0.7 units to camera, hide the head to prevent clipping through near plane
            if (distToCam < 0.7) {
                this.head.visible = false;
                this.wasHeadHiddenByCamera = true;
            } else if (this.wasHeadHiddenByCamera) {
                this.head.visible = true;
                this.wasHeadHiddenByCamera = false;
            }
        }

        // BITE/ATTACK ANIMATION
        if (this.isAttacking) {
            this.attackAnimProgress += deltaTime * 5; // Fast lunge
            if (this.attackAnimProgress > 1.0) {
                this.isAttacking = false;
                this.attackAnimProgress = 0;
            }

            // Sine wave for lunge (0 to 1 back to 0)
            const lunge = Math.sin(this.attackAnimProgress * Math.PI);

            // Limit lunge if already extremely close to avoid clipping/flipping
            const lungeIntensity = (this.group.position.distanceTo(playerPosition) < 1.5) ? 0.05 : 0.15;
            this.group.translateZ(lunge * lungeIntensity);

            this.head.rotation.x = lunge * 0.5; // Bite down
            this.leftArm.rotation.x = -Math.PI / 2 - lunge * 1.0; // Reach forward
            this.rightArm.rotation.x = -Math.PI / 2 - lunge * 1.0;
        }
    }

    triggerAttack() {
        if (this.isAttacking) return;
        this.isAttacking = true;
        this.attackAnimProgress = 0;
    }

    takeDamage(amount, isWeapon) {
        if (this.isDead) return;

        if (this.isFrozen) {
            // SHATTER if hit while frozen (any hit triggers shatter as per "fist" request implies fragility)
            this.shatter();
            return;
        }

        this.health -= amount;
        this.damageCooldown = 0.4;

        // Interrupt attack if hit (User Request)
        if (this.isAttacking) {
            this.isAttacking = false;
            this.attackAnimProgress = 0;
            console.log("Zombie bite interrupted!");
        }

        console.log(`Zombie hit! HP: ${this.health}, Weapon: ${isWeapon}`);

        // FLASH EFFECT (Universal) - Only on bodyParts
        this.hitFlashTimer = 0.15;
        this.bodyParts.forEach(part => {
            if (part.material) {
                if (part.userData.origColor === undefined) part.userData.origColor = part.material.color.getHex();
                part.material.color.setHex(0xff0000); // Red Flash
            }
        });

        // DISMEMBERMENT LOGIC (Weapons only)
        if (isWeapon) {
            if (this.health <= 0) {
                // FATAL HIT -> Decapitate
                this.decapitate();
            } else {
                // NON-FATAL HIT -> Random limb loss
                if (Math.random() > 0.5) {
                    this.severLimb();
                }
            }
        }

        // VISUALS
        // 1. Knockback (Reduced by 40% as requested)
        const knockbackDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
        this.velocity.add(knockbackDir.multiplyScalar(3.9)); // 60% of original 6.5

        // 2. Stun State (1 second)
        this.isStunned = true;
        this.stunTimer = 1.0;

        // 3. Chaotic Rotation
        this.rotVelocity.z = (Math.random() - 0.5) * 10;
        this.rotVelocity.x = -(Math.random() * 5);

        // 3. Flail
        if (this.head.visible) this.head.rotation.x = -Math.PI / 4;
        this.body.rotation.x = -Math.PI / 6;

        if (this.health <= 0) {
            // Fatal Knockback (Push AWAY on death so we see the fall)
            const fatalPush = knockbackDir.clone().multiplyScalar(isWeapon ? 8.0 : 5.0);
            this.velocity.add(fatalPush);
            this.die();
        }
    }

    decapitate() {
        if (!this.head.visible) return;
        this.head.visible = false;

        // SPAWN FLYING HEAD
        this.spawnFlyingPart('head');
        this.spawnBlood(new THREE.Vector3(0, 2.1, 0), 15);
        console.log("HEADSHOT! DECAPITATION!");
    }

    severLimb() {
        // Randomly pick limb type
        const limbs = [
            { part: this.leftArm, name: 'leftArm', bloodY: 1.4, type: 'arm' },
            { part: this.rightArm, name: 'rightArm', bloodY: 1.4, type: 'arm' },
            { part: this.leftLeg, name: 'leftLeg', bloodY: 0.5, type: 'leg' },
            { part: this.rightLeg, name: 'rightLeg', bloodY: 0.5, type: 'leg' }
        ].filter(l => l.part.visible);

        if (limbs.length === 0) return;

        const chosen = limbs[Math.floor(Math.random() * limbs.length)];
        chosen.part.visible = false;

        // SPAWN FLYING LIMB
        this.spawnFlyingPart(chosen.type);

        // Slow down if leg
        if (chosen.type === 'leg') {
            this.speed = Math.max(0.5, this.speed - 1.0);
        }

        this.spawnBlood(new THREE.Vector3(0, chosen.bloodY, 0), 8);
        console.log(`${chosen.name} severed!`);
    }

    spawnFlyingPart(type) {
        // Create a simple flying body part in the SCENE
        let geo, mat, startY;

        if (type === 'head') {
            geo = new THREE.BoxGeometry(1.0, 1.0, 1.0);
            mat = new THREE.MeshLambertMaterial({ color: 0x6DA36D });
            startY = 2.1;
        } else if (type === 'arm') {
            geo = new THREE.BoxGeometry(0.35, 1.0, 0.35);
            mat = new THREE.MeshLambertMaterial({ color: 0x5D4037 });
            startY = 1.4;
        } else { // leg
            geo = new THREE.BoxGeometry(0.4, 1.0, 0.4);
            mat = new THREE.MeshLambertMaterial({ color: 0x212121 });
            startY = 0.5;
        }

        const part = new THREE.Mesh(geo, mat);

        // Position at zombie's world position + offset
        const worldPos = this.group.position.clone();
        worldPos.y += startY;
        part.position.copy(worldPos);

        // Add to scene
        this.scene.add(part);

        // Physics: FAST velocity
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 20,
            10 + Math.random() * 10,
            (Math.random() - 0.5) * 20
        );
        const rotVel = new THREE.Vector3(
            (Math.random() - 0.5) * 25,
            (Math.random() - 0.5) * 25,
            (Math.random() - 0.5) * 25
        );

        // DELEGATE UPDATE TO GLOBAL SYSTEM (Optimization 3)
        if (window.registerFlyingPart) {
            window.registerFlyingPart(part, velocity, rotVel);
        }
    }

    spawnBlood(localPos, count) {
        // Convert local position to world position ONCE
        const worldPos = localPos.clone();
        this.group.localToWorld(worldPos);

        // DELEGATE TO GLOBAL PARTICLE SYSTEM (Optimization 1 & 5)
        if (window.spawnBloodEffect) {
            window.spawnBloodEffect(worldPos, count);
        }
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        this.isDying = true;
        this.deathAnimTimer = 0.6; // 0.6 seconds to fall

        // Stop all other animations
        this.isAttacking = false;
        this.isStunned = false;

        // Play Death Sound
        if (window.soundManager) {
            const worldPos = new THREE.Vector3();
            this.group.getWorldPosition(worldPos);
            window.soundManager.playDeath(worldPos);
        }

        console.log("Zombie died!");
    }

    getHitBox() {
        // Return simple box for collision
        return new THREE.Box3().setFromObject(this.body);
    }

    // --- NEW MAGIC EFFECTS ---

    turnToSand() {
        if (this.isDead) return;
        this.isDead = true;
        this.group.visible = false; // Hide original body

        // Spawn Sand Particles
        const particleCount = 400; // Epic amount
        const startPos = this.group.position.clone();

        // We need access to SpellManager or Scene to spawn particles. 
        // Since Zombie doesn't have SpellManager ref, we'll emit a "dead" state 
        // or just spawn meshes directly into scene.

        const sandGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const sandMat = new THREE.MeshBasicMaterial({ color: 0xd2b48c }); // Tan/Sand color

        // Create a batch of particles mimicking the body shape
        for (let i = 0; i < particleCount; i++) {
            const mesh = new THREE.Mesh(sandGeo, sandMat);

            // Distribute randomly within body volume box (approx 1x2x1)
            const offsetX = (Math.random() - 0.5) * 1.0;
            const offsetY = Math.random() * 2.0; // 0 to 2
            const offsetZ = (Math.random() - 0.5) * 0.8;

            mesh.position.copy(startPos).add(new THREE.Vector3(offsetX, offsetY, offsetZ));

            this.scene.add(mesh);

            // Animate crumbling
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 2, // Spread out
                -Math.random() * 5,        // Fall down
                (Math.random() - 0.5) * 2
            );

            // Simple physics simulation for this particle
            let life = 3.0;
            const updateParticle = () => {
                life -= 0.05; // 60fps approx
                if (life <= 0) {
                    this.scene.remove(mesh);
                    return;
                }

                mesh.position.add(velocity.clone().multiplyScalar(0.016));

                // Ground collision
                if (mesh.position.y < 0.1) {
                    mesh.position.y = 0.1;
                    velocity.x *= 0.8;
                    velocity.z *= 0.8; // Friction
                }

                if (life > 0) requestAnimationFrame(updateParticle);
            };
            requestAnimationFrame(updateParticle);
        }
    }

    applyChill(amount) {
        if (this.isDead || this.isFrozen) return;

        this.freezeProgress = (this.freezeProgress || 0) + amount;

        // Slow down based on chill (Base speed -> 0)
        this.speed = Math.max(0, this.baseSpeed * (1.0 - this.freezeProgress));

        // Tint Blue
        this.group.traverse((child) => {
            if (child.isMesh && child.material) {
                if (!child.userData.origColor) child.userData.origColor = child.material.color.getHex();
                const baseColor = new THREE.Color(child.userData.origColor);
                const iceColor = new THREE.Color(0xaaddff);
                child.material.color.lerpColors(baseColor, iceColor, this.freezeProgress);
            }
        });

        // GROW CRYSTALS
        if (Math.random() < amount * 10) {
            this.spawnIceCrystalOnBody();
        }
        // Scale all crystals up based on progress
        if (this.iceCrystals && this.iceCrystals.children) {
            this.iceCrystals.children.forEach(c => {
                const targetScale = 0.5 + (this.freezeProgress * 1.0); // Grow to 1.5x
                c.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
            });
        }

        // Trigger Freeze
        if (this.freezeProgress >= 1.0) {
            this.freeze();
        }
    }

    spawnIceCrystalOnBody() {
        const geo = new THREE.ConeGeometry(0.1, 0.3, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.8 });
        const mesh = new THREE.Mesh(geo, mat);

        // Random position on body (simplified cylinder approx)
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.5;
        const height = Math.random() * 2.0;

        mesh.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
        mesh.lookAt(new THREE.Vector3(0, height, 0)); // look at center
        mesh.rotateX(-Math.PI / 2); // point out
        mesh.rotation.x += (Math.random() - 0.5); // jitter

        mesh.scale.set(0.1, 0.1, 0.1); // Start small
        this.iceCrystals.add(mesh);
    }

    freeze() {
        if (this.isFrozen || this.isDead) return;
        this.isFrozen = true;
        this.frozenTimer = 120;

        // Final Ice Visual
        if (this.iceCrystals && this.iceCrystals.children) {
            this.iceCrystals.children.forEach(c => c.material.opacity = 1.0);
        }
    }

    unfreeze() {
        this.isFrozen = false;
        this.freezeProgress = 0;
        this.speed = this.baseSpeed;

        // Remove crystals
        this.iceCrystals.clear();

        // Restore color
        this.group.traverse((child) => {
            if (child.isMesh && child.userData.origColor) {
                child.material.color.setHex(child.userData.origColor);
            }
        });
    }

    shatter() {
        if (this.isDead) return;
        this.isDead = true;
        this.group.visible = false;
        if (this.iceCrystals) this.iceCrystals.visible = false;

        // Sound? handled by caller or SpellManager usually, but we are in Zombie
        // We will just do visuals.

        // Ice Shards
        const shardCount = 50;
        const shardGeo = new THREE.ConeGeometry(0.2, 0.5, 4);
        const shardMat = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.8 });

        const startPos = this.group.position.clone();

        for (let i = 0; i < shardCount; i++) {
            const mesh = new THREE.Mesh(shardGeo, shardMat);

            // Random pos in body
            const offsetX = (Math.random() - 0.5) * 1.0;
            const offsetY = Math.random() * 2.0;
            const offsetZ = (Math.random() - 0.5) * 0.8;

            mesh.position.copy(startPos).add(new THREE.Vector3(offsetX, offsetY, offsetZ));
            const rot = new THREE.Vector3(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            mesh.rotation.set(rot.x, rot.y, rot.z);

            this.scene.add(mesh);

            // Explode outwards
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 10,
                Math.random() * 5,
                (Math.random() - 0.5) * 10
            );

            let life = 4.0;
            const updateShard = () => {
                life -= 0.05;
                if (life <= 0) {
                    this.scene.remove(mesh);
                    return;
                }

                velocity.y -= 9.8 * 0.016; // Gravity
                mesh.position.add(velocity.clone().multiplyScalar(0.016));

                if (mesh.position.y < 0.1) {
                    mesh.position.y = 0.1;
                    velocity.multiplyScalar(0.5); // Friction
                }

                if (life > 0) requestAnimationFrame(updateShard);
            };
            requestAnimationFrame(updateShard);
        }
    }
}

if (typeof window !== 'undefined') {
    window.Zombie = Zombie;
}
