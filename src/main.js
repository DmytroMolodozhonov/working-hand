/**
 * main.js — entry point: menu, settings, loading screen, game start,
 * multiplayer lobby. The menu behaves exactly like the original.
 */

import * as THREE from 'three';
import { Face as KalidoFace } from '../vendor/kalidokit/kalidokit.es.js';
import { PoseService } from './input/PoseService.js';
import { VoiceService } from './input/VoiceService.js';
import { SoundManager } from './audio/SoundManager.js';
import { Hud } from './ui/Hud.js';
import { MapEditor } from './ui/MapEditor.js';
import { setupTestMode } from './ui/TestMode.js';
import { Game } from './game/Game.js';
import { Network, MAX_PLAYERS } from './net/Network.js';
import { renderSpellsTab, renderItemsTab } from './ui/Codex.js';
import { matchSpell, bombardoRadius } from './fx/SpellManager.js';
import { startCamera } from './ui/CameraPanel.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ renderer
const canvas = $('game-canvas');
// Antialiasing (MSAA) costs a lot of graphics memory bandwidth: on only when this
// computer is known to manage the highest quality (chosen, or reached by «Авто»).
const graphicsLevel = (() => {
    try {
        const g = (JSON.parse(localStorage.getItem('zns-settings') || '{}') || {})['graphics-quality'];
        if (g !== undefined && g !== 'auto') return parseInt(g, 10);
        const last = parseInt(localStorage.getItem('zns-quality-level'), 10);
        return Number.isFinite(last) ? last : 2;
    } catch (e) { return 2; }
})();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: graphicsLevel >= 3, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1)); // the game's QualityManager adjusts it
renderer.shadowMap.enabled = true;
// soft shadows sample the shadow map many times per pixel: only at the highest level
// (the QualityManager switches the type with the level; starting right avoids a rebuild)
renderer.shadowMap.type = graphicsLevel >= 3 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------ services
const poseService = new PoseService({ faceSolver: KalidoFace });
const voice = new VoiceService();
const hud = new Hud();
const net = new Network();
let sound = null;
let game = null;
let pendingWelcome = null;

// ------------------------------------------------------------------ DOM
const loadingScreen = $('loading');
const mainMenu = $('main-menu');
const progressBar = $('loading-bar-fill');
const loadingStatus = $('loading-status');
const creativeSettings = $('creative-settings');
const creativeZombieCount = $('creative-zombie-count');
const zombieCountDisplay = $('zombie-count-val');

let selectedMode = 'creative';
let selectedMap = null;
let cachedMaps = null;
let isMenuVoiceActive = false;

const settings = { smoothness: 0.3, sensitivity: 1.0 };

function updateProgress(percent, text) {
    progressBar.style.width = `${percent}%`;
    if (text && loadingStatus) loadingStatus.textContent = text;
}

// Loading screen starts visible in the HTML: hide it, show the menu.
loadingScreen.classList.add('hidden');
loadingScreen.style.display = 'none';

// ------------------------------------------------------------------ tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        tabBtns.forEach((b) => b.classList.remove('active'));
        tabPanes.forEach((p) => { p.classList.remove('active'); p.style.display = 'none'; });
        btn.classList.add('active');
        const target = $(btn.dataset.tab);
        target.classList.add('active');
        target.style.display = 'block';
        if (btn.dataset.tab === 'tab-editor') {
            if (!window.mapEditor) window.mapEditor = new MapEditor();
            else window.mapEditor.refreshMapList();
        }
        if (btn.dataset.tab === 'tab-game') updateGameMapList();
        if (btn.dataset.tab === 'tab-items') renderItemsTab();
        if (btn.dataset.tab === 'tab-spells') renderSpellsTab();
        if (btn.dataset.tab === 'tab-mp') refreshServers();
        if (btn.dataset.tab === 'tab-character') window.__charEditor?.show();
    });
});
// Settings sub-tabs
document.querySelectorAll('#tab-settings .sub-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#tab-settings .sub-tab').forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll('#tab-settings .sub-pane').forEach((p) => p.classList.toggle('active', p.id === btn.dataset.sub));
    });
});

