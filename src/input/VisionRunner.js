/**
 * VisionRunner.js — runs the MediaPipe Tasks models (pose, hands, face).
 *
 * Used inside the Web Worker (normal case, keeps the game thread free) and
 * on the main thread as a fallback when workers are not available.
 *
 * Models (all bundled in vendor/, no internet needed):
 *   - Pose Landmarker lite / full / heavy (menu "Качество ИИ")
 *   - Hand Landmarker (2 hands)
 *   - Face Landmarker (478 points, used for head rotation)
 */

import { FilesetResolver, PoseLandmarker, HandLandmarker, FaceLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';

const POSE_MODELS = ['pose_landmarker_lite.task', 'pose_landmarker_full.task', 'pose_landmarker_heavy.task'];

export class VisionRunner {
    constructor(baseUrl) {
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
        this.pose = null;
        this.hands = null;
        this.face = null;
        this.delegate = null;
        this.lastTs = 0;
        this.frame = 0;
        this.faceEvery = 2;
    }

    /**
     * @param {object} o
     *   handsOnly: only the Hand Landmarker (helper next to Holistic, which
     *   loses hands that overlap the arm/body; this network has its own palm detector)
     */
    async init({ quality = 1, useModule = true, handsOnly = false } = {}) {
        this.handsOnly = handsOnly;
        const fileset = await FilesetResolver.forVisionTasks(this.baseUrl + 'vendor/mediapipe/wasm', useModule);
        // With the ES-module loader the library clears self.ModuleFactory after
        // creating a task, and a second import() of the same module does not
        // re-run it. Keep our own reference and restore it before each task.
        const loader = useModule ? await import(fileset.wasmLoaderPath) : null;
        const restoreFactory = () => { if (loader && !self.ModuleFactory) self.ModuleFactory = loader.default; };
        const model = (name) => this.baseUrl + 'vendor/mediapipe/models/' + name;
        const poseModel = POSE_MODELS[Math.max(0, Math.min(2, quality | 0))];

        const create = async (delegate) => {
            // GPU processing needs a canvas per task; in a worker that is an OffscreenCanvas.
            const canvasFor = () => (delegate === 'GPU' && typeof OffscreenCanvas !== 'undefined' ? { canvas: new OffscreenCanvas(1, 1) } : {});
            const common = (path) => ({ baseOptions: { modelAssetPath: model(path), delegate }, runningMode: 'VIDEO', ...canvasFor() });
            if (handsOnly) {
                restoreFactory();
                const hands = await HandLandmarker.createFromOptions(fileset, {
                    ...common('hand_landmarker.task'),
                    numHands: 2,
                    minHandDetectionConfidence: 0.5,
                    minHandPresenceConfidence: 0.5,
                    minTrackingConfidence: 0.5,
                });
                return { pose: null, hands, face: null };
            }
            restoreFactory();
            const pose = await PoseLandmarker.createFromOptions(fileset, {
                ...common(poseModel),
                numPoses: 1,
                minPoseDetectionConfidence: 0.5,
                minPosePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });
            restoreFactory();
            const hands = await HandLandmarker.createFromOptions(fileset, {
                ...common('hand_landmarker.task'),
                numHands: 2,
                minHandDetectionConfidence: 0.5,
                minHandPresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });
            restoreFactory();
            const face = await FaceLandmarker.createFromOptions(fileset, {
                ...common('face_landmarker.task'),
                numFaces: 1,
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: false,
            });
            return { pose, hands, face };
        };

        let models;
        const forced = (typeof self !== 'undefined' && self.__ZNS_DELEGATE__) || (softwareGpu() ? 'CPU' : null);
        try {
            if (forced === 'CPU') throw new Error('no hardware GPU — CPU is faster here');
            models = await create('GPU');
            this.delegate = 'GPU';
        } catch (e) {
            console.warn('[Vision] GPU delegate unavailable, using CPU:', e?.message || e);
            models = await create('CPU');
            this.delegate = 'CPU';
        }
        Object.assign(this, models);
        return { delegate: this.delegate, poseModel };
    }

    /**
     * @param {ImageBitmap|HTMLVideoElement|HTMLCanvasElement} image
     * @param {number} timestampMs  monotonically increasing
     */
    detect(image, timestampMs) {
        let ts = Math.round(timestampMs);
        if (ts <= this.lastTs) ts = this.lastTs + 1;
        this.lastTs = ts;
        this.frame++;
        const t0 = performance.now();
        const pose = this.pose ? this.pose.detectForVideo(image, ts) : { landmarks: [] };
        const hands = this.hands.detectForVideo(image, ts);
        let face = null;
        if (this.face && this.frame % this.faceEvery === 0) face = this.face.detectForVideo(image, ts);
        const cost = performance.now() - t0;
        // The face only steers the camera (head turn), which is smoothed anyway:
        // every 2nd frame is enough and leaves more time for body and hands.
        // On a slow computer, every 3rd.
        this.faceEvery = cost > 45 ? 3 : 2;
        return {
            ts,
            cost,
            poseLandmarks: pose.landmarks?.[0] ? plain(pose.landmarks[0], true) : null,
            hands: (hands.landmarks || []).map((lm, i) => ({
                landmarks: plain(lm, false),
                label: hands.handedness?.[i]?.[0]?.categoryName ?? null,
                score: hands.handedness?.[i]?.[0]?.score ?? 1,
            })),
            faceLandmarks: face && face.faceLandmarks?.[0] ? plain(face.faceLandmarks[0], false) : (face ? null : undefined),
            handsOnly: this.handsOnly,
        };
    }

    close() {
        try { this.pose?.close(); this.hands?.close(); this.face?.close(); } catch (e) { /* ignore */ }
    }
}

/**
 * True when WebGL runs on a software rasteriser (no real GPU / blocked
 * driver). The GPU delegate is then ~10× slower than the CPU one.
 */
export function softwareGpu() {
    try {
        const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
    } catch (e) {
        return false;
    }
}

/** Copy landmarks into plain objects (structured-clone friendly, small). */
function plain(list, withVisibility) {
    const out = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
        const l = list[i];
        out[i] = withVisibility
            ? { x: l.x, y: l.y, z: l.z, visibility: l.visibility ?? 1 }
            : { x: l.x, y: l.y, z: l.z };
    }
    return out;
}
