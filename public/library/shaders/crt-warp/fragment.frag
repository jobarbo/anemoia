precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uWarpAmount;      // Barrel distortion strength (0.0 = flat, ~0.3-0.5 = subtle TV, ~1.0+ = heavy)
uniform float uAspectCorrect;   // 0.0 = barrel in UV space; 1.0 = radial distance uses pixel aspect (w/h)
uniform float uCornerRadius;    // Corner rounding/vignette darkness (0.0 = no darkening, 1.0 = full black corners)
uniform float uCornerSmooth;    // Softness of corner fade (higher = softer edge)
uniform float uBorderColor;     // 0.0 = black border, 1.0 = clamp to edge, 2.0 = infinite mirror
uniform float uVignette;        // Overall vignette intensity (0.0 = none, 1.0 = strong edge darkening)

// Barrel distortion: bends UVs outward from center like a CRT tube
// Corners stay on canvas boundaries — normalization uses corner r² (0.5 in UV space, aspect-adjusted when uAspectCorrect)
vec2 barrelDistortion(vec2 uv, float amount, vec2 resolution, float aspectCorrect) {
	vec2 centered = uv - 0.5;
	float aspect = resolution.x / max(resolution.y, 1.0);
	float cornerR2 = 0.5;

	if (aspectCorrect > 0.5) {
		centered.x *= aspect;
		cornerR2 = 0.25 * (aspect * aspect + 1.0);
	}

	float r2 = dot(centered, centered);
	float distortion = 1.0 + r2 * amount;
	float cornerDistortion = 1.0 + cornerR2 * amount;
	vec2 distorted = centered * (distortion / cornerDistortion);

	if (aspectCorrect > 0.5) {
		distorted.x /= aspect;
	}

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

	vec2 warpedUV = barrelDistortion(uv, uWarpAmount, uResolution, uAspectCorrect);

	vec4 color;
	if (uBorderColor > 1.5) {
		// Infinite mirror: abs(mod(uv+1,2)-1) is identity inside [0,1], mirrors outside.
		vec2 mirroredUV = abs(mod(warpedUV + 1.0, 2.0) - 1.0);
		color = texture2D(uTexture, mirroredUV);
	} else if (uBorderColor > 0.5) {
		color = texture2D(uTexture, clamp(warpedUV, 0.0, 1.0));
	} else {
		bool outsideBounds = warpedUV.x < 0.0 || warpedUV.x > 1.0 || warpedUV.y < 0.0 || warpedUV.y > 1.0;
		if (outsideBounds) {
			color = vec4(0.0, 0.0, 0.0, 1.0);
		} else {
			color = texture2D(uTexture, warpedUV);
		}
	}

	float mask = screenMask(uv, uCornerRadius, max(uCornerSmooth, 0.001));
	color.rgb *= mask;

	if (uVignette > 0.0) {
		vec2 vignetteUV = uv * 2.0 - 1.0;
		float vignette = 1.0 - dot(vignetteUV, vignetteUV) * uVignette * 0.5;
		vignette = clamp(vignette, 0.0, 1.0);
		color.rgb *= vignette;
	}

	gl_FragColor = color;
}