if (creativeZombieCount && zombieCountDisplay) {
    creativeZombieCount.oninput = (e) => { zombieCountDisplay.textContent = e.target.value; };
}

// ------------------------------------------------------------------ settings
const volInput = $('zombie-vol');
const volVal = $('vol-val');
const musicVolInput = $('music-vol');
const musicVolVal = $('music-vol-val');
const spellVolInput = $('spell-vol');
const spellVolVal = $('spell-vol-val');
const ambientToggle = $('audio-ambient-toggle');
volInput.addEventListener('input', (e) => {
    volVal.textContent = e.target.value + '%';
    if (sound) sound.setVolume(parseInt(e.target.value, 10));
});
musicVolInput?.addEventListener('input', (e) => {
    musicVolVal.textContent = e.target.value + '%';
    if (sound) sound.setMusicVolume(parseInt(e.target.value, 10));
});
spellVolInput?.addEventListener('input', (e) => {
    spellVolVal.textContent = e.target.value + '%';
    if (sound) sound.setSpellVolume(parseInt(e.target.value, 10));
});
ambientToggle?.addEventListener('change', () => {
    if (sound) sound.ambientEnabled = ambientToggle.value === '1';
});

const camSmoothInput = $('cam-smooth');
const smoothVal = $('smooth-val');
const camSensInput = $('cam-sens');
const sensVal = $('sens-val');
function updateSmoothness(val) {
    const v = parseInt(val, 10);
    settings.smoothness = Math.max(0.05, 1.0 - v / 100);
    smoothVal.textContent = v + '%';
    if (game) game.settings.smoothness = settings.smoothness;
}
function updateSensitivity(val) {
    const v = parseInt(val, 10);
    settings.sensitivity = v / 100;
    sensVal.textContent = v + '%';
    if (game) game.settings.sensitivity = settings.sensitivity;
}
camSmoothInput.addEventListener('input', (e) => updateSmoothness(e.target.value));
camSensInput.addEventListener('input', (e) => updateSensitivity(e.target.value));
updateSmoothness(camSmoothInput.value);
updateSensitivity(camSensInput.value);

const showHandsToggle = $('show-hands-toggle');
showHandsToggle?.addEventListener('change', (e) => {
    if (game) game.character.setShowHands(e.target.checked);
    const preview = $('webcam-preview');
    if (preview) preview.style.display = e.target.checked ? 'block' : 'none';
});

function readConfig() {
    return {
        mode: selectedMode,
        map: selectedMap,
        zombieCount: selectedMode === 'creative' ? parseInt(creativeZombieCount.value, 10) : 1,
        fpsLimit: parseInt($('fps-limit').value, 10),
        modelComplexity: parseInt($('model-quality').value, 10),
        delegate: $('vision-delegate')?.value || 'auto',
        engine: $('vision-engine')?.value || 'classic',
        graphics: $('graphics-quality')?.value || 'auto',
        resolution: $('camera-res').value,
        cameraMode: $('camera-mode-toggle').checked ? 'fpv' : 'tpv',
        showHands: showHandsToggle ? showHandsToggle.checked : false,
        handVersion: document.querySelector('input[name="hand-version"]:checked')?.value || 'v3',
        handQuality: ($('hand-quality')?.value || 'high').includes('high') ? 'high' : 'low',
        drifting: $('drift-camera') ? $('drift-camera').checked : true,
    };
}

