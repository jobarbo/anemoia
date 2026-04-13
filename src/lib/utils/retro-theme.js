/**
 * Shared visual language for all canvas sketches (splash, overworld, story).
 *
 * Phosphor-green terminal aesthetic — late 90s / early 2000s CRT monitor.
 * All draw utilities operate on a p5.Graphics P2D buffer (artBuffer).
 */

// ── Design tokens ────────────────────────────────────────────────────────────

export const THEME = {
	/** Deep blue-black background */
	BG: [16, 18, 28],
	/** Phosphor green — titles, active elements, primary UI */
	GREEN_PRIMARY: [8, 170, 80],
	/** Medium green — CTAs, prompts, borders, pin markers */
	GREEN_MID: [120, 200, 140],
	/** Desaturated green — body text, secondary labels */
	GREEN_SUBTLE: [170, 200, 170],
	/** Monospace font used everywhere */
	FONT: "monospace",
	/** Blinking prompt interval (ms) */
	BLINK_MS: 600,
	/** Smooth-scroll lerp factor */
	SCROLL_LERP: 0.08,
};

// ── Shared render utilities ───────────────────────────────────────────────────

/**
 * Horizontal CRT scan lines with Perlin noise flicker.
 * Identical to the implementation in splash.js.
 *
 * @param {p5.Graphics} buf - P2D artBuffer
 * @param {number} now - sketch.millis()
 * @param {p5} p - p5 instance (for noise())
 */
export function drawScanLines(buf, now, p) {
	const flicker = 0.12 + p.noise(now * 0.0003) * 0.08;
	buf.fill(0, 0, 0, flicker * 255);
	buf.noStroke();
	for (let y = 0; y < buf.height; y += 3) {
		buf.rect(0, y, buf.width, 1);
	}
}

/**
 * Radial vignette — black fades in from edges.
 * Identical to the implementation in splash.js.
 *
 * @param {p5.Graphics} buf - P2D artBuffer
 */
export function drawVignette(buf) {
	const ctx = buf.drawingContext;
	const cx = buf.width / 2;
	const cy = buf.height / 2;
	const r = Math.max(cx, cy) * 1.03;
	const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
	grad.addColorStop(0, "rgba(0,0,0,0)");
	grad.addColorStop(1, "rgba(0,0,0,0.4)");
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, buf.width, buf.height);
}

/**
 * Title text with manual RGB-channel chromatic aberration (screen blend).
 * Identical to drawTitleAberration in splash.js.
 *
 * @param {p5.Graphics} buf - P2D artBuffer
 * @param {string} text
 * @param {number} x - center x
 * @param {number} y - center y
 * @param {number} size - font size in px
 * @param {number} alpha - 0–255
 * @param {p5} p - p5 instance (for constants)
 * @param {string | p5.Font} [fontOverride] - optional font/family for this draw
 * @param {string | number} [fontWeight="700"] - optional font weight for this draw
 */
export function drawTitleAberration(buf, text, x, y, size, alpha, p, fontOverride, fontWeight = "700") {
	const ctx = buf.drawingContext;
	const offset = Math.max(2, size * 0.015);
	const family = fontOverride ?? THEME.FONT;

	buf.textAlign(p.CENTER, p.CENTER);
	buf.textSize(size);
	buf.textFont(family);
	buf.textStyle(p.BOLD);
	ctx.font = `normal ${fontWeight} ${size}px "${family}"`;

	ctx.globalCompositeOperation = "screen";
	buf.fill(50, 50, 50, alpha * 0.55);
	buf.text(text, x - offset, y);

	buf.fill(50, 100, 255, alpha * 0.55);
	buf.text(text, x + offset, y);

	ctx.globalCompositeOperation = "source-over";
	buf.fill(...THEME.GREEN_PRIMARY, alpha);
	buf.text(text, x, y);

	buf.textStyle(p.NORMAL);
}

/**
 * Blinking monospace prompt (e.g. "[ PRESS ANY KEY ]").
 *
 * @param {p5.Graphics} buf
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} size - font size in px
 * @param {boolean} visible - current blink state (caller tracks timing)
 * @param {p5} p
 * @param {number} [alpha=210]
 */
export function drawBlinkingPrompt(buf, text, x, y, size, visible, p, alpha = 210) {
	if (!visible) return;
	buf.textAlign(p.CENTER, p.CENTER);
	buf.textSize(size);
	buf.textFont(THEME.FONT);
	buf.noStroke();
	buf.fill(...THEME.GREEN_MID, alpha);
	buf.text(text, x, y);
}

/**
 * Returns the current blink state given millis() and last-flip time.
 * Call this each frame; it returns { visible, lastBlink } — update lastBlink
 * in your state when it changes.
 *
 * @param {boolean} currentVisible
 * @param {number} lastBlink - millis() when we last flipped
 * @param {number} now - sketch.millis()
 * @returns {{ visible: boolean, lastBlink: number }}
 */
export function tickBlink(currentVisible, lastBlink, now) {
	if (now - lastBlink > THEME.BLINK_MS) {
		return {visible: !currentVisible, lastBlink: now};
	}
	return {visible: currentVisible, lastBlink};
}

/**
 * Clickable text button drawn in canvas with hover highlight.
 *
 * @param {p5.Graphics} buf
 * @param {string} label
 * @param {number} x - center x
 * @param {number} y - center y
 * @param {number} size - font size
 * @param {boolean} hovered
 * @param {p5} p
 * @returns {{ x: number, y: number, w: number, h: number }} hit rect for click detection
 */
export function drawButton(buf, label, x, y, size, hovered, p) {
	buf.textAlign(p.CENTER, p.CENTER);
	buf.textSize(size);
	buf.textFont(THEME.FONT);
	buf.noStroke();

	const color = hovered ? THEME.GREEN_PRIMARY : THEME.GREEN_SUBTLE;
	buf.fill(...color, hovered ? 255 : 160);
	buf.text(label, x, y);

	const w = buf.textWidth(label) + size;
	const h = size * 1.6;
	return {x: x - w / 2, y: y - h / 2, w, h};
}

/**
 * Returns true if point (px, py) is inside rect {x, y, w, h}.
 *
 * @param {number} px
 * @param {number} py
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @returns {boolean}
 */
export function hitTest(px, py, rect) {
	return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}
