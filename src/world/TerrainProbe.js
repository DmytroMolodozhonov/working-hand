/** A bounded, read-only startup report for missing ground textures (author's screenshot, 09.11). */
import * as THREE from 'three';
import { BLOCK, CHUNK, chunkKey } from './Terrain.js';
import { UNDERSEA } from './VoxelShading.js';
import { ULTRA } from '../fx/UltraUniforms.js';

const names = Object.fromEntries(Object.entries(BLOCK).map(([k, v]) => [v, k]));
const round = n => Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
const hex = c => c?.getHexString?.() || null;

export function terrainProbe(g, phase = 1) {
    const t = g.world?.terrain, d = t?.data, p = g.character?.group?.position;
    if (!d || !p) return [];
    const prefix = `Земля диагностика v1/${phase}: `;
    const lines = [], put = (kind, data) => lines.push(prefix + kind + ' ' + JSON.stringify(data).slice(0, 1050));
    put('мир', { mode: g.config?.mode, gen: g.gen, seed: d.seed, saved: !!g.config?.saved, savedVersion: g.config?.saved?.version,
        at: [p.x, p.y, p.z].map(round), lush: d.lush, slopes: d.slopes, seabed: d.seabed, seaY: UNDERSEA.y.value,
        ultra: ULTRA.on.value, wet: round(ULTRA.wet.value), sea: round(g.sea?.s?.(p.x, p.z)), contextLost: g.renderer?.getContext?.().isContextLost(),
        workers: t._workers?.length || 0, queued: t._queue?.length, local: t._local?.length,
        rebuilding: t._rebuilding?.size, rebuilt: t._rebuilt?.length, dirty: d.dirtyChunks?.size });
    const samples = [];
    for (const [dx, dz] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) {
        const x = Math.round(p.x + dx), z = Math.round(p.z + dz), cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
        const c = d.chunks.get(chunkKey(cx, cz));
        if (!c || !d.hasChunk(cx, cz)) continue; // Never generate land for a diagnostic.
        const L = d.floorBelow(x, z, Math.floor(p.y + 1.5)), b = d.get(x, L, z), top = d.topLayer(x, z);
        const col = ((z % CHUNK + CHUNK) % CHUNK) * CHUNK + (x % CHUNK + CHUNK) % CHUNK;
        samples.push({ x, z, L, block: names[b] || b, top, grass: c.grass?.[col]?.toString(16), sea: c.sea?.[col] || 0 });
    }
    put('блоки', samples);
    const cx = Math.floor(Math.round(p.x) / CHUNK), cz = Math.floor(Math.round(p.z) / CHUNK);
    const e = t.meshes.get(chunkKey(cx, cz)), mesh = e?.ground, geo = mesh?.geometry, mat = mesh?.material;
    if (mat) {
        const color = geo?.getAttribute('color'), pat = geo?.getAttribute('voxPat'), sky = geo?.getAttribute('voxSky');
        const rgb = [], patterns = new Set(), skies = new Set();
        const n = Math.min(16, color?.count || 0);
        for (let i = 0; i < n; i++) {
            const k = Math.floor(i * color.count / n);
            rgb.push([color.getX(k), color.getY(k), color.getZ(k)].map(round));
            if (pat) patterns.add(round(pat.getX(k))); if (sky) skies.add(round(sky.getX(k)));
        }
        const program = g.renderer?.properties?.get(mat)?.currentProgram;
        put('меш', { key: chunkKey(cx, cz), visible: mesh.visible, groupVisible: t.group?.visible,
            pending: t._rebuilding?.has(chunkKey(cx, cz)), material: mat.type, vertexColors: mat.vertexColors, color: hex(mat.color),
            keyShader: mat.customProgramCacheKey?.().slice(0, 100), vertices: geo.getAttribute('position')?.count, colors: color?.count,
            rgb: rgb.slice(0, 5), patterns: [...patterns], sky: [...skies], attributes: program ? Object.keys(program.getAttributes()) : null,
            runnable: program?.diagnostics?.runnable });
    } else put('меш', { key: chunkKey(cx, cz), missing: true });
    // What actually covers the lower-middle of the picture: this distinguishes a lost texture from a pale object over the land.
    if (g.scene?.traverseVisible && g.camera?.isCamera) {
        const ray = new THREE.Raycaster(), sphere = new THREE.Sphere(), candidates = [];
        ray.setFromCamera(new THREE.Vector2(0, -0.4), g.camera); ray.far = 80;
        g.scene.traverseVisible(o => {
            if (candidates.length >= 64 || !o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry?.boundingSphere || !o.layers.test(g.camera.layers)) return;
            sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
            if (ray.ray.intersectsSphere(sphere)) candidates.push(o);
        });
        const hits = ray.intersectObjects(candidates, false).slice(0, 4).map(h => {
            const m = Array.isArray(h.object.material) ? h.object.material[h.face?.materialIndex || 0] : h.object.material;
            const c = h.object.geometry.getAttribute('color'), pat = h.object.geometry.getAttribute('voxPat'), i = h.face?.a;
            return { object: h.object.name || h.object.parent?.name || h.object.type, at: h.point.toArray().map(round), d: round(h.distance),
                terrain: !!h.object.userData.isTerrain, material: m?.type, color: hex(m?.color), vertexColors: m?.vertexColors,
                vertex: c && i != null ? [c.getX(i), c.getY(i), c.getZ(i)].map(round) : null, pattern: pat && i != null ? pat.getX(i) : null };
        });
        put('видимая поверхность', hits);
    }
    return lines;
}