// ------------------------------------------------------------------ maps
async function updateGameMapList(forceRefresh = false) {
    const gameTab = $('tab-game');
    let mapListDiv = $('game-map-list');
    if (!mapListDiv) {
        mapListDiv = document.createElement('div');
        mapListDiv.id = 'game-map-list';
        gameTab.appendChild(mapListDiv);
    }
    try {
        if (!cachedMaps || forceRefresh) {
            const response = await fetch('/api/maps');
            cachedMaps = await response.json();
        }
    } catch (e) {
        console.error('Error fetching maps:', e);
        mapListDiv.innerHTML = '<p style="color:#e74c3c;">Ошибка загрузки списка карт</p>';
        return;
    }
    mapListDiv.innerHTML = '';
    const maps = cachedMaps;
    const mapNames = Object.keys(maps);
    let mapOrder = [];
    try { mapOrder = JSON.parse(localStorage.getItem('mapOrder') || '[]'); } catch (e) { mapOrder = []; }
    if (!Array.isArray(mapOrder)) mapOrder = [];
    mapOrder = mapOrder.filter((n) => mapNames.includes(n));
    const sortedNames = [...mapOrder, ...mapNames.filter((n) => !mapOrder.includes(n)).sort()];
    try { localStorage.setItem('mapOrder', JSON.stringify(sortedNames)); } catch (e) { /* private mode */ }

    const grid = document.createElement('div');
    grid.className = 'map-list-grid';
    mapListDiv.appendChild(grid);

    for (const name of sortedNames) {
        const mapData = maps[name];
        const card = document.createElement('div');
        card.className = 'map-card';
        card.dataset.name = name;
        const cvs = document.createElement('canvas');
        cvs.className = 'map-preview-canvas';
        cvs.width = 80;
        cvs.height = 80;
        const ctx = cvs.getContext('2d');
        const cellSize = 80 / (mapData.gridSize || 20);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 80, 80);
        if (mapData.walls) {
            ctx.fillStyle = '#5D4037';
            for (const w of mapData.walls) ctx.fillRect(w.x * cellSize, w.z * cellSize, cellSize, cellSize);
        }
        if (mapData.playerSpawn) {
            ctx.fillStyle = '#4CAF50';
            ctx.beginPath();
            ctx.arc((mapData.playerSpawn.x + 0.5) * cellSize, (mapData.playerSpawn.z + 0.5) * cellSize, cellSize / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        const nameDiv = document.createElement('div');
        nameDiv.className = 'map-name';
        nameDiv.innerText = name;
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
            } else {
                selectedMap = { ...mapData, name };
                selectedMode = 'survival';
            }
            updateGameMapList();
        };
        grid.appendChild(card);
    }

    const MODE_COLOR = { creative: '#2ecc71', survival: '#e74c3c', freeworld: '#3498db' };
    const MODE_ICON = { creative: '🏗️', survival: '🧟', freeworld: '🌍' };
    for (const m of [{ id: 'creative', name: 'ТВОРЧЕСТВО', cls: 'mode-card' }, { id: 'survival', name: 'ВЫЖИВАНИЕ', cls: 'mode-card survival' }, { id: 'freeworld', name: 'СВОБОДНЫЙ МИР', cls: 'mode-card freeworld' }]) {
        const card = document.createElement('div');
        card.className = `map-card ${m.cls}`;
        if (selectedMode === m.id && !selectedMap) {
            const c = MODE_COLOR[m.id];
            card.style.borderColor = c;
            card.style.boxShadow = `0 0 15px ${c}`;
        }
        const icon = document.createElement('div');
        icon.style.fontSize = '40px';
        icon.style.margin = '10px 0';
        icon.innerText = MODE_ICON[m.id];
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
    }
    if (creativeSettings) creativeSettings.style.display = selectedMode === 'creative' ? 'block' : 'none';
}
window.updateGameMapList = updateGameMapList;
updateGameMapList();

// ------------------------------------------------------------------ version
// Shown in the menu so everyone can see at a glance that the game is up to date
fetch('/api/version').then((r) => r.json()).then((v) => {
    if (!v || !v.date) return;
    const el = $('game-version-top');
    if (el) el.innerHTML = `Версия от <b>${v.date}</b>` + (v.sha ? ` <span class="ver-sha">(${v.sha})</span>` : '');
}).catch(() => {});

