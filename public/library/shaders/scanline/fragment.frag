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

void main() {
	vec2 uv = vTexCoord;
	vec4 color = texture2D(uTexture, uv);

	float spacing = max(1.0, uLineSpacing);
	float phase = fract((uv.y * uResolution.y) / spacing);

	float thickness = clamp(uLineThickness, 0.02, 0.9);
	float distToLine = min(phase, 1.0 - phase);
	float halfThickness = thickness * 0.5;
	float lineMask = 1.0 - smoothstep(0.0, halfThickness, distToLine);

	// Vertical traveling flicker (scrolling upward over time).
	float flickerStrength = clamp(uFlicker, 0.0, 1.0);
	float flickerFreq = max(1.0, uFlickerSpacing);
	float flickerSpeed = 3.2;
	float flickerWave = sin((1.0 - uv.y) * flickerFreq - uTime * flickerSpeed) * 0.5 + 0.5;
	float flicker = 1.0 - flickerWave * flickerStrength;
	float spacingMask = 1.0 - lineMask;
	float spacingOpacity = clamp(uSpacingOpacity, 0.0, 1.0);
	float patternOpacity = lineMask + spacingMask * spacingOpacity;
	float darken = clamp(uAmount, 0.0, 1.0) * patternOpacity * flicker;

	color.rgb *= (1.0 - darken);
	gl_FragColor = color;
}
