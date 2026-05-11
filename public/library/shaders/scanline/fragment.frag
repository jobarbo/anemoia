precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uAmount; // Overall darkening strength [0..1]
uniform float uLineSpacing; // Distance between scanlines in pixels
uniform float uLineThickness; // Line thickness as ratio [0..1]
uniform float uSpacingOpacity; // Darkening applied between lines [0..1]
uniform float uFlicker; // Intensity of time flicker [0..1]
uniform float uFlickerSpacing; // Vertical spacing/frequency of flicker bands
uniform float uTime;
uniform float uRealTime; // Unscaled seconds — used for very slow drift (minutes-scale)
uniform float uSeed; // Per-session offset so drift paths differ

// Cheap stable hash → [0,1)
float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

// 1D value noise with smooth interpolation (slowly varying when x creeps)
float valueNoise1(float x) {
	float i = floor(x);
	float f = fract(x);
	float a = hash12(vec2(i * 0.371 + uSeed * 0.01, 2.4));
	float b = hash12(vec2((i + 1.0) * 0.371 + uSeed * 0.01, 2.4));
	f = f * f * (3.0 - 2.0 * f);
	return mix(a, b, f);
}

// Two octaves for slightly richer drift without high-frequency shimmer
float fbmDrift(float t) {
	return 0.65 * valueNoise1(t) + 0.35 * valueNoise1(t * 1.7 + 4.2);
}

void main() {
	vec2 uv = vTexCoord;
	vec4 color = texture2D(uTexture, uv);

	// Minutes-scale: uRealTime is ~seconds; scale so noise coordinates advance slowly
	float driftT = uRealTime * 0.004 + uSeed * 0.001;
	float nSpeed = fbmDrift(driftT);
	float nDir = fbmDrift(driftT * 0.73 + 11.0);
	// Speed: ~±8% around baseline (stays smooth, no pops)
	float speedMul = mix(0.92, 1.08, nSpeed);
	// Effective scroll strength (noise) — stays positive so no harsh scroll reversal
	float dirMul = mix(0.68, 1.0, nDir);

	float spacing = max(1.0, uLineSpacing);
	// Subtle vertical wander of the scanline grid (few px) over long spans
	float lineWander = (fbmDrift(driftT * 0.55 + 3.1) - 0.5) * 6.0;
	float phase = fract((uv.y * uResolution.y + lineWander) / spacing);

	float thickness = clamp(uLineThickness, 0.02, 0.9);
	float distToLine = min(phase, 1.0 - phase);
	float halfThickness = thickness * 0.5;
	float lineMask = 1.0 - smoothstep(0.0, halfThickness, distToLine);

	// Vertical traveling flicker (scrolling upward over time).
	float flickerStrength = clamp(uFlicker, 0.0, 1.0);
	float flickerFreq = max(1.0, uFlickerSpacing);
	float flickerSpeed = 3.2;
	// De-correlated slow phase nudge so bands don't stay perfectly locked to a sine template
	float phaseWobble = (fbmDrift(driftT * 0.4 + uv.y * 0.08) - 0.5) * 0.35;
	// Slow bounded phase drift (~few–tens of minutes) — pattern “breathes” without snapping
	float slowBeat = sin(uRealTime * 0.011 + uSeed * 0.37) * 0.28;
	// Très léger cisaillement vertical de la phase (~tens of minutes) — glisse sans inverser brutalement
	float verticalShear = uv.y * sin(uRealTime * 0.0016 + uSeed * 0.21) * 0.09;
	float flickerWave = sin(
		(1.0 - uv.y) * flickerFreq
			- uTime * flickerSpeed * speedMul * dirMul
			+ phaseWobble
			+ slowBeat
			+ verticalShear
	) * 0.5 + 0.5;
	float flicker = 1.0 - flickerWave * flickerStrength;
	float spacingMask = 1.0 - lineMask;
	float spacingOpacity = clamp(uSpacingOpacity, 0.0, 1.0);
	float patternOpacity = lineMask + spacingMask * spacingOpacity;
	float darken = clamp(uAmount, 0.0, 1.0) * patternOpacity * flicker;

	color.rgb *= (1.0 - darken);
	gl_FragColor = color;
}