// ------------------------------------------------------------------ voice
const voiceToggleBtn = $('voice-toggle-btn');
const voiceTestText = $('voice-test-text');
voiceToggleBtn?.addEventListener('click', () => {
    isMenuVoiceActive = !isMenuVoiceActive;
    if (isMenuVoiceActive) {
        voice.start();
        voiceToggleBtn.innerText = '🛑 СТОП';
        voiceToggleBtn.style.background = '#c0392b';
        voiceTestText.innerText = voice.supported ? 'ОЖИДАНИЕ ГОЛОСА...' : 'БРАУЗЕР НЕ ПОДДЕРЖИВАЕТ ГОЛОС (нужен Chrome)';
        voiceTestText.style.color = '#55efc4';
    } else {
        voice.stop();
        voiceToggleBtn.innerText = '🎙️ СТАРТ';
        voiceToggleBtn.style.background = '#27ae60';
        voiceTestText.innerText = 'ГОЛОС ВЫКЛЮЧЕН';
        voiceTestText.style.color = '#a4b0be';
    }
});

voice.onResult = (command, isFinal = true) => {
    if (!command) return;
    if (isMenuVoiceActive && voiceTestText) {
        voiceTestText.innerText = `"${command.toUpperCase()}"`;
        voiceTestText.style.color = '#55efc4';
        if (matchSpell(command)) {
            voiceTestText.style.color = '#ff4757';
            voiceTestText.innerHTML = `✨ ${command.toUpperCase()} ✨`;
        }
    }
    if (game && game.active) {
        if (game.isMagicActive || Date.now() - game.lastMagicTime < 1500) hud.setVoice(`🎤 СЛЫШУ: "${escapeHtml(command)}"`);
        // Multiplayer: a friend's voice heard by this microphone must not cast here
        const margin = parseInt($('voice-filter')?.value ?? '9', 10);
        if (margin > 0 && game.remotes?.size > 0 && matchSpell(command) && !voice.isOwnVoice(margin)) {
            hud.setVoice(`🔇 Тихо — похоже, это голос другого игрока: "${escapeHtml(command)}"`);
            return;
        }
        const name = game.castLocalSpell(command, isFinal);
        if (name) {
            voice.learnOwnVoice();
            hud.setVoice(`✨ <span style="color:#55efc4">${name.toUpperCase()}</span> (было: "${escapeHtml(command)}")`);
            if (voiceTestText && isMenuVoiceActive) voiceTestText.innerHTML = `✨ ${name.toUpperCase()} ✨`;
        }
    }
};

// ------------------------------------------------------------------ keyboard
window.addEventListener('keydown', (e) => {
    if (!game || !game.active || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '9' && game.inventory) game.inventory.select(Math.min(parseInt(k, 10), game.inventory.slots.length) - 1);
    if ((k === '0' || k === '`' || k === 'ё') && game.inventory) game.inventory.select(-1);
    if (k === 'm' || k === 'ь') game.castDebug('Inferno');
    if (k === 'b' || k === 'и') game.castDebug('Bombardo');
    if (k === 'n' || k === 'т') game.castDebug('BombardoMaxima');
    if (k === 'g' || k === 'п') game.castDebug('Flight');
    if (k === 'v' || k === 'м') game.castDebug('Waterball');
    if (k === 'x' || k === 'ч') game.castDebug('Maxima');
    if (k === 'c' || k === 'с') game.castDebug('WaterForming');
    if (k === 'z' || k === 'я') game.castDebug('Frozen');
    if (k === 'p' || k === 'з') game.castDebug('Protection');
    if (k === 'l' || k === 'д') game.castDebug('Levitation');
    if (k === 'k' || k === 'л') game.castDebug('Stupefy');
    if (k === 'o' || k === 'щ') game.castDebug('ProtectionMaxima');
    if (k === 'f' || k === 'а') game.toggleFlashlight();
});

