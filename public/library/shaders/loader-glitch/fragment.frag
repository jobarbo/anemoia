precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D uTexture;
uniform float uProgress; // Loading progress from 0.0 (0%) to 1.0 (100%)
uniform float uSeed;
uniform vec2 uResolution;

// Random function
float random(vec2 st, float seed) {
	return fract(sin(dot(st.xy + seed, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Get brightness of a color
float getBrightness(vec3 color) {
	return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
	vec2 uv = vTexCoord;
	
	// If progress is 100% (no sorting needed), just display original texture
	if (uProgress > 0.999) {
		gl_FragColor = texture2D(uTexture, uv);
	} else {
	
	// Convert UV to pixel coordinates
	vec2 pixelCoord = uv * uResolution;
	
	// Base grid size for block indexing (smaller than actual block sizes)
	// This allows variable block sizes while maintaining a searchable grid
	float baseGridSize = 24.0;
	
	// Calculate base block coordinates using grid
	vec2 baseBlockCoord = floor(pixelCoord / baseGridSize);
	
	// Each block has a unique size, "displaced" starting position and rotation
	// These are determined by the block's position (deterministic)
	// Use block coordinates directly with different seed offsets to ensure uniform distribution
	float blockSeed1 = random(baseBlockCoord * 1.7 + vec2(0.0, uSeed), uSeed + 111.111);
	float blockSeed2 = random(baseBlockCoord * 1.3 + vec2(uSeed, 0.0), uSeed + 222.222);
	float blockSeed3 = random(baseBlockCoord * 2.1 + vec2(uSeed), uSeed + 333.333);
	float blockSeed4 = random(baseBlockCoord * 1.9 + vec2(uSeed * 1.7), uSeed + 444.444);
	
	vec2 blockCenter = (baseBlockCoord + 0.5) * baseGridSize;
	
	// Each block moves at a different speed (some faster, some slower)
	// Speed multiplier ranges from 0.4 (fast) to 1.6 (slow)
	// This creates a staggered reveal effect
	float blockSpeed = 0.4 + blockSeed4 * 1.2;
	
	// Calculate block-specific progress
	// Faster blocks (lower speed) will reach their position earlier
	// Slower blocks (higher speed) will reach their position later
	// All blocks will be in place at 100% progress
	float blockProgress = pow(uProgress, 1.0 / blockSpeed);
	// Ensure all blocks finish at 100% (clamp to 1.0)
	blockProgress = min(1.0, blockProgress);
	
	// Calculate initial displacement for this block (where it starts from)
	// At 0% progress, blocks are displaced in all directions. At 100%, they're in correct position
	// Ensure uniform distribution across all directions (left/right/up/down)
	float maxDisplacement = 1.0; // Maximum pixel displacement
	vec2 initialOffset = vec2(
		(blockSeed1 - 0.5) * 2.0 * maxDisplacement, // -maxDisplacement to +maxDisplacement (left/right)
		(blockSeed2 - 0.5) * 2.0 * maxDisplacement  // -maxDisplacement to +maxDisplacement (up/down)
	);
	
	// Calculate initial rotation for this block (in radians)
	// At 0% progress, blocks are rotated. At 100%, they're aligned
	float maxRotation = 1.5; // Maximum rotation in radians (~28 degrees)
	float initialRotation = (blockSeed3 * 2.0 - 1.0) * maxRotation;
	
	// Interpolate from displaced/rotated state to correct state based on block-specific progress
	// Use smoothstep for easing (feels more like snapping into place)
	float easedBlockProgress = smoothstep(0.0, 1.0, blockProgress);
	vec2 currentOffset = initialOffset * (1.0 - easedBlockProgress);
	float currentRotation = initialRotation * (1.0 - easedBlockProgress);
	
	// Calculate block-specific sort amount (pixel sorting also fades at different rates)
	float blockSortAmount = 1.0 - blockProgress;
	
	// Transform backwards: For each output pixel, find which block it belongs to
	// after transformation, then transform back to find the source position
	// This makes blocks move as solid pieces
	
	// Check the current block and nearby blocks (since blocks can move)
	// Find which block's transformed position contains this pixel
	vec2 originalLocalCoord = pixelCoord; // Default fallback
	vec2 testBlockCoord = baseBlockCoord;
	vec2 testCurrentOffset = currentOffset;
	float testCurrentRotation = currentRotation;
	float testBlockSortAmount = blockSortAmount;
	
	// Check current block and nearby blocks (within displacement range)
	// This handles the case where a block moved into this position
	bool foundBlock = false;
	for (int dx = -3; dx <= 3; dx++) {
		for (int dy = -3; dy <= 3; dy++) {
			vec2 testCoord = baseBlockCoord + vec2(float(dx), float(dy));
			
			// Get this test block's properties (match seed generation pattern)
			float testSeed1 = random(testCoord * 1.7 + vec2(0.0, uSeed), uSeed + 111.111);
			float testSeed2 = random(testCoord * 1.3 + vec2(uSeed, 0.0), uSeed + 222.222);
			float testSeed3 = random(testCoord * 2.1 + vec2(uSeed), uSeed + 333.333);
			float testSeed4 = random(testCoord * 1.9 + vec2(uSeed * 1.7), uSeed + 444.444);
			float testSeed5 = random(testCoord * 2.3 + vec2(uSeed * 1.3), uSeed + 555.555);
			
			// Get test block's size
			float testSize = 24.0 + testSeed5 * 64.0;
			vec2 testBlockCenter = (testCoord + 0.5) * baseGridSize;
			
			float testSpeed = 0.4 + testSeed4 * 1.2;
			float testBlockProgress = min(1.0, pow(uProgress, 1.0 / testSpeed));
			float testEasedProgress = smoothstep(0.0, 1.0, testBlockProgress);
			
			vec2 testInitialOffset = vec2(
				(testSeed1 - 0.5) * 2.0 * maxDisplacement,
				(testSeed2 - 0.5) * 2.0 * maxDisplacement
			);
			float testInitialRotation = (testSeed3 * 2.0 - 1.0) * maxRotation;
			vec2 testOffset = testInitialOffset * (1.0 - testEasedProgress);
			float testRotation = testInitialRotation * (1.0 - testEasedProgress);
			
			// Inverse transform to check if this pixel belongs to this block
			// Forward transform order: rotate around center, then translate
			// Inverse transform order: undo translation, then undo rotation
			
			// Step 1: Undo translation
			vec2 translatedPixel = pixelCoord - testOffset;
			
			// Step 2: Convert to block-local coordinates (relative to block center)
			vec2 rotatedLocalPixel = translatedPixel - testBlockCenter;
			
			// Step 3: Undo rotation (inverse rotation around origin)
			float testCosRotInv = cos(-testRotation);
			float testSinRotInv = sin(-testRotation);
			vec2 unrotatedLocalPixel = vec2(
				rotatedLocalPixel.x * testCosRotInv - rotatedLocalPixel.y * testSinRotInv,
				rotatedLocalPixel.x * testSinRotInv + rotatedLocalPixel.y * testCosRotInv
			);
			
			// Step 4: Check if pixel is within this block's original bounds (using variable size)
			if (abs(unrotatedLocalPixel.x) < testSize * 0.5 && abs(unrotatedLocalPixel.y) < testSize * 0.5) {
				// This block's transformed position contains our pixel
				// Convert back to global coordinates
				originalLocalCoord = unrotatedLocalPixel + testBlockCenter;
				testBlockCoord = testCoord;
				testCurrentOffset = testOffset;
				testCurrentRotation = testRotation;
				testBlockSortAmount = 1.0 - testBlockProgress;
				foundBlock = true;
				break;
			}
		}
		if (foundBlock) break;
	}
	
	// Fallback: if no block found, use current block's inverse transform
	if (!foundBlock) {
		// Undo translation first
		vec2 translatedPixel = pixelCoord - currentOffset;
		// Convert to block-local coordinates
		vec2 rotatedLocalPixel = translatedPixel - blockCenter;
		// Undo rotation
		float cosRot = cos(-currentRotation);
		float sinRot = sin(-currentRotation);
		vec2 unrotatedLocalPixel = vec2(
			rotatedLocalPixel.x * cosRot - rotatedLocalPixel.y * sinRot,
			rotatedLocalPixel.x * sinRot + rotatedLocalPixel.y * cosRot
		);
		// Convert back to global coordinates
		originalLocalCoord = unrotatedLocalPixel + blockCenter;
	}
	
	// Determine sorting direction for the block we found (or current block)
	float blockSeed = random(testBlockCoord + uSeed, uSeed);
	float sortDirection = blockSeed;
	
	// Apply pixel sorting in the ORIGINAL coordinate space (before block transformation)
	// This ensures the block content stays together
	vec2 sortCoord = originalLocalCoord;
	
	// Get base color at original position to determine sorting
	vec2 originalUV = clamp(originalLocalCoord / uResolution, 0.0, 1.0);
	vec4 baseColor = texture2D(uTexture, originalUV);
	float baseBrightness = getBrightness(baseColor.rgb);
	
	// Calculate pixel sorting displacement in original coordinate space
	// Use block-specific sort amount so sorting fades at different rates per block
	// Ensure bidirectional sorting (both positive and negative directions)
	vec2 displacement = vec2(0.0);
	float maxDisplacementRatio = 0.1;
	
	// Add additional noise to ensure truly uniform direction distribution
	float directionNoise = random(sortCoord * 0.01 + testBlockCoord, uSeed + 777.777);
	float directionSign = (directionNoise > 0.5) ? 1.0 : -1.0;
	
	// Calculate sort key with sign variation to ensure bidirectional displacement
	float sortKey = (baseBrightness - 0.5) * 2.0 * directionSign;
	
	if (sortDirection < 0.25) {
		// Horizontal pixel sort: displace along X-axis only
		float row = floor(sortCoord.y);
		float rowNoise = random(vec2(row, uSeed), uSeed + 111.111) * 2.0 - 1.0;
		float maxDisplacement = uResolution.x * maxDisplacementRatio;
		float xDisplacement = sortKey * maxDisplacement * testBlockSortAmount * (0.8 + rowNoise * 0.2);
		displacement = vec2(xDisplacement / uResolution.x, 0.0);
		
	} else if (sortDirection < 0.5) {
		// Vertical pixel sort: displace along Y-axis only
		float col = floor(sortCoord.x);
		float colNoise = random(vec2(col, uSeed), uSeed + 222.222) * 2.0 - 1.0;
		float maxDisplacement = uResolution.y * maxDisplacementRatio;
		float yDisplacement = sortKey * maxDisplacement * testBlockSortAmount * (0.8 + colNoise * 0.2);
		displacement = vec2(0.0, yDisplacement / uResolution.y);
		
	} else if (sortDirection < 0.75) {
		// Diagonal pixel sort /: displace along diagonal (top-left to bottom-right)
		float diagCoord = floor(sortCoord.x + sortCoord.y);
		float diagNoise = random(vec2(diagCoord, uSeed), uSeed + 333.333) * 2.0 - 1.0;
		float avgDimension = (uResolution.x + uResolution.y) * 0.5;
		float maxDisplacement = avgDimension * maxDisplacementRatio * 0.707;
		float diagDisplacement = sortKey * maxDisplacement * testBlockSortAmount * (0.8 + diagNoise * 0.2);
		displacement = vec2(diagDisplacement / uResolution.x, diagDisplacement / uResolution.y);
		
	} else {
		// Diagonal pixel sort \: displace along diagonal (top-right to bottom-left)
		float diagCoord = floor(sortCoord.x - sortCoord.y + uResolution.y);
		float diagNoise = random(vec2(diagCoord, uSeed), uSeed + 444.444) * 2.0 - 1.0;
		float avgDimension = (uResolution.x + uResolution.y) * 0.5;
		float maxDisplacement = avgDimension * maxDisplacementRatio * 0.707;
		float diagDisplacement = sortKey * maxDisplacement * testBlockSortAmount * (0.8 + diagNoise * 0.2);
		displacement = vec2(diagDisplacement / uResolution.x, -diagDisplacement / uResolution.y);
	}
	
	// Apply pixel sorting in original space
	vec2 sortedCoord = originalLocalCoord + displacement * uResolution;
	
	// Now transform the sorted position: rotate and translate (forward transform)
	// Use the found block's transformation and size
	vec2 sortedBlockCenter = (testBlockCoord + 0.5) * baseGridSize;
	vec2 sortedLocalCoord = sortedCoord - sortedBlockCenter;
	
	// Apply rotation
	float cosRotFwd = cos(testCurrentRotation);
	float sinRotFwd = sin(testCurrentRotation);
	vec2 rotatedSorted = vec2(
		sortedLocalCoord.x * cosRotFwd - sortedLocalCoord.y * sinRotFwd,
		sortedLocalCoord.x * sinRotFwd + sortedLocalCoord.y * cosRotFwd
	);
	
	// Apply translation
	vec2 finalCoord = rotatedSorted + sortedBlockCenter + testCurrentOffset;
	
	// Sample from final position
	vec2 finalUV = clamp(finalCoord / uResolution, 0.0, 1.0);
	gl_FragColor = texture2D(uTexture, finalUV);
	}
}
