precision highp float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uSeed;
uniform float uAngle; // Sorting direction in radians
uniform float uThreshold; // Brightness threshold for sorting
uniform float uSortAmount; // How much to sort (0.0 = none, 1.0 = full)
uniform float uSampleCount; // Number of samples for sorting quality (higher = better quality, slower)
uniform float uInvert; // 0.0 = sort bright pixels, 1.0 = sort dark pixels
uniform float uSortMode; // 1.0 = sine wave, 2.0 = noise, 3.0 = FBM, 4.0 = vector field
uniform vec2 uResolution;

// Constants for performance
const float MIN_WEIGHT_THRESHOLD = 0.001;
const float INV_SAMPLE_SCALE = 0.015625; // 1.0/64.0 pre-calculated

// Random function
float random(vec2 st, float seed) {
	return fract(sin(dot(st.xy + seed, vec2(12.9898, 78.233))) * 43758.5453123);
}

// 2D Noise function
float noise(vec2 st) {
	vec2 i = floor(st);
	vec2 f = fract(st);

	// Four corners in 2D of a tile
	float a = random(i, 0.0);
	float b = random(i + vec2(1.0, 0.0), 0.0);
	float c = random(i + vec2(0.0, 1.0), 0.0);
	float d = random(i + vec2(1.0, 1.0), 0.0);

	// Smooth interpolation
	vec2 u = f * f * (3.0 - 2.0 * f);

	return mix(a, b, u.x) +
		   (c - a) * u.y * (1.0 - u.x) +
		   (d - b) * u.x * u.y;
}

// Fractal Brownian Motion (layered noise) - Optimized with unrolled loop
float fbm(vec2 st, float time) {
	float timeOffset = time * 0.3;

	// Unroll loop for better performance
	float value = 0.5 * noise(st + timeOffset);
	value += 0.25 * noise(st * 2.0 + timeOffset);
	value += 0.125 * noise(st * 4.0 + timeOffset);
	value += 0.0625 * noise(st * 8.0 + timeOffset);

	return value;
}

// Vector field function - returns direction and magnitude
vec2 vectorField(vec2 pos, float time) {
	// Swirling vector field
	vec2 center = vec2(0.5);
	vec2 toCenter = pos - center;
	float dist = length(toCenter);

	// Rotating vector field with noise perturbation
	float angle = atan(toCenter.y, toCenter.x) + time * 0.5;
	float radius = dist + noise(pos * 5.0 + time * 0.3) * 0.2;

	vec2 direction = vec2(cos(angle + radius * 3.0), sin(angle + radius * 3.0));
	float magnitude = (noise(pos * 3.0 + time * 0.5) * 0.5 + 0.5);

	return direction * magnitude;
}

// Get brightness of a color
float getBrightness(vec3 color) {
	return dot(color, vec3(0.299, 0.587, 0.114));
}

// Rotate UV coordinates
vec2 rotate(vec2 uv, float angle) {
	float s = sin(angle);
	float c = cos(angle);
	mat2 rotMat = mat2(c, -s, s, c);
	return rotMat * (uv - 0.5) + 0.5;
}

