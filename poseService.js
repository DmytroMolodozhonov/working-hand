/**
 * poseService.js - Return raw landmark positions for lookAt approach
 * Based on user's working React code
 */

class PoseService {
    constructor() {
        this.holistic = null;
        this.camera = null;
        this.videoElement = null;
        this.previewElement = null;
        this.isRunning = false;
        this.shoulderHistory = [];
        this.onPoseUpdate = null;
    }

    async initialize(videoElementId, previewElementId, config = {}) {
        this.videoElement = document.getElementById(videoElementId);
        this.previewElement = document.getElementById(previewElementId);

        // Skeleton canvas for debug visualization
        this.skeletonCanvas = document.getElementById('skeleton-canvas');

        // Config defaults
        const modelQuality = config.modelComplexity !== undefined ? parseInt(config.modelComplexity) : 1;

        console.log(`Initializing PoseService with Model Quality: ${modelQuality}`);

        this.holistic = new Holistic({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${file}`
        });

        this.holistic.setOptions({
            modelComplexity: 2, // 0, 1, or 2 (2 is Heavy, best for hands)
            smoothLandmarks: true,
            enableSegmentation: false,
            smoothSegmentation: false,
            refineFaceLandmarks: true,
            minDetectionConfidence: 0.5, // Lowered for stability
            minTrackingConfidence: 0.5   // Lowered for stability
        });

        // Resolution parsing
        let width = 640, height = 480;
        if (config.resolution) {
            const parts = config.resolution.split('x');
            if (parts.length === 2) {
                width = parseInt(parts[0]);
                height = parseInt(parts[1]);
            }
        }
        console.log(`Camera Config: ${width}x${height}, Quality: ${modelQuality}`);

        this.holistic.onResults((results) => this.onResults(results));

        this.camera = new Camera(this.videoElement, {
            onFrame: async () => {
                if (this.isRunning) {
                    await this.holistic.send({ image: this.videoElement });
                }
            },
            width: width,
            height: height
        });

        if (this.previewElement) {
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(stream => { this.previewElement.srcObject = stream; })
                .catch(err => console.error('Preview error:', err));
        }
    }

    async start() {
        this.isRunning = true;
        await this.camera.start();
    }

    stop() {
        this.isRunning = false;
        if (this.camera) this.camera.stop();
    }

    onResults(results) {
        // SKELETON DRAWING
        if (this.skeletonCanvas && results.poseLandmarks) {
            const ctx = this.skeletonCanvas.getContext('2d');
            ctx.save();
            ctx.clearRect(0, 0, this.skeletonCanvas.width, this.skeletonCanvas.height);

            // Black background
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, this.skeletonCanvas.width, this.skeletonCanvas.height);

            // Mirror horizontally for natural feel
            ctx.translate(this.skeletonCanvas.width, 0);
            ctx.scale(-1, 1);

            // Draw connections (bones)
            const connections = [
                [11, 12], // Shoulders
                [11, 13], [13, 15], // Left arm
                [12, 14], [14, 16], // Right arm
                [11, 23], [12, 24], // Torso
                [23, 24], // Hips
                [23, 25], [25, 27], // Left leg
                [24, 26], [26, 28]  // Right leg
            ];

            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            connections.forEach(([i, j]) => {
                const a = results.poseLandmarks[i];
                const b = results.poseLandmarks[j];
                if (a && b) {
                    ctx.beginPath();
                    ctx.moveTo(a.x * this.skeletonCanvas.width, a.y * this.skeletonCanvas.height);
                    ctx.lineTo(b.x * this.skeletonCanvas.width, b.y * this.skeletonCanvas.height);
                    ctx.stroke();
                }
            });

            // Draw joints
            ctx.fillStyle = '#ff0000';
            results.poseLandmarks.forEach((lm, idx) => {
                // Only draw key landmarks (arms, torso, head)
                if ([0, 11, 12, 13, 14, 15, 16, 23, 24].includes(idx)) {
                    ctx.beginPath();
                    ctx.arc(lm.x * this.skeletonCanvas.width, lm.y * this.skeletonCanvas.height, 5, 0, Math.PI * 2);
                    ctx.fill();
                }
            });

            // --- HAND DRAWING START ---
            const drawHand = (landmarks, color) => {
                if (!landmarks) return;
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.fillStyle = color;

                // Hand Connections (0=Wrist, 1-4=Thumb, 5-8=Index, etc)
                const handConnections = [
                    [0, 1], [1, 2], [2, 3], [3, 4],         // Thumb
                    [0, 5], [5, 6], [6, 7], [7, 8],         // Index
                    [0, 9], [9, 10], [10, 11], [11, 12],    // Middle
                    [0, 13], [13, 14], [14, 15], [15, 16],  // Ring
                    [0, 17], [17, 18], [18, 19], [19, 20],  // Pinky
                    [5, 9], [9, 13], [13, 17] // Knuckles cap
                ];

                handConnections.forEach(([i, j]) => {
                    const a = landmarks[i];
                    const b = landmarks[j];
                    ctx.beginPath();
                    ctx.moveTo(a.x * this.skeletonCanvas.width, a.y * this.skeletonCanvas.height);
                    ctx.lineTo(b.x * this.skeletonCanvas.width, b.y * this.skeletonCanvas.height);
                    ctx.stroke();
                });

                // Draw points
                landmarks.forEach(lm => {
                    ctx.beginPath();
                    ctx.arc(lm.x * this.skeletonCanvas.width, lm.y * this.skeletonCanvas.height, 3, 0, Math.PI * 2);
                    ctx.fill();
                });
            };

            // Draw Left Hand (Cyan)
            if (results.leftHandLandmarks) drawHand(results.leftHandLandmarks, '#00ffff');

            // Draw Right Hand (Cyan)
            if (results.rightHandLandmarks) drawHand(results.rightHandLandmarks, '#00ffff');
            // --- HAND DRAWING END ---

            ctx.restore();
        }

        if (this.onPoseUpdate) {
            const poseData = this.processPose(results);
            this.onPoseUpdate(poseData);
        }
    }

    processPose(results) {
        const data = {
            headRotation: { yaw: 0, pitch: 0 },
            bodyRotation: 0,
            leftShoulder: null,
            leftElbow: null,
            leftWrist: null,
            rightShoulder: null,
            rightElbow: null,
            rightWrist: null,
            rightWrist: null,
            leftHandPose: null, // Kalidokit Solved Data
            rightHandPose: null, // Kalidokit Solved Data
            nose: null,
            isRunning: false,
            runIntensity: 0, // 0 to 1
            isCrouching: false
        };

        if (results.poseLandmarks && results.poseLandmarks.length >= 33) {
            const lm = results.poseLandmarks;

            // Raw positions
            data.leftShoulder = { x: lm[11].x, y: lm[11].y, z: lm[11].z || 0 };
            data.leftElbow = { x: lm[13].x, y: lm[13].y, z: lm[13].z || 0 };
            data.leftWrist = { x: lm[15].x, y: lm[15].y, z: lm[15].z || 0 };
            data.rightShoulder = { x: lm[12].x, y: lm[12].y, z: lm[12].z || 0 };
            data.rightElbow = { x: lm[14].x, y: lm[14].y, z: lm[14].z || 0 };
            data.rightWrist = { x: lm[16].x, y: lm[16].y, z: lm[16].z || 0 };
            data.nose = { x: lm[0].x, y: lm[0].y, z: lm[0].z || 0 };

            // hips for crouching
            // 23 = left hip, 24 = right hip
            const leftHip = lm[23];
            const rightHip = lm[24];

            // Body rotation
            const zDiff = (lm[11].z || 0) - (lm[12].z || 0);
            data.bodyRotation = Math.max(-1, Math.min(1, zDiff * 5));

            // Run Intensity Logic (RESPONSIVE)
            const avgY = (lm[11].y + lm[12].y) / 2;
            this.shoulderHistory.push(avgY);
            if (this.shoulderHistory.length > 8) this.shoulderHistory.shift(); // REDUCED FROM 20

            if (this.shoulderHistory.length >= 3) {
                // Calculate total vertical movement (energy) over the short window
                let totalMovement = 0;
                for (let i = 1; i < this.shoulderHistory.length; i++) {
                    totalMovement += Math.abs(this.shoulderHistory[i] - this.shoulderHistory[i - 1]);
                }

                // Thresholds with short window (8 frames):
                // Total movement is smaller now. 
                // Normalize: 0.02 (stillness) to 0.15 (running)
                const rawIntensity = (totalMovement - 0.02) / 0.13;
                data.runIntensity = Math.max(0, Math.min(1, rawIntensity));
                data.isRunning = data.runIntensity > 0.1; // Respond to even light movement
            }

            // PUNCH DETECTION (Velocity Based)
            if (!this.prevWrists) {
                this.prevWrists = { left: { ...data.leftWrist }, right: { ...data.rightWrist } };
            }

            // Calculate distance moved since last frame
            const leftDist = Math.sqrt(
                Math.pow(data.leftWrist.x - this.prevWrists.left.x, 2) +
                Math.pow(data.leftWrist.y - this.prevWrists.left.y, 2));

            const rightDist = Math.sqrt(
                Math.pow(data.rightWrist.x - this.prevWrists.right.x, 2) +
                Math.pow(data.rightWrist.y - this.prevWrists.right.y, 2));

            // Update prev
            this.prevWrists = { left: { ...data.leftWrist }, right: { ...data.rightWrist } };

            // Threshold for "Fast Punch"
            // Typical slow move is < 0.05 per frame
            // Fast punch is > 0.1
            const punchThreshold = 0.08;

            data.isPunching = (leftDist > punchThreshold || rightDist > punchThreshold);
            // Optional: detect which hand
            data.punchingHand = leftDist > rightDist ? 'left' : 'right';

            // Crouch Detection Logic (Refined)
            // Use NOSE position instead of shoulders (more noticeable vertical drop)
            // Normal standing nose Y is usually ~0.2 - 0.3
            // Crouching brings it down to ~0.5 - 0.6
            const noseY = data.nose.y;

            // Debug for user to see values
            // console.log("Nose Y:", noseY.toFixed(2));

            // Hysteresis
            // Enter crouch at > 0.5 (Mid-screen or lower)
            // Exit crouch at < 0.45 (Higher up)

            if (!this.wasCrouching) {
                if (noseY > 0.5) {
                    this.wasCrouching = true;
                    console.log("Crouch ENTER");
                }
            } else {
                if (noseY < 0.45) {
                    this.wasCrouching = false;
                    console.log("Crouch EXIT");
                }
            }
            data.isCrouching = this.wasCrouching;
        }

        // --- NEW: Hand Landmarks (Kalidokit Solved) ---
        if (results.rightHandLandmarks) {
            // console.log("PoseService: Right Hand Detected");
            const riggedRight = Kalidokit.Hand.solve(results.rightHandLandmarks, "Right");
            data.rightHandPose = riggedRight;
            data.rightHandLandmarks = results.rightHandLandmarks; // RAW LANDMARKS FOR VOXEL HAND
            if (Math.random() < 0.01) console.log("PoseService: Right Hand Active");
        }
        if (results.leftHandLandmarks) {
            // console.log("PoseService: Left Hand Detected");
            const riggedLeft = Kalidokit.Hand.solve(results.leftHandLandmarks, "Left");
            data.leftHandPose = riggedLeft;
            data.leftHandLandmarks = results.leftHandLandmarks; // RAW LANDMARKS FOR VOXEL HAND
            if (Math.random() < 0.01) console.log("PoseService: Left Hand Active");
        }

        // Head rotation using Kalidokit
        if (results.faceLandmarks) {
            const faceRig = Kalidokit.Face.solve(results.faceLandmarks, {
                runtime: 'mediapipe',
                video: this.videoElement,
                smooth: true // Enable OneEuroFilter smoothing
            });
            if (faceRig && faceRig.head) {
                data.headRotation.yaw = -(faceRig.head.y || 0);
                data.headRotation.pitch = faceRig.head.x || 0;
            }
        }

        return data;
    }
}

if (typeof window !== 'undefined') {
    window.PoseService = PoseService;
}
