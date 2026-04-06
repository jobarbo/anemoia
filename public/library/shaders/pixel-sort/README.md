# Pixel Sort Shader

An animated pixel sorting shader that creates glitch-like effects by sorting pixels based on brightness.

## Uniforms

- `uTexture` (sampler2D) - The input texture
- `uTime` (float) - Time for animation
- `uSeed` (float) - Random seed
- `uAngle` (float) - Sorting direction in radians (0 = vertical, π/2 = horizontal)
- `uThreshold` (float) - Brightness threshold for sorting (0.0 - 1.0). Pixels brighter than this will be sorted
- `uSortAmount` (float) - Intensity of the sorting effect (0.0 = no sorting, 1.0 = full sorting)
- `uSampleCount` (float) - Number of samples for quality (8-64). Higher = better quality but slower performance
- `uInvert` (float) - Invert mode (0.0 = sort bright pixels, 1.0 = sort dark pixels)
- `uResolution` (vec2) - Canvas resolution

## Features

- **Animated waves**: The sorting effect moves through the image over time
- **Brightness-based**: Sorts pixels based on their perceived brightness or darkness
- **Threshold control**: Only sorts pixels above a certain brightness/darkness threshold
- **Directional**: Control the sorting direction with the angle parameter
- **Invert mode**: Choose to sort bright pixels or dark pixels
- **Smooth blending**: Uses weighted sampling for smooth transitions

## Example Usage

```javascript
const pixelSortShader = shaderManager.loadShader("pixel-sort");

// Apply the shader
pixelSortShader.apply({
	uTime: frameCount * 0.01,
	uSeed: 123.45,
	uAngle: 0, // vertical sorting
	uThreshold: 0.3,
	uSortAmount: 0.8,
	uSampleCount: 32.0,
	uInvert: 0.0, // 0.0 = bright, 1.0 = dark
	uResolution: [width, height],
});
```

## Tips

- Lower `uThreshold` (0.2-0.4) for more aggressive sorting
- Higher `uThreshold` (0.6-0.8) for selective sorting of bright/dark areas
- Try different angles: 0 (vertical), PI/2 (horizontal), or PI/4 (diagonal)
- Use `uInvert: 1.0` to sort dark pixels instead of bright pixels
- Animate `uSortAmount` for pulsing effects
- Combine with other shaders for interesting composite effects