void main() {
	vec2 uv = vTexCoord;

	// Add organic direction variation using noise
	// This creates smooth, flowing direction changes across space and time
	float noiseScale = 3.0; // Scale of the noise field
	float noiseStrength = 0.4; // How much the noise affects the direction (radians)

	// Create dynamic time-evolving flow direction using layered noise
	// Slow global rotation
	float globalRotation = uTime * 0.3;
	// Local noise perturbations that evolve over time
	float angleNoise1 = noise(uv * noiseScale + uTime * 0.15) * 2.0 - 1.0;
	float angleNoise2 = noise(uv * noiseScale * 0.5 + uTime * 0.08) * 2.0 - 1.0;

	// Combine base angle with global rotation and layered noise
	float organicAngle = uAngle + globalRotation + (angleNoise1 * 0.6 + angleNoise2 * 0.4) * noiseStrength;

	// Rotate UV based on organic angle to control sort direction
	vec2 sortUV = rotate(uv, organicAngle);

	// Create organic wave flow direction
	// This makes the wave propagate in different directions based on noise
	vec2 waveFlowDir = vec2(cos(organicAngle), sin(organicAngle));
	float wavePos = dot(uv, waveFlowDir); // Position along the wave flow direction

	// Keep sortPos for compatibility, but use wavePos for wave calculations
	float sortPos = sortUV.y;

	// Select animation style based on uSortMode
	float wave;
	vec2 displacementDirection;

	if (uSortMode < 1.5) {
		// MODE 1: Sine wave with oscillating direction
		wave = sin(wavePos * 10.0 + uTime * 2.0) * 0.5 + 0.5;
		// Create oscillating 2D direction based on organic angle
		float directionAngle = organicAngle + sin(wavePos * 8.0 + uTime) * 0.3;
		displacementDirection = vec2(sin(directionAngle), cos(directionAngle));

	} else if (uSortMode < 2.5) {
		// MODE 2: Noise field with noise-based direction
		wave = noise(vec2(wavePos * 8.0, uTime * 0.5)) * 0.5 + 0.5;
		// Use noise to perturb the direction in 2D (combines organic base with local noise)
		float noiseAngle = noise(sortUV * 5.0 + uTime * 0.3) * 3.14159 * 2.0;
		float directionAngle = organicAngle + noiseAngle * 0.5;
		displacementDirection = vec2(sin(directionAngle), cos(directionAngle));

	} else if (uSortMode < 3.5) {
		// MODE 3: FBM with flow-like direction
		// Use wavePos for primary flow, perpendicular direction for variation
		vec2 perpDir = vec2(-sin(organicAngle), cos(organicAngle));
		float perpPos = dot(uv, perpDir);
		wave = fbm(vec2(wavePos * 5.0, perpPos * 5.0), uTime);
		// Create flowing direction using noise
		float flowX = fbm(sortUV * 3.0 + vec2(uTime * 0.2, 0.0), uTime);
		float flowY = fbm(sortUV * 3.0 + vec2(0.0, uTime * 0.2), uTime);
		vec2 flowDir = vec2(flowX - 0.5, flowY - 0.5);
		// Blend organic base angle with flow direction
		vec2 baseDir = vec2(sin(organicAngle), cos(organicAngle));
		displacementDirection = normalize(baseDir + flowDir * 0.5);

	} else {
		// MODE 4: Vector field (uses 2D position for complex patterns)
		vec2 field = vectorField(sortUV, uTime);
		wave = length(field);
		// Blend vector field with organic base angle for more coherent flow
		vec2 organicDir = vec2(sin(organicAngle), cos(organicAngle));
		vec2 fieldDir = length(field) > 0.001 ? normalize(field) : vec2(0.0, 1.0);
		displacementDirection = normalize(mix(organicDir, fieldDir, 0.7)); // 70% field, 30% organic
	}

	// Sample current pixel
	vec4 currentColor = texture2D(uTexture, uv);
	float currentBrightness = getBrightness(currentColor.rgb);

	// Invert brightness if in dark mode
	float sortValue = mix(currentBrightness, 1.0 - currentBrightness, uInvert);

	// Only sort if above threshold (either brightness or darkness depending on mode)
	if (sortValue > uThreshold) {
		// Pre-calculate constants outside the loop
		float invSampleCount = 1.0 / uSampleCount;
		float offsetScale = 0.3 * invSampleCount;
		vec2 displacementScaled = displacementDirection * wave * uSortAmount;

		// Sample along the sort direction
		float displacement = 0.0;
		float totalWeight = 0.0;

		// Create sorting effect by sampling and comparing brightness
		// Loop has fixed max of 64, but actual samples controlled by uSampleCount
		for (float i = 0.0; i < 64.0; i++) {
			// Only process if within the desired sample count
			if (i >= uSampleCount) break; // Early exit optimization

			// Pre-calculate offset (moved division outside critical path)
			float offset = (i * invSampleCount - 0.5) * 0.3;

			// Use 2D displacement direction from vector field
			vec2 sampleUV = uv + displacementScaled * offset;

			// Clamp to valid UV range - using clamp is faster than if statements
			sampleUV = clamp(sampleUV, 0.0, 1.0);

			vec4 sampleColor = texture2D(uTexture, sampleUV);
			float sampleBrightness = getBrightness(sampleColor.rgb);
			float sampleSortValue = mix(sampleBrightness, 1.0 - sampleBrightness, uInvert);

			// Optimized weight calculation - use faster approximation
			// Replace exp() with polynomial approximation for better performance
			float diff = abs(sampleSortValue - sortValue) * 10.0;
			float weight = 1.0 / (1.0 + diff * diff); // Faster than exp()

			// Early skip if weight is too small
			if (weight > MIN_WEIGHT_THRESHOLD) {
				displacement += offset * weight * sampleSortValue;
				totalWeight += weight;
			}
		}

		// Avoid division by zero and normalize
		displacement = totalWeight > 0.0 ? displacement / totalWeight : 0.0;

		// Apply animated displacement in 2D using the vector field direction
		vec2 sortedUV = uv + displacementDirection * displacement * uSortAmount * wave;

		// Clamp and sample
		sortedUV = clamp(sortedUV, 0.0, 1.0);
		gl_FragColor = texture2D(uTexture, sortedUV);
	} else {
		// Below threshold, don't sort
		gl_FragColor = currentColor;
	}
}