// ------------------------------------------------------------------ game start
const ui = {
    gameOver(kills, punches) {
        hud.show(false);
        $('go-kills').textContent = kills;
        $('go-punches').textContent = punches;
        $('game-over').classList.remove('hidden');
        if (sound) sound.enabled = false;
    },
    victory(score) {
        $('victory-score').innerText = `Счет: ${score}`;
        $('victory-screen').classList.remove('hidden');
        if (document.pointerLockElement) document.exitPointerLock();
    },
    /** Killed: a dark screen with «Возродиться» — the game (and a host's room) goes on. */
    died(text, onRespawn) {
        $('death-text').innerHTML = text;
        const screen = $('death-screen');
        screen.classList.remove('hidden');
        if (document.pointerLockElement) document.exitPointerLock();
        const btn = $('death-respawn-btn');
        btn.disabled = true;
        let left = 3;
        btn.textContent = `Возродиться (${left})`;
        const timer = setInterval(() => {
            left--;
            if (left > 0) { btn.textContent = `Возродиться (${left})`; return; }
            clearInterval(timer);
            btn.disabled = false;
            btn.textContent = '✨ Возродиться';
        }, 1000);
        btn.onclick = () => { if (btn.disabled) return; screen.classList.add('hidden'); onRespawn?.(); };
        $('death-menu-btn').onclick = () => { net.sayGoodbye(); net.leave(); location.reload(); };
    },
    isLoading: () => !loadingScreen.classList.contains('hidden'),
    isMenuVoiceActive: () => isMenuVoiceActive,
    fatal(e) {
        alert('Критическая ошибка: ' + (e?.message || e));
    },
};

async function ensureSound() {
    if (sound) {
        updateProgress(60);
        return;
    }
    sound = new SoundManager(camera);
    window.soundManager = sound;
    updateProgress(5, 'Загрузка звуков...');
    await sound.loadSounds((p) => updateProgress(5 + p * 55, `Загрузка звуков: ${Math.round(p * 100)}%`));
}

let starting = false;
async function startGame(config, welcome = null) {
    if (starting) return; // a second click / duplicate invitation while loading
    starting = true;
    try {
        await startGameInner(config, welcome);
    } finally {
        starting = false;
    }
}

async function startGameInner(config, welcome) {
    mainMenu.classList.add('hidden');
    loadingScreen.classList.remove('hidden');
    loadingScreen.style.display = 'flex';
    updateProgress(2, 'Инициализация...');
    try {
        await ensureSound();
        await sound.resume();
        sound.enabled = true;
        sound.setVolume(parseInt(volInput.value, 10));
        if (musicVolInput) sound.setMusicVolume(parseInt(musicVolInput.value, 10));
        if (spellVolInput) sound.setSpellVolume(parseInt(spellVolInput.value, 10));
        sound.ambientEnabled = ambientToggle ? ambientToggle.value === '1' : true;

        if (game) game.dispose();
        game = new Game({ renderer, camera, poseService, voice, sound, hud, net, ui });
        window.game = game;
        game.settings.smoothness = settings.smoothness;
        game.settings.sensitivity = settings.sensitivity;
        game.settings.drifting = config.drifting !== false;
        await game.init(config, updateProgress);
        if (welcome && game.sync) game.sync.applyWelcome(welcome);

        const preview = $('webcam-preview');
        if (preview) preview.style.display = config.showHands ? 'block' : 'none';
        hud.setVoice('🎤 ОЖИДАНИЕ КОМАНДЫ...', true);

        updateProgress(70, 'Инициализация камеры...');
        let cameraOk = true;
        if (!window.__ZNS_NO_CAMERA__) {
            try {
                poseService.onStatus = (t) => updateProgress(75, t);
                await poseService.initialize('webcam', 'preview-video', config);
                // No camera: a panel explains why, lists the cameras and keeps retrying
                cameraOk = await startCamera(poseService);
            } catch (e) {
                cameraOk = false;
                console.error('Camera/AI init failed:', e);
                updateProgress(85, 'Камера недоступна: ' + (e?.message || e) + '. Проверьте разрешение камеры.');
            }
        }

        updateProgress(90, 'Компиляция шейдеров...');
        await new Promise((r) => requestAnimationFrame(r));
        game.start();
        if (net.isHost && game.sync) net.broadcast(game.sync.welcomeMessage());
        net.info = { ...(net.info || {}), mode: config.mode, playing: true }; // (shown in other players' server lists)
        updateProgress(100, cameraOk ? 'Ожидание первого кадра камеры...' : 'Запуск без камеры...');

        const reveal = () => {
            loadingScreen.classList.add('hidden');
            loadingScreen.style.display = 'none';
            hud.show(true);
        };
        const started = performance.now();
        const waitPose = setInterval(() => {
            if (game.firstPoseReceived || !cameraOk || performance.now() - started > 10000 || window.__ZNS_NO_CAMERA__) {
                clearInterval(waitPose);
                reveal();
                setTimeout(() => updateGameMapList(), 500);
            }
        }, 100);
    } catch (error) {
        console.error('INIT ERROR:', error);
        updateProgress(100, 'Ошибка: ' + (error?.message || error));
        setTimeout(() => location.reload(), 4000);
    }
}

