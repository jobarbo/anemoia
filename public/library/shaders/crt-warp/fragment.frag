precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uWarpAmount;      // Barrel distortion strength (0.0 = flat, ~0.3-0.5 = subtle TV, ~1.0+ = heavy)
uniform float uCornerRadius;    // Corner rounding/vignette darkness (0.0 = no darkening, 1.0 = full black corners)
uniform float uCornerSmooth;    // Softness of corner fade (higher = softer edge)
uniform float uBorderColor;     // 0.0 = black border outside screen, 1.0 = mirror/repeat
uniform float uVignette;        // Overall vignette intensity (0.0 = none, 1.0 = strong edge darkening)

// Barrel distortion: bends UVs outward from center like a CRT tube
vec2 barrelDistortion(vec2 uv, float amount) {
	vec2 centered = uv - 0.5;

	// Distance from center
	float r2 = dot(centered, centered);

	// Barrel distortion formula
	float distortion = 1.0 + r2 * amount;

	vec2 distorted = centered * distortion;

	return distorted + 0.5;
}

// Rounded rectangle mask for CRT screen edges
float screenMask(vec2 uv, float radius, float smoothness) {
	// Map to -1..1 range
	vec2 pos = uv * 2.0 - 1.0;

	// Rounded rectangle SDF
	vec2 d = abs(pos) - (1.0 - radius);
	float sdf = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;

	// Smooth edge
	return 1.0 - smoothstep(-smoothness, smoothness, sdf);
}

void main() {
	vec2 uv = vTexCoord;

	// Apply barrel distortion
	vec2 warpedUV = barrelDistortion(uv, uWarpAmount);

	// Check if warped UVs are outside the texture
	bool outsideBounds = warpedUV.x < 0.0 || warpedUV.x > 1.0 || warpedUV.y < 0.0 || warpedUV.y > 1.0;

	vec4 color;
	if (outsideBounds) {
		if (uBorderColor > 0.5) {
			// Mirror mode: clamp to edge
			vec2 clampedUV = clamp(warpedUV, 0.0, 1.0);
			color = texture2D(uTexture, clampedUV);
		} else {
			// Black border
			color = vec4(0.0, 0.0, 0.0, 1.0);
		}
	} else {
		color = texture2D(uTexture, warpedUV);
	}

	// Corner darkening (rounded rectangle mask)
	float mask = screenMask(uv, uCornerRadius, max(uCornerSmooth, 0.001));
	color.rgb *= mask;

	// Vignette (subtle edge darkening based on distance from center)
	if (uVignette > 0.0) {
		vec2 vignetteUV = uv * 2.0 - 1.0;
		float vignette = 1.0 - dot(vignetteUV, vignetteUV) * uVignette * 0.5;
		vignette = clamp(vignette, 0.0, 1.0);
		color.rgb *= vignette;
	}

	gl_FragColor = color;
}
