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
import { Network, WORLD_CODE } from './net/Network.js';
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

// ------------------------------------------------------------------ items tab
function renderItemsTab() {
    const grid = $('items-grid');
    if (!grid) return;
    grid.innerHTML = '';
    // say: how to cast it; pvp: damage to players in «Свободный мир»; cost: fatigue there
    const items = [
        { name: 'Меч', desc: 'Острое оружие. Берётся рукой как настоящий: сожмите пальцы на рукояти.', dmg: '2 (сильный замах — больше)', pvp: '2–3', icon: 'assets/icons/sword.png' },
        { name: 'Топор', desc: 'Тяжёлый топор.', dmg: '3 (сильный замах — больше)', pvp: '3–4', icon: 'assets/icons/axe.png' },
        { name: 'Инферно', say: 'рука к лицу + «Инферно»', desc: 'Поток огня из руки.', dmg: '1/тик', pvp: '1 каждые 0,6 с', cost: 10, icon: 'assets/icons/inferno.png' },
        { name: 'Тандервейв', say: 'рука к лицу + «Тандервейв» / «Гром»', desc: 'Веер молний, отбрасывает.', dmg: '5', pvp: '3 + отброс', cost: 15, icon: 'assets/icons/thunder.png' },
        { name: 'Сапира', say: 'направить руку на цель + «Сапира»', desc: 'Дуэльное: медленный тяжёлый фиолетовый заряд летит к цели; его можно отбить щитом или встречным заклинанием.', dmg: '10', pvp: '4', cost: 20, icon: 'assets/icons/sapira.png' },
        { name: 'Айс', say: 'рука к лицу + «Айс» / «Лёд»', desc: 'Ледяной луч: держите на цели 5 секунд — замораживает. Игрок заморожен на 20 секунд и не может двигаться; любой удар по замороженному смертелен. Убежать из луча — заклинание спадёт.', dmg: '1/сек', pvp: 'заморозка', cost: 10, icon: 'assets/icons/ice.png' },
        { name: 'Даст', say: 'рука к лицу + «Даст» / «Санд»', desc: 'Шар песка: зомби рассыпается в песок.', dmg: 'Мгновенно', pvp: '3', cost: 8, icon: 'assets/icons/sand.png' },
        { name: 'Бомбардо', say: 'рука к лицу + «Бомбардо»', desc: 'Взрывной шар: вырывает куски гор и земли, ломает деревья, раскидывает зомби и предметы.', dmg: 'до 8 (взрыв)', pvp: 'до 3 (щит −50%)', cost: 15, icon: 'assets/icons/bombardo.svg' },
        { name: 'Бомбардо Максима', say: 'рука к лицу + «Бомбардо Максима»', desc: 'В 3 раза мощнее «Бомбардо»: из руки вырывается огромная волна магии, шар больше, воронка намного шире, всё разлетается дальше.', dmg: 'до 24 (взрыв)', pvp: 'до 9 (щит −50%)', cost: 25, icon: 'assets/icons/bombardo_maxima.svg' },
        { name: 'Флайн', say: 'обе руки вверх + «Флайн»', desc: 'Полёт как у Супермена. Рулите корпусом, приземление — направьте себя в землю. В полёте работают все заклинания. На картах (лабиринтах) не работает.', dmg: '—', cost: 10, icon: 'assets/icons/flight.svg' },
        { name: 'Waterbollow', say: 'рука у самой воды + «Waterbollow»', desc: 'Вода из реки или озера плавно поднимается живым шаром и следует за рукой (большой шар — тяжелее и медленнее). Резкий рывок рукой — шар падает: жидкий сливается с водой, ледяной остаётся.', dmg: 'ледяной шар: 3–10', pvp: 'ледяной шар: 3', cost: 5, icon: 'assets/icons/water.svg' },
        { name: 'Максима (вода)', say: '«Максима», пока держите водный шар', desc: 'Шар втягивает больше воды и растёт — говорите сколько угодно раз, до максимума. Открытая вторая рука рядом с шаром тоже подливает воду без слов.', dmg: '—', cost: 4, icon: 'assets/icons/water.svg' },
        { name: 'Water forming', say: '«Water forming», пока вода жидкая', desc: 'Ведите шар — за ним остаются водяные блоки: стены, башни, дома. Вода тратится, подпитывайте шар. Изо льда формировать нельзя.', dmg: '—', cost: 5, icon: 'assets/icons/water_forming.svg' },
        { name: 'Frozen', say: '«Frozen» с водным шаром', desc: 'Замораживает шар и всё сформированное: блоки становятся льдом — сквозь него не пройти, на нём можно стоять. Без водного шара работает как «Айс».', dmg: '—', cost: 5, icon: 'assets/icons/ice.png' },
        { name: 'Остолбеней', say: 'направить руку на противника + «Остолбеней»', desc: 'Дуэльное. Красный электрический заряд быстро летит к цели (10 м — меньше секунды). Попал — цель замирает на 15 секунд. Защита: щит или встречное дуэльное заклинание.', dmg: 'оглушение 15 с', pvp: 'оглушение 15 с', cost: 12, icon: 'assets/icons/stupefy.svg' },
        { name: 'Авада Кедавра', say: 'направить руку на противника + «Авада Кедавра»', desc: 'Дуэльное. Зелёный заряд — мгновенная смерть при попадании. Защита: щит или встречное дуэльное заклинание.', dmg: 'смерть', pvp: 'смерть', cost: 25, icon: 'assets/icons/avada.svg' },
        { name: 'Дуэль', say: 'встречное дуэльное заклинание в ответ', desc: 'Два заряда встречаются и давят друг на друга: точка смещается к более слабому (сначала усталость, потом HP, немного удачи). Держите руку на сопернике! Выйти без потерь: плавно отвести руку и потом стряхнуть. Резко дёрнуть сразу — сдаться (заклинание попадёт в вас).', dmg: '—', icon: 'assets/icons/duel.svg' },
        { name: 'Вайнд', say: 'поднять руку в нужную сторону + «Вайнд»', desc: 'Порыв ветра из руки сдувает зомби, игроков и предметы на несколько метров. Не ранит.', dmg: '—', pvp: 'отбрасывает', cost: 8, icon: 'assets/icons/wind.svg' },
        { name: 'Вайнд Максима', say: 'поднять руку + «Вайнд Максима»', desc: 'То же, но в 3 раза сильнее и дальше (до 24 м).', dmg: '—', pvp: 'отбрасывает сильно', cost: 20, icon: 'assets/icons/wind.svg' },
        { name: 'Брейнрот', say: 'посмотреть на зомби + «Брейнрот» (руку поднимать не нужно)', desc: 'Только против зомби. Из-над головы мага к зомби катятся гипнотические кольца — он становится вашим слугой на 45 с: нападает на других зомби, а они — на него.', dmg: '—', cost: 15, icon: 'assets/icons/brainrot.svg' },
        { name: 'Акцио', say: 'поднять руку, указать на предмет + «Акцио»', desc: 'Меч, топор или другой предмет до 30 м прилетает прямо в руку. Он останется в руке, даже если она открыта; бросить — сжать и разжать кулак.', dmg: '—', cost: 5, icon: 'assets/icons/accio.svg' },
        { name: 'Вингардиум Левиоса', say: 'направить руку на предмет + «Вингардиум Левиоса»', desc: 'Меч, топор или ледяной шар до 10 м поднимается и плавно следует за рукой. Резкое движение — заклинание спадает и предмет летит дальше (так можно бросать). Сказать ещё раз — мягко опустить. Направленная на существо — дуэльное заклинание: подбрасывает его в воздух.', dmg: '—', cost: 6, icon: 'assets/icons/levitation.svg' },
        { name: 'Protection', say: 'вытянуть руку + «Protection»', desc: 'Работает в любом режиме. У вытянутой руки на 3 секунды появляется голубой щит. В «Свободном мире» заклинания, пущенные прямо в вас, отскакивают, а взрыв Бомбардо рядом ранит вполовину.', dmg: '—', cost: 5, icon: 'assets/icons/shield.svg' },
        { name: 'Protection Maxima', say: 'руки в стороны буквой «T» + «Protection Maxima»', desc: 'Голубой шар вокруг всего тела на 5 секунд: отражает заклинания со всех сторон, взрывы ранят на 75% слабее.', dmg: '—', cost: 20, icon: 'assets/icons/shield_max.svg' },
    ];
    for (const item of items) {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <img src='${item.icon}' class='item-icon' onerror="this.style.display='none'">
            <div class='item-name'>${item.name}</div>
            <div class='item-desc'>${item.desc}</div>
            ${item.say ? `<div class='item-desc'><b>Как:</b> ${item.say}</div>` : ''}
            <div class='item-stats'>
                <div class='stat-row'><span>Урон:</span><span class='stat-val'>${item.dmg}</span></div>
                ${item.pvp ? `<div class='stat-row'><span>По игрокам:</span><span class='stat-val'>${item.pvp}</span></div>` : ''}
                ${item.cost ? `<div class='stat-row'><span>Усталость:</span><span class='stat-val'>${item.cost}</span></div>` : ''}
            </div>`;
        grid.appendChild(card);
    }
}

// ------------------------------------------------------------------ version
// Shown in the menu so everyone can see at a glance that the game is up to date
fetch('/api/version').then((r) => r.json()).then((v) => {
    if (!v || !v.date) return;
    const el = document.createElement('div');
    el.id = 'game-version';
    el.textContent = `Версия от ${v.date}` + (v.sha ? ` (${v.sha})` : '');
    el.style.cssText = 'position:absolute;left:12px;bottom:8px;font-size:12px;color:rgba(255,255,255,.55);pointer-events:none;z-index:5';
    $('main-menu')?.appendChild(el);
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
    /** Свободный мир: killed → message, then back to the menu. */
    died(text) {
        $('death-text').innerHTML = text;
        const screen = $('death-screen');
        screen.classList.remove('hidden');
        if (document.pointerLockElement) document.exitPointerLock();
        let left = 5;
        $('death-count').textContent = left;
        const back = () => location.reload();
        $('death-menu-btn').onclick = back;
        const timer = setInterval(() => {
            left--;
            $('death-count').textContent = Math.max(0, left);
            if (left <= 0) { clearInterval(timer); back(); }
        }, 1000);
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
        net.info = { playing: true }; // (the shared server's status in other players' menus)
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

net.on('peer-join', ({ name }) => {
    renderPlayers();
    renderWorld();
    if (game && game.active) return;
    setMpStatus(net.code === WORLD_CODE
        ? `К вам на общий сервер зашёл: ${escapeHtml(name)}. Выберите режим и нажмите «ИГРАТЬ».`
        : `К вам подключился: ${escapeHtml(name)}. Код: <span class="mp-code-big">${net.code}</span>`);
});

// ---- «Общий сервер»: one fixed room, on/off and who is in — no codes
const worldStatus = $('mp-world-status');
const worldBtn = $('mp-world-btn');
const worldBadge = $('mp-world-badge');
let worldState = null;
function renderWorld() {
    if (net.active && net.code === WORLD_CODE) {
        const who = net.playerList().map((p) => escapeHtml(p.name)).join(', ');
        worldStatus.innerHTML = net.isHost ? `🟢 Общий сервер включён — его держите вы. Сейчас: ${who}` : `🟢 Вы на общем сервере. Сейчас: ${who}`;
        worldBtn.style.display = 'none';
        worldBadge.textContent = '— 🟢 вы на общем сервере';
        return;
    }
    worldBtn.style.display = net.active ? 'none' : '';
    if (!worldState) { worldStatus.textContent = '🌍 Общий сервер: проверяем...'; worldBadge.textContent = ''; return; }
    if (worldState.online) {
        const who = worldState.players.map(escapeHtml).join(', ');
        worldStatus.innerHTML = `🟢 Общий сервер <b>включён</b>: ${who || '...'}${worldState.playing ? ' (идёт игра)' : ''}`;
        worldBtn.textContent = '🌍 Войти';
        worldBadge.textContent = `— 🟢 общий сервер включён (${worldState.players.length})`;
    } else {
        worldStatus.innerHTML = worldState.unknown ? '⚪ Общий сервер: нет связи, попробуйте включить' : '⚪ Общий сервер <b>выключен</b> — включите его, и друзья смогут войти';
        worldBtn.textContent = '🌍 Включить сервер';
        worldBadge.textContent = '— ⚪ общий сервер выключен';
    }
}
async function checkWorld() {
    if (net.active || (game && game.active) || window.__ZNS_NO_WORLD_PROBE__) { renderWorld(); return; }
    try { worldState = await net.probe(WORLD_CODE, mpServer.value); } catch (e) { worldState = { online: false, unknown: true, players: [] }; }
    renderWorld();
}
setTimeout(checkWorld, 800);
setInterval(checkWorld, 10000);
worldBtn.addEventListener('click', async () => {
    net.stopProbe();
    const name = playerName();
    const join = async () => {
        setMpStatus('Входим на общий сервер...');
        await net.join(WORLD_CODE, name, mpServer.value);
        setMpStatus('✅ Вы на общем сервере! Ждём, когда начнётся игра (если она уже идёт — вы войдёте сразу).');
    };
    try {
        if (worldState?.online) await join();
        else {
            setMpStatus('Включаем общий сервер...');
            try {
                await net.host(name, mpServer.value, WORLD_CODE);
                setMpStatus('🟢 Общий сервер включён — вы его держите. Друзья увидят «включён» и войдут одной кнопкой. Выберите режим и нажмите «ИГРАТЬ».');
            } catch (e) {
                if (e.type === 'unavailable-id') await join(); // someone switched it on a moment earlier
                else throw e;
            }
        }
    } catch (e) {
        setMpStatus('❌ ' + escapeHtml(e.message));
    }
    renderPlayers();
    renderWorld();
});
net.on('peer-leave', () => { renderPlayers(); renderWorld(); });
net.on('players', () => { renderPlayers(); renderWorld(); });
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
