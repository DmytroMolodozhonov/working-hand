/**
 * PlayerPreview.js — the small 3D hero of the «Игрок» tab (own renderer; created on open, disposed on close).
 * Same scene as the character editor's preview: the hero with their look, armour and robe on.
 */
import * as THREE from 'three';
import { VoxelCharacter } from '../entities/Character.js';
import { dressArmor } from '../entities/ArmorLook.js';

export async function makePlayerPreview(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, canvas.width / canvas.height, 0.1, 100);
    camera.position.set(0, 1.4, 15);
    camera.lookAt(0, 0.8, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(3, 6, 8);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.2, 32), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
    floor.position.y = -2.15;
    scene.add(floor);
    const hero = new VoxelCharacter(scene, { remote: true });
    hero.setShowHands(true);
    hero.leftArmAnchor.rotation.set(1.35, 0, 0.12);
    hero.rightArmAnchor.rotation.set(1.35, 0, -0.12);
    hero.leftElbowAnchor.rotation.set(-0.35, 0, 0);
    hero.rightElbowAnchor.rotation.set(-0.35, 0, 0);
    return {
        renderer, scene, camera, hero,
        dress: (h, code) => dressArmor(h, code),
        dispose() {
            // (only what the preview owns: the armour's shared materials/shapes stay for the game)
            scene.remove(hero.group);
            hero.group.traverse((o) => {
                if (!(o.isMesh || o.isInstancedMesh)) return;
                if (!o.geometry?.userData?.shared && !o.geometry?.userData?.keep) o.geometry?.dispose();
                for (const m of [].concat(o.material || [])) if (!m.userData?.shared && !m.userData?.keep) m.dispose();
            });
            floor.geometry.dispose(); floor.material.dispose();
            renderer.dispose();
            renderer.forceContextLoss?.(); // (this canvas is thrown away: the next opening makes a NEW canvas — a lost context cannot be reused)
        },
    };
}
