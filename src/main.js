/**
 * main.js — entry point: menu, settings, loading screen, game start,
 * multiplayer lobby. The menu behaves exactly like the original.
 */

import * as THREE from 'three';
import { Face as KalidoFace } from '../vendor/kalidokit/kalidokit.es.js';
import { HandRecorder } from './game/HandRecorder.js';
import { PoseService } from './input/PoseService.js';
import { VoiceService } from './input/VoiceService.js';
import { SoundManager } from './audio/SoundManager.js';
import { Hud, setMinimapSize } from './ui/Hud.js';
import { MapEditor } from './ui/MapEditor.js';
import { setupTestMode } from './ui/TestMode.js';
import { Game } from './game/Game.js';
import { Network, MAX_PLAYERS, netLog } from './net/Network.js';
import { renderSpellsTab, renderItemsTab, renderMechanicsTab } from './ui/Codex.js';
import { listWorlds, loadWorld, deleteWorld, setGameVersion, worldVersionLabel } from './game/WorldSave.js';
import { CharacterEditor, activeLook } from './ui/CharacterEditor.js';
import { matchSpell, bombardoRadius } from './fx/SpellManager.js';
import { startCamera } from './ui/CameraPanel.js';
import { setupPauseAudio } from './ui/PauseAudio.js';
import { setupWindowControls, enterGameFullscreen, becomeAppWindow } from './ui/WindowControls.js';
import { GAME_NAME, MODES, MODE_ORDER, MAPS_ENTRY, modeLabel, modeTitle } from './ui/GameNames.js';
import { setupLogPanel, keepLauncherAlive } from './ui/JournalTab.js';

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
// Which graphics chip draws the game? A weak built-in one (when the computer has a
// strong one too) makes even a powerful PC slow — then the menu says how to fix it.
const gpuName = (() => {
    try {
        const gl = renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
    } catch (e) { return ''; }
})();
const gpuShort = gpuName.replace(/^ANGLE \((?:[^,]*,\s*)?/, '').replace(/\s*\(0x[0-9a-f]+\).*$/i, '').replace(/ Direct3D.*$/, '').replace(/\)$/, '').slice(0, 48);
const gpuWeak = /SwiftShader|llvmpipe|Software|Microsoft Basic|Intel|\bUHD\b|Iris|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d+ Graphics|Mali|Adreno/i.test(gpuName)
    && !/NVIDIA|GeForce|Quadro|RTX|GTX|Radeon RX|Radeon Pro|Arc A\d/i.test(gpuName);
window.__zns = window.__zns || {};
window.__zns.gpu = { name: gpuName, short: gpuShort, weak: gpuWeak };
if (gpuWeak) {
    const warn = document.createElement('div');
    warn.id = 'gpu-warning';
    warn.innerHTML = `⚠️ Игра рисует на слабой встроенной графике (<b>${gpuShort.replace(/[<>&]/g, '')}</b>) — поэтому мало FPS. `
        + 'Запускайте игру через <b>«Запустить игру.bat»</b> — он сам включит мощную видеокарту (если Chrome уже был открыт — <b>закройте все окна Chrome</b> и запустите игру снова). '
        + 'Или вручную: Параметры Windows → Система → Дисплей → Графика → Chrome → «Высокая производительность», потом перезапустите Chrome.';
    document.getElementById('tab-game')?.prepend(warn); // (inside the menu window, above the modes)
}
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
// this player's own lasting id: a server keeps their things under it (not under a name others may have too)
net.pid = (() => {
    try {
        let id = localStorage.getItem('zns-player-id');
        if (!id) { id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); localStorage.setItem('zns-player-id', id); }
        return id;
    } catch (e) { return 'p' + Math.random().toString(36).slice(2, 12); }
})();
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
let pickingMap = false; // «Создать мир» → «Карты» chosen: the maps are shown
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
        if (btn.dataset.tab === 'tab-game') { updateGameMapList(); renderSavedWorlds(); }
        if (btn.dataset.tab === 'tab-items') renderItemsTab();
        if (btn.dataset.tab === 'tab-mechanics') renderMechanicsTab();
        if (btn.dataset.tab === 'tab-spells') renderSpellsTab();
        if (btn.dataset.tab === 'tab-mp') { refreshServers(); renderSavedWorlds(); }
        if (btn.dataset.tab === 'tab-character') { window.__charEditor = window.__charEditor || new CharacterEditor($('tab-character')); window.__charEditor.show(); }
        else window.__charEditor?.hide();
    });
});
// Settings sub-tabs
document.querySelectorAll('#tab-settings .sub-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#tab-settings .sub-tab').forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll('#tab-settings .sub-pane').forEach((p) => p.classList.toggle('active', p.id === btn.dataset.sub));
    });
});
// Settings → «Журнал»; and the app launcher keeps running while this window is open
setupLogPanel();
keepLauncherAlive();

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

