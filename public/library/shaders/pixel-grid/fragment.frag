precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec2 uResolution;    // Canvas size in pixels
uniform vec2 uGridSize;      // Number of cells [cols, rows]
uniform float uCellRatio;    // Aspect ratio override: 1.0 = natural, >1.0 stretches pixel vertically
uniform float uMode;         // 0.0 = pixel mode, 1.0 = diffuse mode
uniform float uDiffuse;      // Bleeding amount in diffuse mode (0.0 = sharp, 1.0 = full blur)
uniform float uGapSize;      // Gap border fraction per side (0.0 = no gap, 0.1 = 10% gap each side)
uniform float uGapBrightness; // Gap fill: 0.0 = black gaps, 1.0 = show cell color in gap

void main() {
	vec2 uv = vTexCoord;

	// --- QUANTIZATION ---
	// Map UV into cell-space [0..cols, 0..rows]
	vec2 cellUV = uv * uGridSize;
	vec2 cellIndex = floor(cellUV);
	vec2 cellPos = fract(cellUV); // position within cell [0..1]

	// Cell center in normalized UV space
	vec2 cellCenterUV = (cellIndex + 0.5) / uGridSize;

	// --- COLOR SAMPLING ---
	vec4 color;

	if (uMode < 0.5) {
		// PIXEL MODE: hard quantization — sample at cell center only
		color = texture2D(uTexture, cellCenterUV);
	} else {
		// DIFFUSE MODE: smooth bilinear interpolation between surrounding cell centers
		// t controls the blending curve:
		//   uDiffuse=0.0 → smoothstep(0.5,0.5,...) = step function = same as pixel mode
		//   uDiffuse=1.0 → smoothstep(0.0,1.0,...) = linear blend between cells
		float halfRange = uDiffuse * 0.5;
		vec2 t = smoothstep(
			vec2(0.5 - halfRange),
			vec2(0.5 + halfRange),
			cellPos
		);

		// Sample the 4 surrounding cell centers.
		// Wrap neighbor cell indices with mod so out-of-bound edges sample
		// from the opposite side of the grid (torus wrap).
		vec2 idx00 = mod(cellIndex,                       uGridSize);
		vec2 idx10 = mod(cellIndex + vec2(1.0, 0.0), uGridSize);
		vec2 idx01 = mod(cellIndex + vec2(0.0, 1.0), uGridSize);
		vec2 idx11 = mod(cellIndex + vec2(1.0, 1.0), uGridSize);

		vec2 c00 = (idx00 + 0.5) / uGridSize;
		vec2 c10 = (idx10 + 0.5) / uGridSize;
		vec2 c01 = (idx01 + 0.5) / uGridSize;
		vec2 c11 = (idx11 + 0.5) / uGridSize;

		vec4 s00 = texture2D(uTexture, c00);
		vec4 s10 = texture2D(uTexture, c10);
		vec4 s01 = texture2D(uTexture, c01);
		vec4 s11 = texture2D(uTexture, c11);

		// Bilinear blend
		color = mix(mix(s00, s10, t.x), mix(s01, s11, t.x), t.y);
	}

	// --- RATIO ADJUSTMENT ---
	// Apply uCellRatio to the y axis of cellPos so cells can appear square
	// regardless of the actual screen-space cell dimensions.
	// uCellRatio=1.0: natural cell shape (no change)
	// uCellRatio>1.0: pixel occupies less vertical space → cells appear shorter
	// uCellRatio<1.0: pixel spans more vertical space → cells appear taller
	vec2 adjustedCellPos = vec2(
		cellPos.x,
		(cellPos.y - 0.5) * uCellRatio + 0.5
	);

	// --- GAP MASK ---
	// A pixel is "inside" the cell if its adjusted position clears the gap border
	float halfGap = uGapSize * 0.5;
	bool inCell = adjustedCellPos.x > halfGap &&
	              adjustedCellPos.x < (1.0 - halfGap) &&
	              adjustedCellPos.y > halfGap &&
	              adjustedCellPos.y < (1.0 - halfGap);

	// Blend between black gap and cell color based on uGapBrightness
	vec4 gapColor = mix(vec4(0.0, 0.0, 0.0, color.a), color, uGapBrightness);
	vec4 finalColor = inCell ? color : gapColor;

	gl_FragColor = finalColor;
}
