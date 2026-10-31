/**
 * main.js — entry point: menu, settings, loading screen, game start,
 * multiplayer lobby. The menu behaves exactly like the original.
 */

import { mountHeroPanel } from './ui/HeroSettingsUi.js';
import { DEFAULT_HERO } from './game/HeroSetup.js';
import { collapseMaxima } from './audio/MaximaShout.js';
import { CreateMemory } from './ui/CreateMemory.js';
import * as THREE from 'three';
import { Face as KalidoFace } from '../vendor/kalidokit/kalidokit.es.js';
import { HandRecorder } from './game/HandRecorder.js';
import { PoseService } from './input/PoseService.js';
import { VoiceService } from './input/VoiceService.js';
import { SoundManager } from './audio/SoundManager.js';
import { Hud, setMinimapSize, setHotbarSize, lastWords } from './ui/Hud.js';
import { MapEditor } from './ui/MapEditor.js';
import { setupTestMode } from './ui/TestMode.js';
import { Game } from './game/Game.js';
import { Network, MAX_PLAYERS, netLog } from './net/Network.js';
import { renderMagicTab, renderItemsTab, renderMechanicsTab, renderBossesTab, SPELLS } from './ui/Codex.js';
import { PlayerSheetView } from './ui/PlayerSheet.js';
import { PlayersTabView } from './ui/PlayersTab.js';
import { makePlayerPreview } from './ui/PlayerPreview.js';
import { listWorlds, loadWorld, deleteWorld, updateWorldMeta, cleanWorldName, NAME_MAX, setGameVersion, worldVersionLabel, worldHoverNote, worldSpawnLabel } from './game/WorldSave.js';
import { CharacterEditor, activeLook, activeName } from './ui/CharacterEditor.js';
import { matchSpell, bombardoRadius } from './fx/SpellManager.js';
import { fromGame, soundingLine } from './audio/GameVoices.js';
import { spellPhrase, PHRASE_WHY_RU, afterCast, lateInSpeech, bodyNoise, soundTrust, TRUSTED_FAR, wordsOfLine, stopFirst } from './audio/SpellPhrase.js';
import { SPELL_RU } from './game/ItemTypes.js';
import { GATE } from './game/VoiceGate.js';
import { VoiceChat } from './net/VoiceChat.js';
import { decide as echoDecide, clearFit, ECHO } from './audio/EchoGuard.js';
import { setupVoiceChatUi } from './ui/VoiceChatUi.js';
import { TalkFlow, STILL, readiness } from './ai/TalkFlow.js';
import { startCamera } from './ui/CameraPanel.js';
import { setupPauseAudio, PAUSE_GRAPHICS_IDS } from './ui/PauseAudio.js';
import { hintPolicy } from './ui/HintPolicy.js';
import { viewDistanceScale } from './game/Quality.js';
import { setupWindowControls, enterGameFullscreen, becomeAppWindow, rememberWindowSize } from './ui/WindowControls.js';
import { WORLD_GEN } from './world/Terrain.js';
import { GAME_NAME, MODES, MODE_ORDER, MAPS_ENTRY, modeLabel, modeTitle, legacyMode } from './ui/GameNames.js';
import { setupLogPanel, keepLauncherAlive } from './ui/JournalTab.js';
import { setupAllLogsPanel } from './ui/AllLogsTab.js';
import { hookAllLog, allLog } from './core/AllLog.js';
import { watchServer } from './ui/ServerLost.js';
import { castContextLine } from './core/SpellLog.js';
import { runUpdate, updateIfNewer, canUpdate, rememberRejoin, pendingRejoin } from './ui/UpdateScreen.js';
import { CREATIVE_RESTART_KEY, creativeRestartConfig, takeCreativeRestart } from './game/CreativeRestart.js';
import { setTextureRenderer } from './core/GpuTexture.js';

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
// (the video card dropped the drawing context — a driver reset under a heavy scene: three.js then dies on «null.trim()» in the shader log;
//  the journal says why, and the loading screen says it in words instead of «Cannot read properties of null»)
// (the last shader the card was asked to build: written to the browser's storage BEFORE each compile — a driver reset leaves the page dead,
//  and this says which shader it was: at once in the journal when the page still lives, and at the next start when it does not)
let _lastShader = null;
(() => {
    try {
        const gl = renderer.getContext(), compile = gl.compileShader.bind(gl), link = gl.linkProgram.bind(gl), srcOf = new WeakMap(), src = gl.shaderSource.bind(gl);
        gl.shaderSource = (sh, text) => { srcOf.set(sh, text); return src(sh, text); };
        gl.compileShader = (sh) => {
            const t = srcOf.get(sh) || '', name = (/#define SHADER_NAME (\S+)/.exec(t) || [])[1] || '?';
            const defs = (t.match(/^#define (USE_\w+|NUM_\w+ \d+|SKINNING|INSTANCING\w*|[A-Z_]{6,24})/gm) || []).slice(0, 40).map((d) => d.slice(8)).join(' ');
            _lastShader = `${name} (${t.length} знаков, ${t.indexOf('gl_Position') >= 0 ? 'вершинный' : 'фрагментный'}): ${defs}`;
            try { localStorage.setItem('zns-gl-at', _lastShader); } catch (e) { /* no storage */ }
            return compile(sh);
        };
        gl.linkProgram = (pr) => link(pr);
        try { const old = localStorage.getItem('zns-gl-at'); if (old) { localStorage.removeItem('zns-gl-at'); setTimeout(() => netLog(`🔥 прошлый запуск оборвался на шейдере: ${old.slice(0, 700)}`), 1500); } } catch (e) { /* no storage */ }
    } catch (e) { /* the card gives no hooks: the journal just says less */ }
})();
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); window.__glLost = true; netLog(`🎮 видеокарта сбросила графику (WebGL context lost) — игра не может продолжать; последний шейдер: ${(_lastShader || '—').slice(0, 700)}`); try { updateProgress(100, 'Видеокарта сбросила графику (драйвер перезапустился). Закройте другие тяжёлые программы, обновите драйвер видеокарты и запустите снова.'); } catch (err) { /* the screen is not built yet */ } });
setTextureRenderer(renderer); // (pictures made on the video card at loading: src/core/GpuTexture.js)
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
hud.getSound = () => sound;
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
        if (btn.dataset.tab === 'tab-spells') renderMagicTab();
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
setupLogPanel(document, () => (game?.spellLog ? { name: 'zns-spells.log', title: 'Заклинания (эта игра)', text: game.spellLog.text() } : null), setupAllLogsPanel(document));
hookAllLog(); allLog('Игра', `=== игра открыта ${new Date().toLocaleString('ru-RU')}`);
keepLauncherAlive();
watchServer(); // (the game's program closed while the window is open: said plainly, and back by itself)

