/**
 * main.js - Phase 9 Complete Overhaul
 * Implements Tabs, Survival Mode, Flashlight, HP System, Smart Spawning
 */

window.addEventListener('DOMContentLoaded', async () => {

    // --- DOM ELEMENTS ---
    const canvas = document.getElementById('game-canvas');
    const loadingScreen = document.getElementById('loading');
    const mainMenu = document.getElementById('main-menu');
    const hud = document.getElementById('hud');
    const gameOverScreen = document.getElementById('game-over');
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');
    const progressBar = document.getElementById('loading-bar-fill');

    // Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Game Mode Selectors (Special Cards)
    let selectedMode = 'creative'; // 'creative' or 'survival'
    let selectedMap = null; // Store selected map data
    let cachedMaps = null; // Cache to prevent "reload" flicker
    const creativeOptions = null;
    const survivalOptions = null;

    // Difficulty
    const btnNovice = document.querySelector('[data-diff="novice"]');
    const btnPro = document.querySelector('[data-diff="pro"]');

    // Inputs
    const fpsLimitInput = document.getElementById('fps-limit');
    const modelQualityInput = document.getElementById('model-quality');
    const cameraResInput = document.getElementById('camera-res');
    const cameraModeToggle = document.getElementById('camera-mode-toggle');
    const volInput = document.getElementById('zombie-vol');
    const volVal = document.getElementById('vol-val');
    const ambientToggle = document.getElementById('audio-ambient-toggle');

    // Creative Zombie Slider NEW
    const creativeSettings = document.getElementById('creative-settings');
    const creativeZombieCount = document.getElementById('creative-zombie-count');
    const zombieCountDisplay = document.getElementById('zombie-count-val');

    // Wire up zombieCountInput to the actual slider
    const zombieCountInput = creativeZombieCount || { value: 0 };

    if (creativeZombieCount && zombieCountDisplay) {
        creativeZombieCount.oninput = (e) => {
            zombieCountDisplay.textContent = e.target.value;
        };
    }

    // HUD Elements
    const hpText = document.getElementById('hp-text');
    const hpBarFill = document.getElementById('hp-bar-fill');
    const killCountEl = document.getElementById('kill-count');
    const punchCountEl = document.getElementById('punch-count');
    const goKills = document.getElementById('go-kills');
    const goPunches = document.getElementById('go-punches');

    // --- GAME STATE ---
    let selectedDiff = 'pro';
    // Helper
    const dist3d = (v1, v2) => v1.distanceTo(v2);

    let gameLoopActive = false;
    let currentPose = null; // Store latest pose for game loop logic
    let firstPoseReceived = false; // NEW
    let playerHP = 10;
    let maxHP = 10;
    let killCount = 0;
    let punchCount = 0;
    let survivalZombieTarget = 1;
    let cachedWallMeshes = []; // Optimization: Store for faster LoS checks
    let lastTime = performance.now();
    let flashlight = null;
    let bodyRotationOffset = 0;
    let playerAttackCooldown = 0; // Prevent spam attacks
    let frameCount = 0;
    let fpsTimeAccumulator = 0;
    let gameStartTime = 0; // NEW: To delay item pickup for safety

    // COLLISION CONSTANTS
    const PLAYER_PHYSICS_RADIUS = 0.4;
    const PLAYER_ZOMBIE_RADIUS = 1.5;

    // --- Optimization Systems (Global) ---
    const flyingParts = []; // Optimization 3: List for centralized update
    let bloodSystem = null; // Optimization 1 & 5: THREE.Points system

    function initGlobalSystems(scene) {
        // 1. Blood System (THREE.Points - Much faster than meshes)
        const bloodCount = 5000;
        const bloodGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(bloodCount * 3);
        const velocities = new Float32Array(bloodCount * 3);
        const lifetimes = new Float32Array(bloodCount);

        // Hide off-screen initially
        for (let i = 0; i < bloodCount; i++) {
            positions[i * 3 + 1] = -1000;
            lifetimes[i] = 0;
        }

        bloodGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const bloodMat = new THREE.PointsMaterial({ color: 0x880000, size: 0.15 });
        bloodSystem = new THREE.Points(bloodGeo, bloodMat);
        bloodSystem.frustumCulled = false;
        scene.add(bloodSystem);

        // Global function for Zombie.js to call
        window.spawnBloodEffect = (worldPos, count) => {
            const posAttr = bloodSystem.geometry.attributes.position.array;
            let spawned = 0;
            for (let i = 0; i < bloodCount && spawned < count; i++) {
                if (lifetimes[i] <= 0) {
                    lifetimes[i] = 2.0 + Math.random() * 2.5;
                    posAttr[i * 3] = worldPos.x;
                    posAttr[i * 3 + 1] = worldPos.y;
                    posAttr[i * 3 + 2] = worldPos.z;

                    velocities[i * 3] = (Math.random() - 0.5) * 4;
                    velocities[i * 3 + 1] = Math.random() * 6;
                    velocities[i * 3 + 2] = (Math.random() - 0.5) * 4;
                    spawned++;
                }
            }
            bloodSystem.geometry.attributes.position.needsUpdate = true;
        };

        window.updateParticles = (dt) => {
            const posAttr = bloodSystem.geometry.attributes.position.array;
            let needsUpdate = false;
            for (let i = 0; i < bloodCount; i++) {
                if (lifetimes[i] > 0) {
                    lifetimes[i] -= dt;

                    velocities[i * 3 + 1] -= 15 * dt; // Gravity
                    posAttr[i * 3] += velocities[i * 3] * dt;
                    posAttr[i * 3 + 1] += velocities[i * 3 + 1] * dt;
                    posAttr[i * 3 + 2] += velocities[i * 3 + 2] * dt;

                    // Ground check
                    if (posAttr[i * 3 + 1] < 0.1) {
                        posAttr[i * 3 + 1] = 0.1;
                        velocities[i * 3] *= 0.8;
                        velocities[i * 3 + 2] *= 0.8;
                        velocities[i * 3 + 1] = 0; // Stick to ground
                    }

                    if (lifetimes[i] <= 0) {
                        posAttr[i * 3 + 1] = -1000;
                    }
                    needsUpdate = true;
                }
            }
            if (needsUpdate) bloodSystem.geometry.attributes.position.needsUpdate = true;
        };

        // 2. Flying Parts System (Optimization 3)
        window.registerFlyingPart = (mesh, velocity, rotVel) => {
            flyingParts.push({ mesh, velocity, rotVel, life: 5.0 });
        };

        window.updateFlyingParts = (dt) => {
            for (let i = flyingParts.length - 1; i >= 0; i--) {
                const p = flyingParts[i];
                p.life -= dt;
                if (p.life <= 0) {
                    scene.remove(p.mesh);
                    if (p.mesh.geometry) p.mesh.geometry.dispose();
                    if (p.mesh.material) p.mesh.material.dispose();
                    flyingParts.splice(i, 1);
                    continue;
                }

                p.velocity.y -= 15 * dt;
                p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
                p.mesh.rotation.x += p.rotVel.x * dt;
                p.mesh.rotation.y += p.rotVel.y * dt;
                p.mesh.rotation.z += p.rotVel.z * dt;

                if (p.mesh.position.y < 0.3) {
                    p.mesh.position.y = 0.3;
                    p.velocity.y *= -0.3;
                    p.velocity.x *= 0.7;
                    p.velocity.z *= 0.7;
                }
            }
        };
    }

    let cameraSmoothness = 0.3; // Alpha (lower = smoother)
    let cameraSensitivity = 1.0; // Multiplier
    let driftingCameraMode = true; // New camera mode with drifting center
    let cameraBaseRotation = 0; // Base rotation that drifts as player looks around

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x87CEEB, 20, 80);

    // Camera Setup
    const cameraOffset = new THREE.Vector3(0, 4, 10); // TPV Offset
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const poseService = new PoseService();
    window.poseService = poseService;
    const voiceService = new VoiceService();
    let lastSpellCastTime = 0;
    const SPELL_COOLDOWN = 1000;

    // VOICE MENU TOGGLE
    const voiceToggleBtn = document.getElementById('voice-toggle-btn');
    const voiceTestText = document.getElementById('voice-test-text');
    let isMenuVoiceActive = false;

    if (voiceToggleBtn) {
        voiceToggleBtn.addEventListener('click', () => {
            isMenuVoiceActive = !isMenuVoiceActive;
            if (isMenuVoiceActive) {
                voiceService.start();
                voiceToggleBtn.innerText = "🛑 СТОП";
                voiceToggleBtn.style.background = "#c0392b";
                if (voiceTestText) {
                    voiceTestText.innerText = "ОЖИДАНИЕ ГОЛОСА...";
                    voiceTestText.style.color = "#55efc4";
                }
            } else {
                voiceService.stop();
                voiceToggleBtn.innerText = "🎙️ СТАРТ";
                voiceToggleBtn.style.background = "#27ae60";
                if (voiceTestText) {
                    voiceTestText.innerText = "ГОЛОС ВЫКЛЮЧЕН";
                    voiceTestText.style.color = "#a4b0be";
                }
            }
        });
    }

    // Voice Feedback for Menu & Game (Consolidated)
    voiceService.onResult = (command) => {
        if (!command) return;
        console.log("[Voice] Result Received:", command);

        // 1. Menu Processing (Always update if menu voice active)
        if (isMenuVoiceActive && voiceTestText) {
            voiceTestText.innerText = `"${command.toUpperCase()}"`;
            voiceTestText.style.color = "#55efc4";

            const spells = ['инферно', 'лед', 'гром', 'сапира', 'песок', 'тандервейв', 'айс', 'санд', 'даст', 'dust'];
            if (spells.some(s => command.toLowerCase().includes(s))) {
                voiceTestText.style.color = "#ff4757";
                voiceTestText.innerHTML = `✨ ${command.toUpperCase()} ✨`;
            }
        }

        // 2. Spell Logic (Works during gameplay + recent magic activity)
        if (gameLoopActive && (isMagicActive || Date.now() - (window.lastMagicTime || 0) < 1500) && spellManager) {
            const activeHand = magicHand || window.lastMagicHand || 'right';
            const now = Date.now();
            if (now - lastSpellCastTime < SPELL_COOLDOWN) {
                console.log("[Voice] Spell on cooldown...");
                return;
            }

            const voiceDebug = document.getElementById('voice-debug');
            if (voiceDebug) voiceDebug.innerText = `🎤 СЛЫШУ: "${command}"`;

            console.log(`[Voice] Casting check: "${command}" (Hand: ${activeHand})`);
            const origin = character.getHandWorldPosition(activeHand);
            const dir = character.getHandDirection(activeHand);
            const spellName = spellManager.castSpell(command, origin, dir, zombies, activeHand);

            if (spellName) {
                console.log(`%c[Voice] SPELL CAST: ${spellName}`, "color: #55efc4; font-weight: bold");
                lastSpellCastTime = now;
                if (voiceDebug) voiceDebug.innerHTML = `✨ <span style="color:#55efc4">${spellName.toUpperCase()}</span> (было: "${command}")`;
                if (voiceTestText && isMenuVoiceActive) voiceTestText.innerHTML = `✨ ${spellName.toUpperCase()} ✨`;
            } else {
                console.log(`[Voice] Command "${command}" matched no spell.`);
            }
        }
    };

    let spellManager = null;
    let soundManager = null;
    let world, character;
    let zombies = [];
    let worldItems = [];
    let worldChests = []; // For map-based chests
    let cameraMode = 'fpv';
    let currentMapData = null; // For custom maps
    let gameWalls = []; // Wall collision data for custom maps
    let config = {}; // Global config for game loop
    let lastSpawnTime = 0; // Global spawn timer

    // Spell State
    let isMagicActive = false;
    let magicHand = null; // 'left' or 'right'



    // --- UI LOGIC ---



    // 1. Tabs
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => {
                p.classList.remove('active');
                p.style.display = 'none'; // Ensure hidden
            });

            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.tab);
            target.classList.add('active');

            // Set display mode based on tab type
            target.style.display = 'block';

            // Initialize MapEditor when editor tab is opened
            if (btn.dataset.tab === 'tab-editor') {
                if (!window.mapEditor) {
                    window.mapEditor = new MapEditor();
                } else {
                    window.mapEditor.refreshMapList();
                }
            }


            // Update map list when switching to Game tab
            if (btn.dataset.tab === 'tab-game') {
                updateGameMapList();
            }

            // Render Items Tab
            if (btn.dataset.tab === 'tab-items') {
                renderItemsTab();
            }
        });
    });

    // Removed auto voice start logic
    // Mode switching is now handled by map card clicks
    function setGameMode(mode) {
        selectedMode = mode;
        selectedMap = null;
        console.log("Mode set to:", mode);
        // Refresh map list to show selection
        updateGameMapList();
    }

    // 3. Difficulty (Simplified: Always PRO)
    selectedDiff = 'pro';

    // 4. Sliders (Zombie count removed from UI, using default 1)

    volInput.addEventListener('input', (e) => {
        volVal.textContent = e.target.value + '%';
        if (soundManager) soundManager.setVolume(parseInt(e.target.value));
    });

    const musicVolInput = document.getElementById('music-vol');
    const musicVolVal = document.getElementById('music-vol-val');
    if (musicVolInput) {
        musicVolInput.addEventListener('input', (e) => {
            musicVolVal.textContent = e.target.value + '%';
            if (soundManager) soundManager.setMusicVolume(parseInt(e.target.value));
        });
    }

    // New Sliders Logic
    const camSmoothInput = document.getElementById('cam-smooth');
    const smoothVal = document.getElementById('smooth-val');
    const camSensInput = document.getElementById('cam-sens');
    const sensVal = document.getElementById('sens-val');

    // MAP: 0-95 -> Alpha 1.0 - 0.05
    function updateSmoothness(val) {
        // val 0 -> alpha 1.0
        // val 95 -> alpha 0.05
        const v = parseInt(val);
        cameraSmoothness = 1.0 - (v / 100);
        if (cameraSmoothness < 0.05) cameraSmoothness = 0.05;
        smoothVal.textContent = v + '%';
        console.log(`Smoothness Updated: Slider=${v}, Alpha=${cameraSmoothness.toFixed(3)}`);
    }

    // MAP: 10-100 -> Sens 0.1 - 1.0
    function updateSensitivity(val) {
        const v = parseInt(val);
        cameraSensitivity = v / 100;
        sensVal.textContent = v + '%';
        console.log(`Sensitivity Updated: Slider=${v}, Multiplier=${cameraSensitivity.toFixed(2)}`);
    }

    camSmoothInput.addEventListener('input', (e) => updateSmoothness(e.target.value));
    camSensInput.addEventListener('input', (e) => updateSensitivity(e.target.value));

    // Init default texts
    console.log("Initializing Sliders...");
    if (camSmoothInput && camSensInput) {
        updateSmoothness(camSmoothInput.value);
        updateSensitivity(camSensInput.value);
    } else {
        console.error("Slider Inputs not found!");
    }

    // Initial Map List Update
    updateGameMapList();

    // --- AUDIO RESUME ---
    async function initAudio() {
        // Create manager
        if (!soundManager) {
            spellManager = new SpellManager(scene);

            // Audio & Voice Setup
            soundManager = new SoundManager(camera); // Pass camera for spatial audio
            spellManager.setSoundManager(soundManager);
            await soundManager.loadSounds(); // Ensure sounds are loaded
            if (config.vol) soundManager.setVolume(config.vol / 100);
            if (config.ambient) soundManager.playAmbient(); // Play bg music

            // Initial items & chests logic...
        }

        // Resume Context
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (THREE.AudioContext && THREE.AudioContext.getContext().state === 'suspended') {
            await THREE.AudioContext.getContext().resume();
        }

        // Apply initial volume
        soundManager.setVolume(parseInt(volInput.value));
        if (document.getElementById('music-vol')) {
            soundManager.setMusicVolume(parseInt(document.getElementById('music-vol').value));
        }
        soundManager.enabled = (ambientToggle.value === '1');
    }

    // --- START GAME ---
    startBtn.addEventListener('click', async () => {

        // Config Object
        // Config Object
        config = {
            mode: selectedMode,
            map: selectedMap, // Pass selected map
            difficulty: selectedDiff,
            zombieCount: selectedMode === 'creative' ? parseInt(creativeZombieCount.value) : 1, // Use new slider if creative
            fpsLimit: parseInt(fpsLimitInput.value),
            modelComplexity: parseInt(modelQualityInput.value),
            resolution: cameraResInput.value,
            cameraMode: cameraModeToggle.checked ? 'fpv' : 'tpv',
            showHands: document.getElementById('show-hands-toggle') ? document.getElementById('show-hands-toggle').checked : false,
            handVersion: document.querySelector('input[name="hand-version"]:checked')?.value || 'v3'
        };
        cameraMode = config.cameraMode;

        // Read drifting camera checkbox
        const driftCheckbox = document.getElementById('drift-camera');
        driftingCameraMode = driftCheckbox ? driftCheckbox.checked : true;

        // Hide Menu, Show Loading
        mainMenu.classList.add('hidden');
        loadingScreen.classList.remove('hidden');
        loadingScreen.style.display = 'flex';

        // Set initial status
        const loadingStatus = document.getElementById('loading-status');
        if (loadingStatus) loadingStatus.textContent = 'Инициализация...';

        await initGame(config);
    });

    // --- TEST MODE VARIABLES ---
    let isTestMode = false;
    let testModeState = 'setup'; // 'setup' or 'fpv'
    let testCameraOffset = new THREE.Vector3(0, -0.5, -0.4); // User Preferred Offset
    let testMarker = null; // The red sphere
    let orbitControls = null;
    let testCharacter = null;
    let riggingManager = null; // NEW Rigging Manager

    // Test Mode UI Elements
    const testModeBtn = document.getElementById('test-mode-btn');
    const testModeUI = document.getElementById('test-mode-ui');
    const tmSlopeX = document.getElementById('tm-x');
    const tmSlopeY = document.getElementById('tm-y');
    const tmSlopeZ = document.getElementById('tm-z');
    const tmValX = document.getElementById('tm-val-x');
    const tmValY = document.getElementById('tm-val-y');
    const tmValZ = document.getElementById('tm-val-z');
    const tmSpawnBtn = document.getElementById('tm-spawn-btn');
    const tmExitBtn = document.getElementById('tm-exit-btn');
    const tmBackOverlay = document.getElementById('tm-back-overlay');
    const tmBackBtn = document.getElementById('tm-back-btn');

    // Test Mode Events
    testModeBtn.addEventListener('click', async () => {
        isTestMode = true;
        testModeState = 'setup';
        mainMenu.classList.add('hidden');
        testModeUI.classList.remove('hidden');

        // Hide FPV Back button initially
        tmBackOverlay.classList.add('hidden');
        document.querySelector('#test-mode-ui .menu-container').classList.remove('hidden');

        await initTestMode();
    });

    tmExitBtn.addEventListener('click', () => {
        // Reset Logic
        if (riggingManager) riggingManager.disable();
        if (character) character.resetPose();

        window.location.reload(); // Simple exit
    });

    tmSpawnBtn.addEventListener('click', async () => {
        testModeState = 'fpv';
        // Hide Setup UI, Show Back Button
        document.querySelector('#test-mode-ui .menu-container').classList.add('hidden');
        tmBackOverlay.classList.remove('hidden');

        // Initialize Pose Service if not already running
        // Use a default config for test mode (full quality or as set in menu)
        const testConfig = {
            modelComplexity: 1, // Full
            cameraMode: 'fpv'
        };

        if (!poseService.holistic) {
            await poseService.initialize('webcam', 'preview-video', testConfig);
        }
        if (!poseService.isRunning) {
            await poseService.start();
        }

        // Lock pointer for FPV feeling? Maybe not for simple test, 
        // but user expects to see FPV "as is".
        // Let's just switch camera logic.
    });

    tmBackBtn.addEventListener('click', () => {
        testModeState = 'setup';
        tmBackOverlay.classList.add('hidden');
        document.querySelector('#test-mode-ui .menu-container').classList.remove('hidden');

        // Reset camera to orbit
        if (orbitControls) orbitControls.enabled = true;
        if (orbitControls) orbitControls.enabled = true;
    });

    // Save Rig Event
    const saveRigBtn = document.getElementById('save-rig-btn');
    if (saveRigBtn) {
        saveRigBtn.addEventListener('click', () => {
            if (riggingManager) {
                riggingManager.saveConfig();
            }
        });
    }

    // Live Tracking Preview
    const tmPreviewTracking = document.getElementById('tm-preview-tracking');
    if (tmPreviewTracking) {
        tmPreviewTracking.addEventListener('change', async (e) => {
            if (e.target.checked) {
                console.log("Starting Live Preview...");
                const testConfig = { modelComplexity: 1, cameraMode: 'tpv' }; // TPV to see character
                if (!poseService.holistic) await poseService.initialize('webcam', 'preview-video', testConfig);
                await poseService.start();
            } else {
                console.log("Stopping Live Preview...");
                // poseService.stop() isn't exposed properly or just stops loop?
                // Actually poseService.close() might be too heavy?
                // Let's just set a flag or rely on existing toggle?
                // Looking at poseService.js (inferred), start() is loop.
                // We'll trust it handles restart or we just ignore?
                // Ideally stop. 
                // Since we don't have explicit stop in snippet, let's try `poseService.holistic.close()` if we want hard stop
                // OR better, just use the `isTestMode` check in onPoseUpdate?
                // No, onPoseUpdate checks `gameLoopActive`.

                // Let's reload page to be clean? No, that's annoying.
                // Reset Pose is enough if we stop feeding data.
                // Assuming poseService running is fine, just clear currentPose?
                if (character) character.resetPose();

                // FORCE STOP (If supported) - for now just reset pose and hope updateArmsLookAt isn't overly aggressive if no new data came in?
                // Actually if holisitic keeps sending data, it will override rest pose immediately.
                // We need to STOP poseService.
                // Assuming poseService.stop() or .close() exists. checking...
                if (poseService.close) await poseService.close();
                else if (poseService.stop) await poseService.stop();

                if (character) character.resetPose();
            }
        });
    }

    // Slider Updates
    function updateTestMarker() {
        if (!testMarker) return;
        const x = parseFloat(tmSlopeX.value);
        const y = parseFloat(tmSlopeY.value);
        const z = parseFloat(tmSlopeZ.value);

        tmValX.textContent = x;
        tmValY.textContent = y;
        tmValZ.textContent = z;

        testCameraOffset.set(x, y, z);
        testMarker.position.set(x, y, z);
    }

    [tmSlopeX, tmSlopeY, tmSlopeZ].forEach(el => {
        el.addEventListener('input', updateTestMarker);
    });

    async function initTestMode() {
        console.log("Starting Test Mode...");

        try {
            // Basic Setup
            scene.clear();
            world = new VoxelWorld(scene);
            world.setNightMode(false); // Day mode for visibility

            // Add Light for character
            const light = new THREE.DirectionalLight(0xffffff, 1);
            light.position.set(5, 10, 5);
            light.castShadow = true; // Enable shadow casting for the light
            light.shadow.mapSize.width = 1024; // default is 512
            light.shadow.mapSize.height = 1024; // default is 512
            light.shadow.camera.near = 0.5; // default
            light.shadow.camera.far = 50; // default
            light.shadow.camera.left = -10;
            light.shadow.camera.right = 10;
            light.shadow.camera.top = 10;
            light.shadow.camera.bottom = -10;
            scene.add(light);
            scene.add(light.target); // Add light target to scene for proper shadow calculation

            // Character
            character = new VoxelCharacter(scene);
            // Position character
            character.group.position.set(10, 1.5, 10); // Middle of starting area

            // Marker (Red Sphere)
            if (character.head) {
                const markerGeo = new THREE.SphereGeometry(0.05, 16, 16);
                const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, transparent: true });
                testMarker = new THREE.Mesh(markerGeo, markerMat);
                testMarker.renderOrder = 999;
                character.head.add(testMarker);

                // Set initial slider values
                testMarker.position.copy(testCameraOffset);
                tmSlopeX.value = testCameraOffset.x;
                tmSlopeY.value = testCameraOffset.y;
                tmSlopeZ.value = testCameraOffset.z;
                updateTestMarker();
            }

            // Orbit Controls
            if (THREE.OrbitControls) {
                orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
                orbitControls.target.copy(character.group.position);
                orbitControls.target.y += 1.5;
                orbitControls.enableDamping = true;
                orbitControls.dampingFactor = 0.05;

                // Initial Camera Pos
                camera.position.set(character.group.position.x + 3, character.group.position.y + 2, character.group.position.z + 3);
                orbitControls.update();
                // Initial Camera Pos
                camera.position.set(character.group.position.x + 3, character.group.position.y + 2, character.group.position.z + 3);
                orbitControls.update();
            }

            // Init Rigging Manager
            if (typeof RiggingManager !== 'undefined') {
                riggingManager = new RiggingManager(scene, camera, renderer, orbitControls);
                riggingManager.enable();

                // Pass loaded config to hands if already present
                if (character.leftHand) character.leftHand.setRigConfig(riggingManager.rigConfig);
                if (character.rightHand) character.rightHand.setRigConfig(riggingManager.rigConfig);
            }

            // Clear Zombies
            zombies = [];
            worldChests = [];

            // EQUIP SWORD FOR TEST - DISABLED (User wants to pick manually)
            /*
            if (character) {
                if (typeof Item === 'undefined') {
                    throw new Error("Item class is not defined! Check Item.js loading.");
                }
                const sword = new Item(scene, 'sword', new THREE.Vector3(0, -10, 0));
                character.equip(sword.mesh, 'sword');
            }
            */

            // WEAPON SLIDERS LOGIC
            const sliders = {
                wpX: document.getElementById('wp-x'),
                wpY: document.getElementById('wp-y'),
                wpZ: document.getElementById('wp-z'),
                wrX: document.getElementById('wr-x'),
                wrY: document.getElementById('wr-y'),
                wrZ: document.getElementById('wr-z'),
                hideWeapon: document.getElementById('hide-weapon'),
                // Hand Sliders
                hpS: document.getElementById('hp-s'),
                hpX: document.getElementById('hp-x'),
                hpY: document.getElementById('hp-y'),
                hpZ: document.getElementById('hp-z'),
                hrX: document.getElementById('hr-x'),
                hrY: document.getElementById('hr-y'),
                hrZ: document.getElementById('hr-z')
            };

            const updateWeaponTransform = () => {
                if (character && character.currentWeapon) {
                    const w = character.currentWeapon;

                    // Hide logic
                    if (sliders.hideWeapon.checked) {
                        w.visible = false;
                    } else {
                        w.visible = true;
                    }

                    // Update values display
                    document.getElementById('wp-val-x').textContent = sliders.wpX.value;
                    document.getElementById('wp-val-y').textContent = sliders.wpY.value;
                    document.getElementById('wp-val-z').textContent = sliders.wpZ.value;
                    document.getElementById('wr-val-x').textContent = sliders.wrX.value;
                    document.getElementById('wr-val-y').textContent = sliders.wrY.value;
                    document.getElementById('wr-val-z').textContent = sliders.wrZ.value;

                    // Apply to mesh
                    w.position.set(
                        parseFloat(sliders.wpX.value),
                        parseFloat(sliders.wpY.value),
                        parseFloat(sliders.wpZ.value)
                    );
                    w.rotation.set(
                        parseFloat(sliders.wrX.value),
                        parseFloat(sliders.wrY.value),
                        parseFloat(sliders.wrZ.value)
                    );
                }
            };

            const updateHandTransform = () => {
                if (character && character.leftHand && character.rightHand) {
                    // Update display
                    document.getElementById('hp-val-s').textContent = sliders.hpS.value;
                    document.getElementById('hp-val-x').textContent = sliders.hpX.value;
                    document.getElementById('hp-val-y').textContent = sliders.hpY.value;
                    document.getElementById('hp-val-z').textContent = sliders.hpZ.value;
                    document.getElementById('hr-val-x').textContent = sliders.hrX.value;
                    document.getElementById('hr-val-y').textContent = sliders.hrY.value;
                    document.getElementById('hr-val-z').textContent = sliders.hrZ.value;

                    const s = parseFloat(sliders.hpS.value);
                    const px = parseFloat(sliders.hpX.value);
                    const py = parseFloat(sliders.hpY.value);
                    const pz = parseFloat(sliders.hpZ.value);
                    const rx = parseFloat(sliders.hrX.value);
                    const ry = parseFloat(sliders.hrY.value);
                    const rz = parseFloat(sliders.hrZ.value);

                    // Apply to LEFT Hand
                    character.leftHand.group.scale.set(s, s, s);
                    character.leftHand.group.position.set(px, py, pz);
                    character.leftHand.group.rotation.set(rx, ry, rz);

                    // Apply to RIGHT Hand
                    character.rightHand.group.scale.set(s, s, s);
                    character.rightHand.group.position.set(px, py, pz);
                    character.rightHand.group.rotation.set(rx, ry, rz);
                }
            };

            // Bind listeners securely
            Object.values(sliders).forEach(el => {
                if (!el) return; // Guard against missing
                const newEl = el.cloneNode(true);
                el.parentNode.replaceChild(newEl, el);
                const id = newEl.id.replace(/-/g, '').replace('wp', 'wp').replace('hp', 'hp');

                // Special case for hideWeapon since it doesn't follow ID pattern exactly or we map it manual
                if (newEl.id === 'hide-weapon') {
                    sliders['hideWeapon'] = newEl;
                    newEl.onchange = updateWeaponTransform;
                } else {
                    sliders[id] = newEl;

                    // Determine handler
                    if (newEl.id.startsWith('wp') || newEl.id.startsWith('wr')) {
                        newEl.oninput = updateWeaponTransform;
                    } else {
                        newEl.oninput = updateHandTransform;
                    }
                }
            });

            // Re-map dictionary 
            sliders.wpX = document.getElementById('wp-x');
            sliders.wpY = document.getElementById('wp-y');
            sliders.wpZ = document.getElementById('wp-z');
            sliders.wrX = document.getElementById('wr-x');
            sliders.wrY = document.getElementById('wr-y');
            sliders.wrZ = document.getElementById('wr-z');
            sliders.hideWeapon = document.getElementById('hide-weapon');

            sliders.hpS = document.getElementById('hp-s');
            sliders.hpX = document.getElementById('hp-x');
            sliders.hpY = document.getElementById('hp-y');
            sliders.hpZ = document.getElementById('hp-z');
            sliders.hrX = document.getElementById('hr-x');
            sliders.hrY = document.getElementById('hr-y');
            sliders.hrZ = document.getElementById('hr-z');

            // Initialize Slider Values
            if (character.currentWeapon) {
                const w = character.currentWeapon;
                // Set Default Pose
                character.setIdlePose();
                const r = (v) => Math.round(v * 100) / 100;
                sliders.wpX.value = r(w.position.x);
                sliders.wpY.value = r(w.position.y);
                sliders.wpZ.value = r(w.position.z);
                sliders.wrX.value = r(w.rotation.x);
                sliders.wrY.value = r(w.rotation.y);
                sliders.wrZ.value = r(w.rotation.z);

                // Init Hide Checkbox
                if (sliders.hideWeapon.checked) w.visible = false;

                updateWeaponTransform();
            }

            // Initialize Hand Slider Values
            const activeHands = character.getActiveHands();
            if (activeHands.left) {
                const h = activeHands.left.group;
                const r = (v) => Math.round(v * 100) / 100;
                sliders.hpS.value = r(h.scale.x) || 1.2;
                sliders.hpX.value = r(h.position.x);
                sliders.hpY.value = r(h.position.y);
                sliders.hpZ.value = r(h.position.z);
                sliders.hrX.value = r(h.rotation.x);
                sliders.hrY.value = r(h.rotation.y);
                sliders.hrZ.value = r(h.rotation.z);
                // Force Update to ensure symmetry
                updateHandTransform();
            }

            // Start Loop
            updateGameMapList();
            gameLoopActive = true;
            orbitControls.update();

            // Show Voice UI
            const voiceUI = document.getElementById('voice-debug');
            if (voiceUI) voiceUI.style.display = 'block';

            animate();

        } catch (e) {
            console.error("TEST MODE ERROR:", e);
            alert("Ошибка запуска тест-режима: " + e.message);
        }
    }


    function createTable(scene, x, z, cachedWallMeshes) {
        const tableGroup = new THREE.Group();
        tableGroup.position.set(x, 0, z);

        // 1.75m (In between previous 1.1 and 3.5)
        const topHeight = 1.75;
        const topWidth = 5.0;
        const topDepth = 4.0;
        const topGeo = new THREE.BoxGeometry(topWidth, 0.6, topDepth);
        const topMat = new THREE.MeshLambertMaterial({ color: 0x5D4037 });
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.y = topHeight;
        top.receiveShadow = true;
        top.castShadow = true;

        // MARK FOR COLLISION SYSTEM
        top.userData.isWall = true;
        top.userData.sizeX = topWidth;
        top.userData.sizeZ = topDepth;
        top.userData.size = topWidth; // Fallback

        tableGroup.add(top);

        // THICK LEGS
        const legGeo = new THREE.BoxGeometry(0.8, topHeight, 0.8);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x3E2723 });
        const ox = topWidth / 2 - 0.5;
        const oz = topDepth / 2 - 0.5;
        [[-ox, -oz], [ox, -oz], [-ox, oz], [ox, oz]].forEach(off => {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(off[0], topHeight / 2, off[1]);
            leg.castShadow = true;
            tableGroup.add(leg);
        });

        scene.add(tableGroup);

        if (cachedWallMeshes) {
            cachedWallMeshes.push(top);
        }

        return topHeight + 0.3; // surface Y
    }

    async function initGame(config) {
        console.time("InitGame Total");
        try {
            // ... (rest of audio/ui setup)
            updateProgress(5);
            const loadingStatus = document.getElementById('loading-status');
            if (loadingStatus) loadingStatus.textContent = 'Очистка памяти...';

            // CLEAN SLATE
            localStorage.removeItem('custom_weapons');
            if (character) {
                character.currentWeapon = null;
                character.currentWeaponType = null;
                // Actually remove any children from hand anchors
                if (character.leftHandAnchor) character.leftHandAnchor.clear();
                if (character.rightHandAnchor) character.rightHandAnchor.clear();
            }

            if (loadingStatus) loadingStatus.textContent = 'Загрузка звуков...';

            // Audio Setup with progress
            if (!soundManager) {
                spellManager = new SpellManager(scene);
                soundManager = new SoundManager(camera);
                spellManager.setSoundManager(soundManager);
                await soundManager.loadSounds((p) => {
                    // Audio is 5-60% of progress
                    updateProgress(5 + (p * 55));
                    if (loadingStatus) loadingStatus.textContent = `Загрузка звуков: ${Math.round(p * 100)}%`;
                });
            } else {
                updateProgress(60);
            }

            if (loadingStatus) loadingStatus.textContent = 'Создание мира...';

            // Setup World
            scene.clear();
            world = new VoxelWorld(scene);
            if (config.mode === 'survival') world.setNightMode(true);
            else world.setNightMode(false);

            if (soundManager) soundManager.setScene(scene);

            character = new VoxelCharacter(scene);
            character.setFirstPerson(config.cameraMode === 'fpv');
            character.setShowHands(config.showHands);

            // Apply Hand Quality from UI
            const handQuality = document.getElementById('hand-quality');
            if (handQuality) {
                const mode = handQuality.value.includes('high') ? 'high' : 'low';
                character.setHandQuality(mode);
            }

            // Apply Hand Version (V2 or V3)
            if (config.handVersion) {
                character.setHandVersion(config.handVersion);
                console.log('Hand version set to:', config.handVersion);
            }
            // GLOBAL REGISTRATION
            window.character = character;
            window.spellManager = spellManager;
            window.soundManager = soundManager;

            // Sync UI Preview visibility
            const preview = document.getElementById('webcam-preview');
            if (preview) {
                preview.style.display = config.showHands ? 'block' : 'none';
            }

            updateProgress(65);

            // Show Voice UI
            const voiceUI = document.getElementById('voice-debug');
            if (voiceUI) voiceUI.style.display = 'block';

            // Flashlight Logic
            if (flashlight) {
                if (flashlight.parent) flashlight.parent.remove(flashlight);
                flashlight = null;
            }
            if (config.mode === 'survival') {
                flashlight = new THREE.SpotLight(0xffffff, 2); // 2x less bright (was 4)
                flashlight.position.set(0, 0, 0);
                flashlight.angle = Math.PI / 3; // Even wider (was PI/4)
                flashlight.penumbra = 1.0; // Max softness
                flashlight.decay = 2;
                flashlight.distance = 60; // Increased from 50
                flashlight.castShadow = true;

                // SHADOW TUNING (Fix "blocky" artifacts)
                flashlight.shadow.bias = -0.0001;
                flashlight.shadow.mapSize.width = 1024;
                flashlight.shadow.mapSize.height = 1024;

                // Attach to camera (head)
                camera.add(flashlight);
                flashlight.target.position.set(0, 0, -5);
                camera.add(flashlight.target);
                // Camera is already in scene? No, usually camera is just used in render.
                // But if we attach light to camera, camera need to be "in logic" or light added to scene?
                // ThreeJS: Lights children of camera work fine if camera is rendered.
                scene.add(camera);
                initGlobalSystems(scene);
            }

            updateProgress(50);

            // UPDATE PERFORMANCE-HEAVY POSE IN MAIN LOOP
            // This is handled in the main animation loop now,
            // and `firstPoseReceived` will ensure we wait for actual data.
            // if (currentPose) {
            //     character.updateArmsLookAt(currentPose);
            // }

            // Zombies Init
            zombies = [];
            worldChests = [];
            lastSpawnTime = Date.now(); // Reset spawn timer
            let initialZombies = 0;

            let mapSpawnData = null;

            if (config.map) {
                // CUSTOM MAP LOAD (Combined with Mode)
                mapSpawnData = world.loadFromMap(config.map);

                // Spawn player
                if (mapSpawnData.playerSpawn) {
                    character.group.position.copy(mapSpawnData.playerSpawn);
                }

                // Walls
                gameWalls = mapSpawnData.walls || [];
                const gridSize = mapSpawnData.gridSize || 20;
                for (let x = 0; x < gridSize; x++) {
                    for (let z = 0; z < gridSize; z++) {
                        if (x === 0 || z === 0 || x === gridSize - 1 || z === gridSize - 1) {
                            if (!gameWalls.some(w => w.x === x && w.z === z)) {
                                gameWalls.push({ x, z });
                            }
                        }
                    }
                }

                // Zombies (From Map)
                mapSpawnData.zombieSpawns.forEach((pos, i) => {
                    const zomb = new Zombie(scene, pos.clone(), i);
                    zomb.setSleeping(true);
                    zombies.push(zomb);
                });

                // Chests
                mapSpawnData.chests.forEach(c => {
                    const chestPos = c.position.clone();
                    chestPos.y = 0.5;
                    const chest = new Chest(scene, chestPos, c.item);
                    worldChests.push(chest);
                });

                // Win Point
                config.winPoint = mapSpawnData.winPoint;

            } else {
                // STANDARD GENERATION (No Map Selected)
                if (config.mode === 'creative') {
                    initialZombies = config.zombieCount;
                    for (let i = 0; i < initialZombies; i++) spawnZombie(i);
                } else {
                    // Survival Default Spawns
                    initialZombies = 1;
                    survivalZombieTarget = 1;
                    for (let i = 0; i < initialZombies; i++) spawnZombie(i);
                }
            }

            // APPLY MODE RULES (Standardize Survival/Maps to 20HP)
            if (config.mode === 'survival' || config.map) {
                maxHP = 20;
            } else {
                // Creative
                maxHP = 20; // Keep 20HP standard for consistency
            }

            playerHP = maxHP;
            killCount = 0;
            punchCount = 0;
            updateHUD();

            // HAND VISIBILITY (Use setShowHands method which handles versioning)
            character.setShowHands(!!config.showHands);

            // Optimization: Cache wall meshes early for table logic
            cachedWallMeshes = [];
            scene.traverse(obj => {
                if (obj.isMesh && obj.userData && obj.userData.isWall) cachedWallMeshes.push(obj);
            });

            // TABLES & ITEMS (RE-INIT FOR VISIBILITY)
            worldItems = [];
            if (!config.map) {
                // TableZ = -5.0 (Visible in front)
                const tableZ = -5.0;
                const surface1 = createTable(scene, -7, tableZ, cachedWallMeshes);
                const axe = new Item(scene, 'axe', new THREE.Vector3(-7, surface1, tableZ));
                // SCALE ITEM TO 4X (Same as when held)
                axe.mesh.scale.set(4, 4, 4);
                axe.mesh.rotation.set(Math.PI / 2, 0, Math.PI / 4);
                axe.isStatic = true;
                worldItems.push(axe);

                const surface2 = createTable(scene, 7, tableZ, cachedWallMeshes);
                const sword = new Item(scene, 'sword', new THREE.Vector3(7, surface2, tableZ));
                // SCALE ITEM TO 4X (Same as when held)
                sword.mesh.scale.set(4, 4, 4);
                // Rotated 180 on X axis so handle faces player
                sword.mesh.rotation.set(-Math.PI / 2, 0, -Math.PI / 4);
                sword.isStatic = true;
                worldItems.push(sword);
            }

            // REMOVED AUTO-EQUIP
            localStorage.removeItem('custom_weapons');


            if (loadingStatus) loadingStatus.textContent = 'Инициализация камеры...';
            updateProgress(70);

            // Pose
            await poseService.initialize('webcam', 'preview-video', config);
            await poseService.start();

            if (loadingStatus) loadingStatus.textContent = 'Компиляция шейдеров...';
            updateProgress(90);

            // PRE-COMPILE SHADERS (Fix Freeze)
            console.time("Shader Compile");
            renderer.compile(scene, camera);
            console.timeEnd("Shader Compile");

            updateProgress(100);
            if (loadingStatus) loadingStatus.textContent = 'Готово!';

            // Ensure progress is visible before hiding
            console.time("Wait Frames");
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            console.timeEnd("Wait Frames");

            // START GAME LOOP
            gameLoopActive = true;
            gameStartTime = performance.now();
            cameraBaseRotation = 0; // Reset for Creative/Maps consistency

            // Optimization: Cache wall meshes (Include tables!)
            cachedWallMeshes = [];
            scene.traverse(obj => {
                if (obj.isMesh && obj.userData && obj.userData.isWall) {
                    cachedWallMeshes.push(obj);
                }
            });

            animate();

            // WAIT FOR FIRST POSE BEFORE HIDING
            const checkPose = setInterval(() => {
                if (loadingStatus) loadingStatus.textContent = 'Ожидание первого кадра камеры...';
                if (firstPoseReceived) {
                    clearInterval(checkPose);
                    console.log("First pose received, hiding loading screen");

                    // REVEAL GAME UI
                    loadingScreen.classList.add('hidden');
                    loadingScreen.style.display = 'none';
                    hud.classList.remove('hidden');

                    // DEFER non-critical map list update
                    setTimeout(() => {
                        updateGameMapList();
                    }, 500);
                }
            }, 100);

            // Safety timeout for loading screen (10 seconds)
            setTimeout(() => {
                if (loadingScreen.style.display !== 'none') {
                    console.warn("Loading screen safety timeout triggered");
                    loadingScreen.classList.add('hidden');
                    loadingScreen.style.display = 'none';
                    hud.classList.remove('hidden');
                }
            }, 10000);

            console.timeEnd("InitGame Total");

            // CREATIVE MODE UI TWEAK: Hide HP
            const hpContainer = document.getElementById('hp-container');
            if (hpContainer) {
                if (config.mode === 'creative') {
                    hpContainer.classList.add('hidden');
                } else {
                    hpContainer.classList.remove('hidden');
                }
            }

            // --- INITIALIZATION COMPLETE ---

        } catch (error) {
            console.error("INIT ERROR:", error);
            if (loadingScreen && loadingScreen.querySelector('p')) {
                loadingScreen.querySelector('p').textContent = 'Error: ' + error.message;
            }
            setTimeout(() => location.reload(), 3000);
        }
    }

    function spawnZombie(id) {
        // Normal Mode Spawning: Radius 50m around player
        const radius = 50;
        const angle = Math.random() * Math.PI * 2;
        const dist = 10 + Math.random() * (radius - 10); // Min 10m, Max 50m

        // Calculate position relative to player
        const playerPos = character ? character.group.position : new THREE.Vector3(0, 0, 0);
        const spawnX = playerPos.x + Math.sin(angle) * dist;
        const spawnZ = playerPos.z + Math.cos(angle) * dist;

        const startPos = new THREE.Vector3(spawnX, 0, spawnZ);
        const zombie = new Zombie(scene, startPos, id);
        zombies.push(zombie);
    }

    function showVictoryScreen(score) {
        document.getElementById('victory-score').innerText = `Счет: ${score}`;
        document.getElementById('victory-screen').classList.remove('hidden');
        document.exitPointerLock();
    }

    // Wire up victory menu button
    const victoryMenuBtn = document.getElementById('victory-menu-btn');
    if (victoryMenuBtn) {
        victoryMenuBtn.onclick = () => {
            window.location.href = window.location.origin + window.location.pathname;
        };
    }

    // Add map list to game tab for playing
    // Add map list to game tab for playing
    async function updateGameMapList(forceRefresh = false) {
        console.log("updateGameMapList called");
        const gameTab = document.getElementById('tab-game');
        let mapListDiv = document.getElementById('game-map-list');

        // Ensure container exists
        if (!mapListDiv) {
            mapListDiv = document.createElement('div');
            mapListDiv.id = 'game-map-list';
            gameTab.appendChild(mapListDiv);
        }

        // Reset container content
        mapListDiv.innerHTML = '';

        try {
            if (!cachedMaps || forceRefresh) {
                const response = await fetch('/api/maps');
                cachedMaps = await response.json();
            }
            const maps = cachedMaps;
            let mapNames = Object.keys(maps);

            // Load and Apply Custom Order (User Request: Move maps)
            let mapOrder = JSON.parse(localStorage.getItem('mapOrder') || '[]');

            // Clean order from deleted maps
            mapOrder = mapOrder.filter(n => mapNames.includes(n));

            // Sort mapNames based on order + append new ones
            const remainingNames = mapNames.filter(n => !mapOrder.includes(n)).sort();
            const sortedNames = [...mapOrder, ...remainingNames];

            // Save cleaned order back
            localStorage.setItem('mapOrder', JSON.stringify(sortedNames));

            if (mapNames.length === 0 && false) {
                mapListDiv.innerHTML += '<p style="color:#666;">Нет сохранённых карт</p>';
                return;
            }

            // Create Grid Container
            const grid = document.createElement('div');
            grid.className = 'map-list-grid';
            mapListDiv.appendChild(grid);

            // Drag and Drop Logic REMOVED from Game Tab


            // 1. Map Cards first (Moved modes later)
            sortedNames.forEach(name => {
                const mapData = maps[name];

                // Card Container
                const card = document.createElement('div');
                card.className = 'map-card';
                card.dataset.name = name;

                // Canvas Preview
                const cvs = document.createElement('canvas');
                cvs.className = 'map-preview-canvas';
                cvs.width = 80;
                cvs.height = 80;

                // Draw Preview
                const ctx = cvs.getContext('2d');
                const cellSize = 80 / (mapData.gridSize || 20);

                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, 80, 80);

                if (mapData.walls) {
                    ctx.fillStyle = '#5D4037';
                    mapData.walls.forEach(w => {
                        ctx.fillRect(w.x * cellSize, w.z * cellSize, cellSize, cellSize);
                    });
                }
                if (mapData.playerSpawn) {
                    ctx.fillStyle = '#4CAF50';
                    ctx.beginPath();
                    ctx.arc((mapData.playerSpawn.x + 0.5) * cellSize, (mapData.playerSpawn.z + 0.5) * cellSize, cellSize / 2, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Delete Button REMOVED (Moved to Editor)

                // Name
                const nameDiv = document.createElement('div');
                nameDiv.className = 'map-name';
                nameDiv.innerText = name;
                // Renaming REMOVED (Moved to Editor if needed, but request didn't specify renaming, only moved reorder and delete)

                // Assemble
                card.appendChild(cvs);
                card.appendChild(nameDiv);

                if (selectedMap && selectedMap.name === name) {
                    card.style.borderColor = '#e74c3c';
                    card.style.boxShadow = '0 0 15px #e74c3c';
                }

                card.onclick = () => {
                    if (selectedMap && selectedMap.name === name) {
                        selectedMap = null;
                        selectedMode = 'creative';
                        updateGameMapList();
                    } else {
                        selectedMap = mapData;
                        selectedMap.name = name;
                        selectedMode = 'survival';
                        updateGameMapList();
                    }
                };

                grid.appendChild(card);
            });

            // 2. ADD SPECIAL MODE CARDS AT THE END
            const modes = [
                { id: 'creative', name: 'ТВОРЧЕСТВО', class: 'mode-card' },
                { id: 'survival', name: 'ВЫЖИВАНИЕ', class: 'mode-card survival' }
            ];

            modes.forEach(m => {
                const card = document.createElement('div');
                card.className = `map-card ${m.class}`;
                if (selectedMode === m.id && !selectedMap) {
                    card.style.borderColor = (m.id === 'creative') ? '#2ecc71' : '#e74c3c';
                    card.style.boxShadow = `0 0 15px ${(m.id === 'creative') ? '#2ecc71' : '#e74c3c'}`;
                }

                const icon = document.createElement('div');
                icon.style.fontSize = '40px';
                icon.style.margin = '10px 0';
                icon.innerText = (m.id === 'creative') ? '🏗️' : '🧟';

                const nameDiv = document.createElement('div');
                nameDiv.className = 'map-name';
                nameDiv.innerText = m.name;

                card.appendChild(icon);
                card.appendChild(nameDiv);

                card.onclick = () => {
                    selectedMode = m.id;
                    selectedMap = null;
                    updateGameMapList();
                };
                grid.appendChild(card);
            });


            if (creativeSettings) {
                creativeSettings.style.display = (selectedMode === 'creative') ? 'block' : 'none';
            }


        } catch (e) {
            console.error("Error fetching maps:", e);
            mapListDiv.innerHTML += '<p style="color:#e74c3c;">Ошибка загрузки списка карт</p>';
        }
    }
    window.updateGameMapList = updateGameMapList;


    function spawnZombie(idOverride) {
        // FRONTAL SPAWN: Spawn in front of player (within 90 deg arc)
        // Player faces -Z direction in Three.js convention
        // rotation.y = 0 means facing -Z
        const playerRot = character.group.rotation.y;

        // Random angle within -45 to +45 degrees of player facing direction
        const angleOffset = (Math.random() - 0.5) * (Math.PI / 2); // -45 to +45 deg
        // Player forward is at angle (playerRot + PI) because they face -Z
        const spawnAngle = playerRot + Math.PI + angleOffset;

        const dist = 50 + Math.random() * 30; // Min 50m spawn
        const x = character.group.position.x + Math.sin(spawnAngle) * dist;
        const z = character.group.position.z + Math.cos(spawnAngle) * dist;

        const id = (idOverride !== undefined) ? idOverride : Date.now() + Math.random();
        const zomb = new Zombie(scene, new THREE.Vector3(x, 0.5, z), id);
        zombies.push(zomb);
    }

    function updateProgress(percent) {
        if (progressBar) progressBar.style.width = `${percent}%`;
    }

    function updateHUD() {
        hpText.textContent = `HP: ${playerHP}/${maxHP}`;
        const pct = (playerHP / maxHP) * 100;
        hpBarFill.style.width = `${pct}%`;

        killCountEl.textContent = killCount;
        punchCountEl.textContent = punchCount;
    }

    function gameOver() {
        gameLoopActive = false;
        hud.classList.add('hidden');
        gameOverScreen.classList.remove('hidden');
        goKills.textContent = killCount;
        goPunches.textContent = punchCount;
        if (soundManager) soundManager.enabled = false;

        // Clean up Voice on Game Over
        isMagicActive = false;
        magicHand = null;
        if (!isMenuVoiceActive) voiceService.stop();
    }

    if (restartBtn) {
        restartBtn.onclick = () => {
            console.log("Restarting game via manual RELOAD...");
            window.location.href = window.location.origin + window.location.pathname;
        };
    }

    function triggerDamageFlash() {
        const flash = document.getElementById('damage-flash');
        if (flash) {
            flash.classList.remove('hidden');
            flash.classList.remove('active');
            void flash.offsetWidth; // Force reflow
            flash.classList.add('active');
        }
    }

    const raycasterLoS = new THREE.Raycaster();
    function canSeePlayer(zombie, playerPos) {
        // Optimization: Rate limit Raycasting (Max once every 10 frames per zombie)
        // AND skip if very far
        if (zombie.lastDistSq > 2500) return false;
        const frameIdx = Math.floor((frameCount + (zombie.id || 0) * 3) % 10);
        if (frameIdx !== 0 && zombie.lastLoSResult !== undefined) return zombie.lastLoSResult;

        if (!cachedWallMeshes || cachedWallMeshes.length === 0) {
            zombie.lastLoSResult = true;
            return true;
        }

        const start = zombie.group.position.clone(); start.y += 1.5;
        const end = playerPos.clone(); end.y += 1.0;

        raycasterLoS.set(start, new THREE.Vector3().subVectors(end, start).normalize());
        raycasterLoS.far = start.distanceTo(end);

        const intersects = raycasterLoS.intersectObjects(cachedWallMeshes, false);
        zombie.lastLoSResult = (intersects.length === 0);
        return zombie.lastLoSResult;
    }

    // --- POSE & LOGIC ---
    poseService.onPoseUpdate = (poseData) => {
        if (!gameLoopActive) return;
        currentPose = poseData;
        firstPoseReceived = true; // Signal for loading screen
    };

    // Wall collision helper
    function checkWallCollision(pos, walls, radius = 1.5) {
        if (!walls || walls.length === 0) return false;
        for (const wall of walls) {
            const halfSize = wall.size / 2 + radius;
            if (Math.abs(pos.x - wall.x) < halfSize && Math.abs(pos.z - wall.z) < halfSize) {
                return wall; // Return the wall that's blocking
            }
        }
        return null;
    }

    // OPTIMIZED COLLISION RESOLVER
    function resolveWallCollision(objectGroup, walls, radius) {
        const pos = objectGroup.position;
        const nearbyWalls = [];
        const checkDist = 6.0;

        const worldPos = new THREE.Vector3();

        for (const wall of walls) {
            let wx, wz;
            if (wall.isMesh) {
                wall.getWorldPosition(worldPos);
                wx = worldPos.x;
                wz = worldPos.z;
            } else {
                wx = wall.x !== undefined ? wall.x : wall.position.x;
                wz = wall.z !== undefined ? wall.z : wall.position.z;
            }

            if (Math.abs(pos.x - wx) < checkDist && Math.abs(pos.z - wz) < checkDist) {
                nearbyWalls.push({ wall, wx, wz });
            }
        }
        if (nearbyWalls.length === 0) return;

        for (let pass = 0; pass < 2; pass++) {
            let collided = false;
            for (const entry of nearbyWalls) {
                const { wall, wx, wz } = entry;
                const wSize = wall.size !== undefined ? wall.size : (wall.userData ? wall.userData.size : 1.6);

                const halfSize = wSize / 2 + radius;
                const dx = pos.x - wx;
                const dz = pos.z - wz;

                if (Math.abs(dx) < halfSize && Math.abs(dz) < halfSize) {
                    collided = true;
                    const penX = halfSize - Math.abs(dx);
                    const penZ = halfSize - Math.abs(dz);

                    if (penX < penZ) {
                        pos.x += Math.sign(dx) * penX;
                    } else {
                        pos.z += Math.sign(dz) * penZ;
                    }
                }
            }
            if (!collided) break;
        }
    }

    // --- INPUTS ---
    window.addEventListener('keydown', (e) => {
        if (!gameLoopActive) return;

        // Manual Spell Debug
        if (e.key.toLowerCase() === 'm') {
            console.log("DEBUG: Casting Inferno");
            const origin = character.head.position.clone();
            character.group.localToWorld(origin);
            const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(character.group.quaternion);
            spellManager.castSpell('инферно', origin, dir, zombies);
        }

        if (e.key.toLowerCase() === 'f') {
            if (!flashlight && character.head) {
                // Create flashlight
                flashlight = new THREE.SpotLight(0xffffff, 1, 100, Math.PI * 0.1, 0.5, 2);
                flashlight.position.set(0, 0, 0); // Relative to head
                flashlight.target.position.set(0, 0, -1); // Point forward
                character.head.add(flashlight);
                character.head.add(flashlight.target);
            } else if (flashlight) {
                // Toggle flashlight
                flashlight.visible = !flashlight.visible;
            }
        }
    });

    function animate() {
        if (!gameLoopActive) return;
        requestAnimationFrame(animate);

        try {
            const now = performance.now();
            const deltaTime = (now - lastTime) / 1000;
            lastTime = now;

            // SAFETY: Cap deltaTime to prevent huge jumps after freeze/lag
            const safeDelta = Math.min(deltaTime, 0.1);

            // Update Particle & Part Systems (Optimization 3 & 4)
            if (window.updateParticles) window.updateParticles(safeDelta);
            if (window.updateFlyingParts) window.updateFlyingParts(safeDelta);

            frameCount++;

            // FPS COUNTER (Accurate Rolling Average)
            fpsTimeAccumulator += deltaTime;
            if (frameCount % 20 === 0) {
                const fps = Math.round(20 / fpsTimeAccumulator);
                fpsTimeAccumulator = 0;
                const fpsEl = document.getElementById('fps-counter');
                if (fpsEl) {
                    fpsEl.innerText = `FPS: ${fps}`;
                    fpsEl.style.color = fps > 50 ? '#00ff00' : (fps > 25 ? '#ffff00' : '#ff0000');
                }
            }

            // POSE UPDATE (Moved from onPoseUpdate for FPS/Smoothness)
            if (currentPose) {
                // 1. Smooth Head Logic
                if (currentPose.headRotation) {
                    if (!character.smoothHead) character.smoothHead = { yaw: 0, pitch: 0 };

                    const targetYaw = currentPose.headRotation.yaw * cameraSensitivity;
                    const targetPitch = currentPose.headRotation.pitch * cameraSensitivity;

                    let activeAlpha = cameraSmoothness;
                    if (currentPose.isRunning) activeAlpha = Math.min(cameraSmoothness, 0.1);

                    character.smoothHead.yaw += (targetYaw - character.smoothHead.yaw) * activeAlpha;
                    character.smoothHead.pitch += (targetPitch - character.smoothHead.pitch) * activeAlpha;

                    // drifting mode
                    if (driftingCameraMode) {
                        const driftThreshold = 0.1;
                        if (Math.abs(character.smoothHead.yaw) > driftThreshold) {
                            cameraBaseRotation += character.smoothHead.yaw * 0.1;
                        }
                        character.setBodyRotation(cameraBaseRotation);
                        character.updateHeadRotation(character.smoothHead.yaw, character.smoothHead.pitch);
                    } else {
                        character.updateHeadRotation(character.smoothHead.yaw, character.smoothHead.pitch);
                        if (currentPose.bodyRotation !== undefined) {
                            if (!character.smoothBody) character.smoothBody = 0;
                            character.smoothBody += (currentPose.bodyRotation - character.smoothBody) * activeAlpha;
                            character.setBodyRotation(character.smoothBody);
                        }
                    }
                }

                // 2. Arms & Movement
                character.updateArmsLookAt(currentPose);
                character.setCrouching(currentPose.isCrouching);
                character.setRunning(currentPose.isRunning, currentPose.runIntensity);
            }

            character.update(safeDelta);

            // Wall collision for player (Include Map Walls & Tables)
            if (gameWalls && gameWalls.length > 0) {
                resolveWallCollision(character.group, gameWalls, 0.48);
            }
            if (cachedWallMeshes && cachedWallMeshes.length > 0) {
                resolveWallCollision(character.group, cachedWallMeshes, 0.48);
            }
            // Chest Collision (Hard Stop)
            if (worldChests && worldChests.length > 0) {
                const pPos = character.getPosition();
                for (const chest of worldChests) {
                    chest.update(safeDelta); // ANIMATION UPDATE (Moved from onPoseUpdate)

                    const halfW = 1.8 + 0.5;
                    const halfD = 1.2 + 0.5;
                    const dx = pPos.x - chest.getPosition().x;
                    const dz = pPos.z - chest.getPosition().z;

                    // Interaction Check (Opening) - Moved from onPoseUpdate
                    if (!chest.isOpen && dist3d(pPos, chest.getPosition()) < 4.5) {
                        // We can't easily trigger opening here without a trigger event...
                        // Actually, let's keep interaction separate or check for specific pose state?
                        // The original code passed 'poseData' to check interactions? No.
                        // It just checked distance. But we don't want to auto-open chests just by standing near them?
                        // Original code: if (dist < 4.5 && !chest.isOpen) { chest.open() ... }
                        // Wait, that means chests AUTO OPENED?
                        // Let's preserve that behavior for now.
                        const itemData = chest.open();
                        if (itemData && itemData.mesh) {
                            character.equip(itemData.mesh, itemData.type);
                            // REMOVED soundManager.playHit() - incorrect sound
                        }
                    }


                    if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
                        const penX = halfW - Math.abs(dx);
                        const penZ = halfD - Math.abs(dz);
                        if (penX < penZ) {
                            character.group.position.x = chest.getPosition().x + Math.sign(dx) * halfW;
                        } else {
                            character.group.position.z = chest.getPosition().z + Math.sign(dz) * halfD;
                        }
                    }
                }
            }

            // VICTORY CHECK (Custom Map) - Moved to animate
            if (config.mode === 'custom' && config.winPoint) {
                // winPoint is now Vector3 from World.js loadFromMap
                const charPos = character.getPosition();
                // Check if close to win point (radius 2.0)
                // We use 2D distance (X, Z) just in case Y differs slightly
                const dx = charPos.x - config.winPoint.x;
                const dz = charPos.z - config.winPoint.z;
                if (Math.sqrt(dx * dx + dz * dz) < 2.0) {
                    showVictoryScreen(killCount * 100 + (playerHP * 50));
                    gameLoopActive = false;
                }
            }

            // WEAPON VS TABLE COLLISION (Only weapon, not hands - hands use tracking)
            if (cachedWallMeshes && cachedWallMeshes.length > 0 && character.currentWeapon) {
                const tablePos = new THREE.Vector3();
                for (const wall of cachedWallMeshes) {
                    wall.getWorldPosition(tablePos);
                    const halfX = (wall.userData.sizeX || wall.userData.size || 2) / 2;
                    const halfZ = (wall.userData.sizeZ || wall.userData.size || 2) / 2;
                    const surfaceY = tablePos.y + 0.4;

                    // Check weapon tip position
                    const tipPos = character.getWeaponTipPosition();
                    if (tipPos) {
                        if (Math.abs(tipPos.x - tablePos.x) < halfX + 0.8 &&
                            Math.abs(tipPos.z - tablePos.z) < halfZ + 0.8) {
                            if (tipPos.y < surfaceY) {
                                const pen = surfaceY - tipPos.y;
                                // Push the HAND ANCHOR up to lift the whole weapon
                                const anchor = character.currentHandSide === 'left'
                                    ? character.leftHandAnchor
                                    : character.rightHandAnchor;
                                if (anchor) {
                                    anchor.position.y += pen * 0.6;
                                }
                            }
                        }
                    }

                    // Also check weapon center
                    const wpnWorld = new THREE.Vector3();
                    character.currentWeapon.getWorldPosition(wpnWorld);
                    if (Math.abs(wpnWorld.x - tablePos.x) < halfX + 0.6 &&
                        Math.abs(wpnWorld.z - tablePos.z) < halfZ + 0.6) {
                        if (wpnWorld.y < surfaceY) {
                            const pen = surfaceY - wpnWorld.y;
                            const anchor = character.currentHandSide === 'left'
                                ? character.leftHandAnchor
                                : character.rightHandAnchor;
                            if (anchor) {
                                anchor.position.y += pen * 0.4;
                            }
                        }
                    }
                }
            }

            // Update Items (Float) & Precise Pickup Check
            if (worldItems && worldItems.length > 0) {
                worldItems.forEach(item => {
                    item.update(safeDelta, cachedWallMeshes);
                    
                    if (item.grabState === 'free') {
                        const timeSinceStart = (performance.now() - gameStartTime) / 1000;
                        if (timeSinceStart > 3.0) {
                            const activeHands = character.getActiveHands();
                            const checkHands = [
                                { side: 'left', hand: activeHands.left, anchor: character.leftHandAnchor },
                                { side: 'right', hand: activeHands.right, anchor: character.rightHandAnchor }
                            ];

                            const itemSegments = item.getSegments();
                            for (const hInfo of checkHands) {
                                const { hand, anchor, side } = hInfo;
                                if (!hand || !hand.group.visible) continue;

                                // Use palm anchor's world position as the reference for grab trigger
                                const palmPos = new THREE.Vector3();
                                const targetAnchor = (hand && hand.palm) ? hand.palm : anchor;
                                targetAnchor.getWorldPosition(palmPos);

                                const curl = hand.currentState.fingers.index;
                                const isGrabbingGesture = curl > 0.5;

                                // Find the handle segment of the item
                                const handleSeg = itemSegments.find(seg => seg.part === 'handle') || itemSegments[0];
                                if (!handleSeg) continue;

                                // Compute closest point on handle segment to palm position
                                const v = new THREE.Vector3().subVectors(handleSeg.end, handleSeg.start);
                                const w = new THREE.Vector3().subVectors(palmPos, handleSeg.start);
                                const c1 = w.dot(v);
                                const c2 = v.dot(v);

                                let closestOnHandle;
                                let t = 0.5; // Default grip offset ratio
                                if (c1 <= 0) {
                                    closestOnHandle = handleSeg.start.clone();
                                    t = 0;
                                } else if (c2 <= c1) {
                                    closestOnHandle = handleSeg.end.clone();
                                    t = 1.0;
                                } else {
                                    t = c1 / c2;
                                    closestOnHandle = new THREE.Vector3().addVectors(handleSeg.start, v.clone().multiplyScalar(t));
                                }

                                const distToPalm = palmPos.distanceTo(closestOnHandle);

                                // Robust Grab Trigger zone: 0.7 units (about 70cm)
                                if (distToPalm < 0.7) {
                                    if (isGrabbingGesture) {
                                        // Trigger grab transition!
                                        item.startGrabTransition(hand, targetAnchor, side, t);
                                        break;
                                    }
                                }

                                // Apply subtle physics/collision push if hand touches weapon but doesn't grab it
                                const handBoxes = hand.getCollisionBoxes();
                                for (const hb of handBoxes) {
                                    const hPos = new THREE.Vector3();
                                    hb.box.getCenter(hPos);

                                    for (const seg of itemSegments) {
                                        const segV = new THREE.Vector3().subVectors(seg.end, seg.start);
                                        const segW = new THREE.Vector3().subVectors(hPos, seg.start);
                                        const segC1 = segW.dot(segV);
                                        const segC2 = segV.dot(segV);

                                        let segClosest;
                                        if (segC1 <= 0) segClosest = seg.start.clone();
                                        else if (segC2 <= segC1) segClosest = seg.end.clone();
                                        else segClosest = new THREE.Vector3().addVectors(seg.start, segV.clone().multiplyScalar(segC1 / segC2));

                                        const segDist = hPos.distanceTo(segClosest);
                                        const minR = seg.radius + 0.12;

                                        if (segDist < minR) {
                                            const pushDir = new THREE.Vector3().subVectors(hPos, segClosest).normalize();
                                            // If hand is above the item, prevent it from pushing the item downwards into the table/ground
                                            if (pushDir.y > 0) {
                                                pushDir.y = 0;
                                                if (pushDir.lengthSq() > 0.0001) {
                                                    pushDir.normalize();
                                                } else {
                                                    pushDir.set(0, 0, 0);
                                                }
                                            }
                                            const pen = minR - segDist;

                                            // Physically push the ITEM slightly
                                            item.mesh.position.sub(pushDir.clone().multiplyScalar(pen * 0.4));
                                            item.velocity.add(pushDir.clone().multiplyScalar(0.04));
                                            item.isStatic = false;

                                            // Visually block the hand anchor
                                            if (anchor.parent) {
                                                const parentQuat = new THREE.Quaternion();
                                                anchor.parent.getWorldQuaternion(parentQuat);
                                                const localPush = pushDir.clone().applyQuaternion(parentQuat.invert());
                                                anchor.position.add(localPush.multiplyScalar(pen * 1.0));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else if (item.grabState === 'grabbed') {
                        // AUTO-DROP (As in reality: open hand = drop)
                        const side = character.currentHandSide;
                        const activeHands = character.getActiveHands();
                        const hand = side === 'left' ? activeHands.left : activeHands.right;

                        // Drop if fingers are open
                        if (hand && hand.currentState.fingers.index < 0.3) {
                            character.dropWeapon();
                        }
                    }
                });
            }


            // Decrement player attack cooldown
            if (playerAttackCooldown > 0) {
                playerAttackCooldown -= safeDelta;
            }


            // Update Zombies & Combat
            const charPos = character.getPosition();
            const poseData = currentPose;
            const isPlayerPunching = !!(poseData && poseData.isPunching);
            const hasWeapon = character.currentWeaponType === 'axe' || character.currentWeaponType === 'sword' || character.currentWeaponType === 'custom';

            zombies.forEach(zombie => {
                const zombiePos = zombie.group.position;
                // 1. Process Update (Movement/AI)
                // Pass camera for clipping checks (User Request)
                zombie.update(safeDelta, charPos, camera);
                const distSq = zombie.lastDistSq; // Use cached value from zombie.update

                // 2. Sleeping Logic
                if (zombie.sleeping) {
                    if (distSq < 900) { // 30m distance squared
                        if (canSeePlayer(zombie, charPos)) {
                            zombie.setSleeping(false);
                        }
                    }
                    return;
                }

                if (zombie.isDead) return;

                // 3. Wall Collision
                if (gameWalls && gameWalls.length > 0) {
                    resolveWallCollision(zombie.group, gameWalls, 0.88);
                }

                // 4. Player-Zombie Collision (Fix "sticking" and "jumping")
                const collisionRadius = 1.3;
                const dist = Math.sqrt(distSq);
                if (dist < collisionRadius) {
                    // FORCE GROUNDING: Prevent zombie from "jumping" on player's head
                    zombie.group.position.y = 0.5;

                    const overlap = collisionRadius - dist;
                    const angle = Math.atan2(charPos.z - zombiePos.z, charPos.x - zombiePos.x);

                    // Aggressive separating force (increased to 0.6)
                    character.group.position.x += Math.cos(angle) * overlap * 0.6;
                    character.group.position.z += Math.sin(angle) * overlap * 0.6;
                    zombie.group.position.x -= Math.cos(angle) * overlap * 0.4;
                    zombie.group.position.z -= Math.sin(angle) * overlap * 0.4;

                    // Prevent vertical sticking
                    if (Math.abs(character.group.position.y - zombie.group.position.y) < 1.0) {
                        zombie.group.position.y = 0.5;
                    }
                }

                // 5. Combat Logic (Hit detection)
                if (isPlayerPunching && zombie.damageCooldown <= 0 && playerAttackCooldown <= 0) {
                    // Optimized hit check: only do weapon tip check if zombie is within 5m
                    if (distSq < 25) {
                        const weaponHit = hasWeapon && character.checkWeaponHit(new THREE.Vector3(zombiePos.x, zombiePos.y + 1, zombiePos.z), 3.0);
                        const fistHit = !hasWeapon && dist < 3.0;

                        if (weaponHit || fistHit) {
                            punchCount++;
                            playerAttackCooldown = 0.5;

                            let dmg = hasWeapon ? (character.currentWeapon?.userData?.damage || 2) : 1;
                            let knockback = hasWeapon ? 0.9 : 0.3;

                            zombie.takeDamage(dmg, hasWeapon);
                            if (soundManager) zombie.isFrozen ? soundManager.playFrozenHit() : soundManager.playHit();

                            // Knockback
                            const pushDir = zombiePos.clone().sub(charPos).normalize();
                            pushDir.y = 0;
                            zombie.group.position.add(pushDir.multiplyScalar(knockback));

                            if (zombie.isDead) {
                                killCount++;
                                // Redundant: Zombie.die() already plays sound
                            }
                        }
                    }
                }

                // 6. Zombie Damage to Player
                if (selectedMode === 'survival' && distSq < 4.0) { // Using distSq (2.0^2 = 4.0)
                    const dist = Math.sqrt(distSq);
                    const now = Date.now();
                    if (now - (zombie.lastAttackTime || 0) > 1000) {
                        playerHP -= 1;
                        zombie.lastAttackTime = now;
                        zombie.triggerAttack();
                        updateHUD();
                        triggerDamageFlash();
                        if (soundManager) soundManager.playHit();
                        if (playerHP <= 0) gameOver();
                    }
                }
            });

            // 7. Optimized Global Systems (Zombie-Zombie separation)
            // Throttled and distance-limited for FPS boost
            if (frameCount % 4 === 0) { // Throttled from 2 to 4
                for (let i = 0; i < zombies.length; i++) {
                    const zA = zombies[i];
                    if (zA.isDead || (zA.lastDistSq > 900)) continue; // Skip far zombies
                    const posA = zA.group.position;

                    for (let j = i + 1; j < zombies.length; j++) {
                        const zB = zombies[j];
                        if (zB.isDead || (zB.lastDistSq > 900)) continue;

                        const posB = zB.group.position;
                        const dx = posB.x - posA.x;
                        const dz = posB.z - posA.z;

                        // Broad phase check
                        if (Math.abs(dx) < 1.3 && Math.abs(dz) < 1.3) {
                            const dSq = dx * dx + dz * dz;
                            if (dSq < 1.69) { // 1.3 * 1.3
                                const d = Math.sqrt(dSq) || 0.1;
                                const overlap = (1.3 - d) * 0.5;
                                const ax = (dx / d) * overlap;
                                const az = (dz / d) * overlap;
                                posB.x += ax; posB.z += az;
                                posA.x -= ax; posA.z -= az;
                            }
                        }
                    }
                }
            }

            // SPELL UPDATE
            if (spellManager) spellManager.update(safeDelta);

            // MAGIC GESTURE DETECTION (Request 2 & 3)
            const handResult = character.isHandRaised(); // {side, bothLevel} or null
            const isLoading = loadingScreen && !loadingScreen.classList.contains('hidden');

            if (handResult && !isLoading) {
                const { side, bothLevel } = handResult;

                // Update current and shadow state for spells
                magicHand = side;
                window.lastMagicHand = side;
                window.lastMagicTime = Date.now();

                const label = bothLevel ? "ОБЕ" : side.toUpperCase();

                if (!isMagicActive) {
                    isMagicActive = true;
                    console.log(`%c[Gesture] ACTIVE: ${label}`, "color: #55efc4");
                    const voiceDebug = document.getElementById('voice-debug');
                    if (voiceDebug) {
                        voiceDebug.classList.remove('hidden');
                        voiceDebug.style.display = 'block';
                        voiceDebug.innerHTML = `🎤 <span style="color:#55efc4">ЖДУ КОМАНДУ (${label})</span>`;
                    }
                    voiceService.start();
                } else {
                    const voiceDebug = document.getElementById('voice-debug');
                    if (voiceDebug && !voiceDebug.innerHTML.includes('СЛЫШУ')) {
                        voiceDebug.innerHTML = `🎤 <span style="color:#55efc4">ЖДУ КОМАНДУ (${label})</span>`;
                    }
                }
            } else {
                // Delayed turn off (Hysteresis) to prevent cutoffs during speech
                if (isMagicActive && (Date.now() - (window.lastMagicTime || 0) > 1200)) {
                    isMagicActive = false;
                    console.log("%c[Gesture] LOST: Stopping Mic after delay", "color: #a4b0be");
                    const voiceDebug = document.getElementById('voice-debug');
                    if (voiceDebug) {
                        voiceDebug.classList.add('hidden');
                        voiceDebug.style.display = 'none';
                    }
                    if (!isMenuVoiceActive) voiceService.stop();
                    magicHand = null;
                }
            }

            // ZOMBIE SPAWNING (Waves)
            // Disable waves for custom maps and Test Mode
            if (!isTestMode) {
                // ZOMBIE SPAWNING (Waves)
                // Disable waves loop if Map is Selected (User Request)
                if (!isTestMode && !config.map) {
                    if (config.mode === 'creative') {
                        const desired = config.zombieCount || 0;
                        const live = zombies.filter(z => !z.isDead).length;
                        if (live < desired && Math.random() < 0.02) {
                            spawnZombie();
                        }
                    } else if (config.mode === 'survival') {
                        const liveZombies = zombies.filter(z => !z.isDead).length;
                        if (Date.now() - lastSpawnTime > 5000 && liveZombies < 20) {
                            lastSpawnTime = Date.now();
                            const spawnCount = config.difficulty === 'pro' ? 2 : 1;
                            for (let i = 0; i < spawnCount; i++) spawnZombie(zombies.length + i);
                        }
                    }
                }

            } // Close Waves Logic


            // Camera
            if (isTestMode) {
                // TEST MODE LOGIC
                if (testModeState === 'setup') {
                    if (orbitControls) orbitControls.update();
                    if (testMarker) testMarker.visible = true;
                    character.setRunning(false);
                } else {
                    // FPV TEST MODE
                    if (testMarker) testMarker.visible = false;
                    if (character.head) {
                        const markerWorldPos = new THREE.Vector3();
                        testMarker.getWorldPosition(markerWorldPos);
                        camera.position.copy(markerWorldPos);
                        const headQuat = new THREE.Quaternion();
                        character.head.getWorldQuaternion(headQuat);
                        camera.quaternion.copy(headQuat);
                    }
                }
            } else if (cameraMode === 'fpv') {
                const headPos = character.getHeadPosition();
                camera.position.set(headPos.x, headPos.y, headPos.z);
                const headQuat = character.getHeadQuaternion();
                camera.quaternion.copy(headQuat);
            } else {
                const characterPos = character.getPosition();
                const rotatedOffset = cameraOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), character.group.rotation.y);
                let targetPos = characterPos.clone().add(rotatedOffset);
                camera.position.lerp(targetPos, 0.1);
                camera.lookAt(characterPos.clone().add(new THREE.Vector3(0, 2, 0)));
            }

            renderer.render(scene, camera);

            // Minimap & Ambient Audio Update (Throttle to every 5 frames for FPS boost)
            frameCount++;
            if (frameCount % 5 === 0) {
                const mmCanvas = document.getElementById('minimap');
                if (mmCanvas && world) {
                    const ctx = mmCanvas.getContext('2d');
                    ctx.clearRect(0, 0, mmCanvas.width, mmCanvas.height);
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    ctx.fillRect(0, 0, mmCanvas.width, mmCanvas.height);

                    const radius = mmCanvas.width / 2;
                    const scale = 2.0;

                    ctx.save();
                    ctx.translate(radius, radius);

                    // Trees
                    ctx.fillStyle = '#2ecc71';
                    if (world.trees) world.trees.forEach(t => {
                        const dx = (t.x - charPos.x) * scale;
                        const dy = (t.z - charPos.z) * scale;
                        if (dx * dx + dy * dy < radius * radius) { ctx.beginPath(); ctx.arc(dx, dy, 2, 0, Math.PI * 2); ctx.fill(); }
                    });

                    // Zombies
                    ctx.fillStyle = '#e74c3c';
                    zombies.forEach(z => {
                        if (!z.isDead) {
                            const zx = (z.group.position.x - charPos.x) * scale;
                            const zz = (z.group.position.z - charPos.z) * scale;
                            if (zx * zx + zz * zz < radius * radius) { ctx.beginPath(); ctx.arc(zx, zz, 3, 0, Math.PI * 2); ctx.fill(); }
                        }
                    });

                    // Player
                    ctx.fillStyle = '#fff';
                    ctx.beginPath();
                    ctx.rotate(-character.getRotation().y);
                    ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.fill();
                    ctx.restore();
                }

                if (soundManager) soundManager.updateAmbient(charPos, zombies);
            }

        } catch (e) {
            console.error("GAME LOOP CRASH:", e);
            gameLoopActive = false; // Stop loop
            alert("Критическая ошибка (Game Loop): " + e.message);
        }
    } // End animate





    // HAND VISIBILITY TOGGLE (Runtime)
    if (showHandsCheck) {
        showHandsCheck.addEventListener('change', (e) => {
            if (character) {
                character.setShowHands(e.target.checked);
            }
            // Also toggle UI Preview
            const preview = document.getElementById('webcam-preview');
            if (preview) {
                preview.style.display = e.target.checked ? 'block' : 'none';
            }
        });
    }

    // Mic is strictly started by gestures or manual button (Fix Request 2)
    console.log("Main initialization complete. Gesture-mic is ready.");

});

function renderItemsTab() {
    const grid = document.getElementById('items-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const items = [
        { name: 'Меч', desc: 'Острое оружие.', dmg: '2', icon: 'assets/icons/sword.png' },
        { name: 'Топор', desc: 'Тяжелый топор.', dmg: '3', icon: 'assets/icons/axe.png' },
        { name: 'Инферно', desc: 'Огненное заклинание.', dmg: '1/tik', icon: 'assets/icons/inferno.png' },
        { name: 'Тандервейв', desc: 'Призыв молний (Тандер).', dmg: '5', icon: 'assets/icons/thunder.png' },
        { name: 'Сапира', desc: 'Луч смерти.', dmg: '10', icon: 'assets/icons/sapira.png' },
        { name: 'Айс', desc: 'Заморозка (Айс).', dmg: '1/сек', icon: 'assets/icons/ice.png' },
        { name: 'Даст', desc: 'Пыль (Даст/Sand).', dmg: 'Мгновенно', icon: 'assets/icons/sand.png' }
    ];

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';

        // Use a generic fallback if icon fails, but try to use the ones we copied
        card.innerHTML = `
            <img src='${item.icon}' class='item-icon' onerror="this.style.display='none'">
            <div class='item-name'>${item.name}</div>
            <div class='item-desc'>${item.desc}</div>
            <div class='item-stats'>
                <div class='stat-row'>
                    <span>Урон:</span>
                    <span class='stat-val'>${item.dmg}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}