poseService.onPoseUpdate = (poseData) => {
    if (game && game.active) game.setPose(poseData);
};

$('start-btn').addEventListener('click', () => {
    if (net.isClient) {
        setMpStatus('Вы подключены к чужой игре — её запускает хост.');
        return;
    }
    startGame(readConfig());
});

// Test mode (camera / hand setup)
$('test-mode-btn').addEventListener('click', async () => {
    mainMenu.classList.add('hidden');
    if (game) game.dispose();
    game = new Game({ renderer, camera, poseService, voice, sound: null, hud, net: null, ui });
    window.game = game;
    await game.init({ ...readConfig(), mode: 'test', map: null, showHands: true, cameraMode: 'fpv' });
    game.world.setNightMode(false);
    setupTestMode(game, { renderer, camera, poseService, onExit: () => location.reload() });
    hud.setVoice('🎤 ОЖИДАНИЕ КОМАНДЫ...', true);
    game.start();
});

const backToMenu = () => { net.sayGoodbye(); net.leave(); window.location.href = window.location.origin + window.location.pathname; };
window.addEventListener('pagehide', () => net.sayGoodbye());
$('restart-btn').onclick = backToMenu;
$('victory-menu-btn').onclick = backToMenu;

// ------------------------------------------------------------------ multiplayer lobby
// «Мультиплеер» tab: a list of servers. «Создать сервер» starts a game that
// appears in everybody's list (name, mode, players); others click it and
// «Войти». Up to 10 players each. A private game by code is still possible.
const mpStatus = $('mp-status');
const mpPlayers = $('mp-players');
const mpName = $('mp-name');
const mpCode = $('mp-code');
const mpServer = $('mp-server');
const MODE_NAME = { freeworld: '🌍 Свободный мир', creative: '🏗️ Творчество', survival: '🧟 Выживание' };
try {
    mpName.value = localStorage.getItem('zns-name') || '';
    mpServer.value = localStorage.getItem('zns-server') || '';
    $('mp-srv-name').value = localStorage.getItem('zns-srv-name') || '';
} catch (e) { /* ignore */ }

function setMpStatus(html) { mpStatus.innerHTML = html; }
function renderPlayers() {
    if (!net.active) { mpPlayers.innerHTML = ''; return; }
    mpPlayers.innerHTML = 'Игроки: ' + net.playerList().map((p) => escapeHtml(p.name) + (p.id === net.localId ? ' (вы)' : '')).join(', ');
}
function playerName() {
    const n = (mpName.value || '').trim().slice(0, 16) || 'Игрок';
    try { localStorage.setItem('zns-name', n); localStorage.setItem('zns-server', mpServer.value.trim()); } catch (e) { /* ignore */ }
    return n;
}