// The minimap's size (settings → «Размер мини-карты»)
const minimapSize = $('minimap-size');
minimapSize?.addEventListener('input', (e) => {
    setMinimapSize(e.target.value);
    const v = $('minimap-size-val');
    if (v) v.textContent = e.target.value + '%';
});
setMinimapSize(minimapSize?.value || 120);

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
        look: activeLook(), // the hero from the «Персонаж» tab
        villagerVoice: ($('villager-voice')?.value ?? '1') !== '0',
        villagerVoiceEngine: $('villager-voice')?.value === 'system' ? 'system' : 'neural', // (neural: Supertonic 3 in the browser)
        villagerText: $('villager-text')?.value === 'always' ? 'always' : 'auto', // (the words over the head: only when no voice says them)
        villagerAI: $('villager-ai')?.value || 'auto',
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

    // «Создать мир»: Творческий / Хардкор / Выживание, and «Карты» as a fourth choice
    // (internal modes unchanged; a map is a 'survival' game with the map)
    const modeRow = document.createElement('div');
    modeRow.className = 'mode-row';
    mapListDiv.appendChild(modeRow);
    const MODE_CLS = { creative: 'mode-card', survival: 'mode-card survival', freeworld: 'mode-card freeworld', maps: 'mode-card maps' };
    const choices = [...MODE_ORDER.map((id) => [id, MODES[id]]), ['maps', MAPS_ENTRY]];
    for (const [id, m] of choices) {
        const card = document.createElement('div');
        const on = id === 'maps' ? pickingMap : !pickingMap && selectedMode === id;
        card.className = `map-card ${MODE_CLS[id]}` + (on ? ' selected' : '');
        card.dataset.mode = id;
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.innerHTML = `<span class="mode-icon">${m.icon}</span><span class="map-name">${m.label}</span>`;
        card.onclick = () => {
            pickingMap = id === 'maps';
            selectedMap = null;
            selectedMode = pickingMap ? 'survival' : id;
            updateGameMapList();
        };
        card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.onclick(); } };
        modeRow.appendChild(card);
    }
    const hint = document.createElement('div');
    hint.className = 'mode-hint';
    hint.textContent = pickingMap ? MAPS_ENTRY.hint + (sortedNames.length ? ' — выберите карту:' : ' — карт пока нет (их делают в «Редакторе карт»)') : MODES[selectedMode]?.hint || '';
    mapListDiv.appendChild(hint);

    // the maps themselves: only when «Карты» is chosen
    const grid = document.createElement('div');
    grid.className = 'map-list-grid' + (pickingMap ? '' : ' hidden');
    mapListDiv.appendChild(grid);

    for (const name of sortedNames) {
        const mapData = maps[name];
        const card = document.createElement('div');
        card.className = 'map-card' + (selectedMap && selectedMap.name === name ? ' selected' : '');
        card.dataset.name = name;
        const cvs = document.createElement('canvas');
        cvs.className = 'map-preview-canvas';
        cvs.width = 80;
        cvs.height = 80;
        const ctx = cvs.getContext('2d');
        const cellSize = 80 / (mapData.gridSize || 20);
        ctx.fillStyle = '#120c2c';
        ctx.fillRect(0, 0, 80, 80);
        if (mapData.walls) {
            ctx.fillStyle = '#8f7bd6';
            for (const w of mapData.walls) ctx.fillRect(w.x * cellSize, w.z * cellSize, cellSize, cellSize);
        }
        if (mapData.playerSpawn) {
            ctx.fillStyle = '#ffd76a';
            ctx.beginPath();
            ctx.arc((mapData.playerSpawn.x + 0.5) * cellSize, (mapData.playerSpawn.z + 0.5) * cellSize, cellSize / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        const nameDiv = document.createElement('div');
        nameDiv.className = 'map-name';
        nameDiv.innerText = name;
        card.appendChild(cvs);
        card.appendChild(nameDiv);
        card.onclick = () => {
            pickingMap = true;
            selectedMap = selectedMap && selectedMap.name === name ? null : { ...mapData, name };
            selectedMode = 'survival';
            updateGameMapList();
        };
        grid.appendChild(card);
    }
    if (creativeSettings) creativeSettings.style.display = selectedMode === 'creative' && !pickingMap ? 'block' : 'none';
    const start = $('start-btn');
    start.disabled = pickingMap && !selectedMap;
    start.textContent = pickingMap ? (selectedMap ? '✨ Играть на карте' : 'Выберите карту') : '✨ Создать и играть';
}
window.updateGameMapList = updateGameMapList;
updateGameMapList();

// ------------------------------------------------------------------ version
// Shown in the menu so everyone can see at a glance that the game is up to date
fetch('/api/version').then((r) => r.json()).then((v) => {
    if (v?.sha) net.version = v.sha; // (players must play the same version together)
    setGameVersion(v); // (saved worlds remember the version that wrote them)
    renderSavedWorlds();
    if (!v || !v.date) return;
    const el = $('game-version-top');
    if (el) el.innerHTML = `Версия от <b>${v.date}</b>` + (v.sha ? ` <span class="ver-sha">(${v.sha})</span>` : '');
    // a newer version is out (the launcher downloads it on the next start): say so
    fetch('/api/update').then((r) => r.json()).then((u) => {
        if (!el || !u?.latest || !u.have || u.latest === u.have) return;
        el.insertAdjacentHTML('beforeend', '<div class="ver-new">✨ Вышла новая версия игры — закройте окно игры, подождите полминуты и откройте снова значком: она скачается сама.</div>');
    }).catch(() => {});
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
        // …and it must be ME who said it: my lips moved (the camera sees the mouth), and it isn't
        // the echo of a spell a friend has just cast (their voice from my speakers / headphones)
        const heard = matchSpell(command);
        // (alone too: a wizard of the game may have just said that spell's word aloud from the speakers)
        if (heard && (game.remotes?.size > 0 || game.voiceGate.echoes(heard, performance.now()))) {
            const gate = game.voiceGate.check(heard, performance.now());
            if (!gate.ok) {
                hud.setVoice(gate.why === 'lips' ? `🔇 «${escapeHtml(command)}» — ваши губы не двигались: это сказали не вы` : `🔇 «${escapeHtml(command)}» — это чужой голос (это заклинание только что сказал кто-то другой)`);
                if (isFinal) netLog(`заклинание «${command}» не моё: ${gate.why === 'lips' ? 'губы не двигались' : 'эхо заклинания друга'}`);
                return;
            }
        }
        // talking to a villager near me, the hand not raised to cast: words they understand are words,
        // not a spell («собери войско» is not «Gather», «спасибо» is not «Rescue», «в атаку» is an order)
        if (isFinal && !game.isMagicActive && Date.now() - game.lastMagicTime > 1500 && game.castleLife?.talk?.claims?.(command) && game.castleLife.talk.hear(command)) {
            hud.setVoice(`🗣️ Вы: «${escapeHtml(command)}»`);
            return;
        }
        // (the same with a ship's sailor near me)
        if (isFinal && !game.isMagicActive && Date.now() - game.lastMagicTime > 1500 && game.ships?.crew.claims(command) && game.ships.crew.hear(command)) {
            hud.setVoice(`🗣️ Вы: «${escapeHtml(command)}»`);
            return;
        }
        const name = game.castLocalSpell(command, isFinal);
        // not a spell: maybe you are talking to someone in a castle (only one close enough hears)
        // («стоп» with nothing to stop is still words to a villager: «стой» / «стоп» = stop following me)
        if (!name && isFinal && (!heard || heard === 'Stand') && (game.castleLife?.talk?.hear(command) || game.ships?.crew.hear(command))) {
            hud.setVoice(`🗣️ Вы: «${escapeHtml(command)}»`);
            return;
        }
        if (name) {
            voice.learnOwnVoice();
            hud.setVoice(`✨ <span style="color:#55efc4">${name.toUpperCase()}</span> (было: "${escapeHtml(command)}")`);
            if (voiceTestText && isMenuVoiceActive) voiceTestText.innerHTML = `✨ ${name.toUpperCase()} ✨`;
        }
    }
};

// ------------------------------------------------------------------ hand recording (F9)
let handRecorder = null;
function startHandRecording() {
    if (!game) return;
    if (!handRecorder || handRecorder.game !== game) handRecorder = new HandRecorder(game, poseService);
    if (handRecorder.active) return;
    let left = 10;
    const say = (t) => hud.setVoice?.(t, true);
    // (the result stays on the screen a while: other notes would cover it at once)
    const done = (text) => { clearInterval(tick); let n = 0; const keep = setInterval(() => { say(text); if (++n > 30) clearInterval(keep); }, 300); say(text); };
    if (!handRecorder.start(10, done)) return;
    say(`🔴 Запись руки: ${left} с — двигайте палочкой / рукой как обычно`);
    const tick = setInterval(() => { left--; if (left > 0) say(`🔴 Запись руки: ${left} с`); }, 1000);
}

// ------------------------------------------------------------------ keyboard
window.addEventListener('keydown', (e) => {
    // Escape: the pause menu (continue / back to the main menu)
    if (e.key === 'Escape' && game && game.active) { e.preventDefault(); togglePauseMenu(); return; }
    if (!game || !game.active || e.target.tagName === 'INPUT') return;
    if (!$('pause-menu').classList.contains('hidden')) return; // (the menu is open)
    // F9: a 10-second recording of the hands for the developer (HandRecorder.js)
    if (e.key === 'F9') { e.preventDefault(); startHandRecording(); return; }
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '9' && game.inventory) game.inventory.select(Math.min(parseInt(k, 10), game.inventory.slots.length) - 1);
    if ((k === '0' || k === '`' || k === 'ё') && game.inventory) game.inventory.select(-1);
    if ((k === 'j' || k === 'о') && game.animals) game.animals.tryMount();
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
    // the menu is a window; the game itself is played full screen
    if (!window.__ZNS_NO_FULLSCREEN__) enterGameFullscreen();
    window.__charEditor?.hide(); // (its preview must not keep drawing under the game)
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
    const cfg = readConfig();
    if (!cfg.map) cfg.worldName = `${modeLabel(cfg.mode) || 'Мир'} — ${new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    startGame(cfg);
});

// ------------------------------------------------------------------ «Создать мир»
let createTouched = false; // (the player opened or closed it: leave it as they want)
function showCreateWorld(on) {
    $('create-world').classList.toggle('hidden', !on);
    $('create-world-btn').classList.toggle('hidden', on);
}
$('create-world-btn').addEventListener('click', () => { createTouched = true; showCreateWorld(true); });
$('create-cancel').addEventListener('click', () => { createTouched = true; showCreateWorld(false); });

// ------------------------------------------------------------------ saved worlds
// Every world you play (not the maps) is saved by itself; continue it here.
async function renderSavedWorlds() {
    const box = $('saved-worlds');
    const sel = $('mp-world');
    const worlds = await listWorlds();
    if (sel) {
        const cur = sel.value;
        sel.innerHTML = '<option value="">✨ Новый мир</option>' + worlds.map((w) => `<option value="${w.id}">💾 ${escapeHtml(w.name)}</option>`).join('');
        if (worlds.some((w) => w.id === cur)) sel.value = cur;
    }
    if (!box) return;
    if (!worlds.length) {
        box.innerHTML = '<div class="worlds-empty">Пока нет ни одного мира. Созданный мир сохраняется сам — потом его можно продолжить отсюда.</div>';
        if (!createTouched) showCreateWorld(true); // (nothing to continue: the choice is open at once)
        return;
    }
    if (!createTouched) showCreateWorld(false); // (worlds to continue: the choice waits for «Создать мир»)
    box.innerHTML = worlds.map((w) => {
        const ver = worldVersionLabel(w);
        return `
        <div class="world-row" data-id="${w.id}">
            <span class="world-name">${escapeHtml(w.name)}</span>
            <span class="world-meta">${modeLabel(w.mode)} · ${new Date(w.updated).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            <button class="mp-btn world-play">▶ Продолжить</button>
            <button class="mp-btn mp-btn-grey world-del" title="Удалить">🗑</button>
            <span class="world-ver${ver.old ? ' old' : ''}" title="${ver.old ? 'Сохранён другой версией игры' : 'Сохранён этой версией игры'}">${escapeHtml(ver.text)}</span>
            <span class="world-confirm hidden">Удалить этот мир навсегда? <button class="mp-btn world-del-yes">Да, удалить</button> <button class="mp-btn mp-btn-grey world-del-no">Нет</button></span>
        </div>`;
    }).join('');
    for (const row of box.querySelectorAll('.world-row')) {
        const id = row.dataset.id;
        const ask = row.querySelector('.world-confirm');
        const asking = (on) => {
            ask.classList.toggle('hidden', !on);
            row.classList.toggle('confirming', on);
            for (const b of row.querySelectorAll('.world-play, .world-del')) b.classList.toggle('hidden', on);
        };
        row.querySelector('.world-play').onclick = async () => {
            const w = await loadWorld(id);
            if (!w) return;
            startGame({ ...readConfig(), mode: w.mode, map: null, seed: w.seed, saved: w });
        };
        // deleting asks first — right in the row, in the game's own look
        row.querySelector('.world-del').onclick = () => asking(true);
        row.querySelector('.world-del-no').onclick = () => asking(false);
        row.querySelector('.world-del-yes').onclick = async () => {
            await deleteWorld(id);
            renderSavedWorlds();
        };
    }
}
renderSavedWorlds();

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

// ------------------------------------------------------------------ the menu window's own buttons
setupWindowControls({
    min: $('win-min'), full: $('win-full'), close: $('win-close'),
    onNote: (t) => { const n = $('win-note'); if (!n) return; n.textContent = t; n.classList.add('on'); clearTimeout(n._t); n._t = setTimeout(() => n.classList.remove('on'), 4000); },
});
// the game's own window (shortcut / .bat): no Windows frame, exactly the menu's size
if (!window.__ZNS_NO_FULLSCREEN__) becomeAppWindow({ bar: document.querySelector('#main-menu .brand') });

// ------------------------------------------------------------------ pause menu (Escape)
// (in a game with others the world goes on; alone it waits)
// «🔊 Звук» in the pause menu: the sound settings without leaving the game
const pauseAudio = setupPauseAudio($('pause-audio'));
function showPauseTab(id) {
    document.querySelectorAll('.pause-tab').forEach((b) => b.classList.toggle('active', b.dataset.pauseTab === id));
    document.querySelectorAll('.pause-pane').forEach((p) => p.classList.toggle('active', p.id === id));
    if (id === 'pause-audio') pauseAudio.sync();
}
document.querySelectorAll('.pause-tab').forEach((b) => { b.onclick = () => showPauseTab(b.dataset.pauseTab); });
function togglePauseMenu(show) {
    const el = $('pause-menu');
    const open = show ?? el.classList.contains('hidden');
    if (open) { pauseAudio.sync(); showPauseTab('pause-main'); }
    el.classList.toggle('hidden', !open);
    if (open && document.pointerLockElement) document.exitPointerLock();
    if (game && !(net && net.active)) game.paused = open;
}
$('pause-continue-btn').onclick = () => togglePauseMenu(false);
$('pause-exit-btn').onclick = async () => {
    $('pause-exit-btn').disabled = true;
    $('pause-exit-btn').textContent = '💾 Сохраняем мир...';
    try { game?.sync?._sendMine?.(); } catch (e) { /* ignore */ }
    try { await Promise.race([game?.keeper?.save?.(), new Promise((r) => setTimeout(r, 3000))]); } catch (e) { /* the page still leaves */ }
    backToMenu();
};
window.addEventListener('pagehide', () => { try { game?.sync?._sendMine?.(); } catch (e) { /* closing */ } net.sayGoodbye(); });
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
try {
    mpName.value = localStorage.getItem('zns-name') || '';
    mpServer.value = localStorage.getItem('zns-server') || '';
    $('mp-srv-name').value = localStorage.getItem('zns-srv-name') || '';
} catch (e) { /* ignore */ }
setTimeout(() => customServerWarning(), 0);

function setMpStatus(html) { mpStatus.innerHTML = html; }
/** A connection server typed in by hand: only players with the very same one see each other. */
function customServerWarning() {
    const el = $('mp-custom-warn');
    const v = (mpServer.value || '').trim();
    if (el) el.innerHTML = v ? `⚠️ Указан свой сервер связи «${escapeHtml(v)}» — друзья увидят вас, только если у них указан такой же. Обычно поле пустое.` : '';
}
mpServer.addEventListener('input', customServerWarning);
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
let lastSeenServers = '';
let pickedServer = null;
let refreshing = false;
async function refreshServers() {
    if (refreshing || net.active || (game && game.active) || window.__ZNS_NO_WORLD_PROBE__) { renderServers(); return; }
    refreshing = true;
    try { servers = await net.listServers(mpServer.value); } catch (e) { servers = null; }
    refreshing = false;
    const seen = servers ? servers.map((s) => s.code + (s.noInfo ? '(без прямой связи)' : '')).join(', ') || 'нет' : 'нет связи с сервером связи';
    if (seen !== lastSeenServers) { lastSeenServers = seen; netLog('список серверов: ' + seen); }
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
            // (a server there, but no direct link to it yet: no name / players known)
            row.innerHTML = sv.noInfo
                ? `<span class="mp-srv-name">Сервер ${escapeHtml(sv.code)}</span><span>—</span><span title="нет прямой связи">?/${sv.max || MAX_PLAYERS}</span>`
                : `<span class="mp-srv-name">${escapeHtml(sv.name || 'Сервер')}</span><span>${modeTitle(sv.mode) || '—'}</span><span class="${full ? 'mp-full' : ''}">${sv.players.length}/${sv.max || MAX_PLAYERS}</span>`;
            row.onclick = () => { pickedServer = sv; renderServers(); };
            list.appendChild(row);
        }
    }
    const info = $('mp-server-info');
    const sv = pickedServer && servers?.find((x) => x.code === pickedServer.code);
    if (!sv) { info.innerHTML = '<div class="mp-empty">Нажмите на сервер — здесь появятся игроки и кнопка «Войти»</div>'; return; }
    const full = sv.players.length >= (sv.max || MAX_PLAYERS);
    if (sv.noInfo) {
        info.innerHTML = `<h4>Сервер ${escapeHtml(sv.code)}</h4><div class="mp-info-mode">Сервер есть, но прямой связи с ним пока нет — попробуйте войти: если не выйдет, игра скажет почему.</div>
            <button id="mp-enter-btn" class="mp-btn">▶ Войти</button>`;
        $('mp-enter-btn').onclick = () => joinRoom(sv.code);
        return;
    }
    info.innerHTML = `<h4>${escapeHtml(sv.name || 'Сервер')}</h4><div class="mp-info-mode">${modeTitle(sv.mode)}${sv.playing ? ' · идёт игра' : ''}</div>
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
    net.serverName = servers?.find((x) => x.code === code)?.name || 'Сервер';
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
    const savedId = $('mp-world')?.value || '';
    const saved = savedId ? await loadWorld(savedId) : null;
    const mode = saved ? saved.mode : $('mp-mode').value;
    setMpStatus('Создаём сервер...');
    try {
        await net.host(playerName(), mpServer.value, null, { slots: true });
        net.info = { name: srvName, mode, playing: false };
        setMpStatus(`🟢 Сервер создан — он виден всем в списке. Код: <span class="mp-code-big">${net.code}</span> (если друг не видит сервер — пусть войдёт по коду). Запускаем...`);
        showCodeInGame(net.code);
        selectedMode = mode;
        selectedMap = null;
        pickingMap = false;
        startGame(saved ? { ...readConfig(), mode, map: null, seed: saved.seed, saved } : { ...readConfig(), mode, map: null, worldName: srvName });
    } catch (e) {
        setMpStatus('❌ ' + escapeHtml(e.message));
    }
});

// A game by code: works even when the server list can't be seen (a bad line, a VPN)
$('mp-private-btn').addEventListener('click', async () => {
    net.stopProbe();
    const savedId = $('mp-world')?.value || '';
    const saved = savedId ? await loadWorld(savedId) : null;
    const mode = saved ? saved.mode : $('mp-mode').value;
    setMpStatus('Создаём игру по коду...');
    try {
        const code = await net.host(playerName(), mpServer.value);
        net.info = { name: 'Игра по коду', mode, playing: false };
        setMpStatus(`🔑 Код вашей игры: <span class="mp-code-big">${code}</span><br>Скажите его другу: «Мультиплеер» → «Войти по коду». Запускаем игру...`);
        renderPlayers();
        selectedMode = mode;
        selectedMap = null;
        pickingMap = false;
        startGame(saved ? { ...readConfig(), mode, map: null, seed: saved.seed, saved } : { ...readConfig(), mode, map: null, worldName: 'Игра ' + code });
        showCodeInGame(code);
    } catch (e) {
        setMpStatus('❌ ' + escapeHtml(e.message));
    }
});

/** The host sees the room code in the game for a while (to tell friends). */
function showCodeInGame(code) {
    let n = 0;
    const t = setInterval(() => {
        n++;
        if (game?.active && game.hud?.notify) { game.hud.notify(`🔑 Код игры: ${code} — друг входит: «Мультиплеер» → «Войти по коду»`); clearInterval(t); }
        else if (n > 60) clearInterval(t);
    }, 1000);
}

$('mp-join-btn').addEventListener('click', async () => {
    const code = (mpCode.value || '').trim().toUpperCase();
    if (code.length < 4) { setMpStatus('Введите код комнаты от друга.'); return; }
    setMpStatus('Подключаемся...');
    net.serverName = 'Закрытая игра';
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
net.on('relayed', ({ who }) => {
    const text = `🐢 Связь с ${who} идёт через посредника (прямое соединение не вышло) — может подтормаживать`;
    if (game?.active && game.hud?.notify) game.hud.notify(text); else setMpStatus(escapeHtml(text));
});
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
    startGame({ ...local, mode: msg.config.mode, map: msg.config.map, zombieCount: msg.config.zombieCount, seed: msg.config.seed, gen: msg.config.gen ?? 1 }, msg);
});

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Hooks for automated tests (read-only helpers + pose injection)
// ------------------------------------------------------------------ remembered settings
// Volumes, graphics, camera… are kept in this browser between launches.
(function rememberSettings() {
    const KEY = 'zns-settings';
    const IDS = ['zombie-vol', 'music-vol', 'spell-vol', 'voice-filter', 'audio-ambient-toggle', 'villager-voice', 'villager-text', 'villager-ai', 'cam-smooth', 'cam-sens', 'fps-limit', 'model-quality',
        'hand-quality', 'camera-res', 'vision-engine', 'vision-delegate', 'graphics-quality', 'camera-mode-toggle',
        'show-hands-toggle', 'drift-camera', 'creative-zombie-count', 'minimap-size'];
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
    // (the camera network always starts in its own thread; the «game thread» choice is gone)
    if (saved['vision-engine'] === 'classic-main') saved['vision-engine'] = 'classic';
    // every sound at 20% — once for everybody (later each one's own choice is kept)
    const vol20 = !saved.vol20;
    if (vol20) for (const id of ['zombie-vol', 'music-vol', 'spell-vol']) saved[id] = '20';
    const save = () => {
        const out = {};
        for (const id of IDS) {
            const el = $(id);
            if (el) out[id] = el.type === 'checkbox' ? el.checked : el.value;
        }
        const hv = document.querySelector('input[name="hand-version"]:checked');
        if (hv) out.handVersion = hv.value;
        out.vol20 = true;
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
    if (vol20) save(); // (remembered: done once)
})();

window.__zns = Object.defineProperties(window.__zns || {}, Object.getOwnPropertyDescriptors({ THREE, bombardoRadius, get game() { return game; }, poseService, net, voice, startGame, readConfig, get pendingWelcome() { return pendingWelcome; } }));
console.log(GAME_NAME + ': готово.');
