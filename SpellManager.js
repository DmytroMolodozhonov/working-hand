class SpellManager {
    constructor(scene) {
        this.scene = scene;
        this.spells = []; // Active spell effects
        this.soundManager = null;
    }

    setSoundManager(sm) {
        this.soundManager = sm;
    }

    castSpell(name, origin, direction, zombies, handSide) {
        console.log(`[SpellManager] RAW Input: "${name}"`);
        const cleanName = name.toLowerCase().trim();
        console.log(`[SpellManager] CLEAN Input: "${cleanName}", HandSide: ${handSide}`);

        // Debug: Log all active spells count to see if we are leaking
        console.log(`[SpellManager] Active Spells: ${this.spells.length}`);

        // Fuzzy Match Helper
        const isMatch = (input, target, tolerance = 3) => {
            if (input.includes(target)) return true;
            return false;
        };

        // SPELL CHECK (Priority: Longest/Specific -> Shortest)

        // 1. Sapira
        if (cleanName.includes('сап') || cleanName.includes('sap') ||
            cleanName.includes('саб') || cleanName.includes('sab') ||
            cleanName.includes('саф') || cleanName.includes('saf') ||
            cleanName.includes('сат') || cleanName.includes('sat') ||
            cleanName.includes('зап') || cleanName.includes('zap')) {
            this.castSapira(origin, direction, zombies);
            return 'Sapira';
        }

        // 2. Thunderwave
        if (cleanName.includes('танд') || cleanName.includes('thun') ||
            cleanName.includes('молн') || cleanName.includes('гром') ||
            cleanName.includes('удар')) {
            this.castThunderwave(origin, direction, zombies);
            return 'Thunderwave';
        }

        // 3. Inferno
        if (cleanName.includes('инфер') || cleanName.includes('infer') ||
            cleanName.includes('огон') || cleanName.includes('фаер') || cleanName.includes('fire')) {
            this.castInferno(origin, direction, zombies);
            return 'Inferno';
        }

        // 4. Sands
        // Extended with: sun, son, sam, set, sed, cent
        const isSand = cleanName.includes('санд') || cleanName.includes('sand') ||
            cleanName.includes('сенд') || cleanName.includes('send') ||
            cleanName.includes('санс') || cleanName.includes('sans') ||
            cleanName.includes('песо') || cleanName.includes('peso') ||
            cleanName.includes('цент') || cleanName.includes('cent') ||
            cleanName.includes('даст') || cleanName.includes('dust') ||
            cleanName.includes('sun') || cleanName.includes('son') ||
            cleanName.includes('sam') || cleanName.includes('set') ||
            cleanName.includes('sed');

        if (isSand) {
            console.log(`[SpellManager] MATCHED SAND: "${cleanName}"`);
            this.castSands(origin, direction, zombies);
            return 'Sands';
        } else {
            // Debug partial matches for Sand?
            if (cleanName.includes('s')) console.log(`[SpellManager] Possible Sand miss? Input: "${cleanName}"`);
        }

        // 5. Ice 
        // Extended with: freeze, froze, snow, eyes, ace
        const isIce = cleanName.includes('айс') || cleanName.includes('ice') ||
            cleanName.includes('аис') || cleanName.includes('ais') ||
            cleanName.includes('лед') || cleanName.includes('led') ||
            cleanName.includes('мороз') || cleanName.includes('moroz') ||
            cleanName.includes('холод') || cleanName.includes('cold') ||
            cleanName.includes('луч') || cleanName.includes('beam') ||
            cleanName.includes('eyes') || cleanName.includes('ace') ||
            cleanName.includes('is') || cleanName.includes('snow') ||
            cleanName.includes('freeze') || cleanName.includes('froze');

        if (isIce) {
            console.log(`[SpellManager] MATCHED ICE: "${cleanName}"`);
            this.castIce(origin, direction, zombies, handSide);
            return 'Ice';
        } else {
            if (cleanName.includes('i') || cleanName.includes('eye')) console.log(`[SpellManager] Possible Ice miss? Input: "${cleanName}"`);
        }

        return null; // No match
    }

    update(deltaTime) {
        if (!this.spells) this.spells = [];
        if (!this.particles) this.particles = [];

        // Update Spells (Main effects)
        for (let i = this.spells.length - 1; i >= 0; i--) {
            const spell = this.spells[i];
            spell.life -= deltaTime;

            if (spell.onUpdate) spell.onUpdate(spell, deltaTime);

            if (spell.life <= 0) {
                if (spell.mesh) this.scene.remove(spell.mesh);
                if (spell.meshes) spell.meshes.forEach(m => this.scene.remove(m));
                // Extra cleanup for beamMesh if present
                if (spell.beamMesh) this.scene.remove(spell.beamMesh);

                this.spells.splice(i, 1);
            }
        }

        // Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= deltaTime;

            // Move
            p.mesh.position.add(p.velocity.clone().multiplyScalar(deltaTime));

            // Rotate
            if (p.rotateSpeed) {
                p.mesh.rotation.x += p.rotateSpeed.x * deltaTime;
                p.mesh.rotation.y += p.rotateSpeed.y * deltaTime;
                p.mesh.rotation.z += p.rotateSpeed.z * deltaTime;
            }

            // Scale
            if (p.scaleSpeed) {
                p.mesh.scale.addScalar(p.scaleSpeed * deltaTime);
            }

            // Fade
            if (p.mesh.material.transparent) {
                p.mesh.material.opacity = p.life / p.maxLife;
            }

            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
            }
        }
    }

    // --- HELPER: Spawn Particle ---
    spawnParticle(pos, color, size, vel, life) {
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);

        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

        this.scene.add(mesh);
        this.particles.push({
            mesh,
            velocity: vel,
            life: life,
            maxLife: life,
            scaleSpeed: -0.5,
            rotateSpeed: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(5)
        });
    }

    // --- SPELLS ---

    castInferno(origin, direction, zombies) {
        if (this.soundManager && this.soundManager.playInferno) {
            try { this.soundManager.playInferno(); } catch (e) { console.warn("Sound Error", e); }
        }

        // UPGRADED INFERNO: CONTINUOUS STREAM
        this.spells.push({
            life: 4.0,
            maxLife: 4.0,
            type: 'emitter',
            origin: origin,
            direction: direction,
            onUpdate: (spell, dt) => {
                const count = 15;
                for (let i = 0; i < count; i++) {
                    const angle = spell.life * 10 + (Math.random() * Math.PI * 2);
                    const radius = 0.12 + Math.random() * 0.12; // Extremely tight stream
                    const up = new THREE.Vector3(0, 1, 0);
                    const right = new THREE.Vector3().crossVectors(direction, up).normalize();
                    const localUp = new THREE.Vector3().crossVectors(right, direction).normalize();

                    const offset = right.clone().multiplyScalar(Math.cos(angle) * radius)
                        .add(localUp.clone().multiplyScalar(Math.sin(angle) * radius));

                    const spawnPos = spell.origin.clone().add(offset);
                    const speed = 24 + Math.random() * 8;
                    const vel = direction.clone().multiplyScalar(speed).add(offset.normalize().multiplyScalar(0.4)); // Minimal spread

                    const colors = [0xff0000, 0xff4500, 0xff8800, 0xffffff, 0x880000];
                    const color = colors[Math.floor(Math.random() * colors.length)];

                    this.spawnParticle(spawnPos, color, 0.4 + Math.random() * 0.7, vel, 0.7 + Math.random() * 0.3); // Small sharp particles
                }

                // DAMAGE LOGIC
                zombies.forEach(z => {
                    if (z.isDead) return;
                    const toZombie = z.group.position.clone().sub(spell.origin);
                    const dist = toZombie.length();

                    if (dist > 30) return;
                    const angle = spell.direction.angleTo(toZombie.clone().normalize());
                    if (angle < 0.5) {
                        if (z.damageCooldown <= 0) {
                            z.takeDamage(1, true);
                            z.damageCooldown = 0.1;
                        }
                    }
                });
            }
        });
    }

    castThunderwave(origin, direction, zombies) {
        if (this.soundManager && this.soundManager.playThunder) {
            try { this.soundManager.playThunder(); } catch (e) { console.warn("Sound Error", e); }
        }

        // 1. CLOUD
        for (let i = 0; i < 20; i++) {
            const spread = new THREE.Vector3(
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5 + 3,
                (Math.random() - 0.5) * 5
            );
            this.spawnParticle(origin.clone().add(spread), 0x88ffff, 1.5, direction.clone().multiplyScalar(5), 0.5);
        }

        const range = 40;

        // 2. 3D BOLTS
        for (let k = 0; k < 15; k++) {
            const spreadAngle = (Math.random() - 0.5) * 2.0;
            const boltDir = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spreadAngle).normalize();

            let currPos = origin.clone();
            const segments = 8;
            const segLen = (range * (0.5 + Math.random() * 0.5)) / segments;

            for (let s = 0; s < segments; s++) {
                const nextPos = currPos.clone().add(boltDir.clone().multiplyScalar(segLen));
                nextPos.add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2));

                const dist = currPos.distanceTo(nextPos);
                const mid = currPos.clone().add(nextPos).multiplyScalar(0.5);
                const thickness = 0.15;
                const geo = new THREE.CylinderGeometry(thickness, thickness, dist, 4);
                geo.rotateX(-Math.PI / 2);

                const mat = new THREE.MeshBasicMaterial({ color: 0xaaddff });
                const mesh = new THREE.Mesh(geo, mat);

                mesh.position.copy(mid);
                mesh.lookAt(nextPos);
                mesh.rotateX(Math.PI / 2);

                this.scene.add(mesh);
                this.spells.push({ mesh, life: 0.15 + k * 0.01, maxLife: 0.2, type: 'beam' });

                currPos = nextPos;
            }
        }

        // Flash
        const light = new THREE.PointLight(0xaaddff, 3, 50);
        light.position.copy(origin);
        this.scene.add(light);
        this.spells.push({ mesh: light, life: 0.3, maxLife: 0.3, type: 'light' });


        // Logic
        zombies.forEach(z => {
            if (z.isDead) return;
            const toZombie = z.group.position.clone().sub(origin);
            const dist = toZombie.length();
            const dot = direction.dot(toZombie.clone().normalize());

            if ((dist < 4.0 && dot > -0.2) || (dist < range && direction.angleTo(toZombie.normalize()) < 1.2)) {
                z.damageCooldown = 0;
                z.takeDamage(5, true);
                z.group.position.add(toZombie.normalize().multiplyScalar(8));
            }
        });
    }

    castSands(origin, direction, zombies) {
        if (this.soundManager && this.soundManager.playWhoosh) {
            try { this.soundManager.playWhoosh(); } catch (e) { console.warn("Sound Error", e); }
        }

        const size = 0.5;
        const geo = new THREE.SphereGeometry(size, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xd2b48c });
        const mesh = new THREE.Mesh(geo, mat);

        this.scene.add(mesh);
        mesh.position.copy(origin);

        const velocity = direction.clone().multiplyScalar(25.0);

        this.spells.push({
            mesh: mesh,
            life: 3.0,
            maxLife: 3.0,
            type: 'projectile',
            velocity: velocity,
            onUpdate: (spell, dt) => {
                spell.mesh.position.add(spell.velocity.clone().multiplyScalar(dt));
                spell.mesh.rotation.x += dt * 5;
                spell.mesh.rotation.y += dt * 5;

                if (Math.random() > 0.5) {
                    this.spawnParticle(spell.mesh.position.clone(), 0xd2b48c, 0.2, new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)), 0.5);
                }

                let hitZombie = null;
                for (let z of zombies) {
                    if (z.isDead) continue;
                    const zCenter = z.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
                    if (spell.mesh.position.distanceTo(zCenter) < 1.5) {
                        hitZombie = z;
                        console.log("Sands Hit Zombie!", z.id);
                        break;
                    }
                }

                if (hitZombie) {
                    hitZombie.turnToSand();
                    spell.life = 0;
                    this.scene.remove(spell.mesh);
                    for (let k = 0; k < 20; k++) {
                        this.spawnParticle(spell.mesh.position.clone(), 0xd2b48c, 0.4, new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10), 0.8);
                    }
                }

                if (spell.mesh.position.distanceTo(origin) > 20 && spell.life > 0) {
                    spell.life = 0;
                    this.scene.remove(spell.mesh);
                }
            }
        });
    }

    castIce(origin, direction, zombies, handSide) {
        console.log(`[SpellManager] castIce called with HandSide: ${handSide}`);
        // ICE: Guided Beam, Freeze

        let targetZombie = null;
        let minDist = Infinity;
        const maxRange = 20.0;

        zombies.forEach(z => {
            if (z.isDead || z.isFrozen) return;
            const zombieCenter = z.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
            const toZombie = zombieCenter.clone().sub(origin);
            const dist = toZombie.length();

            if (dist > maxRange) return;
            const angle = direction.angleTo(toZombie.clone().normalize());

            if (angle < 0.4) {
                if (dist < minDist) {
                    minDist = dist;
                    targetZombie = z;
                }
            }
        });

        if (!targetZombie) {
            console.log("Ice Cast: No target found");
            this.spawnIceBeam(origin, origin.clone().add(direction.multiplyScalar(20)), false);
            return;
        }

        console.log("Ice Cast: Target Locked", targetZombie.id);

        if (this.soundManager && this.soundManager.playIce) {
            try { this.soundManager.playIce(); } catch (e) { }
        }

        const iceSpell = {
            life: 5.0,
            maxLife: 5.0,
            type: 'ice_beam',
            target: targetZombie,
            originStatic: origin.clone(),
            initialDir: direction.clone(),
            handSide: handSide || null, // 'left' or 'right'
            beamMesh: null,

            onUpdate: (spell, dt) => {
                if (spell.target.isDead) {
                    spell.life = 0;
                    if (spell.beamMesh) spell.beamMesh.visible = false;
                    return;
                }

                // DEFINE zCenter HERE TO AVOID REFERENCE ERROR
                const zCenter = spell.target.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));

                // 1. Resolve Hand Side (if not yet found) - RELAXED & DEBUGGED
                if (typeof window !== 'undefined' && window.character && !spell.handSide) {
                    const char = window.character;
                    const lPos = char.getHandWorldPosition('left');
                    const rPos = char.getHandWorldPosition('right');

                    const distL = lPos.distanceTo(spell.originStatic);
                    const distR = rPos.distanceTo(spell.originStatic);

                    // Tighten logic: Lock to closer hand within 2.5m, then STICK to it.
                    if (distL < 2.5 && distL < distR) spell.handSide = 'left';
                    else if (distR < 2.5) spell.handSide = 'right';

                    if (spell.handSide) console.log(`Ice Beam Locked to Hand: ${spell.handSide}`);
                }

                // Get Live Data
                let currentOrigin = spell.originStatic;
                let currentDir = spell.initialDir;

                if (typeof window !== 'undefined' && window.character && spell.handSide) {
                    // ALWAYS update if we have a hand side
                    currentOrigin = window.character.getHandWorldPosition(spell.handSide);
                    currentDir = window.character.getHandDirection(spell.handSide);
                    // console.log("Updating Ice Origin:", currentOrigin); // Uncomment for spam
                } else {
                    if (!spell.handSide) console.warn("Ice Spell has NO handSide!");
                    // Try to force one?
                    if (typeof window !== 'undefined' && window.character) {
                        // Emergency fallback: use Right Hand
                        currentOrigin = window.character.getHandWorldPosition('right');
                        currentDir = window.character.getHandDirection('right');
                    }
                }

                // 2. Breaking Condition (> 25 degrees from INITIAL Direction) - Increased tolerance
                const angleFromStart = currentDir.angleTo(spell.initialDir);

                if (angleFromStart > 0.45) { // ~25 deg
                    console.log("Ice Beam Broken: Angle too large", angleFromStart);
                    spell.life = 0;
                    if (spell.beamMesh) spell.beamMesh.visible = false;
                    return;
                }

                // 3. Curved Beam Visuals - THROTTLED UPDATE
                const p0 = currentOrigin;
                const p2 = zCenter;
                const dist = p0.distanceTo(p2);
                const p1 = p0.clone().add(currentDir.clone().multiplyScalar(dist * 0.5));

                // Only recreate geometry if significant change or first time
                if (!spell.lastP0 || spell.lastP0.distanceTo(p0) > 0.05 || spell.lastP2.distanceTo(p2) > 0.1 || !spell.beamMesh) {
                    if (spell.beamMesh) this.scene.remove(spell.beamMesh);

                    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
                    const thickness = 0.15; // Removed sine pulse for stability and speed
                    const geo = new THREE.TubeGeometry(curve, 12, thickness, 6, false); // Reduced segments
                    const mat = new THREE.MeshBasicMaterial({
                        color: 0x00ffff,
                        transparent: true,
                        opacity: 0.8,
                        blending: THREE.AdditiveBlending
                    });

                    spell.beamMesh = new THREE.Mesh(geo, mat);
                    this.scene.add(spell.beamMesh);

                    spell.lastP0 = p0.clone();
                    spell.lastP2 = p2.clone();
                }

                // 4. Chill Mechanics (5 seconds)
                const chillAmount = (1.0 / 5.0) * dt;
                spell.target.applyChill(chillAmount);

                // Particles at target
                if (Math.random() > 0.5) {
                    this.spawnParticle(zCenter, 0xaaddff, 0.4, new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)), 0.5);
                }
            }
        };

        this.spells.push(iceSpell);
    }

    spawnIceBeam(start, end, isHit) {
        const path = new THREE.LineCurve3(start, end);
        const geo = new THREE.TubeGeometry(path, 1, 0.4, 8, false);
        const mat = new THREE.MeshBasicMaterial({ color: 0x88ffff, transparent: true, opacity: 0.5 });
        const mesh = new THREE.Mesh(geo, mat);
        this.scene.add(mesh);

        this.spells.push({
            mesh: mesh,
            life: 0.5,
            maxLife: 0.5,
            onUpdate: (s, dt) => {
                s.mesh.material.opacity = s.life / s.maxLife;
            }
        });
    }

    castSapira(origin, direction, zombies) {
        if (this.soundManager && this.soundManager.playSapira) {
            try { this.soundManager.playSapira(); } catch (e) { console.warn(e); }
        }

        const len = 100;
        const coreGeo = new THREE.CylinderGeometry(0.2, 0.2, len, 8);
        coreGeo.rotateX(-Math.PI / 2);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const core = new THREE.Mesh(coreGeo, coreMat);

        const shellGeo = new THREE.CylinderGeometry(0.6, 0.6, len, 8);
        shellGeo.rotateX(-Math.PI / 2);
        const shellMat = new THREE.MeshBasicMaterial({
            color: 0x9b59b6,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending
        });
        const shell = new THREE.Mesh(shellGeo, shellMat);

        const group = new THREE.Group();
        group.add(core);
        group.add(shell);

        group.position.copy(origin).add(direction.clone().multiplyScalar(len / 2));
        group.lookAt(origin.clone().add(direction.clone().multiplyScalar(len)));

        this.scene.add(group);

        this.spells.push({
            mesh: group,
            life: 1.5,
            maxLife: 1.5,
            type: 'beam_anim',
            onUpdate: (spell, dt) => {
                const scale = 1 + Math.sin(spell.life * 10) * 0.5;
                shell.scale.set(scale, 1, scale);
                shell.rotation.z += 5 * dt;
            }
        });

        const beamRadius = 1.5;
        zombies.forEach(z => {
            if (z.isDead) return;
            const zombieCenter = z.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
            const toZombie = zombieCenter.clone().sub(origin);
            const projectionDist = toZombie.dot(direction);

            if (projectionDist < 0 || projectionDist > len) return;

            const pointOnLine = origin.clone().add(direction.clone().multiplyScalar(projectionDist));
            const distFromBeam = pointOnLine.distanceTo(zombieCenter);

            if (distFromBeam < beamRadius) {
                z.takeDamage(10, true);
            }
        });
    }
}