let servers = null; // null: not checked yet / no connection
let pickedServer = null;
let refreshing = false;
async function refreshServers() {
    if (refreshing || net.active || (game && game.active) || window.__ZNS_NO_WORLD_PROBE__) { renderServers(); return; }
    refreshing = true;
    try { servers = await net.listServers(mpServer.value); } catch (e) { servers = null; }
    refreshing = false;
    renderServers();
}
function renderServers() {
    const list = $('mp-server-list');
    if (!list) return;
    if (servers === null) {
        list.innerHTML = `<div class="mp-empty">${refreshing ? 'Ищем серверы...' : 'Нет связи с сетью — проверьте интернет и нажмите «Обновить»'}</div>`;
    } else if (!servers.length) {
        list.innerHTML = '<div class="mp-empty">Пока нет ни одного сервера. Создайте свой — он появится здесь у всех!</div>';
    } else {
        list.innerHTML = '';
        for (const sv of servers) {
            const row = document.createElement('div');
            row.className = 'mp-server-row' + (pickedServer?.code === sv.code ? ' sel' : '');
            row.dataset.code = sv.code;
            const full = sv.players.length >= (sv.max || MAX_PLAYERS);
            row.innerHTML = `<span class="mp-srv-name">${escapeHtml(sv.name || 'Сервер')}</span><span>${MODE_NAME[sv.mode] || '—'}</span><span class="${full ? 'mp-full' : ''}">${sv.players.length}/${sv.max || MAX_PLAYERS}</span>`;
            row.onclick = () => { pickedServer = sv; renderServers(); };
            list.appendChild(row);
        }
    }
    const info = $('mp-server-info');
    const sv = pickedServer && servers?.find((x) => x.code === pickedServer.code);
    if (!sv) { info.innerHTML = '<div class="mp-empty">Нажмите на сервер — здесь появятся игроки и кнопка «Войти»</div>'; return; }
    const full = sv.players.length >= (sv.max || MAX_PLAYERS);
    info.innerHTML = `<h4>${escapeHtml(sv.name || 'Сервер')}</h4><div class="mp-info-mode">${MODE_NAME[sv.mode] || ''}${sv.playing ? ' · идёт игра' : ''}</div>
        <div class="mp-info-players">${sv.players.map((n) => `<div>🧙 ${escapeHtml(n)}</div>`).join('')}</div>
        <button id="mp-enter-btn" class="mp-btn" ${full ? 'disabled' : ''}>${full ? 'Заполнен' : '▶ Войти'}</button>`;
    $('mp-enter-btn').onclick = () => joinRoom(sv.code);
}
setTimeout(refreshServers, 800);
setInterval(() => { if ($('tab-mp')?.classList.contains('active')) refreshServers(); }, 8000);
$('mp-refresh-btn').addEventListener('click', () => { servers = null; refreshing = false; renderServers(); refreshServers(); });
$('mp-create-open').addEventListener('click', () => $('mp-create').classList.toggle('hidden'));

async function joinRoom(code) {
    net.stopProbe();
    setMpStatus('Подключаемся...');
    try {
        await net.join(code, playerName(), mpServer.value);
        if (!net.active) return; // (the server was full)
        setMpStatus('✅ Подключено! Входим в игру...');
        renderPlayers();
    } catch (e) {
        setMpStatus('❌ ' + escapeHtml(e.message));
    }
}

// Create a server: it takes a free place in the list and the game starts at once
$('mp-host-btn').addEventListener('click', async () => {
    net.stopProbe();
    const srvName = ($('mp-srv-name').value || '').trim().slice(0, 24) || `Сервер ${playerName()}`;
    try { localStorage.setItem('zns-srv-name', srvName); } catch (e) { /* ignore */ }
    const mode = $('mp-mode').value;
    setMpStatus('Создаём сервер...');
    try {
        await net.host(playerName(), mpServer.value, null, { slots: true });
        net.info = { name: srvName, mode, playing: false };
        setMpStatus('🟢 Сервер создан — он виден всем в списке. Запускаем...');
        selectedMode = mode;
        selectedMap = null;
        startGame({ ...readConfig(), mode, map: null, world: $('mp-world')?.value || null });
    } catch (e) {
        setMpStatus('❌ ' + escapeHtml(e.message));
    }
});

