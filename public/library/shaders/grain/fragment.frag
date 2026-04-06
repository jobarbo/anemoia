precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uSeed;
uniform float uAmount; // grain intensity [0..1]
// Spatial threshold (UV 0-1): grain visible only inside the rectangle
uniform float uThresholdMinX; // left edge [0..1]
uniform float uThresholdMaxX; // right edge [0..1]
uniform float uThresholdMinY; // bottom edge [0..1]
uniform float uThresholdMaxY; // top edge [0..1]
uniform float uThresholdSmooth; // soft edge width in UV (0 = hard edge)

float random(vec2 st, float seed) {
	return fract(sin(dot(st.xy + seed, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
	vec2 uv = vTexCoord;
	vec4 color = texture2D(uTexture, uv);

	float amount = clamp(uAmount, 0.0, 1.0);

	// Spatial threshold: grain visible only when uv is inside the x/y rectangle
	float smoothWidth = max(0.001, uThresholdSmooth);
	float inRangeX = smoothstep(uThresholdMinX, uThresholdMinX + smoothWidth, uv.x)
		* (1.0 - smoothstep(uThresholdMaxX - smoothWidth, uThresholdMaxX, uv.x));
	float inRangeY = smoothstep(uThresholdMinY, uThresholdMinY + smoothWidth, uv.y)
		* (1.0 - smoothstep(uThresholdMaxY - smoothWidth, uThresholdMaxY, uv.y));
	amount *= inRangeX * inRangeY;

	vec2 noise_uv = uv * 128.0;
	float angle = 0.25;
	float cos_a = cos(angle);
	float sin_a = sin(angle);
	noise_uv = vec2(
		noise_uv.x * cos_a - noise_uv.y * sin_a,
		noise_uv.x * sin_a + noise_uv.y * cos_a
	);

	float t = uTime * 0.0; // static for now; animate later if desired
	noise_uv += vec2(sin(t * 0.6), cos(t * 0.7)) * 1100.0;

	float grain_noise = random(noise_uv, uSeed);
	float grain_noise2 = random(noise_uv * 2.5 + vec2(t * 0.05, t * 0.03), uSeed + 123.456);
	float grainValue = (grain_noise * 0.7 + grain_noise2 * 0.3) * 2.0 - 1.0;

	float grainFactor = 1.0 + grainValue * amount;
	color.rgb *= grainFactor;
	color.rgb += grainValue * amount * 1.3;

	float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
	float grainMask = 1.0 - abs(luminance - 0.5) * 2.0;
	grainMask = smoothstep(0.0, 1.0, grainMask);
	color.rgb += grainValue * amount * grainMask * 0.04;

	gl_FragColor = color;
}