const heroSp = mountHeroPanel($('hero-settings-sp'), 'hero-sp'); // («Настройки героя»: shown with the Creative choice)
if (creativeZombieCount && zombieCountDisplay) {
    creativeZombieCount.oninput = (e) => { zombieCountDisplay.textContent = e.target.value; };
}

// «Создать мир» помнит последний выбор отдельно для каждого режима (CreateMemory.js): настройки героя, «Гладкий мир», последняя карта
const createMem = new CreateMemory();
const CREATE_MODES = MODE_ORDER.filter((id) => id !== 'maps');
function restoreCreateMemory(mode) {
    const d = createMem.load(mode);
    const smooth = $('smooth-world');
    if (smooth) smooth.checked = !!d?.smooth;
    if (mode === 'creative') { try { heroSp.set(d?.hero); } catch (e) { heroSp.set(undefined); } }
}
function saveCreateMemory() {
    if (pickingMap) return;
    const patch = { smooth: !!$('smooth-world')?.checked };
    if (selectedMode === 'creative') {
        const hero = heroSp.read();
        patch.hero = hero;
        // (the settings are kept for every «Где появиться» apart: «Бесконечная мана», здоровье, броня… of the arena are not those of the port)
        patch.heroBySpot = { ...(createMem.load('creative')?.heroBySpot || {}), [hero.spawn]: hero };
    }
    createMem.save(selectedMode, patch);
}
{
    const last = createMem.lastMode(CREATE_MODES);
    if (last) selectedMode = last;
    restoreCreateMemory(selectedMode);
    $('hero-settings-sp').addEventListener('input', (e) => { if (e.target?.id !== 'hero-sp-spawn') saveCreateMemory(); }); // (the start's own change is saved by its 'change' below, after the new start's settings are shown)
    $('hero-settings-sp').addEventListener('change', (e) => {
        if (e.target?.id === 'hero-sp-spawn') { // (another start: its own remembered settings, or the defaults of that start)
            const spot = e.target.value, mem = createMem.load('creative')?.heroBySpot?.[spot];
            try { heroSp.set(mem ? { ...mem, spawn: spot } : { ...DEFAULT_HERO, spawn: spot, health: spot === 'start' ? 'immortal' : 'normal' }); } catch (err) { /* keep what is on the screen */ }
        }
        saveCreateMemory();
    });
    $('smooth-world')?.addEventListener('change', saveCreateMemory);
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
// The slots' size at the bottom (settings / Escape → «Размер панели предметов»)
const hotbarSize = $('hotbar-size');
hotbarSize?.addEventListener('input', (e) => {
    setHotbarSize(e.target.value);
    const v = $('hotbar-size-val');
    if (v) v.textContent = e.target.value + '%';
});
setHotbarSize(hotbarSize?.value || 100);

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
        ultra: $('ultra-quality')?.value === 'on', // («Ультра качество»: Ultra.js)
        viewDistance: $('view-distance')?.value || 'medium',
        resolution: $('camera-res').value,
        cameraMode: $('camera-mode-toggle').checked ? 'fpv' : 'tpv',
        showHands: showHandsToggle ? showHandsToggle.checked : false,
        handVersion: document.querySelector('input[name="hand-version"]:checked')?.value || 'v3',
        heroModel: $('hero-model')?.value === 'real' ? 'real' : 'std', // (the «Реалистичный» test model — RealisticBody.js)
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
            if (pickingMap) { // (the map chosen last time is chosen again)
                const nm = createMem.load('maps')?.map;
                if (nm && maps[nm]) selectedMap = { ...maps[nm], name: nm };
            } else { createMem.setLastMode(id); restoreCreateMemory(id); }
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
            if (selectedMap) createMem.save('maps', { map: name });
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
let creativeRestartNow = null;
try { creativeRestartNow = takeCreativeRestart(sessionStorage); } catch { /* no pending attempt */ }
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
        if (game?.active || starting || rejoinNow || creativeRestartNow) return; // (never in the middle of a game)
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
function holdSpell(command, isFinal, meta = null) {
    if (heldSpell) { heldSpell.command = command; heldSpell.isFinal = heldSpell.isFinal || isFinal; heldSpell.meta = meta || heldSpell.meta; return; }
    heldSpell = { command, isFinal, meta };
    // (with its meta: when the words were said — the echo check and the journal need it after the wait too)
    setTimeout(() => { const h = heldSpell; heldSpell = null; if (h) voice.onResult(h.command, h.isFinal, true, h.meta); }, GATE.HOLD);
}

// A friend's echo (EchoGuard.js): a spell heard while a friend spoke too — the game waits a moment for his own word
// (his game tells which spells HE said) before it casts; one wait per spell, the later looks of the same phrase join it.
const echoHolds = new Map(); // spell → {command, isFinal, meta}
function holdEcho(spell, command, isFinal, meta) {
    const h = echoHolds.get(spell);
    if (h) { h.command = command; h.isFinal = h.isFinal || isFinal; return; }
    echoHolds.set(spell, { command, isFinal, meta });
    setTimeout(() => { const x = echoHolds.get(spell); echoHolds.delete(spell); if (x) voice.onResult(x.command, x.isFinal, false, { ...(x.meta || {}), echoHeld: true }); }, ECHO.HOLD);
}

/**
 * When the words heard were said (ms): the native voice tells it; the browser's recognizer does not — then the microphone's
 * last burst of sound (EchoGuard.lastBurst), or the last 2.5 s.
 */
function heardWindow(meta, t) {
    if (Number.isFinite(meta?.from)) return [meta.from, Number.isFinite(meta.to) ? meta.to : t];
    return game?.voiceChat?.guard.lastBurst(t) || [t - 2500, t];
}

/**
 * Is it a friend's voice from my speakers (the game's voice chat, Discord…)? → the guard's decision for this phrase, or
 * null (no friends / nothing to compare with). My own voice is never let go because of an echo (EchoGuard.decide).
 */
function friendEcho(spell, meta, t) {
    const vc = game?.voiceChat;
    if (!vc || !(game.remotes?.size > 0)) return null;
    const [from, to] = heardWindow(meta, t);
    const j = vc.guard.judge(from, to);
    const said = spell ? vc.guard.friendSaid(spell, from, to) : null;
    const spoke = vc.guard.friendSpoke(from, to);
    const lips = game.voiceGate.lipsSync(t, voice._levels, voice.noiseFloor);
    const talking = !!vc.guard.friendTalking(t, 700);
    // (how clearly the native voice heard the spell: a friend's talk from the speakers is never this clear a spell)
    const clear = meta?.native && meta.sure && !meta.byWords ? clearFit(meta.fit, meta.len) : null;
    const d = echoDecide(j, { said, spoke, lips, clear, talking, held: !!meta?.echoHeld });
    return { ...d, j, from, to, said, lips };
}

// Talking to a villager (the author: «отвечать МОМЕНТАЛЬНО, как человек»): the words go to the villagers as
// soon as they are surely over — not when the voice program closes the phrase (0.85 s of quiet: it waits for a
// spell's «… Хаус»). The native voice tells the quiet after the words (TalkFlow: an order after 0.12 s, a finished
// phrase after 0.25 s, one left hanging after 0.6 s); the browser's recognizer only the words, then they must stand
// still a moment (STILL). The phrase's end later is no second question (TalkFlow.final / talkEarly).
let talkWait = null, talkEarly = null;
const talkKey = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim();
// The spell journal (Settings → Журнал → «Заклинания», zns-spells.log): every phrase and what came of it.
const spellRu = (n) => (n ? SPELL_RU[n] || n : null);
let lastJournal = null;
let lastCast = null; // the last spell the voice cast {spell, at, seg} (SpellPhrase.afterCast)
const letterCount = (t) => String(t || '').replace(/[^a-zа-яё]/gi, '').length;

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
    // (a spell the game refused: the same delay, and where the hands were — the journal only, no hint on the screen)
    let note;
    if (!ok && spell && !/^отсеян|меню паузы/.test(why || '')) {
        if (Number.isFinite(m.to) && now - m.to >= 0 && now - m.to < 8000) m.lag = now - m.to;
        try { note = castContextLine(game.castContext()); } catch (e) { /* the journal never breaks a cast */ }
    }
    const line = soundingLine(m.from ?? now - 2500, m.to ?? now);
    if (line) m.gameLine = line;
    log.add({ text: command, isFinal: isFinal || !!m.settled, meta: m, source, spell: spellRu(spell), ok, why, note });
}

