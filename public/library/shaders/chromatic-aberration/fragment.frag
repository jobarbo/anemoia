precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;
uniform float uSeed; // Random seed for noise variation
uniform float uAmount; // Chromatic aberration intensity

float random(vec2 st, float seed) {
	return fract(sin(dot(st.xy + seed, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st, float seed) {
	vec2 i = floor(st);
	vec2 f = fract(st);

	float a = random(i, seed);
	float b = random(i + vec2(1.0, 0.0), seed);
	float c = random(i + vec2(0.0, 1.0), seed);
	float d = random(i + vec2(1.0, 1.0), seed);

	vec2 u = f * f * (3.0 - 2.0 * f);

	return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 st, float seed) {
	float value = 0.0;
	float amplitude = 0.5;
	for (int i = 0; i < 6; i++) {
		value += amplitude * noise(st, seed);
		st *= 2.0;
		amplitude *= 0.5;
	}
	return value;
}

void main() {
	vec2 uv = vTexCoord;

	vec4 originalColor = texture2D(uTexture, uv);

	float aberrationAmount = (uAmount > 0.0) ? uAmount : 0.0;

	float noiseScale = 6.0;
	vec2 noiseCoord = uv * noiseScale + uTime * 0.2;
	float noiseX = fbm(noiseCoord, uSeed + 234.567) * 2.0 - 1.0;
	float noiseY = fbm(noiseCoord + vec2(100.0, 100.0), uSeed + 567.890) * 2.0 - 1.0;

	vec2 intensityCoord = uv * 10.0 + uTime * 0.1;
	float noiseIntensity = fbm(intensityCoord, uSeed + 890.234);
	float scaledAberration = aberrationAmount * (0.5 + noiseIntensity * 1.5);

	vec2 redOffset = uv + vec2(noiseX, noiseY) * scaledAberration;
	vec2 blueOffset = uv - vec2(noiseX, noiseY) * scaledAberration;
	vec2 greenOffset = uv + vec2(noiseY * 0.5, noiseX * 0.5) * scaledAberration;

	vec4 redChannel = texture2D(uTexture, redOffset);
	vec4 greenChannel = texture2D(uTexture, greenOffset);
	vec4 blueChannel = texture2D(uTexture, blueOffset);

	float redDiff = redChannel.r - originalColor.r;
	float greenDiff = greenChannel.g - originalColor.g;
	float blueDiff = blueChannel.b - originalColor.b;

	float saturationLevel = 1.0;
	redDiff *= saturationLevel;
	greenDiff *= saturationLevel;
	blueDiff *= saturationLevel;

	gl_FragColor = vec4(
		originalColor.r + redDiff,
		originalColor.g + greenDiff,
		originalColor.b + blueDiff,
		1.0
	);
}