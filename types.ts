import * as THREE from 'three';

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface HandResults {
  multiHandLandmarks: Landmark[][];
  multiHandedness: { label: string; score: number }[];
}

export interface KalidokitResult {
  Right?: ResolvedHand;
  Left?: ResolvedHand;
}

export interface ResolvedHand {
  [key: string]: {
    x?: number;
    y?: number;
    z?: number; // rotation in radians
    w?: number; // quaternion
  } | undefined;
}

// Map standard joint names to indices in the 21-point hand mesh
export const JOINT_MAP: Record<string, number> = {
  wrist: 0,
  thumb1: 1, thumb2: 2, thumb3: 3, thumb4: 4,
  index1: 5, index2: 6, index3: 7, index4: 8,
  middle1: 9, middle2: 10, middle3: 11, middle4: 12,
  ring1: 13, ring2: 14, ring3: 15, ring4: 16,
  pinky1: 17, pinky2: 18, pinky3: 19, pinky4: 20,
};

// Connections for drawing the skeleton
export const SKELETON_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index
  [0, 9], [9, 10], [10, 11], [11, 12], // Middle
  [0, 13], [13, 14], [14, 15], [15, 16], // Ring
  [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [5, 9], [9, 13], [13, 17], [0, 17] // Palm base
];