/** How words heard at the phrase's end came (the talk's stopwatch line tells why they were not answered sooner). */
function finalInfo(meta) {
    if (!meta?.native) return { how: 'браузер, конец фразы' };
    const why = !Number.isFinite(meta.q) ? 'старая программа голоса — перезапустите игру' : (meta.far || 0) >= 0.25 ? 'в колонках звучала речь' : meta.cut ? 'длинная фраза' : 'раньше не вышло';
    // (the speech network: its time on the phrase, and how long after the phrase's sound its words came — a busy processor shows here)
    const late = Number.isFinite(meta.soundEnd) ? Math.round(performance.now() - meta.soundEnd) : null;
    const net = Number.isFinite(meta.cost) ? `; распознавание ${Math.round(meta.cost)} мс${late != null ? `, слова пришли через ${late} мс после звука` : ''}${voice?.native?.cost?.n ? `, в среднем ${Math.round(voice.native.cost.sum / voice.native.cost.n)} мс, худшее ${Math.round(voice.native.cost.max)} мс` : ''}` : '';
    return { end: meta.end, how: `конец фразы (${why}${net})` };
}

/** The words go to the villager (or the sailor) who hears me now — before the phrase's end. */
function talkNow(command, info = {}) {
    const T = game?.castleLife?.talk, crew = game?.ships?.crew;
    if (!game?.active || game.isMagicActive || Date.now() - game.lastMagicTime < 1500 || (matchSpell(command) && spellPhrase(command).ok)) return false;
    if (!$('pause-menu')?.classList.contains('hidden')) return false; // (the pause menu opened meanwhile)
    if (game.owls?.claims?.(command)) return false; // (an owl's words: at the phrase's end, as before)
    const castle = () => !!T?._listener?.(command) && T.hear(command, info);
    const ship = () => !!crew?._listener?.() && crew.hear(command, null, info);
    const ok = crew?.heardFirst?.(T) ? ship() || castle() : castle() || ship();
    if (!ok) return false;
    talkEarly = { key: talkKey(command), at: performance.now() };
    hud.setVoice(`🗣️ Вы: «${escapeHtml(command)}»`);
    return true;
}

const talkFlow = new TalkFlow({ fire: (text, info) => talkNow(text, info), players: () => game?.castleLife?.talk?._players?.() || [] });
voice.onQuiet = (q) => talkFlow.quiet(q);
voice.onNativeLevels = (d, off) => game?.voiceChat?.nativeLevels(d, off);
// («Империус Максима» in a dragon: its fire is the caster's long «У» — the letters heard and the microphone's level: DragonHowl)
voice.native.onLetters = (written) => game?.imperius?.voiceLetters(written);
{ const lv = voice.native.onLevel; voice.native.onLevel = (d) => { lv?.(d); if (game?.imperius?.active) for (const db of d.db || []) game.imperius.voiceLevel(db); }; }

/** (the browser's recognizer) the words stood still long enough for their kind: answered. */
// (the same words again — the native voice looks at the phrase every ~0.15 s while it is quiet — keep the wait going)
let talkWaitKey = null;
function earlyTalk(command) {
    const k = talkKey(command);
    if (talkWait && k === talkWaitKey) return;
    clearTimeout(talkWait);
    talkWaitKey = k;
    talkWait = setTimeout(() => { talkWait = null; talkWaitKey = null; talkNow(command); }, STILL[readiness(command)]);
}

