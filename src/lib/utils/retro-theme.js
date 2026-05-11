/**
 * Shared visual language for all canvas sketches (splash, overworld, story).
 *
 * Phosphor-amber / orange terminal aesthetic — late 90s / early 2000s CRT monitor.
 * All draw utilities operate on a p5.Graphics P2D buffer (artBuffer).
 */

// ── Design tokens ────────────────────────────────────────────────────────────

/**
 * Single source of truth for typography config used across all scenes.
 * Splash uses provider/local/google fields for loading; the rest of the
 * project consumes THEME.FONT and THEME.FONT_WEIGHT derived below.
 */
const toGoogleFontFamily = (family) => family.trim().replace(/\s+/g, "+");
const THEME_FONT_FAMILY = "Orbitron";
const THEME_FONT_FALLBACK_FAMILY = "sans-serif";
const THEME_FONT_GOOGLE_CSS_URL = `https://fonts.googleapis.com/css2?family=${toGoogleFontFamily(THEME_FONT_FAMILY)}:wght@400;500;600;700;800;900&display=swap`;

export const THEME_FONT = {
	// "google" | "local" | "system"
	provider: "google",
	// Primary family used by runtime font loading
	family: THEME_FONT_FAMILY,
	// Secondary stack used after the primary family
	fallbackFamily: THEME_FONT_FALLBACK_FAMILY,
	weight: "400",
	googleCssUrl: THEME_FONT_GOOGLE_CSS_URL,
	// Used for provider: "local" (served from /public)
	localPath: "/assets/fonts/splash.ttf",
};

const THEME_FONT_STACK = `"${THEME_FONT.family}", "${THEME_FONT.fallbackFamily}", monospace`;

export const THEME = {
	/** Near-black with warm brown undertone */
	BG: [8, 12, 28],
	PANEL_BG: [5, 10, 20],
	/** Bright amber — titles, active elements, primary UI */
	GREEN_PRIMARY: [255, 155, 82],
	/** Soft peach-white — CTAs, prompts, borders, pin markers */
	GREEN_MID: [255, 228, 198],
	/** Dusty orange-brown — body text, secondary labels */
	GREEN_SUBTLE: [195, 125, 78],
	/** Shared terminal font stack used across all canvas scenes */
	FONT: THEME_FONT_STACK,
	FONT_WEIGHT: THEME_FONT.weight,
	/** Blinking prompt interval (ms) */
	BLINK_MS: 600,
	/** Smooth-scroll lerp factor */
	SCROLL_LERP: 0.08,
};

const appliedThemeFontState = new WeakMap();

function getP5TextStyle(sketch, style, weight) {
	if (!sketch) return undefined;
	if (style === "italic") return sketch.ITALIC;
	const parsedWeight = Number.parseInt(String(weight), 10);
	return parsedWeight >= 600 ? sketch.BOLD : sketch.NORMAL;
}

/**
 * Shared canvas font application for all p5 sketches.
 *
 * @param {p5.Graphics} buf
 * @param {number} size
 * @param {p5} sketch
 * @param {{ family?: string, weight?: string | number, style?: "normal" | "italic" }} [options]
 */
export function applyThemeCanvasFont(buf, size, sketch, options = {}) {
	const family = options.family ?? THEME.FONT;
	const weight = options.weight ?? THEME.FONT_WEIGHT;
	const style = options.style ?? "normal";
	const font = `${style} ${weight} ${size}px ${family}`;
	const previous = appliedThemeFontState.get(buf);

	if (previous?.font === font && previous.family === family && previous.size === size) return;

	buf.textFont(family);
	buf.textSize(size);
	const p5Style = getP5TextStyle(sketch, style, weight);
	if (p5Style !== undefined) buf.textStyle(p5Style);
	buf.drawingContext.font = font;
	appliedThemeFontState.set(buf, {font, family, size});
}

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
	buf.fill(255, 200, 165, flicker * 10);
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
 * Title text renderer (single pass).
 *
 * NOTE: p5-side RGB aberration was intentionally removed because the global
 * shader pipeline now owns chromatic aberration to avoid double-processing.
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
	const family = fontOverride ?? THEME.FONT;

	applyThemeCanvasFont(buf, size, p, {family, weight: fontWeight});
	buf.textAlign(p.CENTER, p.CENTER);
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
export function drawBlinkingPrompt(buf, text, x, y, size, visible, p, alpha = 255) {
	if (!visible) return;
	buf.textAlign(p.CENTER, p.CENTER);
	applyThemeCanvasFont(buf, size, p);
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
	applyThemeCanvasFont(buf, size, p);
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

const CANVAS_TEXT_ELLIPSIS = "...";

/**
 * Shortens text so the drawn line stays inside maxWidthPx (inner margin so ellipsis stays inside the container).
 * Call after {@link applyThemeCanvasFont} so measurements match the drawn string.
 *
 * @param {p5.Graphics} buf
 * @param {string} text
 * @param {number} maxWidthPx
 */
export function truncateCanvasTextToFitWidth(buf, text, maxWidthPx) {
	const raw = String(text ?? "").trim();
	if (!raw.length) return "";
	/** Marge entre mesure textWidth et rendu réel (sous-pixels, arrondi du glyphe «…»). */
	const epsilon = Math.min(10, Math.max(4, maxWidthPx * 0.045));
	const budget = Math.max(0, maxWidthPx - epsilon);
	if (budget <= 0) return CANVAS_TEXT_ELLIPSIS;
	if (buf.textWidth(raw) <= budget) return raw;
	if (buf.textWidth(CANVAS_TEXT_ELLIPSIS) > budget) {
		return raw.slice(0, 1);
	}
	let best = 0;
	let lo = 0;
	let hi = raw.length;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const tw = buf.textWidth(raw.slice(0, mid) + CANVAS_TEXT_ELLIPSIS);
		if (tw <= budget) {
			best = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	let out = best === 0 ? CANVAS_TEXT_ELLIPSIS : raw.slice(0, best) + CANVAS_TEXT_ELLIPSIS;
	while (out.length > CANVAS_TEXT_ELLIPSIS.length && buf.textWidth(out) > budget) {
		best -= 1;
		out = best <= 0 ? CANVAS_TEXT_ELLIPSIS : raw.slice(0, best) + CANVAS_TEXT_ELLIPSIS;
	}
	return out;
}
