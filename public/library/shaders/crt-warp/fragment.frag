precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uWarpAmount;      // Barrel distortion strength (0.0 = flat, ~0.3-0.5 = subtle TV, ~1.0+ = heavy)
uniform float uAspectCorrect;   // 0.0 = barrel in UV space; 1.0 = radial distance uses pixel aspect (w/h)
uniform float uCornerRadius;    // Rounded-rect inset for sampling bounds (0 = sharp rect; larger = rounder screen cut-out)
uniform float uCornerSmooth;    // Softness of the rounded bounds edge (same units as screenMask SDF band)
uniform float uBorderColor;     // 0.0 = black border, 1.0 = clamp to edge, 2.0 = infinite mirror
uniform float uVignette;        // Overall vignette intensity (0.0 = none, 1.0 = strong edge darkening)
uniform float uBoundsInset;     // UV margin for OOB: 0 = flush [0,1]; >0 shrinks valid rect (more black); <0 expands tolerance
uniform vec3 uRgbGain;          // Per-channel multiplier after warp / vignette (default 1,1,1)

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

// Rounded rectangle mask: 1 = inside screen, 0 = outside (smooth band width ≈ smoothness)
float roundedRectMask(vec2 uv, float radius, float smoothness) {
	vec2 pos = uv * 2.0 - 1.0;
	vec2 d = abs(pos) - (1.0 - radius);
	float sdf = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
	return 1.0 - smoothstep(-smoothness, smoothness, sdf);
}

// Inset shrink/expand in UV, then rounded-rect gate — drives all borderColor sampling paths
float sampleBoundsEdge(vec2 warpedUV, float inset, float radius, float smoothness) {
	float denom = max(1.0 - 2.0 * inset, 0.0001);
	vec2 uvBounds = (warpedUV - vec2(inset)) / denom;
	return roundedRectMask(uvBounds, radius, max(smoothness, 0.001));
}

void main() {
	vec2 uv = vTexCoord;

	vec2 warpedUV = barrelDistortion(uv, uWarpAmount, uResolution, uAspectCorrect);

	float edge = sampleBoundsEdge(warpedUV, uBoundsInset, uCornerRadius, uCornerSmooth);

	vec4 color;
	if (uBorderColor > 1.5) {
		vec2 mirroredUV = abs(mod(warpedUV + 1.0, 2.0) - 1.0);
		color = texture2D(uTexture, mirroredUV);
	} else if (uBorderColor > 0.5) {
		color = texture2D(uTexture, clamp(warpedUV, 0.0, 1.0));
	} else {
		color = texture2D(uTexture, warpedUV);
	}
	color.rgb *= edge;

	if (uVignette > 0.0) {
		vec2 vignetteUV = uv * 2.0 - 1.0;
		float vignette = 1.0 - dot(vignetteUV, vignetteUV) * uVignette * 0.5;
		vignette = clamp(vignette, 0.0, 1.0);
		color.rgb *= vignette;
	}

	color.rgb *= uRgbGain;
	gl_FragColor = color;
}