voice.onResult = (command, isFinal = true, held = false, meta = null) => {
    if (!command) return;
    // (in a beam clash my «Максима» shouted over and over is heard as one stream of «максимум максиму сим…»: it is one shout — MaximaShout.js)
    if (game?.active && game.duel?.clashes?.some((c) => c.a.by === game.localId || c.b.by === game.localId)) command = collapseMaxima(command);
    // the pause menu (Esc) is open: nothing said is heard — no spell, no word to a villager
    if (game?.active && !$('pause-menu')?.classList.contains('hidden')) { journal(command, isFinal, meta, matchSpell(command), false, 'открыто меню паузы — голос не слушается'); return; }
    // the gods listen to a description («Да пусть создастся» said): every word is theirs — even what the sound took for
    // a spell («существо стой» heard as «стоп»): the letters written go to them (DivineCreation.hearDesc); a spell said
    // on its own before any description (a «Бомбардо») stops the listening and is cast
    if (game?.active && game.divine?.listening) {
        const written = meta?.written && letterCount(meta.written) > letterCount(command) ? String(meta.written) : command;
        const sp = matchSpell(written);
        const solo = sp && sp !== 'DivineCreation' && sp !== 'Stand' && !game.divine.listening.parts.length && spellPhrase(written, { final: true }).ok && written.trim().split(/\s+/).length <= 3;
        if (solo) game.divine._unlisten(null);
        else if (sp !== 'DivineCreation' && game.divine.hearDesc(written, isFinal, { cut: !!meta?.cut, command })) {
            if (isFinal) journal(written, true, meta, null, false, 'описание для «Да пусть создастся» — боги слушают', 'микрофон игрока');
            return;
        }
    }
    // words (no spell) that are only a friend's voice from my speakers: no talk of mine to a villager (EchoGuard)
    if (game?.active && game.voiceChat && !matchSpell(command)) {
        const fe = friendEcho(null, meta, performance.now());
        if (fe?.block && fe.j.verdict === 'echo') { journal(command, isFinal, meta, null, false, `не ваши слова: ${fe.why}`, 'голос друга'); return; }
    }
    // (the words go on / are final: the early answer waits for them, or is already given)
    if (talkWait && (isFinal || talkKey(command) !== talkWaitKey)) { clearTimeout(talkWait); talkWait = null; talkWaitKey = null; }
    // (the native voice: the phrase answered as soon as I stopped — its end is no second question; a different
    // order after it — «в атаку… нет, отбой» — or more words are: answered again, the older answer cut)
    // (never a spell: its words go the spell's way whatever was said to a villager before — «Джолт» by Тихон)
    if (isFinal && meta?.native && game?.active && !(matchSpell(command) && spellPhrase(command, { final: true }).ok)) {
        const st = talkFlow.final(command, meta.seg);
        if (st === 'handled') { talkEarly = null; journal(command, true, meta, null, false, 'житель уже ответил — как только вы замолчали'); return; }
        if (st === 'changed' && !matchSpell(command) && talkNow(command, { end: meta.end, seg: meta.seg, refine: true })) { talkEarly = null; journal(command, true, meta, null, false, 'фраза продолжилась — житель ответил на всю'); return; }
    }
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
    if (!isFinal && !held && game?.active && (!matchSpell(command) || talkOnly) && (game.castleLife?.talk?._listener?.(command) || game.ships?.crew?._listener?.()) && !game.owls?.claims?.(command)) {
        // (the browser's recognizer — or a voice program from before this update, which tells no quiet: the words standing still)
        if (!meta?.native || !Number.isFinite(meta.q)) earlyTalk(command);
        else if (!meta.cut && !(matchSpell(command) && spellPhrase(command).ok)) talkFlow.offer(command, { seg: meta.seg, q: meta.q || 0, end: meta.end }); // (a look missing the phrase's start, a spell said alone: its end decides)
    }
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
        if (isFinal && !sailorFirst && !game.isMagicActive && Date.now() - game.lastMagicTime > 1500 && game.castleLife?.talk?.claims?.(command) && game.castleLife.talk.hear(command, finalInfo(meta))) {
            journal(command, isFinal, meta, null, false, 'это разговор с жителем (рука не поднята)');
            return; // (your words are in the «heard» line in Creative; the villager answers in its bubble)
        }
        // (the same with a ship's sailor near me)
        if (isFinal && !game.isMagicActive && Date.now() - game.lastMagicTime > 1500 && game.ships?.crew.claims(command) && game.ships.crew.hear(command, null, finalInfo(meta))) {
            journal(command, isFinal, meta, null, false, 'это разговор с моряком (рука не поднята)');
            return;
        }
        if (talkOnly) {
            if (isFinal) game.castleLife?.talk?.hear(command, finalInfo(meta)) || game.ships?.crew.hear(command, null, finalInfo(meta));
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
        // A friend's voice from my speakers (the game's voice chat — the game plays it and knows it exactly; Discord — his own
        // game sends what his voice was like and which spells HE said): never my spell. My own voice is never let go for it.
        let mineWin = null;
        if (spoken && game.voiceChat && game.remotes?.size > 0) {
            const fe = friendEcho(spoken, meta, performance.now());
            if (fe?.block) {
                if (isFinal) netLog(`заклинание «${command}» не моё: ${fe.why}`);
                journal(command, isFinal, meta, spoken, false, `отсеяно: ${fe.why}`, 'голос друга');
                return;
            }
            if (fe?.hold) { holdEcho(spoken, command, isFinal, meta); return; }
            if (fe) { mineWin = [fe.from, fe.to]; if (meta && fe.why) meta.echoWhy = fe.why; }
        }
        // right after a spell of mine: its explosion, its echo, the end of the same phrase are no new spell
        if (spoken) {
            const no = afterCast(lastCast, spoken, meta, performance.now());
            if (no) { journal(command, isFinal, meta, spoken, false, `отсеяно: ${no}`); return; }
            const late = lateInSpeech(spoken, command, meta, performance.now());
            if (late) { journal(command, isFinal, meta, spoken, false, `отсеяно: ${late}`); return; }
            // breathing, steps, a rustle while running read as «Даст», «Джолт»: the mouth and the fit tell
            const lips = game.voiceGate.lipsMoved(performance.now());
            const running = !!game.character?.isRunning;
            if (meta) { meta.lips = lips; meta.running = running; }
            const noise = bodyNoise({ spell: spoken, text: command, native: !!meta?.native, fit: meta?.fit, len: meta?.len, snr: meta?.snr, running, lips })
                // (found by its sound: how sure, weighed with how like the spell the written letters are, the lips, the run)
                || (meta?.native && meta.sure && !meta.byWords ? soundTrust({ spell: spoken, canonical: command, written: meta.near ?? meta.written, fit: meta.fit, len: meta.len, far: meta.refChecked ? Math.min(meta.far || 0, TRUSTED_FAR) : meta.far, running, lips, snr: meta.snr, holding: !!(game.focus?.held?.() || game.combat?.shield || game.flight?.active), hope: !!(game.voice?.native?.duelHot || game.duelOnly || game.arenaDuels?.mode) }) : null);
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
            if (name) lastCast = { spell: name, at: performance.now(), seg: meta?.seg, to: meta?.to };
            if (said) journal(command, isFinal, meta, said, !!name, name ? '' : castWhy(said), 'микрофон игрока');
            else journal(command, isFinal, meta, null, false, 'обычная речь — заклинания нет', 'микрофон игрока');
            // (the others are told what I said even when it didn't work here — unknown, no mana: else my voice from their speakers,
            // with no word of mine to tell it, cast it from THEIR hand)
            if (said && !name && isFinal && game.remotes?.size > 0) game.sync?.say?.(said, meta?.from);
            if (name) {
                if (game.remotes?.size > 0) game.sync?.say?.(said, meta?.from);
                if (mineWin) game.voiceChat?.said(name, mineWin[0], mineWin[1]); // (my voice in their speakers is not theirs)
                voice.learnOwnVoice();
                hud.setVoice(`✨ <span style="color:#55efc4">${name.toUpperCase()}</span>`);
                if (voiceTestText && isMenuVoiceActive) voiceTestText.innerHTML = `✨ ${name.toUpperCase()} ✨`;
            } else if (isFinal && (!said || said === 'Stand')) {
                if (sailorFirst) game.ships.crew.hear(command, null, finalInfo(meta)) || game.castleLife?.talk?.hear(command, finalInfo(meta));
                else game.castleLife?.talk?.hear(command, finalInfo(meta)) || game.ships?.crew.hear(command, null, finalInfo(meta));
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
        const saidFrom = Number.isFinite(meta?.from) ? meta.from : null; // (when my words began: after a friend's word came — mine, not its echo)
        if (heard && (game.remotes?.size > 0 || game.voiceGate.echoes(heard, performance.now(), saidFrom))) {
            const gate = game.voiceGate.check(heard, performance.now(), { levels: voice._levels, floor: voice.noiseFloor }, saidFrom);
            if (!gate.ok) {
                if (isFinal || held) netLog(`заклинание «${command}» не моё: ${gate.why === 'lips' ? 'губы не двигались' : 'эхо заклинания друга'}`);
                journal(command, isFinal || held, meta, heard, false, gate.why === 'lips' ? 'отсеяно: губы не двигались (камера) — это не ваш голос' : 'отсеяно: эхо заклинания друга');
                return;
            }
            if (game.remotes?.size > 0) {
                // sure it's me (my lips moved right then): the others are told at once — my voice from
                // their speakers then casts nothing there; not sure: wait a moment for their word
                if (gate.sure) game.sync?.say?.(heard, saidFrom);
                else if (!held) { holdSpell(command, isFinal, meta); return; }
                else game.sync?.say?.(heard, saidFrom);
                if (isFinal || held) netLog(`заклинание «${command}» моё: ${gate.sure ? 'рот двигался вместе с голосом' : 'лица не видно — друг этого заклинания не говорил'}`);
            }
        }
        const name = game.castLocalSpell(command, isFinal || !!meta?.settled);
        if (name) lastCast = { spell: name, at: performance.now(), seg: meta?.seg, to: meta?.to };
        if (heard) journal(command, isFinal || held, meta, heard, !!name, name ? '' : castWhy(heard), 'микрофон игрока');
        else journal(command, isFinal, meta, null, false, 'обычная речь — заклинания нет', 'микрофон игрока');
        // not a spell: maybe you are talking to someone in a castle (only one close enough hears)
        // («стоп» with nothing to stop is still words to a villager: «стой» / «стоп» = stop following me)
        if (!name && isFinal && (!heard || heard === 'Stand') && (sailorFirst ? game.ships.crew.hear(command, null, finalInfo(meta)) || game.castleLife?.talk?.hear(command, finalInfo(meta)) : game.castleLife?.talk?.hear(command, finalInfo(meta)) || game.ships?.crew.hear(command, null, finalInfo(meta)))) {
            return; // (your words are in the «heard» line in Creative; the villager answers in its bubble)
        }
        if (name) {
            voice.learnOwnVoice();
            if (mineWin) game.voiceChat?.said(name, mineWin[0], mineWin[1]); // (my voice in their speakers is not theirs)
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
    restartCreative(g) {
        // A new document also cancels every old worker, timer, conversation and module-level cache.
        const config = creativeRestartConfig(g);
        try { sessionStorage.setItem(CREATIVE_RESTART_KEY, JSON.stringify(config)); }
        catch { g.hud?.toast?.('Не удалось перезапустить мир. Проверьте, разрешено ли хранение данных в браузере.'); return; }
        g.stop();
        g.keeper?.dispose(); // no pagehide autosave of the discarded attempt
        rememberWindowSize(); // (the reload must not change the window: full screen stays full screen)
        location.reload();
    },
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
        // the players' voice chat (the host's choice at creation; the guests get it from the host) and the friend's-echo guard
        if (net.active) {
            game.voiceChat = new VoiceChat({ net, game, voice, serverMode: config.voiceChat });
            voiceChatUi?.attach(game.voiceChat);
        }
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
        // every shader and picture sent to the video card in pieces (the page keeps answering; the bar moves)
        await game.prewarmAsync((f) => updateProgress(90 + Math.round(f * 9), `Компиляция шейдеров... ${Math.round(f * 100)}%`));
        game.revealed = false;
        game.start();
        if (poseService._noticed) setTimeout(() => game.hud?.notify?.('✋ ' + poseService._noticed, 9000), 1500); // (said before the game was on)
        if (net.isHost && game.sync) net.broadcast(game.sync.welcomeMessage());
        net.info = { ...(net.info || {}), mode: config.mode, playing: true }; // (shown in other players' server lists)
        updateProgress(100, cameraOk ? 'Ожидание первого кадра камеры...' : 'Запуск без камеры...');

        const reveal = () => {
            try { localStorage.removeItem('zns-gl-at'); } catch (e) { /* no storage */ }
            game.revealed = true; // (the frames before it are behind the loading screen: PerfLog says so of their hitches)
            loadingScreen.classList.add('hidden');
            loadingScreen.style.display = 'none';
            hud.show(true);
            game.sync?.markScreenOpen(); // (network game: «ready» to the others — only now my avatar may appear for them)
            if (creativeRestartNow) game.keeper?.save(); // replace the old saved attempt with the pristine world
            applyFps();
        };
        const started = performance.now(), frame0 = game.frameCount;
        let settleFrame = null;
        const waitPose = setInterval(() => {
            // (and a few frames drawn behind this screen first: what the first frames compile and send
            // to the graphics card — new models, the sea's waves — happens here, not in the first seconds of play)
            // (automated tests draw in software, a frame a second: they don't wait for the smooth run)
            // the screen closes only when the game is really ready — the ground around, the shaders, 30 smooth frames in a row
            // (Game.readyToShow; the safety stopwatch of 45 s inside it; the tests' software drawing skips only the smooth run)
            const rd = game.readyToShow(started, { needCalm: !window.__ZNS_FIXED_QUALITY__ });
            if (!rd.ok) { updateProgress(90 + Math.round(rd.frac * 9), rd.text); return; }
            // (Creative «Где появиться»: the hero is carried to the chosen place behind this screen — no start platform seen first, no visible jump;
            //  held until the ground there is made and a few frames are drawn on it; a place that cannot be made gives up in 75 s: HeroApply says why)
            if (game.heroApply?.pending && performance.now() - started < 75000) { settleFrame = null; updateProgress(100, 'Переносим к выбранному месту...'); return; }
            if (settleFrame == null) settleFrame = game.frameCount;
            if (game.frameCount - settleFrame < 20 && !window.__ZNS_FIXED_QUALITY__ && game.hero?.spawn && game.hero.spawn !== 'start' && performance.now() - started < 80000) return;
            if (game.firstPoseReceived || !cameraOk || performance.now() - started > 10000 || window.__ZNS_NO_CAMERA__) {
                clearInterval(waitPose);
                reveal();
                setTimeout(() => updateGameMapList(), 500);
            }
        }, 100);
    } catch (error) {
        console.error('INIT ERROR:', error, error?.stack);
        netLog(`❌ вход в мир (место «${config?.hero?.spawn || 'start'}», поколение ${config?.gen ?? '—'}): ${error?.message || error}${window.__glLost ? ' [контекст WebGL потерян]' : ''} | ${String(error?.stack || '').split('\n').slice(0, 4).join(' ← ')}`);
        updateProgress(100, window.__glLost ? 'Видеокарта сбросила графику (драйвер перезапустился). Закройте другие тяжёлые программы, обновите драйвер видеокарты и запустите снова.' : 'Ошибка: ' + (error?.message || error));
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
    if (cfg.mode === 'creative' && !cfg.map) cfg.hero = heroSp.read(); // («Настройки героя» Творческого мира: HeroSettingsUi.js)
    cfg.smooth = !!$('smooth-world')?.checked; // («Гладкий мир»: ramps — only when a world is made)
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
        const note = worldHoverNote(w);
        const old = (Number.isFinite(w.gen) ? w.gen : 1) < WORLD_GEN || worldVersionLabel(w).old;
        return `
        <div class="world-row" data-id="${w.id}" title="${escapeHtml(note)}">
            <button class="world-fav${w.fav ? ' on' : ''}" title="${w.fav ? 'Убрать из избранного' : 'В избранное'}">${w.fav ? '♥' : '♡'}</button>
            <span class="world-name" tabindex="0" title="Двойной щелчок — переименовать">${escapeHtml(w.name)}</span>
            <span class="world-meta">${new Date(w.updated).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            <button class="mp-btn world-play">▶ Продолжить</button>
            <button class="mp-btn mp-btn-grey world-del" title="Удалить">🗑</button>
            <span class="world-badges"><span class="world-mode m-${escapeHtml(w.mode || 'none')}">${(MODES[legacyMode(w.mode)]?.icon || '')} ${escapeHtml(modeLabel(w.mode) || 'Мир')}</span>${worldSpawnLabel(w) ? `<span class="world-spot" title="Где герой появляется в этом мире">📍 ${escapeHtml(worldSpawnLabel(w))}</span>` : ''}${old ? '<span class="world-old">устарел</span>' : ''}</span>
            <span class="world-confirm hidden">${w.fav ? 'Это избранный мир! ' : ''}Удалить этот мир навсегда? <button class="mp-btn world-del-yes">Да, удалить</button> <button class="mp-btn mp-btn-grey world-del-no">Нет</button></span>
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
        row.querySelector('.world-fav').onclick = async () => {
            const w = worlds.find((x) => x.id === id);
            await updateWorldMeta(id, { fav: !w?.fav });
            renderSavedWorlds();
        };
        // rename: the name turns into a text field right in the row (Enter saves, Escape cancels)
        const rename = () => {
            const nameEl = row.querySelector('.world-name');
            if (!nameEl || row.querySelector('.world-name-edit')) return;
            const w = worlds.find((x) => x.id === id);
            const inp = document.createElement('input');
            inp.type = 'text'; inp.className = 'world-name-edit'; inp.maxLength = NAME_MAX; inp.value = w?.name || '';
            nameEl.replaceWith(inp);
            inp.focus(); inp.select();
            let done = false;
            const finish = async (save) => {
                if (done) return; done = true;
                if (save && cleanWorldName(inp.value) && cleanWorldName(inp.value) !== w?.name) await updateWorldMeta(id, { name: inp.value });
                renderSavedWorlds();
            };
            inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); };
            inp.onblur = () => finish(true);
        };
        // a double click (a triple one too) renames; one click does nothing, so it never fights «выбрать»; Enter/F2 on the focused name for the keyboard
        const nm = row.querySelector('.world-name');
        nm.ondblclick = rename;
        nm.onkeydown = (e) => { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); rename(); } };
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
// «🎙 Голосовой чат»: in «Создать сервер» (the mode for everybody) and in Escape → «🔊 Звук» (VoiceChatUi.js)
const voiceChatUi = setupVoiceChatUi({ pane: $('pause-audio'), create: $('mp-create') });
// «🖥 Графика» in the pause menu: the same graphics settings, applied at once
const pauseGraphics = setupPauseAudio($('pause-graphics'), PAUSE_GRAPHICS_IDS);
// «Правша / Левша» in the pause menu (every mode): the same control as in «Настройки», applied at once
const pauseHands = setupPauseAudio($('pause-hands'), ['handedness', 'walk-mode', 'hints-mode']);
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
// «Подсказки»: a «how to» hint once (remembered in this browser), always, or never (HintPolicy.js)
$('hints-mode')?.addEventListener('change', (e) => hintPolicy.setMode(e.target.value));
applyWalkMode();
// the graphics settings change the running game at once (no restart of the world)
$('view-distance')?.addEventListener('change', (e) => { if (game?.world) game.world.viewDistance = viewDistanceScale(e.target.value); });
$('graphics-quality')?.addEventListener('change', (e) => { game?.quality?.setSetting(e.target.value); });
$('ultra-quality')?.addEventListener('change', (e) => { game?.ultra?.set(e.target.value === 'on'); });
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
// the hero's model changes the running game at once: mine is drawn so, and the others are told (NetSync.sendLook)
$('hero-model')?.addEventListener('change', () => {
    const v = $('hero-model').value === 'real' ? 'real' : 'std';
    if (!game?.character) return;
    game.character.setHeroModel(v);
    if (game.config) game.config.heroModel = v;
    game.sync?.sendLook?.();
});
// the hand version changes the running game at once (settings or pause menu)
for (const r of document.querySelectorAll('input[name="hand-version"]')) {
    r.addEventListener('change', () => {
        if (!r.checked || !game?.character) return;
        game.character.setHandVersion(r.value);
        if (game.config) game.config.handVersion = r.value;
        poseService._setHands?.(r.value === 'v5' ? 'v5' : '');
        pauseCreative.sync();
    });
}
// «🧙 Игрок»: the hero's sheet (data refreshed on open and every 0.5 s while the tab is open; the 3D hero is drawn only then)
const playerSheet = new PlayerSheetView($('pause-player'), () => game, {
    spells: [...new Set(SPELLS.map((s) => matchSpell(s.name)).filter(Boolean))],
    look: () => activeLook(),
    name: () => activeName(), // (the hero made in «Персонаж»; in a network game the server name wins — PlayerSheet.heroName)
    openCodex: () => { const b = document.querySelector('[data-pause-tab="pause-spells"]'); if (b && !b.hidden) showPauseTab('pause-spells'); },
    makeCharacter: makePlayerPreview,
});
const playersTab = new PlayersTabView($('pause-players'), () => game);
function showPauseTab(id) {
    if (id === 'pause-players') playersTab.show(); else playersTab.hide();
    if (id === 'pause-player') playerSheet.show(); else playerSheet.hide();
    document.querySelectorAll('.pause-tab').forEach((b) => b.classList.toggle('active', b.dataset.pauseTab === id));
    document.querySelectorAll('.pause-pane').forEach((p) => p.classList.toggle('active', p.id === id));
    $('pause-menu').classList.toggle('pause-wide', id === 'pause-spells' || id === 'pause-bosses' || id === 'pause-player'); // (the spell book and the bosses need room)
    if (id === 'pause-audio') { pauseAudio.sync(); voiceChatUi.sync(); }
    if (id === 'pause-graphics') pauseGraphics.sync();
    if (id === 'pause-creative') pauseCreative.sync();
    // (outside Creative each spell is marked: ✅ its first-success mana had, ☐ +N not yet — Mana.spellsUsed)
    if (id === 'pause-spells') {
        const cr = game?.config?.mode === 'creative';
        renderMagicTab({ bar: 'pause-magic-sections', spells: 'pause-magic-spells', potions: 'pause-magic-potions', pents: 'pause-magic-pentagrams', cats: 'pause-spell-cats', grid: 'pause-spells-grid', pgrid: 'pause-pentagrams-grid', vgrid: 'pause-potions-grid', pcats: 'pause-pentagram-cats', vcats: 'pause-potion-cats' },
            cr ? null : (spell) => !!game?.canSaySpell?.(spell), cr ? null : (spell) => !!game?.mana?.spellsUsed?.has(spell), cr || !game?.pentagranium ? null : new Set(game.pentagranium.known() || []));
    }
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
        voiceChatUi.sync();
        pauseGraphics.sync();
        pauseHands.sync();
        // «✨ Заклинания»: in Creative all of them (not on a map); in the other modes the ones the hero can say now
        const creativeMap = game?.config?.mode === 'creative' && !!game?.config?.map;
        document.querySelector('[data-pause-tab="pause-players"]').hidden = !(net && net.active && game?.sync); // (only in a network game)
        document.querySelector('[data-pause-tab="pause-spells"]').hidden = creativeMap;
        document.querySelector('[data-pause-tab="pause-creative"]').hidden = game?.config?.mode !== 'creative';
        showPauseTab('pause-main');
    } else { playerSheet.hide(); playersTab.hide(); }
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
window.addEventListener('pagehide', () => {
    try { if (game?.sync) game.groundVortex?.returnAll?.(); } catch (e) { /* closing */ } // (blocks held by «Ground Vortex» back into the ground: the others see it)
    try { game?.sync?._sendMine?.(); } catch (e) { /* closing */ }
    net.sayGoodbye();
});
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
let mpBusy = false;
const mpUnavailable = () => mpBusy || net.active || starting || !!game?.active;
function updateMpButtons() {
    for (const id of ['mp-join-btn', 'mp-enter-btn', 'mp-host-btn', 'mp-private-btn']) {
        const button = $(id);
        if (button) button.disabled = mpUnavailable() || (id === 'mp-enter-btn' && !!button.dataset.full);
    }
}
async function refreshServers() {
    if (refreshing || mpBusy || net.active || (game && game.active) || window.__ZNS_NO_WORLD_PROBE__) { renderServers(); return; }
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
            <button id="mp-enter-btn" class="mp-btn" ${mpUnavailable() ? 'disabled' : ''}>${mpBusy ? '⏳ Подключаемся...' : '▶ Войти'}</button>`;
        $('mp-enter-btn').onclick = () => joinRoom(sv.code);
        return;
    }
    info.innerHTML = `<h4>${escapeHtml(sv.name || 'Сервер')}</h4><div class="mp-info-mode">${modeTitle(sv.mode)}${sv.playing ? ' · идёт игра' : ''}</div>
        <div class="mp-info-players">${sv.players.map((n) => `<div>🧙 ${escapeHtml(n)}</div>`).join('')}</div>
        <button id="mp-enter-btn" class="mp-btn" ${full ? 'data-full="true"' : ''} ${full || mpUnavailable() ? 'disabled' : ''}>${full ? 'Заполнен' : mpBusy ? '⏳ Подключаемся...' : '▶ Войти'}</button>`;
    $('mp-enter-btn').onclick = () => joinRoom(sv.code);
}
setTimeout(refreshServers, 800);
setInterval(() => { if ($('tab-mp')?.classList.contains('active')) refreshServers(); }, 8000);
$('mp-refresh-btn').addEventListener('click', () => { if (refreshing || mpUnavailable()) return; servers = null; renderServers(); refreshServers(); });
$('mp-create-open').addEventListener('click', () => $('mp-create').classList.toggle('hidden'));

async function joinRoom(code, byCode = false) {
    if (mpUnavailable()) return;
    mpBusy = true;
    updateMpButtons();
    renderServers();
    net.stopProbe();
    setMpStatus('⏳ Подключаемся к серверу...');
    net.serverName = byCode ? 'Закрытая игра' : servers?.find((x) => x.code === code)?.name || 'Сервер';
    lastJoin = { code, server: mpServer.value, name: net.serverName, byCode };
    try {
        await net.join(code, playerName(), mpServer.value);
        if (!net.active) return; // (the server was full)
        setMpStatus(byCode ? '✅ Подключено! Ждём, когда хост начнёт игру...' : '✅ Подключено! Входим в игру...');
        renderPlayers();
    } catch (e) {
        setMpStatus('❌ ' + escapeHtml(e.message));
    } finally {
        mpBusy = false;
        updateMpButtons();
        renderServers();
    }
}

/** A new multiplayer world's choices: «Гладкий мир» (ramps) and «Божественные заклинания на Земле» (both off by default). */
const mpWorldOpts = () => ({ voiceChat: voiceChatUi.createMode(), smooth: !!$('mp-smooth')?.checked, godsOnEarth: !!$('mp-gods')?.checked, ...($('mp-mode')?.value === 'creative' ? { hero: heroMp.read() } : {}) }); // (Creative: the hero's settings — HeroSettingsUi.js; guests get the host's)
const heroMp = mountHeroPanel($('hero-settings-mp'), 'hero-mp');
{ const showHeroMp = () => { $('hero-settings-mp').hidden = $('mp-mode').value !== 'creative'; }; $('mp-mode')?.addEventListener('change', showHeroMp); showHeroMp(); }

// Create a server: it takes a free place in the list and the game starts at once
$('mp-host-btn').addEventListener('click', async () => {
    if (mpUnavailable()) return;
    mpBusy = true;
    updateMpButtons();
    net.stopProbe();
    const srvName = ($('mp-srv-name').value || '').trim().slice(0, 24) || `Сервер ${playerName()}`;
    try { localStorage.setItem('zns-srv-name', srvName); } catch (e) { /* ignore */ }
    setMpStatus('Создаём сервер...');
    try {
        const savedId = $('mp-world')?.value || '';
        const saved = savedId ? await loadWorld(savedId) : null;
        const mode = saved ? saved.mode : $('mp-mode').value;
        await net.host(playerName(), mpServer.value, null, { slots: true });
        net.info = { name: srvName, mode, playing: false };
        setMpStatus(`🟢 Сервер создан — он виден всем в списке. Код: <span class="mp-code-big">${net.code}</span> (если друг не видит сервер — пусть войдёт по коду). Запускаем...`);
        showCodeInGame(net.code);
        selectedMode = mode;
        selectedMap = null;
        pickingMap = false;
        startGame(saved ? { ...readConfig(), mode, map: null, seed: saved.seed, saved, voiceChat: voiceChatUi.createMode() } : { ...readConfig(), mode, map: null, worldName: srvName, ...mpWorldOpts() });
    } catch (e) {
        setMpStatus('❌ ' + escapeHtml(e.message));
    } finally {
        mpBusy = false;
        updateMpButtons();
    }
});

// A game by code: works even when the server list can't be seen (a bad line, a VPN)
$('mp-private-btn').addEventListener('click', async () => {
    if (mpUnavailable()) return;
    mpBusy = true;
    updateMpButtons();
    net.stopProbe();
    setMpStatus('Создаём игру по коду...');
    try {
        const savedId = $('mp-world')?.value || '';
        const saved = savedId ? await loadWorld(savedId) : null;
        const mode = saved ? saved.mode : $('mp-mode').value;
        const code = await net.host(playerName(), mpServer.value);
        net.info = { name: 'Игра по коду', mode, playing: false };
        setMpStatus(`🔑 Код вашей игры: <span class="mp-code-big">${code}</span><br>Скажите его другу: «Мультиплеер» → «Войти по коду». Запускаем игру...`);
        renderPlayers();
        selectedMode = mode;
        selectedMap = null;
        pickingMap = false;
        startGame(saved ? { ...readConfig(), mode, map: null, seed: saved.seed, saved, voiceChat: voiceChatUi.createMode() } : { ...readConfig(), mode, map: null, worldName: 'Игра ' + code, ...mpWorldOpts() });
        showCodeInGame(code);
    } catch (e) {
        setMpStatus('❌ ' + escapeHtml(e.message));
    } finally {
        mpBusy = false;
        updateMpButtons();
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

$('mp-join-btn').addEventListener('click', () => {
    if (mpUnavailable()) return;
    const code = (mpCode.value || '').trim().toUpperCase();
    if (code.length < 4) { setMpStatus('Введите код комнаты от друга.'); return; }
    joinRoom(code, true);
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
        updateMpButtons();
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
        updateMpButtons();
    }
});
net.on('message', (msg) => {
    if (msg.t !== 'welcome' || !net.isClient) return;
    if ((game && game.active) || starting) return;
    pendingWelcome = msg;
    const local = readConfig();
    startGame({ ...local, mode: legacyMode(msg.config.mode, msg.config.map), map: msg.config.map, zombieCount: msg.config.zombieCount, seed: msg.config.seed, gen: msg.config.gen ?? 1, godsOnEarth: !!msg.config.godsOnEarth, realTrees: !!msg.config.realTrees, hero: msg.config.hero }, msg);
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
        'hand-quality', 'camera-res', 'vision-engine', 'vision-delegate', 'graphics-quality', 'ultra-quality', 'view-distance', 'antialias', 'camera-mode-toggle',
        'hero-model', 'show-hands-toggle', 'show-heard-toggle', 'drift-camera', 'handedness', 'walk-mode', 'hints-mode', 'creative-zombie-count', 'minimap-size', 'hotbar-size'];
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

// The heavy nets go to the video card now, in the menu — not in the first half-minute of a game (a freeze of 1–2 s there,
// the author's journal): the villagers' net (the program on this computer) and their voices (shared by every game).
// (not in the tests' pages: they never talk, and the models would be fetched for every page)
if (!window.__ZNS_NO_WORLD_PROBE__) setTimeout(() => {
    try {
        const c = readConfig();
        if (c.villagerAI !== 'off') import('./ai/NativeLLM.js').then(({ NativeLLMPort }) => NativeLLMPort.preload(c.villagerAI)).catch(() => {});
        if (c.villagerVoice && c.villagerVoiceEngine === 'neural') import('./audio/NeuralVoice.js').then(({ NeuralVoice }) => { if (NeuralVoice.supported) NeuralVoice.shared().load().catch(() => {}); }).catch(() => {});
    } catch (e) { /* (an old settings page) */ }
}, 1500);
window.__zns = Object.defineProperties(window.__zns || {}, Object.getOwnPropertyDescriptors({ THREE, bombardoRadius, get game() { return game; }, poseService, net, voice, startGame, readConfig, get pendingWelcome() { return pendingWelcome; } }));
console.log(GAME_NAME + ': готово.');
if (creativeRestartNow) startGame(creativeRestartNow);
