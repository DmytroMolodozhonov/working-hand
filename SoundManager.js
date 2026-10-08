class SoundManager {
    constructor(camera) {
        this.camera = camera;
        this.audioListener = new THREE.AudioListener();
        this.camera.add(this.audioListener);

        this.sounds = {
            ambient: null,
            death: null,
            thunder: null,
            inferno: null,
            sapira: null,
            hits: [],
            ice: null,
            sand: null,
            shatter: null
        };

        // Music Tracks
        this.music = {
            ambient: [], // Array of buffers
            battle: null, // Battle buffer
            current: null, // Currently playing Audio object
            currentIndex: 0, // For cycling ambient
            state: 'idle', // 'idle', 'ambient', 'battle'
            fading: false,
            volume: 0.5
        };

        // Battle State Logic
        this.battleTimer = 0;
        this.isBattleMode = false;

        // Pool of positional audio for zombies
        this.ambientPool = [];
        this.maxAmbient = 3;

        this.enabled = true;
        this.audioLoader = new THREE.AudioLoader();
    }

    async loadSounds(onProgress) {
        try {
            console.log("Loading sounds...");
            const files = [
                { key: 'ambient', path: 'sounds/Звук зомби.wav' },
                { key: 'death', path: 'sounds/Звук смерти зомби.wav' },
                { key: 'h1', path: 'sounds/Звук удара зомби 1.wav' },
                { key: 'h2', path: 'sounds/Звук удара зомби2.wav' },
                { key: 'h3', path: 'sounds/Звук удара зомби3.wav' },
                { key: 'thunder', path: 'sounds/Резкий удар молнии.wav' },
                { key: 'inferno', path: 'sounds/Огненой эффект.wav' },
                { key: 'sapira', path: 'sounds/Сапира.wav' },
                { key: 'ice', path: 'sounds/Заморозка.wav', optional: true },
                { key: 'sand', path: 'sounds/Рассыпаться в песок.wav', optional: true },
                { key: 'shatter', path: 'sounds/Разбитие зомби.wav', optional: true },
                { key: 'm1', path: 'music/Музыка1.mp3', optional: true },
                { key: 'm2', path: 'music/Музыка2.mp3', optional: true },
                { key: 'battle', path: 'music/Музыка для начала битвы.mp3', optional: true }
            ];

            let loaded = 0;
            const update = () => {
                loaded++;
                if (onProgress) onProgress(loaded / files.length);
            };

            // Load all
            const results = {};
            await Promise.all(files.map(async (file) => {
                try {
                    const buffer = await this.loadBuffer(encodeURI(file.path));
                    results[file.key] = buffer;
                } catch (e) {
                    if (!file.optional) throw e;
                }
                update();
            }));

            // Map results back
            const ambientBuffer = results.ambient;
            for (let i = 0; i < this.maxAmbient; i++) {
                const sound = new THREE.PositionalAudio(this.audioListener);
                sound.setBuffer(ambientBuffer);
                sound.setRefDistance(2);
                sound.setLoop(true);
                sound.setVolume(1.0);
                this.ambientPool.push({ sound, activeId: null });
            }

            this.sounds.death = results.death;
            this.sounds.hits = [results.h1, results.h2, results.h3];
            this.sounds.thunder = results.thunder;
            this.sounds.inferno = results.inferno;
            this.sounds.sapira = results.sapira;
            this.sounds.ice = results.ice;
            this.sounds.sand = results.sand;
            this.sounds.shatter = results.shatter;
            this.music.ambient = [results.m1, results.m2].filter(x => x);
            this.music.battle = results.battle;

            console.log("Sounds loaded successfully!");
            this.playAmbientMusic();

        } catch (err) {
            console.error("Failed to load sounds:", err);
            this.enabled = false;
        }
    }

    loadBuffer(path) {
        return new Promise((resolve, reject) => {
            this.audioLoader.load(path,
                (buffer) => resolve(buffer),
                (xhr) => { },
                (err) => {
                    console.warn(`Error loading sound ${path}:`, err);
                    reject(err);
                }
            );
        });
    }

    setScene(scene) {
        this.scene = scene;
        this.ambientPool.forEach(item => {
            this.scene.add(item.sound);
        });
    }

    setVolume(val) {
        // Master volume for zombie sounds (SFX)
        const gain = val / 100;
        this.ambientPool.forEach(item => {
            item.sound.setVolume(gain);
        });
        this.globalVolume = gain;
        // NOTE: Music volume is now separate!
    }

    setMusicVolume(val) {
        const gain = val / 100;
        this.music.volume = gain;
        if (this.music.current) {
            this.music.current.setVolume(gain);
        }
    }

    // --- MUSIC SYSTEM ---

    playAmbientMusic() {
        if (!this.enabled || !this.music.ambient.length) return;
        this.startTrack(this.music.ambient[this.music.currentIndex], 'ambient');
    }

    playBattleMusic() {
        if (!this.enabled || !this.music.battle) return;
        this.startTrack(this.music.battle, 'battle');
    }

    startTrack(buffer, type) {
        // Stop previous
        if (this.music.current) {
            // Instant stop or crossfade? For now, implementing crossfade in updateMusic
            // But if we are forcing start, we assume transition handled or initial start
            if (this.music.current.isPlaying) this.music.current.stop();
        }

        const sound = new THREE.Audio(this.audioListener);
        sound.setBuffer(buffer);
        sound.setLoop(type === 'battle'); // Battle music loops itself? Or user said just "Battle starts". 
        // Usually battle music loops.
        // Ambient music: "Cycle 1 then 2 then 1"
        if (type === 'ambient') sound.setLoop(false);

        sound.setVolume(this.music.volume);
        sound.play();

        if (type === 'ambient') {
            sound.onEnded = () => {
                // Next track
                if (this.music.state === 'ambient') {
                    this.music.currentIndex = (this.music.currentIndex + 1) % this.music.ambient.length;
                    this.playAmbientMusic();
                }
            };
        }

        this.music.current = sound;
        this.music.state = type;
    }

    updateMusic(deltaTime, nearestZombieDist) {
        if (!this.enabled) return;

        // Battle Condition
        const BATTLE_RANGE = 20.0;
        const BATTLE_END_DELAY = 20.0; // Seconds to wait before ending battle

        if (nearestZombieDist < BATTLE_RANGE) {
            this.battleTimer = BATTLE_END_DELAY;
            if (!this.isBattleMode) {
                this.isBattleMode = true;
                this.crossfadeTo('battle', 3.0); // 3 sec fade in
            }
        } else {
            if (this.battleTimer > 0) {
                this.battleTimer -= deltaTime;
            } else {
                if (this.isBattleMode) {
                    this.isBattleMode = false;
                    this.crossfadeTo('ambient', 5.0); // 5 sec fade out
                }
            }
        }
    }

    crossfadeTo(targetState, duration) {
        console.log(`Music Transition: ${this.music.state} -> ${targetState} (${duration}s)`);

        // 1. Create New Track
        let nextBuffer = null;
        if (targetState === 'battle') {
            nextBuffer = this.music.battle;
        } else {
            // Resume ambient
            nextBuffer = this.music.ambient[this.music.currentIndex]; // Resume/Start current index
        }

        if (!nextBuffer) return;

        const nextSound = new THREE.Audio(this.audioListener);
        nextSound.setBuffer(nextBuffer);
        nextSound.setLoop(targetState === 'battle');
        nextSound.setVolume(0); // Start silent
        nextSound.play();

        if (targetState === 'ambient') {
            nextSound.onEnded = () => {
                if (this.music.state === 'ambient') {
                    this.music.currentIndex = (this.music.currentIndex + 1) % this.music.ambient.length;
                    this.playAmbientMusic();
                }
            };
        }

        // 2. Crossfade
        const oldSound = this.music.current;
        const startVolume = this.music.volume;

        // We use a simple interval or update loop for fading?
        // SoundManager.update is not called globally? updateAmbient is.
        // We can do it via AudioParam automation

        // Fade In New
        if (nextSound.gain.gain) {
            nextSound.gain.gain.setValueAtTime(0, this.audioListener.context.currentTime);
            nextSound.gain.gain.linearRampToValueAtTime(this.music.volume, this.audioListener.context.currentTime + duration);
        }

        // Fade Out Old
        if (oldSound && oldSound.isPlaying && oldSound.gain.gain) {
            oldSound.gain.gain.cancelScheduledValues(this.audioListener.context.currentTime);
            oldSound.gain.gain.setValueAtTime(oldSound.gain.gain.value, this.audioListener.context.currentTime);
            oldSound.gain.gain.linearRampToValueAtTime(0, this.audioListener.context.currentTime + duration);

            // Stop old after fade
            setTimeout(() => {
                if (oldSound.isPlaying) oldSound.stop();
            }, duration * 1000);
        }

        this.music.current = nextSound;
        this.music.state = targetState;
    }

    // --- SFX ---

    updateAmbient(playerPos, zombies) {
        if (!this.enabled || !this.ambientPool.length) return;

        // 1. Calculate distances
        let minDist = Infinity;

        const candidates = [];
        zombies.forEach(z => {
            if (!z.isDead) {
                const dist = playerPos.distanceTo(z.group.position);
                if (dist < minDist) minDist = dist;

                if (dist < 15) {
                    candidates.push({ zombie: z, dist });
                }
            }
        });

        // Update Music Logic with Min Distance (approximate delta 0.016 is fine for logic timer)
        this.updateMusic(0.016, minDist);

        // 2. Sort by distance
        candidates.sort((a, b) => a.dist - b.dist);

        // 3. Assign top 3 to pool
        const activeZombies = new Set();
        const toPlay = candidates.slice(0, this.maxAmbient);

        toPlay.forEach((item) => {
            const z = item.zombie;
            activeZombies.add(z.id);
            let slot = this.ambientPool.find(s => s.activeObject === z);
            if (!slot) slot = this.ambientPool.find(s => s.activeObject === null);

            if (slot) {
                slot.activeObject = z;
                const zWorldPos = new THREE.Vector3();
                z.group.getWorldPosition(zWorldPos);
                slot.sound.position.copy(zWorldPos);
                if (!slot.sound.isPlaying) slot.sound.play();
                slot.sound.setVolume(this.globalVolume !== undefined ? this.globalVolume : 1.0);
            }
        });

        // 4. Cleanup
        this.ambientPool.forEach(slot => {
            const shouldStop = !slot.activeObject ||
                !activeZombies.has(slot.activeObject.id) ||
                (slot.activeObject && slot.activeObject.isDead);

            if (shouldStop) {
                if (slot.sound.isPlaying) slot.sound.stop();
                slot.activeObject = null;
            }
        });
    }

    playHit() {
        if (!this.enabled || !this.sounds.hits.length) return;
        if (this.hitIndex === undefined) this.hitIndex = 0;
        const buffer = this.sounds.hits[this.hitIndex];
        this.hitIndex = (this.hitIndex + 1) % this.sounds.hits.length;

        const sound = new THREE.Audio(this.audioListener);
        sound.setBuffer(buffer);
        sound.setVolume(1.0);
        sound.play();
    }

    playFrozenHit() {
        if (!this.enabled) return;
        // Use Shatter sound if available, else standard hit
        if (this.sounds.shatter) {
            const sound = new THREE.Audio(this.audioListener);
            sound.setBuffer(this.sounds.shatter);
            sound.setVolume(1.2);
            sound.play();
        } else {
            this.playHit();
        }
    }

    playDeath(position) {
        if (!this.enabled || !this.sounds.death) return;
        const sound = new THREE.PositionalAudio(this.audioListener);
        sound.setBuffer(this.sounds.death);
        sound.setRefDistance(5);
        sound.setVolume(1.5);
        sound.position.copy(position);
        sound.play();
    }

    playThunder() {
        if (!this.enabled || !this.sounds.thunder) return;
        const sound = new THREE.Audio(this.audioListener);
        sound.setBuffer(this.sounds.thunder);
        sound.setVolume(1.0);
        sound.play();
    }

    playInferno() {
        if (!this.enabled || !this.sounds.inferno) return;
        const sound = new THREE.Audio(this.audioListener);
        sound.setBuffer(this.sounds.inferno);
        sound.setVolume(0.8);
        sound.play();
    }

    playSapira() {
        if (!this.enabled || !this.sounds.sapira) return;
        const sound = new THREE.Audio(this.audioListener);
        sound.setBuffer(this.sounds.sapira);
        sound.setVolume(1.0);
        sound.play();
    }

    playWhoosh() { this.playSand(); }

    playSand() {
        if (!this.enabled) return;
        if (this.sounds.sand) {
            const sound = new THREE.Audio(this.audioListener);
            sound.setBuffer(this.sounds.sand);
            sound.setVolume(1.0);
            sound.play();
        } else if (this.sounds.inferno) {
            const sound = new THREE.Audio(this.audioListener);
            sound.setBuffer(this.sounds.inferno);
            sound.setRate(2.0);
            sound.setVolume(0.5);
            sound.play();
        }
    }

    playIce() {
        if (!this.enabled || !this.sounds.ice) return;
        const sound = new THREE.Audio(this.audioListener);
        sound.setBuffer(this.sounds.ice);
        sound.setVolume(1.4); // 40% Louder
        sound.play();
    }
}
