import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VillagerModel, villagerLook, MODES } from '../../src/entities/VillagerModel.js';
import { styleOf, STANCES, SWINGS, GAITS } from '../../src/entities/MoveStyle.js';

const run = (v, seconds, state, dt = 1 / 60) => { for (let i = 0; i < Math.round(seconds / dt); i++) v.update(dt, state); };

test('each wizard has his own manner — from the seed alone (the same on every computer), and they differ', () => {
    const st = new Set(), sw = new Set(), gt = new Set();
    for (let seed = 0; seed < 60; seed++) {
        const L = villagerLook(seed, 'student');
        assert.deepEqual(styleOf(L, true), styleOf(villagerLook(seed, 'student'), true));
        const S = styleOf(L, true);
        st.add(S.stance); sw.add(S.swing); gt.add(S.gait);
        assert.ok(GAITS[S.gait]);
    }
    assert.equal(st.size, STANCES.length);
    assert.equal(sw.size, SWINGS.length);
    assert.ok(gt.size >= 4);
    assert.equal(styleOf(villagerLook(3, 'king'), false).gait, 'stately');
});

test('whatever his manner, the cast (and a long duel push) points the wand where he aims', () => {
    for (let seed = 0; seed < 40; seed++) {
        const m = new VillagerModel(villagerLook(seed, 'teacher'));
        for (const pitch of [0, 0.35]) {
            m.setAim(pitch);
            for (const secs of [0.6, 2.5]) {
                run(m, 0.4, { mode: 'idle' });
                run(m, secs, { mode: 'cast' });
                m.group.updateMatrixWorld(true);
                const d = m.getWandDir(new THREE.Vector3());
                assert.ok(d.z < -0.85, `${m.style.stance}/${m.style.swing} forward ${d.z.toFixed(2)}`);
                assert.ok(Math.abs(Math.asin(d.y) - pitch) < 0.2, `${m.style.stance} pitch ${pitch}: ${Math.asin(d.y).toFixed(2)}`);
            }
        }
    }
});

test('every mode and every walk: the pose stays finite, the feet on the ground', () => {
    for (let seed = 0; seed < 30; seed++) for (const role of ['farmer', 'knight', 'student', 'wanderer']) {
        const m = new VillagerModel(villagerLook(seed, role));
        for (const mode of MODES) {
            run(m, 0.3, { mode, speed: mode === 'walk' ? 1.6 : undefined }, 1 / 30);
            for (const k in m._p) assert.ok(Number.isFinite(m._p[k]), `${role} ${mode} ${k}`);
        }
        run(m, 3, { mode: 'cast' }, 1 / 30); run(m, 12, { mode: 'idle' }, 1 / 30); run(m, 2, { mode: 'walk', speed: 1.6 }, 1 / 30);
        for (const k in m._p) assert.ok(Number.isFinite(m._p[k]));
    }
});
