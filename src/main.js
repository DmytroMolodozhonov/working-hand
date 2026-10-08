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
import { Network } from './net/Network.js';
import { matchSpell } from './fx/SpellManager.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ renderer
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
const ambientToggle = $('audio-ambient-toggle');
volInput.addEventListener('input', (e) => {
    volVal.textContent = e.target.value + '%';
    if (sound) sound.setVolume(parseInt(e.target.value, 10));
});
musicVolInput?.addEventListener('input', (e) => {
    musicVolVal.textContent = e.target.value + '%';
    if (sound) sound.setMusicVolume(parseInt(e.target.value, 10));
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

    for (const m of [{ id: 'creative', name: 'ТВОРЧЕСТВО', cls: 'mode-card' }, { id: 'survival', name: 'ВЫЖИВАНИЕ', cls: 'mode-card survival' }]) {
        const card = document.createElement('div');
        card.className = `map-card ${m.cls}`;
        if (selectedMode === m.id && !selectedMap) {
            const c = m.id === 'creative' ? '#2ecc71' : '#e74c3c';
            card.style.borderColor = c;
            card.style.boxShadow = `0 0 15px ${c}`;
        }
        const icon = document.createElement('div');
        icon.style.fontSize = '40px';
        icon.style.margin = '10px 0';
        icon.innerText = m.id === 'creative' ? '🏗️' : '🧟';
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

// ------------------------------------------------------------------ items tab
function renderItemsTab() {
    const grid = $('items-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const items = [
        { name: 'Меч', desc: 'Острое оружие. Берётся рукой как настоящий: сожмите пальцы на рукояти.', dmg: '2 (сильный замах — больше)', icon: 'assets/icons/sword.png' },
        { name: 'Топор', desc: 'Тяжелый топор.', dmg: '3 (сильный замах — больше)', icon: 'assets/icons/axe.png' },
        { name: 'Инферно', desc: 'Огненное заклинание.', dmg: '1/tik', icon: 'assets/icons/inferno.png' },
        { name: 'Тандервейв', desc: 'Призыв молний (Тандер).', dmg: '5', icon: 'assets/icons/thunder.png' },
        { name: 'Сапира', desc: 'Луч смерти.', dmg: '10', icon: 'assets/icons/sapira.png' },
        { name: 'Айс', desc: 'Заморозка (Айс).', dmg: '1/сек', icon: 'assets/icons/ice.png' },
        { name: 'Даст', desc: 'Пыль (Даст/Sand).', dmg: 'Мгновенно', icon: 'assets/icons/sand.png' },
        { name: 'Бомбардо', desc: 'Взрывной шар: разрушает блоки, горы, деревья и раскидывает зомби.', dmg: 'до 8 (взрыв)', icon: 'assets/icons/bombardo.svg' },
        { name: 'Флайн', desc: 'Полёт как у Супермена: обе руки вверх + «Флайн». Рулите корпусом, приземление — направьте себя в землю.', dmg: '—', icon: 'assets/icons/flight.svg' },
    ];
    for (const item of items) {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <img src='${item.icon}' class='item-icon' onerror="this.style.display='none'">
            <div class='item-name'>${item.name}</div>
            <div class='item-desc'>${item.desc}</div>
            <div class='item-stats'><div class='stat-row'><span>Урон:</span><span class='stat-val'>${item.dmg}</span></div></div>`;
        grid.appendChild(card);
    }
}

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

voice.onResult = (command) => {
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
        const name = game.castLocalSpell(command);
        if (name) {
            hud.setVoice(`✨ <span style="color:#55efc4">${name.toUpperCase()}</span> (было: "${escapeHtml(command)}")`);
            if (voiceTestText && isMenuVoiceActive) voiceTestText.innerHTML = `✨ ${name.toUpperCase()} ✨`;
        }
    }
};

// ------------------------------------------------------------------ keyboard
window.addEventListener('keydown', (e) => {
    if (!game || !game.active || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'm' || k === 'ь') game.castDebug('Inferno');
    if (k === 'b' || k === 'и') game.castDebug('Bombardo');
    if (k === 'g' || k === 'п') game.castDebug('Flight');
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
                await poseService.start();
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
const mpStatus = $('mp-status');
const mpPlayers = $('mp-players');
const mpName = $('mp-name');
const mpCode = $('mp-code');
const mpServer = $('mp-server');
try {
    mpName.value = localStorage.getItem('zns-name') || '';
    mpServer.value = localStorage.getItem('zns-server') || '';
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

$('mp-host-btn').addEventListener('click', async () => {
    setMpStatus('Создаём комнату...');
    try {
        const code = await net.host(playerName(), mpServer.value);
        setMpStatus(`Код комнаты: <span class="mp-code-big">${code}</span><br>Отправьте его друзьям, выберите режим/карту и нажмите «ИГРАТЬ».`);
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

net.on('peer-join', ({ name }) => { renderPlayers(); if (!game || !game.active) setMpStatus(`К вам подключился: ${escapeHtml(name)}. Код: <span class="mp-code-big">${net.code}</span>`); });
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
window.__zns = { THREE, get game() { return game; }, poseService, net, voice, startGame, readConfig, get pendingWelcome() { return pendingWelcome; } };
console.log('ЗОМБИ НЕ СПЯТ: готово.');