// Private game by code (old way)
$('mp-private-btn').addEventListener('click', async () => {
    setMpStatus('Создаём закрытую комнату...');
    try {
        const code = await net.host(playerName(), mpServer.value);
        net.info = { name: 'Закрытая игра', mode: selectedMode, playing: false };
        setMpStatus(`Код комнаты: <span class="mp-code-big">${code}</span><br>Отправьте его друзьям, выберите режим во вкладке «Одиночная игра» и нажмите «ИГРАТЬ».`);
        renderPlayers();
    } catch (e) {
        setMpStatus('❌ ' + escapeHtml(e.message));
    }
});

$('mp-join-btn').addEventListener('click', async () => {
    const code = (mpCode.value || '').trim().toUpperCase();
    if (code.length < 4) { setMpStatus('Введите код комнаты от друга.'); return; }
    setMpStatus('Подключаемся...');
    try {
        await net.join(code, playerName(), mpServer.value);
        setMpStatus('✅ Подключено! Ждём, когда хост начнёт игру...');
        renderPlayers();
    } catch (e) {
        setMpStatus('❌ ' + escapeHtml(e.message));
    }
});

net.on('peer-join', ({ name }) => {
    renderPlayers();
    if (game && game.active) return;
    setMpStatus(`К вам подключился: ${escapeHtml(name)}. Код: <span class="mp-code-big">${net.code}</span>`);
});
net.on('peer-leave', () => renderPlayers());
net.on('players', () => renderPlayers());
net.on('status', (text) => setMpStatus('⚠️ ' + escapeHtml(text)));
net.on('disconnected', ({ reason }) => {
    if (game && game.active) {
        alert('Мультиплеер: ' + reason);
        location.reload();
    } else {
        setMpStatus('❌ ' + escapeHtml(reason));
        renderPlayers();
    }
});
net.on('message', (msg) => {
    if (msg.t !== 'welcome' || !net.isClient) return;
    if ((game && game.active) || starting) return;
    pendingWelcome = msg;
    const local = readConfig();
    startGame({ ...local, mode: msg.config.mode, map: msg.config.map, zombieCount: msg.config.zombieCount, seed: msg.config.seed }, msg);
});

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Hooks for automated tests (read-only helpers + pose injection)
// ------------------------------------------------------------------ remembered settings
// Volumes, graphics, camera… are kept in this browser between launches.
(function rememberSettings() {
    const KEY = 'zns-settings';
    const IDS = ['zombie-vol', 'music-vol', 'spell-vol', 'voice-filter', 'audio-ambient-toggle', 'cam-smooth', 'cam-sens', 'fps-limit', 'model-quality',
        'hand-quality', 'camera-res', 'vision-engine', 'vision-delegate', 'graphics-quality', 'camera-mode-toggle',
        'show-hands-toggle', 'drift-camera', 'creative-zombie-count'];
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
    const save = () => {
        const out = {};
        for (const id of IDS) {
            const el = $(id);
            if (el) out[id] = el.type === 'checkbox' ? el.checked : el.value;
        }
        const hv = document.querySelector('input[name="hand-version"]:checked');
        if (hv) out.handVersion = hv.value;
        try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) { /* private mode: just not remembered */ }
    };
    // Restore, and let each control's own handler apply the value (labels, sound, camera…)
    for (const id of IDS) {
        const el = $(id);
        if (!el || saved[id] === undefined) continue;
        if (el.type === 'checkbox') el.checked = !!saved[id];
        else if (el.tagName === 'SELECT' && ![...el.options].some((o) => o.value === String(saved[id]))) continue;
        else el.value = saved[id];
        el.dispatchEvent(new Event(el.type === 'range' ? 'input' : 'change'));
    }
    if (saved.handVersion) {
        const r = document.querySelector(`input[name="hand-version"][value="${saved.handVersion}"]`);
        if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
    }
    for (const id of IDS) {
        const el = $(id);
        if (el) { el.addEventListener('input', save); el.addEventListener('change', save); }
    }
    for (const r of document.querySelectorAll('input[name="hand-version"]')) r.addEventListener('change', save);
})();

window.__zns = { THREE, bombardoRadius, get game() { return game; }, poseService, net, voice, startGame, readConfig, get pendingWelcome() { return pendingWelcome; } };
console.log('ЗОМБИ НЕ СПЯТ: готово.');
