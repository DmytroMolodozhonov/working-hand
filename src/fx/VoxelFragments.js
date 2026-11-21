import * as THREE from 'three';
import { applyVoxelDetail } from '../world/VoxelShading.js';
import { BASE_COLORS, patternOf } from '../world/Terrain.js';

/** A moving block samples its old position so the pattern goes with it as it turns. */
export function fragmentMaterial() {
    const mat = applyVoxelDetail(new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 8, specular: 0x111111 }));
    const base = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
        base(shader, renderer);
        shader.vertexShader = shader.vertexShader
            .replace('attribute float voxPat;', 'attribute float voxPat;\nattribute vec3 fragmentOrigin;')
            .replace('vVoxPos = (modelMatrix * vec4(transformed, 1.0)).xyz;', 'vVoxPos = position + fragmentOrigin;')
            .replace('vVoxNormal = normalize(mat3(modelMatrix) * normal);', 'vVoxNormal = normal;');
    };
    mat.customProgramCacheKey = () => 'voxel-fragments';
    return mat;
}

export function fragmentGeometry(count, dynamic = false) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const usage = dynamic ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage;
    g.setAttribute('fragmentOrigin', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(usage));
    g.setAttribute('voxPat', new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(usage));
    g.setAttribute('voxSky', new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1));
    return g;
}

export function blockFragments(cells, material, data) {
    const geo = fragmentGeometry(cells.length);
    const mesh = new THREE.InstancedMesh(geo, material, cells.length);
    mesh.frustumCulled = false;
    const color = new THREE.Color();
    cells.forEach(([x, L, z, t], i) => {
        geo.attributes.fragmentOrigin.setXYZ(i, x, L - 1, z);
        geo.attributes.voxPat.setX(i, patternOf(t, !!data?.lush));
        mesh.setColorAt(i, color.setHex(data?.faceColor?.(t, x, L, z, false) ?? BASE_COLORS[t] ?? 0x888888));
    });
    mesh.instanceColor.needsUpdate = true;
    return mesh;
}
