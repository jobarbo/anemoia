# Pixel Effect Shader (CRT / Checkerboard)

A dual-mode shader that can create either:

- **CRT Mode**: CRT television subpixel effect with RGB vertical stripes and scanlines
- **Checkerboard Mode**: Retro checkerboard dithering pattern

## Uniforms

- `uTexture` (sampler2D) - The input texture
- `uResolution` (vec2) - Canvas resolution [width, height]
- `uCrtMode` (bool) - Mode switch
  - `true` = CRT mode (RGB subpixel stripes)
  - `false` = Checkerboard mode (alternating pattern)
- `uDarkness` (float) - Intensity of the effect (0.0 - 1.0)
  - 0.0 = no CRT effect
  - 0.2 = subtle CRT look
  - 0.5 = pronounced CRT effect
  - 1.0 = strong mask (very dark)
- `uBrightness` (float) - Brightness boost for subpixels (0.0+)
  - 0.0 = no boost (recommended for subtle effect)
  - 0.05-0.15 = slight glow
  - Higher values = more vibrant subpixels
- `uCellSize` (float) - Size of each CRT "pixel" (which contains 3 RGB subpixels)
  - 3.0 = Very fine (each pixel = 3 screen pixels)
  - 4.5 = Medium visibility
  - 6.0 = Large, clearly visible CRT pixels

## Features

- **RGB Subpixel Structure**: Each CRT pixel has 3 vertical stripes (Red, Green, Blue)
- **Pixel Offset Pattern**: Each pixel column alternates vertical offset (0, 0.5, 0, 0.5...) while keeping RGB columns aligned
- **Pixel Separation**: Very small gaps between pixels both horizontally and vertically, like real CRT TV
- **Scanlines**: Subtle horizontal scanlines for authentic CRT look
- **Resolution-aware**: Automatically adapts to canvas size
- **Adjustable size**: Control the CRT pixel size for different viewing distances
- **Authentic retro look**: Mimics the appearance of old CRT televisions

## Example Usage

```javascript
// CRT Mode
shaderEffects.addEffect("pixelChecker", {
	enabled: true,
	crtMode: true,
	darkness: 0.2,
	brightness: 0.0,
	cellSize: 3.0,
	uniforms: {
		uResolution: "[width, height]",
		uCrtMode: "crtMode",
		uDarkness: "darkness",
		uBrightness: "brightness",
		uCellSize: "cellSize",
	},
});

// Or Checkerboard Mode
shaderEffects.updateEffectParam("pixelChecker", "crtMode", false);
shaderEffects.updateEffectParam("pixelChecker", "cellSize", 1.0);
```

## Tips

**CRT Mode:**

- Use `cellSize: 3.0-4.5` for subtle CRT effect
- Use `cellSize: 6.0+` for clearly visible CRT pixels (good for pixelated art)
- Keep `darkness: 0.15-0.3` for authentic CRT look without being too dark
- Set `brightness: 0.0` for natural look, or add slight boost (0.05-0.1) for glow
- Pixel offset pattern creates alternating vertical positions while maintaining RGB column alignment
- Small gaps between pixels create authentic CRT TV appearance with visible pixel separation
- Combines well with chromatic aberration for authentic retro CRT look

**Checkerboard Mode:**

- Use `cellSize: 1.0` for 1-pixel dithering
- Use `cellSize: 2.0-4.0` for more visible retro pattern
- Lower `darkness: 0.2-0.4` for subtle dithering effect
- Adds vintage/halftone aesthetic to artwork

**General:**

- Works great as a final pass after other effects
- The effect is more visible when zoomed out or on larger displays
- Switch modes dynamically for different artistic effects
