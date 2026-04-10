precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uLevels; // discrete steps per R/G/B channel (2 = harsh … 256 ≈ full)
uniform float uMix;    // 0 = original, 1 = full quantization

void main() {
	vec4 tex = texture2D(uTexture, vTexCoord);
	vec3 col = tex.rgb;

	float lv = max(uLevels, 2.0);
	float denom = max(lv - 1.0, 1.0);
	vec3 q = floor(col * denom + 0.5) / denom;

	float m = clamp(uMix, 0.0, 1.0);
	gl_FragColor = vec4(mix(col, q, m), tex.a);
}
