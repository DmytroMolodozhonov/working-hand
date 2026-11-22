/**
 * ToneShoulder.js — one look for the land and the sky (the author 22.11: «небо и земля как будто из двух разных игр»).
 * The sky (Sky.js) is drawn with a photographic curve — bright air rolls off softly — while the land, the grass and every model were
 * written to the screen straight: a sunlit meadow ran past white into flat yellow-white, its colour gone, beside a sky that never does.
 * Now every lit material ends with the same kind of curve (renderer.toneMapping = Custom, the curve here): below ~60 % of white the
 * picture is as it was; above, the brightness bends softly towards white KEEPING the colour (it works on the brightest channel: a bright
 * green stays green). «Ультра» makes its own curve after the scene (UltraPost): there the scene is drawn with toneMappingExposure −1,
 * which this curve reads as «leave it as it is» — no second curve, and no shader is compiled twice (the uniform changes, not the code).
 */
import * as THREE from 'three';

export const SHOULDER = { KNEE: 0.62 };

export function installToneShoulder(renderer, chunks = THREE.ShaderChunk) {
    const src = chunks.tonemapping_pars_fragment;
    const old = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
    if (src.includes(old)) {
        const k = SHOULDER.KNEE.toFixed(3), r = (1 - SHOULDER.KNEE).toFixed(3);
        chunks.tonemapping_pars_fragment = src.replace(old, `vec3 CustomToneMapping( vec3 color ) {
	if ( toneMappingExposure < 0.0 ) return color;
	color *= toneMappingExposure;
	float m = max( max( color.r, color.g ), color.b );
	if ( m <= ${k} ) return color;
	float s = ${k} + ${r} * ( 1.0 - exp( -( m - ${k} ) / ${r} ) );
	return color * ( s / m );
}`);
    }
    if (renderer) { renderer.toneMapping = THREE.CustomToneMapping; renderer.toneMappingExposure = 1; }
}
