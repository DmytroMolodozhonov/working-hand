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
import { Hud, setMinimapSize, lastWords } from './ui/Hud.js';
import { MapEditor } from './ui/MapEditor.js';
import { setupTestMode } from './ui/TestMode.js';
import { Game } from './game/Game.js';
import { Network, MAX_PLAYERS, netLog } from './net/Network.js';
import { renderSpellsTab, renderItemsTab, renderMechanicsTab, renderBossesTab } from './ui/Codex.js';
import { listWorlds, loadWorld, deleteWorld, setGameVersion, worldVersionLabel } from './game/WorldSave.js';
import { CharacterEditor, activeLook } from './ui/CharacterEditor.js';
import { matchSpell, bombardoRadius } from './fx/SpellManager.js';
import { fromGame, soundingLine } from './audio/GameVoices.js';
import { spellPhrase, PHRASE_WHY_RU, afterCast, bodyNoise, soundTrust, wordsOfLine, stopFirst } from './audio/SpellPhrase.js';
import { SPELL_RU } from './game/ItemTypes.js';
import { GATE } from './game/VoiceGate.js';
import { startCamera } from './ui/CameraPanel.js';
import { setupPauseAudio, PAUSE_GRAPHICS_IDS } from './ui/PauseAudio.js';
import { viewDistanceScale } from './game/Quality.js';
import { setupWindowControls, enterGameFullscreen, becomeAppWindow } from './ui/WindowControls.js';
import { GAME_NAME, MODES, MODE_ORDER, MAPS_ENTRY, modeLabel, modeTitle } from './ui/GameNames.js';
import { setupLogPanel, keepLauncherAlive } from './ui/JournalTab.js';
import { watchServer } from './ui/ServerLost.js';
import { runUpdate, updateIfNewer, canUpdate, rememberRejoin, pendingRejoin } from './ui/UpdateScreen.js';

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
// («Сглаживание краёв» in the settings can turn it on or off for good: the next start)
const antialias = (() => {
    try {
        const a = (JSON.parse(localStorage.getItem('zns-settings') || '{}') || {}).antialias;
        if (a === 'on' || a === 'off') return a === 'on';
    } catch (e) { /* not remembered */ }
    return graphicsLevel >= 3;
})();
const renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' });
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
// «Механика игры» sub-tabs: «Как игра работает» / «Боссы»
document.querySelectorAll('#tab-mechanics [data-mech]').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#tab-mechanics [data-mech]').forEach((b) => {
            b.classList.toggle('active', b === btn);
            $(b.dataset.mech).hidden = b !== btn;
        });
        if (btn.dataset.mech === 'bosses-list') renderBossesTab('bosses-list');
    });
});
// Settings sub-tabs
document.querySelectorAll('#tab-settings .sub-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#tab-settings .sub-tab').forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll('#tab-settings .sub-pane').forEach((p) => p.classList.toggle('active', p.id === btn.dataset.sub));
    });
});
// Settings: the villagers' net — which one and its state («загружается…», «готова»), the last game's when none is running
(function villagerNetState() {
    const el = $('villager-ai-state');
    if (!el) return;
    const show = (st, old = false) => {
        if (!st?.text) return;
        el.textContent = `${old ? 'В прошлой игре' : 'Сейчас'}: ${st.text}`;
        el.style.color = st.state === 'ready' ? '#7bed9f' : st.state === 'failed' ? '#ff6b81' : '#eccc68';
    };
    try { show(JSON.parse(localStorage.getItem('zns-llm-state') || 'null'), true); } catch (e) { /* ignore */ }
    window.addEventListener('zns-llm-state', (e) => show(e.detail));
})();
// Settings → «Журнал»; and the app launcher keeps running while this window is open
setupLogPanel(document, () => (game?.spellLog ? { name: 'zns-spells.log', title: 'Заклинания (эта игра)', text: game.spellLog.text() } : null));
keepLauncherAlive();
watchServer(); // (the game's program closed while the window is open: said plainly, and back by itself)

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
const talkVolInput = $('talk-vol');
talkVolInput?.addEventListener('input', (e) => {
    $('talk-vol-val').textContent = e.target.value + '%';
    if (sound) sound.setTalkVolume(parseInt(e.target.value, 10));
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
        viewDistance: $('view-distance')?.value || 'medium',
        resolution: $('camera-res').value,
        cameraMode: $('camera-mode-toggle').checked ? 'fpv' : 'tpv',
        showHands: showHandsToggle ? showHandsToggle.checked : false,
        handVersion: document.querySelector('input[name="hand-version"]:checked')?.value || 'v3',
        v5gpu: !!$('v5-gpu')?.checked, // (V5's more exact finder on the video card)
        handQuality: ($('hand-quality')?.value || 'high').includes('high') ? 'high' : 'low',
        drifting: $('drift-camera') ? $('drift-camera').checked : true,
        leftHanded: $('handedness')?.value === 'left',
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
            applyFps();
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
// (a friend's server is being joined with its version, just downloaded: keep that one)
const rejoinNow = pendingRejoin(true);
fetch('/api/version').then((r) => r.json()).then((v) => {
    if (v?.sha) net.version = v.sha; // (players must play the same version together)
    if (v?.full) net.fullVersion = v.full;
    setGameVersion(v); // (saved worlds remember the version that wrote them)
    renderSavedWorlds();
    if (!v || !v.date) return;
    const el = $('game-version-top');
    if (el) el.innerHTML = `Версия от <b>${v.date}</b>` + (v.sha ? ` <span class="ver-sha">(${v.sha})</span>` : '');
    // a newer version is out: it is downloaded right now (a loading window), then the menu opens again
    fetch('/api/update?fresh=1').then((r) => r.json()).then(async (u) => {
        if (game?.active || starting || rejoinNow) return; // (never in the middle of a game)
        await updateIfNewer(u);
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

// (multiplayer, my lips not seen: a spell waits a moment — the friend's word may be on its way over the network)
let heldSpell = null;
function holdSpell(command, isFinal) {
    if (heldSpell) { heldSpell.command = command; heldSpell.isFinal = heldSpell.isFinal || isFinal; return; }
    heldSpell = { command, isFinal };
    setTimeout(() => { const h = heldSpell; heldSpell = null; if (h) voice.onResult(h.command, h.isFinal, true); }, GATE.HOLD);
}

// Talking to a villager: the browser marks the words «final» only a good while after you stop. When the
// words being caught stop changing for a moment (no spell's sound in them), the villager answers now;
// the browser's own final of the same words later is not a second question.
const TALK_STILL = 700; // ms
let talkWait = null, talkEarly = null;
const talkKey = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim();
// The spell journal (Settings → Журнал → «Заклинания», zns-spells.log): every phrase and what came of it.
const spellRu = (n) => (n ? SPELL_RU[n] || n : null);
let lastJournal = null;
let lastCast = null; // the last spell the voice cast {spell, at, seg} (SpellPhrase.afterCast)
function journal(command, isFinal, meta, spell, ok, why, source = '') {
    const log = game?.spellLog;
    if (!log || !command) return;
    // (a phrase still being said: only when a spell came of it, or a spell was held back — once per words)
    if (!isFinal && !spell) return;
    // (the network's words while the phrase is still said: the sound decides the spell — no line per look)
    if (!isFinal && meta?.native && meta.talkOnly && !ok) return;
    const key = `${command}|${spell}|${ok}|${why}`;
    const now = performance.now();
    if (lastJournal && lastJournal.key === key && now - lastJournal.at < 4000) return;
    lastJournal = { key, at: now };
    const m = { ...(meta || {}) };
    if (!m.native) { const pk = voice.recentPeak?.(2500); if (Number.isFinite(pk)) { m.peak = pk; m.snr = pk - voice.noiseFloor; } }
    // (how fast: from the start of the spell's words and from their last letter to the cast)
    if (ok && Number.isFinite(m.to)) { m.lag = now - m.to; if (Number.isFinite(m.from)) m.fromStart = now - (m.from + 200); }
    const line = soundingLine(m.from ?? now - 2500, m.to ?? now);
    if (line) m.gameLine = line;
    log.add({ text: command, isFinal: isFinal || !!m.settled, meta: m, source, spell: spellRu(spell), ok, why });
}

function earlyTalk(command) {
    clearTimeout(talkWait);
    talkWait = setTimeout(() => {
        talkWait = null;
        const T = game?.castleLife?.talk;
        if (!game?.active || !T || game.isMagicActive || Date.now() - game.lastMagicTime < 1500 || (matchSpell(command) && spellPhrase(command).ok)) return;
        if (!$('pause-menu')?.classList.contains('hidden')) return; // (the pause menu opened meanwhile)
        if (!T._listener?.() || !T.hear(command)) return;
        talkEarly = { key: talkKey(command), at: performance.now() };
        hud.setVoice(`🗣️ Вы: «${escapeHtml(command)}»`);
    }, TALK_STILL);
}

voice.onResult = (command, isFinal = true, held = false, meta = null) => {
    if (!command) return;
    // the pause menu (Esc) is open: nothing said is heard — no spell, no word to a villager
    if (game?.active && !$('pause-menu')?.classList.contains('hidden')) { journal(command, isFinal, meta, matchSpell(command), false, 'открыто меню паузы — голос не слушается'); return; }
    // (the words go on / are final: the early answer waits for them, or is already given)
    if (talkWait) { clearTimeout(talkWait); talkWait = null; }
    if (talkEarly && performance.now() - talkEarly.at < 5000) {
        const k = talkKey(command);
        if (k === talkEarly.key || talkEarly.key.startsWith(k)) { if (isFinal) talkEarly = null; return; }
        talkEarly = null; // (more words after the answer: a new question)
    }
    // Only words, never a spell: a spell's word inside a sentence («…огонь горит у ворот», «спасибо»,
    // «сегодня солнце светит»). A spell is the phrase itself, said on its own (SpellPhrase.js; the native
    // voice already tells by the sound — NativeVoice).
    const phrase = spellPhrase(command, { final: isFinal || !!meta?.settled });
    const loose = !!phrase.name && !phrase.ok && !game?.planetMagic?._naming && !game?.vortex?.bubbleOpen?.();
    const talkOnly = !!meta?.talkOnly || loose;
    const talkWhy = loose ? PHRASE_WHY_RU[phrase.why] || 'обычная речь' : 'слово заклинания внутри обычной фразы — это разговор';
    if (!isFinal && !held && game?.active && (!matchSpell(command) || talkOnly) && game.castleLife?.talk?._listener?.() && !game.owls?.claims?.(command)) earlyTalk(command);
    if (isMenuVoiceActive && voiceTestText) {
        voiceTestText.innerText = `"${command.toUpperCase()}"`;
        voiceTestText.style.color = '#55efc4';
        if (matchSpell(command)) {
            voiceTestText.style.color = '#ff4757';
            voiceTestText.innerHTML = `✨ ${command.toUpperCase()} ✨`;
        }
    }
    if (game && game.active) {
        game._voiceMeta = meta; // (when the words were said: the journal counts how late the spell came — Game.castLocalSpell)
        // the words being caught: a big short line, only in Creative (partly a developer mode)
        hud.heard(command, game.config?.mode === 'creative' && !!$('show-heard-toggle')?.checked); // (off by default; switched in the settings or the pause menu)
        // talking to a villager near me, the hand not raised to cast: words they understand are words,
        // not a spell («собери войско» is not «Gather», «спасибо» is not «Rescue», «в атаку» is an order)
        // (first: they cast nothing, so the checks below that a spell is really mine — loudness, lips,
        // a friend's echo — must not eat a guest's words to a villager)
        // (in a port both may be near: the nearer one — a sailor at the rail or a man on the pier — hears)
        // a clever owl that loves me, near me: «я хочу найти паучиху» is for it — no spell, no word to a
        // villager (only then: without such an owl the words go on as always — Owls.claims)
        if (game.owls?.claims?.(command)) {
            if (isFinal) game.owls.hear(command);
            journal(command, isFinal, meta, null, false, 'слова для совы рядом');
            return;
        }
        const sailorFirst = !!game.ships?.crew.heardFirst?.(game.castleLife?.talk);
        if (isFinal && !sailorFirst && !game.isMagicActive && Date.now() - game.lastMagicTime > 1500 && game.castleLife?.talk?.claims?.(command) && game.castleLife.talk.hear(command)) {
            journal(command, isFinal, meta, null, false, 'это разговор с жителем (рука не поднята)');
            return; // (your words are in the «heard» line in Creative; the villager answers in its bubble)
        }
        // (the same with a ship's sailor near me)
        if (isFinal && !game.isMagicActive && Date.now() - game.lastMagicTime > 1500 && game.ships?.crew.claims(command) && game.ships.crew.hear(command)) {
            journal(command, isFinal, meta, null, false, 'это разговор с моряком (рука не поднята)');
            return;
        }
        if (talkOnly) {
            if (isFinal) game.castleLife?.talk?.hear(command) || game.ships?.crew.hear(command);
            journal(command, isFinal, meta, phrase.name, false, phrase.name ? `не заклинание: ${talkWhy}` : 'обычная речь');
            return;
        }
        // A spell's words in what the game itself said aloud just then — a merchant's «…на костре», a
        // guard's «огонь!», a wizard's «Бомбардо!» from the speakers: their voice, not mine. The game knows
        // its own lines and when they sounded (GameVoices.js) — whatever the microphone and the setup.
        // (my mouth moved with the voice the microphone heard: mine, even over the Ice Queen's taunts)
        const spoken = matchSpell(command);
        if (spoken) {
            const now = performance.now();
            // (or the game's voices were made quiet then — the hand raised to cast: what was heard is mine)
            const mine = game.voiceGate.lipsSync(now, voice._levels, voice.noiseFloor) === true || !!game.voicesDucked?.(meta?.from ?? now - 1500);
            const line = fromGame(spoken, { ...meta, from: meta?.from ?? now - 2500, to: meta?.to ?? now, mine });
            if (line) {
                if (isFinal) netLog(`заклинание «${command}» не моё: его слова только что сказал голос игры`);
                journal(command, isFinal, meta, spoken, false, `отсеяно как голос игры: «${String(line).slice(0, 60)}»`, 'голос игры');
                return;
            }
            // (the network wrote the very words a game's voice was saying then: «так спасибо» over «Спасибо, братцы!»)
            const sounding = meta?.native && !mine ? soundingLine(meta.from ?? now - 2500, meta.to ?? now) : null;
            if (sounding && meta.written && wordsOfLine(meta.written, sounding)) {
                journal(command, isFinal, meta, spoken, false, `отсеяно: это слова голоса игры «${String(sounding).slice(0, 60)}»`, 'голос игры');
                return;
            }
        }
        // right after a spell of mine: its explosion, its echo, the end of the same phrase are no new spell
        if (spoken) {
            const no = afterCast(lastCast, spoken, meta, performance.now());
            if (no) { journal(command, isFinal, meta, spoken, false, `отсеяно: ${no}`); return; }
            // breathing, steps, a rustle while running read as «Даст», «Джолт»: the mouth and the fit tell
            const lips = game.voiceGate.lipsMoved(performance.now());
            const running = !!game.character?.isRunning;
            if (meta) { meta.lips = lips; meta.running = running; }
            const noise = bodyNoise({ spell: spoken, text: command, native: !!meta?.native, fit: meta?.fit, len: meta?.len, snr: meta?.snr, running, lips })
                // (found by its sound: how sure, weighed with how like the spell the written letters are, the lips, the run)
                || (meta?.native && meta.sure && !meta.byWords ? soundTrust({ spell: spoken, canonical: command, written: meta.written, fit: meta.fit, len: meta.len, far: meta.far, running, lips }) : null);
            if (noise) { journal(command, isFinal, meta || { lips, running }, spoken, false, `отсеяно: ${noise}`); return; }
            // «стоп, раскрой свои секреты»: first the stop (what I hold lets go), then the spell
            if (spoken !== 'Stand' && game.focus?.held?.() && stopFirst(meta?.written || command)) {
                const st = game.castLocalSpell('стоп', true);
                journal('стоп', true, meta, 'Stand', !!st, st ? '' : castWhy('Stand'), 'микрофон игрока');
            }
        }
        // The native voice with the speakers' sound taken out of the microphone (voice_native.py): a
        // friend's voice from Discord / the speakers never got here at all, and a spell heard in the
        // speakers' sound too was already let go (voice.onEcho). Nothing more to check — the lips, the
        // loudness and the network's echo only ever guessed that, and sometimes ate my own spells.
        if (meta?.native && meta.aec) {
            const said = matchSpell(command);
            // (settled: the voice already waited for a possible «… Максима» / «… Хаус» — as good as the phrase's end)
            const name = game.castLocalSpell(command, isFinal || !!meta.settled);
            if (name) lastCast = { spell: name, at: performance.now(), seg: meta?.seg };
            if (said) journal(command, isFinal, meta, said, !!name, name ? '' : castWhy(said), 'микрофон игрока');
            else journal(command, isFinal, meta, null, false, 'обычная речь — заклинания нет', 'микрофон игрока');
            if (name) {
                if (game.remotes?.size > 0) game.sync?.say?.(said);
                voice.learnOwnVoice();
                hud.setVoice(`✨ <span style="color:#55efc4">${name.toUpperCase()}</span>`);
                if (voiceTestText && isMenuVoiceActive) voiceTestText.innerHTML = `✨ ${name.toUpperCase()} ✨`;
            } else if (isFinal && (!said || said === 'Stand')) {
                if (sailorFirst) game.ships.crew.hear(command) || game.castleLife?.talk?.hear(command);
                else game.castleLife?.talk?.hear(command) || game.ships?.crew.hear(command);
            }
            return;
        }
        const margin = parseInt($('voice-filter')?.value ?? '9', 10);
        // Multiplayer: a friend's voice heard by this microphone must not cast here
        if (margin > 0 && game.remotes?.size > 0 && matchSpell(command) && !voice.isOwnVoice(margin)) {
            netLog(`заклинание «${command}» не моё: тише моего голоса`);
            journal(command, isFinal, meta, matchSpell(command), false, 'отсеяно: тише моего голоса (похоже, голос друга)');
            return;
        }
        // …and it must be ME who said it: my lips moved (the camera sees the mouth), and it isn't
        // the echo of a spell a friend has just cast (their voice from my speakers / headphones)
        const heard = matchSpell(command);
        // (alone too: a wizard of the game may have just said that spell's word aloud from the speakers)
        if (heard && (game.remotes?.size > 0 || game.voiceGate.echoes(heard, performance.now()))) {
            const gate = game.voiceGate.check(heard, performance.now(), { levels: voice._levels, floor: voice.noiseFloor });
            if (!gate.ok) {
                if (isFinal || held) netLog(`заклинание «${command}» не моё: ${gate.why === 'lips' ? 'губы не двигались' : 'эхо заклинания друга'}`);
                journal(command, isFinal || held, meta, heard, false, gate.why === 'lips' ? 'отсеяно: губы не двигались (камера) — это не ваш голос' : 'отсеяно: эхо заклинания друга');
                return;
            }
            if (game.remotes?.size > 0) {
                // sure it's me (my lips moved right then): the others are told at once — my voice from
                // their speakers then casts nothing there; not sure: wait a moment for their word
                if (gate.sure) game.sync?.say?.(heard);
                else if (!held) { holdSpell(command, isFinal); return; }
                else game.sync?.say?.(heard);
                if (isFinal || held) netLog(`заклинание «${command}» моё: ${gate.sure ? 'рот двигался вместе с голосом' : 'лица не видно — друг этого заклинания не говорил'}`);
            }
        }
        const name = game.castLocalSpell(command, isFinal || !!meta?.settled);
        if (name) lastCast = { spell: name, at: performance.now(), seg: meta?.seg };
        if (heard) journal(command, isFinal || held, meta, heard, !!name, name ? '' : castWhy(heard), 'микрофон игрока');
        else journal(command, isFinal, meta, null, false, 'обычная речь — заклинания нет', 'микрофон игрока');
        // not a spell: maybe you are talking to someone in a castle (only one close enough hears)
        // («стоп» with nothing to stop is still words to a villager: «стой» / «стоп» = stop following me)
        if (!name && isFinal && (!heard || heard === 'Stand') && (sailorFirst ? game.ships.crew.hear(command) || game.castleLife?.talk?.hear(command) : game.castleLife?.talk?.hear(command) || game.ships?.crew.hear(command))) {
            return; // (your words are in the «heard» line in Creative; the villager answers in its bubble)
        }
        if (name) {
            voice.learnOwnVoice();
            hud.setVoice(`✨ <span style="color:#55efc4">${name.toUpperCase()}</span>`);
            if (voiceTestText && isMenuVoiceActive) voiceTestText.innerHTML = `✨ ${name.toUpperCase()} ✨`;
        }
    }
};

// The native voice heard a spell only as the speakers' echo (a friend over Discord, the game itself)
voice.onEcho = (words, meta) => {
    if (!game?.active) return;
    netLog(`заклинание «${words}» не моё: оно звучало из колонок`);
    journal(words, true, meta, matchSpell(words), false, 'отсеяно: это звучало из колонок (голос друга или игры)', 'колонки');
};

// A finished phrase the native voice heard that gave nothing: the journal tells how near a spell it was
// (a spell lost in the noise shows here: «не хватило …», «шумно»)
voice.onMiss = (written, meta) => {
    if (!game?.active || !written) return;
    const near = meta?.near && Number.isFinite(meta.nearFit) && meta.nearFit > -1.5
        ? `заклинание не узнано: ближе всего «${meta.near}», не хватило ${(-meta.nearFit).toFixed(1)}${Number.isFinite(meta.snr) && meta.snr < 16 ? ' — мешал шум' : ''}`
        : 'обычная речь — заклинания нет';
    journal(written, true, meta, null, false, near, 'микрофон игрока');
};

/** Why a recognized spell did not work (the game says where it refused it — Game.lastCastWhy). */
function castWhy(spell) {
    const w = game?.lastCastWhy;
    if (w) return w;
    if (game && !game.knowsSpell?.(spell)) return 'это заклинание вы ещё не знаете';
    return 'не сработало: не выполнено условие (нет цели, рука не поднята / не направлена, не здесь…)';
}

// «Распознавание голоса»: the speech network on this computer (where it is installed) or the browser's
$('voice-engine')?.addEventListener('change', (e) => voice.setPreference(e.target.value));
async function showVoiceEngine() {
    const el = $('voice-engine-status');
    if (!el) return;
    const st = await voice.native.check();
    let t;
    if (!st) t = 'Нейросеть на компьютере не отвечает — работает распознавание браузера.';
    else if (st.state === 'installing') t = '⏳ Нейросеть голоса ставится (один раз). Пока работает распознавание браузера.';
    else if (st.state === 'downloading') t = `⏳ ${st.detail || 'Нейросеть голоса скачивается'} (${Math.round((st.progress || 0) * 100)}%). Пока работает распознавание браузера.`;
    else if (!st.available) t = `Нейросеть на компьютере недоступна${st.error ? ` (${escapeHtml(st.error)})` : ''} — работает распознавание браузера.`;
    else if (voice.engine === 'native' && st.state === 'running') t = `✅ Работает нейросеть на компьютере. Микрофон: ${escapeHtml(st.mic || '—')}. ${st.aec ? 'Звук колонок (Discord, игра) убирается из микрофона: голос друга не колдует у вас.' : 'Звук колонок недоступен — лучше играть в наушниках.'}`;
    else t = '✅ Нейросеть на компьютере готова — включится, когда начнётся игра.';
    if ($('voice-engine')?.value === 'browser') t = 'Выбрано распознавание браузера (Google). ' + (st?.available ? 'Нейросеть на компьютере готова, если захотите вернуться.' : '');
    el.innerHTML = t;
}
setInterval(() => { if ($('voice-engine-status')?.offsetParent) showVoiceEngine(); }, 2000);

// «Микрофон для заклинаний»: which microphone the speech network on this computer listens to
const micSel = $('voice-mic');
const MIC_HINT = 'Выбор работает для нейросети на компьютере. Распознавание браузера всегда слушает микрофон, выбранный по умолчанию в системе.';
function micOption(key, text) {
    let o = [...micSel.options].find((x) => x.value === key);
    if (!o) { o = new Option(text, key); micSel.appendChild(o); }
    o.textContent = text;
    return o;
}
if (micSel) {
    // (the remembered one stays chosen while the list is not here yet — the settings are restored before it comes)
    try {
        const k = JSON.parse(localStorage.getItem('zns-settings') || '{}')?.['voice-mic'];
        if (k && k !== 'default') micOption(k, k);
    } catch (e) { /* not remembered */ }
    micSel.addEventListener('change', () => { voice.native.setMic(micSel.value); showVoiceMic(); });
}
async function showVoiceMic() {
    const el = $('voice-mic-status');
    if (!micSel || !el) return;
    const d = await voice.native.devices();
    const want = micSel.value;
    if (d?.devices) {
        const keys = new Set(['default', ...d.devices.map((x) => x.key)]);
        for (const x of d.devices) micOption(x.key, x.name + (x.default ? ' (сейчас в системе по умолчанию)' : ''));
        for (const o of [...micSel.options]) if (!keys.has(o.value) && o.value !== want) o.remove();
        if (want !== 'default' && !d.devices.some((x) => x.key === want)) micOption(want, want + ' — не подключён');
        micSel.value = want;
    }
    const st = voice.native.status;
    let t = '';
    if (want !== 'default' && d?.devices && !d.devices.some((x) => x.key === want)) t = `⚠️ «${escapeHtml(want)}» сейчас не подключён — слушается микрофон, выбранный в системе. Подключите его, и он заработает сам.`;
    else if (st?.micFallback) t = '⚠️ Выбранный микрофон не открылся — слушается микрофон, выбранный в системе.';
    if (voice.engine === 'native' && st?.state === 'running' && st.mic) t += (t ? ' ' : '') + `🎙 Сейчас слушается: ${escapeHtml(st.mic)}.`;
    el.innerHTML = (t ? t + '<br>' : '') + MIC_HINT;
}
setInterval(() => {
    const inPause = !!$('pause-audio')?.offsetParent;
    if ($('voice-mic-status')?.offsetParent || inPause) showVoiceMic().then(() => { if (inPause) pauseAudio.sync(); });
}, 3000);
setTimeout(showVoiceMic, 1500);

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
        if (talkVolInput) sound.setTalkVolume(parseInt(talkVolInput.value, 10));
        sound.ambientEnabled = ambientToggle ? ambientToggle.value === '1' : true;

        if (game) game.dispose();
        game = new Game({ renderer, camera, poseService, voice, sound, hud, net, ui });
        window.game = game;
        game.settings.smoothness = settings.smoothness;
        game.settings.sensitivity = settings.sensitivity;
        game.settings.drifting = config.drifting !== false;
        game.settings.leftHanded = !!config.leftHanded;
        await game.init(config, updateProgress);
        if (welcome && game.sync) game.sync.applyWelcome(welcome);
        // the whole visible world is built on the loading screen (the first seconds of play stay smooth)
        await game.loadNearby((f) => updateProgress(66 + Math.round(f * 4), `Прорисовка мира... ${Math.round(f * 100)}%`));
        // the sounds and the spells' looks otherwise made in the first seconds of play (each a hitch): now
        await game.warmUp((f) => updateProgress(70, `Подготовка звуков... ${Math.round(f * 100)}%`));

        const preview = $('webcam-preview');
        if (preview) preview.style.display = config.showHands ? 'block' : 'none';
        hud.setVoice('🎤 ОЖИДАНИЕ КОМАНДЫ...', true);

        updateProgress(70, 'Инициализация камеры...');
        let cameraOk = true;
        if (!window.__ZNS_NO_CAMERA__) {
            try {
                poseService.onStatus = (t) => updateProgress(75, t);
                // (V5 hands couldn't start: the player is told — shown once the game is on)
                poseService.onNotice = (t) => { if (game?.active && game.hud?.notify) game.hud.notify('✋ ' + t, 9000); };
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
        game.revealed = false;
        game.start();
        if (poseService._noticed) setTimeout(() => game.hud?.notify?.('✋ ' + poseService._noticed, 9000), 1500); // (said before the game was on)
        if (net.isHost && game.sync) net.broadcast(game.sync.welcomeMessage());
        net.info = { ...(net.info || {}), mode: config.mode, playing: true }; // (shown in other players' server lists)
        updateProgress(100, cameraOk ? 'Ожидание первого кадра камеры...' : 'Запуск без камеры...');

        const reveal = () => {
            game.revealed = true; // (the frames before it are behind the loading screen: PerfLog says so of their hitches)
            loadingScreen.classList.add('hidden');
            loadingScreen.style.display = 'none';
            hud.show(true);
            applyFps();
        };
        const started = performance.now(), frame0 = game.frameCount;
        const waitPose = setInterval(() => {
            // (and a few frames drawn behind this screen first: what the first frames compile and send
            // to the graphics card — new models, the sea's waves — happens here, not in the first seconds of play)
            // (automated tests draw in software, a frame a second: they don't wait)
            const warm = game.frameCount - frame0 >= 30 || performance.now() - started > 4000 || window.__ZNS_FIXED_QUALITY__;
            if (!warm) return;
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
if (!window.__ZNS_NO_FULLSCREEN__) becomeAppWindow({ bar: [document.querySelector('#main-menu .menu-top'), document.querySelector('#main-menu .menu-side')] });

// ------------------------------------------------------------------ pause menu (Escape)
// (in a game with others the world goes on; alone it waits)
// «Показывать FPS»: by default on in Creative, off elsewhere; the choice is remembered apart for Creative and for the other modes
const fpsKey = (mode) => 'zns-show-fps-' + (mode === 'creative' ? 'creative' : 'other');
const fpsMode = () => (game?.active ? game.config?.mode : selectedMode);
function fpsPref(mode) {
    let v = null;
    try { v = localStorage.getItem(fpsKey(mode)); } catch (e) { /* not remembered */ }
    return v === null ? mode === 'creative' : v === '1';
}
function applyFps() {
    const mode = fpsMode();
    const on = fpsPref(mode);
    const box = $('show-fps-toggle');
    if (box) box.checked = on;
    if (game) hud.setFpsShown(on, mode === 'creative');
}
$('show-fps-toggle')?.addEventListener('change', (e) => {
    try { localStorage.setItem(fpsKey(fpsMode()), e.target.checked ? '1' : '0'); } catch (err) { /* not remembered */ }
    applyFps();
});
applyFps();
// «🔊 Звук» in the pause menu: the sound settings without leaving the game
const pauseAudio = setupPauseAudio($('pause-audio'));
// «🖥 Графика» in the pause menu: the same graphics settings, applied at once
const pauseGraphics = setupPauseAudio($('pause-graphics'), PAUSE_GRAPHICS_IDS);
// «Правша / Левша» in the pause menu (every mode): the same control as in «Настройки», applied at once
const pauseHands = setupPauseAudio($('pause-hands'), ['handedness', 'walk-mode']);
const applyHandedness = () => {
    const left = $('handedness')?.value === 'left';
    poseService.interpreter.leftHanded = left; // (the body's places mirrored: PoseInterpreter.bodyPlaces)
    if (game?.settings) game.settings.leftHanded = left;
};
$('handedness')?.addEventListener('change', applyHandedness);
applyHandedness();
// «Ходьба и бег»: the usual walk (the body's bob) or the new one (steps read from the legs)
const applyWalkMode = () => { poseService.interpreter.walkMode = $('walk-mode')?.value === 'legs' ? 'legs' : 'old'; };
$('walk-mode')?.addEventListener('change', applyWalkMode);
applyWalkMode();
// the graphics settings change the running game at once (no restart of the world)
$('view-distance')?.addEventListener('change', (e) => { if (game?.world) game.world.viewDistance = viewDistanceScale(e.target.value); });
$('graphics-quality')?.addEventListener('change', (e) => { game?.quality?.setSetting(e.target.value); });
$('fps-limit')?.addEventListener('change', (e) => { if (game?.config) game.config.fpsLimit = parseInt(e.target.value, 10) || 0; });
// «🛠 Творческий» in the pause menu: hand version and «show what I said», changed on the go.
// Each control mirrors the one in the settings (same value, same saving).
const pauseCreative = (() => {
    const box = $('pause-creative');
    const row = (title, ctl, hint) => {
        const r = document.createElement('div'); r.className = 'pause-audio-row';
        const l = document.createElement('label'); l.className = 'pause-audio-label'; l.textContent = title;
        const c = document.createElement('div'); c.className = 'pause-audio-ctl'; c.appendChild(ctl);
        r.append(l, c);
        let h = null;
        if (hint !== undefined) { h = document.createElement('div'); h.className = 'pause-audio-hint'; r.appendChild(h); }
        box.appendChild(r);
        return h;
    };
    const radios = document.createElement('div'); radios.className = 'pause-radios'; radios.style.display = 'contents';
    const names = { v2: 'V2 (Точная)', v3: 'V3 (Стабильная)', v4: 'V4 (Новая)', v5: 'V5 (Новая)' };
    const rs = {};
    for (const v of Object.keys(names)) {
        const lab = document.createElement('label'); const r = document.createElement('input');
        r.type = 'radio'; r.name = 'pause-hand-version'; r.value = v;
        r.addEventListener('change', () => {
            const src = document.querySelector(`input[name="hand-version"][value="${v}"]`);
            if (src) { src.checked = true; src.dispatchEvent(new Event('change', { bubbles: true })); }
            sync();
        });
        r.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
        lab.append(r, names[v]); radios.appendChild(lab); rs[v] = r;
    }
    const hHint = row('Версия кистей рук', radios, '');
    box.firstChild.querySelector('.pause-audio-ctl').classList.add('pause-radios');
    const chk = document.createElement('input'); chk.type = 'checkbox';
    const lab = document.createElement('label'); lab.className = 'pause-check'; lab.append(chk, 'Показывать, что вы сказали');
    chk.addEventListener('change', () => {
        const src = $('show-heard-toggle');
        if (src) { src.checked = chk.checked; src.dispatchEvent(new Event('change', { bubbles: true })); }
        if (!chk.checked) hud.heard('', false);
    });
    chk.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    const cHint = row('Сказанное', lab, '');
    cHint.textContent = 'На экране видно, что услышал микрофон (а что нет — не видно).';
    function sync() {
        const cur = document.querySelector('input[name="hand-version"]:checked')?.value || 'v3';
        for (const v in rs) rs[v].checked = v === cur;
        chk.checked = !!$('show-heard-toggle')?.checked;
        // V5 needs the camera program: if it can't start, say why (the same words as the game's notice)
        const why = cur === 'v5' ? poseService._noticed : '';
        hHint.textContent = why && !why.startsWith('Кисти V5 включились') ? why : (cur === 'v5' ? 'Кисти V5: ищутся с отдельной программой камеры.' : '');
    }
    sync();
    return { sync };
})();
// the hand version changes the running game at once (settings or pause menu)
for (const r of document.querySelectorAll('input[name="hand-version"]')) {
    r.addEventListener('change', () => {
        if (!r.checked || !game?.character) return;
        game.character.setHandVersion(r.value);
        if (game.config) game.config.handVersion = r.value;
        poseService._setHands?.(r.value === 'v5' ? ($('v5-gpu')?.checked ? 'v5rtm' : 'v5') : '');
        pauseCreative.sync();
    });
}
// «V5 точнее (на видеокарте)»: the camera program's V5 hands found by RTMPose on the video card
$('v5-gpu')?.addEventListener('change', (e) => {
    const v5 = document.querySelector('input[name="hand-version"]:checked')?.value === 'v5';
    if (v5) poseService._setHands?.(e.target.checked ? 'v5rtm' : 'v5');
});
function showPauseTab(id) {
    document.querySelectorAll('.pause-tab').forEach((b) => b.classList.toggle('active', b.dataset.pauseTab === id));
    document.querySelectorAll('.pause-pane').forEach((p) => p.classList.toggle('active', p.id === id));
    $('pause-menu').classList.toggle('pause-wide', id === 'pause-spells' || id === 'pause-bosses'); // (the spell book and the bosses need room)
    if (id === 'pause-audio') pauseAudio.sync();
    if (id === 'pause-graphics') pauseGraphics.sync();
    if (id === 'pause-creative') pauseCreative.sync();
    if (id === 'pause-spells') renderSpellsTab('pause-spell-cats', 'pause-spells-grid');
    // (the achievements are only the bosses: who is beaten in THIS world is ticked there — the author: no separate tab)
    if (id === 'pause-bosses') renderBossesTab('pause-bosses-list', game?.achievements?.done || null);
}
document.querySelectorAll('.pause-tab').forEach((b) => { b.onclick = () => showPauseTab(b.dataset.pauseTab); });
function togglePauseMenu(show) {
    const el = $('pause-menu');
    const open = show ?? el.classList.contains('hidden');
    if (open) {
        applyFps();
        pauseAudio.sync();
        pauseGraphics.sync();
        pauseHands.sync();
        // «✨ Заклинания» — only in Creative (not on a map)
        const creative = game?.config?.mode === 'creative' && !game?.config?.map;
        document.querySelector('[data-pause-tab="pause-spells"]').hidden = !creative;
        document.querySelector('[data-pause-tab="pause-creative"]').hidden = game?.config?.mode !== 'creative';
        showPauseTab('pause-main');
    }
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
    lastJoin = { code, server: mpServer.value, name: net.serverName, byCode: false };
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
    lastJoin = { code, server: mpServer.value, name: net.serverName, byCode: true };
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
// The friend's server runs another version: get exactly that one now, then join it again by itself
let lastJoin = null;
net.on('version', (ev) => {
    if (!lastJoin || (game && game.active)) return;
    ev.handled = true;
    const join = lastJoin;
    (async () => {
        if (await canUpdate()) {
            rememberRejoin(join);
            if (await runUpdate(ev.full || ev.host, 'Скачиваю версию игры, как на сервере друга…')) { location.reload(); return; }
            pendingRejoin(true);
        }
        setMpStatus('❌ ' + escapeHtml('У вас с сервером разные версии игры, и скачать нужную не получилось — проверьте интернет и попробуйте войти ещё раз'));
        renderPlayers();
    })();
});
// …and here it is again, with the server's version: join it
{
    const join = rejoinNow;
    if (join) {
        setTimeout(async () => {
            document.querySelector('.tab-btn[data-tab="tab-mp"]')?.click();
            mpServer.value = join.server || '';
            if (join.byCode) { mpCode.value = join.code; $('mp-join-btn').click(); return; }
            await joinRoom(join.code);
            if (net.serverName === 'Сервер' && join.name) net.serverName = join.name;
        }, 1200);
    }
}
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
    const IDS = ['zombie-vol', 'music-vol', 'spell-vol', 'talk-vol', 'voice-filter', 'voice-engine', 'voice-mic', 'audio-ambient-toggle', 'villager-voice', 'villager-text', 'villager-ai', 'cam-smooth', 'cam-sens', 'fps-limit', 'model-quality',
        'hand-quality', 'camera-res', 'vision-engine', 'vision-delegate', 'graphics-quality', 'view-distance', 'antialias', 'camera-mode-toggle',
        'show-hands-toggle', 'show-heard-toggle', 'drift-camera', 'handedness', 'walk-mode', 'creative-zombie-count', 'minimap-size', 'v5-gpu'];
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
    // (the camera network always starts in its own thread; the «game thread» choice is gone)
    if (saved['vision-engine'] === 'classic-main') saved['vision-engine'] = 'classic';
    // every sound at 20% — once for everybody (later each one's own choice is kept)
    const vol20 = !saved.vol20;
    if (vol20) for (const id of ['zombie-vol', 'music-vol', 'spell-vol']) saved[id] = '20';
    // the villagers' net is always on now — once for everybody who had switched it off (the author: no setting to find)
    if (!saved.aiOn) { saved['villager-ai'] = 'auto'; }
    // the weak old nets chosen once by hand → «Авто» (Gemma 4 on the graphics card), once for everybody
    if (!saved.aiGemma4 && ['light', 'smart'].includes(saved['villager-ai'])) saved['villager-ai'] = 'auto';
    const save = () => {
        const out = {};
        for (const id of IDS) {
            const el = $(id);
            if (el) out[id] = el.type === 'checkbox' ? el.checked : el.value;
        }
        const hv = document.querySelector('input[name="hand-version"]:checked');
        if (hv) out.handVersion = hv.value;
        out.vol20 = true;
        out.aiOn = true;
        out.aiGemma4 = true;
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
    if (vol20 || !saved.aiGemma4) save(); // (remembered: done once)
})();

window.__zns = Object.defineProperties(window.__zns || {}, Object.getOwnPropertyDescriptors({ THREE, bombardoRadius, get game() { return game; }, poseService, net, voice, startGame, readConfig, get pendingWelcome() { return pendingWelcome; } }));
console.log(GAME_NAME + ': готово.');
