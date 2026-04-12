precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uSeed;
uniform float uOctave;
uniform float uAmount; // deformation scale
uniform float uNoiseScale; // noise scale
uniform bool uEmberMode;

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

	// Use a fixed loop with step function to control octaves
	for (int i = 0; i < 8; i++) {
		float step = step(float(i), uOctave);
		value += step * amplitude * noise(st, seed);
		st *= 2.0;
		amplitude *= 0.5;
	}

	return value;
}

// Simple function to get a random direction that changes over time
vec2 getRandomDirection(float time, float seed) {
	// Use time to create slowly changing direction
	float angle = fbm(vec2(time * 0.01, 0.0), seed) * 2.0 * 3.14159;
	return vec2(cos(angle), sin(angle));
}

void main() {
	vec2 uv = vTexCoord;

	float scale = (uAmount > 0.0) ? uAmount : 0.1;
	float noiseScale = (uNoiseScale > 0.0) ? uNoiseScale : 15.0;

	// Get a random direction that changes over time
	vec2 randomDir = getRandomDirection(uTime*1.5, uSeed + 456.0);

	// Apply the random direction to the original movement
	vec2 noiseCoord = uv * noiseScale + randomDir * uTime * 0.000000000001;
	float noiseX = fbm(noiseCoord, uSeed) * 2.0 - 1.0;
	float noiseY = fbm(noiseCoord + vec2(120.0, 210.0), uSeed + 1230.0) * 2.0 - 1.0;
	//vec2 intensityCoord = uv * 2.0 + randomDir * uTime * 0.1;
	//!old line
	//vec2 intensityCoord = uv * fbm(uv * 16000.0 * sin(noiseX),uSeed + 213.0) * 4.0 + uTime * 0.1; // **great washed up textures**
	vec2 intensityCoord = uv + fbm(vec2(11500.0 * sin(noiseX), 11500.0 * cos(noiseX)),uSeed + 213.0) * 4.0 + randomDir * 1.0 + uTime * 11.5; // **great washed up textures**
	float noiseIntensity = fbm(intensityCoord, uSeed + 1230.0);
	float deformationAmount = smoothstep(0.99, 0.01, max(abs(uv.x - 0.5), abs(uv.y - 0.5))) * scale * (0.5 + noiseIntensity * 1.5);
	vec2 movement = vec2(noiseX, noiseY) * deformationAmount;
	vec2 deformedUV = uv + movement;

	vec4 texColor = texture2D(uTexture, deformedUV);

	if (uEmberMode) {
		// Calculate brightness based on movement magnitude (length of movement vector)
		float movementMagnitude = length(movement);
		// Apply smoothstep for steep contrast (adjust min/max to control range)
		float contrastCurve = smoothstep(0.01, 0.25, movementMagnitude); // Adjust 0.1 to control steepness
		float brightness = contrastCurve * -10.0; // Adjust multiplier to control intensity
		texColor.rgb += brightness;
	}


	gl_FragColor = texColor;
}


