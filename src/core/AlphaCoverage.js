/**
 * AlphaCoverage.js — no shimmer on cut-out leaves and grass far away (the author 22.11: «мир вдали мигает»; a 2 cm move of the camera
 * lit up every tree's crown and every tuft in a difference picture — tools/shots/flicker.mjs). A cut-out edge (alphaTest) is all or
 * nothing per pixel: far away, where a leaf is thinner than a pixel, it blinks in and out at the least move. With the screen's edge
 * smoothing on (MSAA, «Сглаживание краёв»), the card turns the picture's alpha into coverage of the pixel's samples (alpha-to-coverage)
 * and the alpha is first sharpened by its own change across the screen — so an edge is crisp near, soft and steady far, and does not
 * thin out with the mipmaps (the technique of Ben Golus' «Anti-aliased Alpha Test»). Without MSAA nothing changes.
 */
export const COVERAGE = { on: false };

/** Make a cut-out material steady far away (call once, on creation; its old alphaTest is kept for the shadow and without MSAA). */
export function steadyCutout(material) {
    if (!COVERAGE.on || material.userData?.steady) return material;
    material.userData = { ...(material.userData || {}), steady: true };
    material.alphaToCoverage = true;
    material.alphaTest = Math.min(material.alphaTest || 0.5, 0.06); // (the coverage does the edge: only the empty corners are thrown away)
    material.extensions = { ...(material.extensions || {}), derivatives: true };
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        prev?.call(material, shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `diffuseColor.a = clamp( ( diffuseColor.a - 0.5 ) / max( fwidth( diffuseColor.a ), 0.0001 ) + 0.5, 0.0, 1.0 );
#include <alphatest_fragment>`);
    };
    const key = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => (key ? key() : material.type) + '-a2c';
    return material;
}
