/**
 * TestMode.js — "🛠️ Настроить Камеру (Тест)": orbit view of the character,
 * red marker = FPV camera position, hand / weapon sliders, live tracking.
 * Same UI and behaviour as the original test mode (with its crashes fixed).
 */

import * as THREE from 'three';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';

export function setupTestMode(game, { renderer, camera, poseService, onExit }) {
    const $ = (id) => document.getElementById(id);
    const ui = $('test-mode-ui');
    const panel = document.querySelector('#test-mode-ui .menu-container');
    const backOverlay = $('tm-back-overlay');
    ui.classList.remove('hidden');
    backOverlay.classList.add('hidden');
    panel.classList.remove('hidden');
    game.testState = 'setup';

    const ch = game.character;
    ch.setIdlePose();
    const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, transparent: true }),
    );
    marker.renderOrder = 999;
    ch.head.add(marker);
    game.testMarker = marker;
    const offset = new THREE.Vector3(0, -0.5, -0.4);
    marker.position.copy(offset);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.copy(ch.group.position);
    orbit.target.y += 1.5;
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.05;
    camera.position.set(ch.group.position.x + 3, ch.group.position.y + 2, ch.group.position.z + 3);
    orbit.update();
    game.orbit = orbit;

    // Camera marker sliders
    const sx = $('tm-x'), sy = $('tm-y'), sz = $('tm-z');
    sx.value = offset.x; sy.value = offset.y; sz.value = offset.z;
    const updateMarker = () => {
        const x = parseFloat(sx.value), y = parseFloat(sy.value), z = parseFloat(sz.value);
        $('tm-val-x').textContent = x; $('tm-val-y').textContent = y; $('tm-val-z').textContent = z;
        marker.position.set(x, y, z);
    };
    [sx, sy, sz].forEach((el) => { el.oninput = updateMarker; });
    updateMarker();

    // Hand sliders (scale / position / rotation of both hands)
    const hs = ['hp-s', 'hp-x', 'hp-y', 'hp-z', 'hr-x', 'hr-y', 'hr-z'].map($);
    const hands = ch.getActiveHands();
    const g0 = hands.left.group;
    const r = (v) => Math.round(v * 100) / 100;
    hs[0].value = r(Math.abs(g0.scale.y)) || 1;
    hs[1].value = r(g0.position.x); hs[2].value = r(g0.position.y); hs[3].value = r(g0.position.z - ch.BONE_LENGTH_LOWER);
    hs[4].value = r(g0.rotation.x); hs[5].value = r(g0.rotation.y); hs[6].value = r(g0.rotation.z);
    const updateHands = () => {
        const v = hs.map((el) => parseFloat(el.value));
        ['hp-val-s', 'hp-val-x', 'hp-val-y', 'hp-val-z', 'hr-val-x', 'hr-val-y', 'hr-val-z'].forEach((id, i) => { $(id).textContent = hs[i].value; });
        for (const side of ['left', 'right']) {
            const g = ch.getActiveHands()[side].group;
            const mirror = side === 'left' && ch.handVersion === 'v3' ? -1 : (ch.handVersion === 'v2' ? -1 : 1);
            g.scale.set(v[0] * mirror, v[0], v[0]);
            g.userData.restOffset = new THREE.Vector3(v[1], v[2], v[3]);
            g.position.set(v[1], v[2], ch.BONE_LENGTH_LOWER + v[3]);
            g.rotation.set(v[4], v[5], v[6]);
        }
    };
    hs.forEach((el) => { el.oninput = updateHands; });

    // Weapon section: hide/show held weapons
    const hide = $('hide-weapon');
    hide.onchange = () => { for (const w of game.weapons.weapons) w.mesh.visible = !hide.checked; };

    // Buttons
    $('tm-exit-btn').onclick = () => onExit();
    $('tm-spawn-btn').onclick = async () => {
        game.testState = 'fpv';
        panel.classList.add('hidden');
        backOverlay.classList.remove('hidden');
        orbit.enabled = false;
        try {
            await poseService.initialize('webcam', 'preview-video', { modelComplexity: 1 });
            await poseService.start();
        } catch (e) {
            console.error('Camera start failed', e);
        }
    };
    $('tm-back-btn').onclick = () => {
        game.testState = 'setup';
        backOverlay.classList.add('hidden');
        panel.classList.remove('hidden');
        orbit.enabled = true;
    };
    const live = $('tm-preview-tracking');
    live.checked = false;
    live.onchange = async (e) => {
        if (e.target.checked) {
            try {
                await poseService.initialize('webcam', 'preview-video', { modelComplexity: 1 });
                await poseService.start();
            } catch (err) {
                console.error('Camera start failed', err);
                e.target.checked = false;
            }
        } else {
            poseService.stop();
            game.currentPose = null;
            ch.resetPose();
        }
    };
    // Save rig: persists hand slider values on the server (same endpoint as before)
    const saveRig = $('save-rig-btn');
    if (saveRig) {
        saveRig.classList.remove('hidden');
        saveRig.onclick = async () => {
            const data = { hands: hs.map((el) => parseFloat(el.value)), camera: [parseFloat(sx.value), parseFloat(sy.value), parseFloat(sz.value)] };
            try {
                const res = await fetch('/api/rig', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                if (res.ok) toast('Риг сохранён!');
            } catch (e) { console.error(e); }
        };
    }
}

function toast(msg) {
    const div = document.createElement('div');
    div.textContent = msg;
    Object.assign(div.style, { position: 'absolute', top: '100px', left: '50%', transform: 'translateX(-50%)', padding: '10px 20px', background: '#27ae60', color: 'white', borderRadius: '5px', zIndex: '10000' });
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2000);
}
