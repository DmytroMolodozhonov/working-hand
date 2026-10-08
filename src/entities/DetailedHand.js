/**
 * DetailedHand.js — "V2 (Точная)" voxel hand drawn straight from the raw
 * MediaPipe landmarks with an InstancedMesh. Original algorithm and constants,
 * rewritten without per-frame allocations.
 */

import * as THREE from 'three';

const CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17], [0, 17],
];
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class DetailedHand {
    constructor(side = 'right') {
        this.side = side;
        this.group = new THREE.Group();
        this.VOXEL_SIZE = 0.02;
        this.MAX_INSTANCES = 1500;
        this.VOXEL_DENSITY = 1.5;
        this.HAND_PHYSICAL_SIZE = 2.5;
        this.lastLandmarks = null;
        this.voxelColor = side === 'right' ? 0x00efff : 0xff00ef;

        const geometry = new THREE.BoxGeometry(this.VOXEL_SIZE, this.VOXEL_SIZE, this.VOXEL_SIZE);
        const material = new THREE.MeshStandardMaterial({
            color: this.voxelColor, roughness: 0.2, metalness: 0.8, emissive: 0x0044aa, emissiveIntensity: 0.2,
        });
        this.mesh = new THREE.InstancedMesh(geometry, material, this.MAX_INSTANCES);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.count = 0;
        this.mesh.frustumCulled = false;
        this.group.add(this.mesh);

        this.rotationOffset = 60 * (Math.PI / 180);
        this.quality = 'high';
        this.currentVectors = null;
        this._targets = Array.from({ length: 21 }, () => new THREE.Vector3());
        this._matrix = new THREE.Matrix4();
        this._e1 = new THREE.Vector3();
        this._e2 = new THREE.Vector3();
        this._default = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
        // Dummy currentState so grab logic can query curls with either hand version.
        this.currentState = { fingers: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 } };
        this.palm = null;
    }

    setQuality(mode) {
        this.quality = mode;
        this.VOXEL_DENSITY = mode === 'high' ? 1.5 : 0.8;
    }

    _toLocal(l, wrist, scaleFactor, out) {
        const s = scaleFactor * this.HAND_PHYSICAL_SIZE;
        out.set(-(l.x - wrist.x) * s, -(l.y - wrist.y) * s, -(l.z || 0) * s);
        return out.applyAxisAngle(Z_AXIS, this.rotationOffset);
    }

    placeVoxel(x, y, z, idx) {
        if (idx >= this.MAX_INSTANCES) return idx;
        this._matrix.makeTranslation(x, y, z);
        this.mesh.setMatrixAt(idx, this._matrix);
        return idx + 1;
    }

    fillTriangle(p1, p2, p3, idx) {
        if (this.quality === 'low') return idx;
        const density = 6;
        for (let i = 0; i <= density; i++) {
            const t = i / density;
            this._e1.lerpVectors(p1, p2, t);
            this._e2.lerpVectors(p1, p3, t);
            const innerSteps = Math.ceil(this._e1.distanceTo(this._e2) / (this.VOXEL_SIZE / 1.5));
            for (let j = 0; j <= innerSteps; j++) {
                const k = j / (innerSteps || 1);
                idx = this.placeVoxel(
                    this._e1.x + (this._e2.x - this._e1.x) * k,
                    this._e1.y + (this._e2.y - this._e1.y) * k,
                    this._e1.z + (this._e2.z - this._e1.z) * k,
                    idx,
                );
            }
        }
        return idx;
    }

    update(landmarks) {
        if (!landmarks || landmarks.length < 21) {
            landmarks = this.lastLandmarks || this._default;
        } else {
            this.lastLandmarks = landmarks;
            this._updateCurls(landmarks);
        }
        const wrist = landmarks[0];
        const middleMCP = landmarks[9];
        const apparent = Math.hypot(wrist.x - middleMCP.x, wrist.y - middleMCP.y);
        const scaleFactor = 0.15 / Math.max(apparent, 0.001);

        for (let i = 0; i < 21; i++) this._toLocal(landmarks[i], wrist, scaleFactor, this._targets[i]);
        if (!this.currentVectors) this.currentVectors = this._targets.map((v) => v.clone());
        for (let i = 0; i < 21; i++) this.currentVectors[i].lerp(this._targets[i], 0.5); // (0.3 trailed the real hand)

        let idx = 0;
        const cv = this.currentVectors;
        for (const [a, b] of CONNECTIONS) {
            const vs = cv[a], ve = cv[b];
            const steps = Math.ceil(vs.distanceTo(ve) / (this.VOXEL_SIZE / this.VOXEL_DENSITY)) || 1;
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                idx = this.placeVoxel(vs.x + (ve.x - vs.x) * t, vs.y + (ve.y - vs.y) * t, vs.z + (ve.z - vs.z) * t, idx);
            }
        }
        idx = this.fillTriangle(cv[0], cv[5], cv[17], idx);
        idx = this.fillTriangle(cv[5], cv[9], cv[17], idx);
        idx = this.fillTriangle(cv[9], cv[13], cv[17], idx);
        this.mesh.count = idx;
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    _updateCurls(lm) {
        const w = lm[0];
        const curl = (b, t) => {
            const dTip = Math.hypot(lm[t].x - w.x, lm[t].y - w.y);
            const dBase = Math.hypot(lm[b].x - w.x, lm[b].y - w.y);
            return Math.max(0, Math.min(1, (1.15 - dTip / (dBase + 0.05)) * 3.2));
        };
        const f = this.currentState.fingers;
        f.index = curl(5, 8); f.middle = curl(9, 12); f.ring = curl(13, 16); f.pinky = curl(17, 20);
    }

    setGrip() { }

    serializeState() {
        const f = this.currentState.fingers;
        return [0, f.index, f.middle, f.ring, f.pinky, 0, 0, 0, 0, 0];
    }

    getCollisionBoxes() {
        const boxes = [];
        if (!this.group.visible || !this.currentVectors) return boxes;
        for (let i = 0; i < 21; i++) {
            const p = this.currentVectors[i].clone();
            this.mesh.localToWorld(p);
            boxes.push({ box: new THREE.Box3().setFromCenterAndSize(p, new THREE.Vector3(0.15, 0.15, 0.15)), type: 'landmark', index: i });
        }
        return boxes;
    }
}
