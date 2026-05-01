/**
 * Story sketch — scrollable canvas text reader, phosphor-green terminal aesthetic.
 *
 * Receives content via container[data-sketch-data]:
 *   {
 *     title: string,
 *     neighborhood: string,  // slug for back navigation
 *     blocks: Array<{ type: 'h1'|'h2'|'p', text: string }>
 *   }
 *
 * Rendering:
 *   - Dark background, monospace text, THEME color palette
 *   - h1 → GREEN_PRIMARY + chromatic aberration, large
 *   - h2 → GREEN_MID, medium
 *   - p  → GREEN_SUBTLE, body size
 *   - Smooth scroll (mouse wheel + touch) with lerp
 *   - GSAP-driven per-block reveal: opacity + offsetY animate in when block enters viewport
 *   - "[ RETOUR AU QUARTIER ]" back nav (top-left corner)
 *   - Scan lines + vignette on each frame
 *
 * Captured frame-perfectly by GlobalShaderOverlay via flat mode.
 */

import gsap from "gsap";
import {sceneNavigate} from "../../lib/router/scene-nav.js";
import {THEME, drawTitleAberration, hitTest, applyThemeCanvasFont} from "../../lib/utils/retro-theme.js";

export default function (container) {
	const raw = container.dataset.sketchData;
	const {title = "", neighborhood = "", returnTo = "neighborhood", blocks = []} = raw ? JSON.parse(raw) : {};

	return (sketch) => {
		/** P2D artBuffer — all drawing; GlobalShaderOverlay handles GLSL post. */
		let artBuffer;

		// ── Scroll state ──────────────────────────────────────────────────────────
		let scrollY = 0;
		let targetScrollY = 0;
		let maxScroll = 0;

		// ── Touch scroll ──────────────────────────────────────────────────────────
		let lastTouchY = null;

		// ── Block layout cache (computed once after setup) ────────────────────────
		/** @type {Array<{y: number, h: number}>} */
		let blockLayout = [];

		// ── GSAP per-block reveal state ───────────────────────────────────────────
		/** @type {Array<{opacity: number, offsetY: number, triggered: boolean}>} */
		let blockState = [];

		// ── Window close button (top bar) ────────────────────────────────────────
		let closeRect = null;
		let closeHovered = false;

		sketch.setup = () => {
			sketch.pixelDensity(1);
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);
			artBuffer = sketch.createGraphics(w, h);
			artBuffer.pixelDensity(1);
			artBuffer.noStroke();
			artBuffer.textFont(THEME.FONT);

			blockState = blocks.map(() => ({opacity: 0, offsetY: 40, triggered: false}));
			computeLayout();
		};

		sketch.draw = () => {
			const w = artBuffer.width;
			const h = artBuffer.height;

			// Smooth scroll
			scrollY += (targetScrollY - scrollY) * THEME.SCROLL_LERP;

			// Check which blocks are now visible and trigger GSAP reveal
			triggerVisibleBlocks(h);

			// ── Background ────────────────────────────────────────────────────────
			drawDesktopBackground(artBuffer, w, h);
			const topBar = drawWindowTopBar(artBuffer, w, h, closeHovered, sketch);
			closeRect = topBar.closeRect;

			// ── Content blocks ────────────────────────────────────────────────────
			const contentX = w * 0.12;
			const contentW = w * 0.76;

			for (let i = 0; i < blocks.length; i++) {
				const block = blocks[i];
				const layout = blockLayout[i];
				if (!layout) continue;

				const state = blockState[i];
				const screenY = layout.y - scrollY + state.offsetY;

				// Skip if completely off-screen
				if (screenY + layout.h < -50 || screenY > h + 50) continue;

				drawBlock(artBuffer, block, contentX, screenY, contentW, state.opacity, sketch);
			}

			// Scrollbar indicator
			drawScrollbar(artBuffer, scrollY, maxScroll);

			// Blit to output
			sketch.clear();
			sketch.image(artBuffer, 0, 0);

			container.style.cursor = closeHovered ? "pointer" : "default";
		};

		// ── Input ─────────────────────────────────────────────────────────────────

		sketch.mouseWheel = (e) => {
			targetScrollY = sketch.constrain(targetScrollY + e.delta, 0, maxScroll);
			return false; // prevent page scroll
		};

		sketch.mouseMoved = () => {
			closeHovered = closeRect ? hitTest(sketch.mouseX, sketch.mouseY, closeRect) : false;
		};

		sketch.mousePressed = () => {
			if (closeRect && hitTest(sketch.mouseX, sketch.mouseY, closeRect)) {
				if (returnTo === "desktop") {
					sceneNavigate("desktop");
				} else {
					sceneNavigate("neighborhood", {slug: neighborhood});
				}
			}
		};

		sketch.touchStarted = (e) => {
			if (e.touches && e.touches.length > 0) {
				lastTouchY = e.touches[0].clientY;
			}
			return false;
		};

		sketch.touchMoved = (e) => {
			if (e.touches && e.touches.length > 0 && lastTouchY !== null) {
				const dy = lastTouchY - e.touches[0].clientY;
				targetScrollY = sketch.constrain(targetScrollY + dy * 1.5, 0, maxScroll);
				lastTouchY = e.touches[0].clientY;
			}
			return false;
		};

		sketch.touchEnded = () => {
			lastTouchY = null;
			return false;
		};

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			sketch.resizeCanvas(w, h);
			artBuffer.resizeCanvas(w, h);
			artBuffer.pixelDensity(1);
			artBuffer.textFont(THEME.FONT);
			computeLayout();
			// Re-trigger any block whose state was already revealed
			for (const s of blockState) {
				if (s.triggered) {
					s.opacity = 1;
					s.offsetY = 0;
				}
			}
		};

		// ── Layout computation ────────────────────────────────────────────────────

		function computeLayout() {
			const w = artBuffer.width;
			const h = artBuffer.height;
			const contentW = w * 0.76;
			const topPad = h * 0.19;
			const blockGap = h * 0.06;

			blockLayout = [];
			let cursorY = topPad;

			for (const block of blocks) {
				const sz = fontSizeForType(block.type, w);
				applyThemeCanvasFont(artBuffer, sz, sketch);

				// p5 textWidth works on single lines; wrap manually to get height
				const lines = wrapText(artBuffer, block.text, contentW, block.type === "p" ? sz * 1.55 : sz * 1.3);
				const blockH = lines.length * sz * (block.type === "p" ? 1.55 : 1.3);

				blockLayout.push({y: cursorY, h: blockH, lines, sz});
				cursorY += blockH + (block.type === "p" ? blockGap : blockGap * 0.5);
			}

			maxScroll = Math.max(0, cursorY - h * 0.85);
			targetScrollY = sketch.constrain(targetScrollY, 0, maxScroll);
		}

		// ── GSAP reveal ───────────────────────────────────────────────────────────

		function triggerVisibleBlocks(viewportH) {
			const threshold = viewportH * 0.88;
			for (let i = 0; i < blocks.length; i++) {
				const state = blockState[i];
				if (state.triggered) continue;
				const layout = blockLayout[i];
				if (!layout) continue;
				const screenY = layout.y - scrollY;
				if (screenY < threshold) {
					state.triggered = true;
					gsap.to(state, {opacity: 1, offsetY: 0, duration: 0.7, ease: "power2.out", delay: 0.05 * (i % 4)});
				}
			}
		}

		// ── Block drawing ─────────────────────────────────────────────────────────

		function drawBlock(buf, block, x, y, maxW, opacity, p) {
			if (opacity <= 0.01) return;

			const layout = blockLayout[blocks.indexOf(block)];
			if (!layout) return;

			const alpha = Math.round(opacity * 255);
			const lineH = layout.sz * (block.type === "p" ? 1.55 : 1.3);

			applyThemeCanvasFont(buf, layout.sz, p);
			buf.textAlign(p.LEFT, p.TOP);
			buf.noStroke();

			if (block.type === "h1") {
				// Chromatic aberration title
				drawTitleAberration(buf, block.text, x + maxW / 2, y + layout.sz / 2, layout.sz, alpha, p);
				return;
			}

			const color = block.type === "h2" ? THEME.GREEN_MID : THEME.GREEN_SUBTLE;

			let lineY = y;
			for (const line of layout.lines) {
				buf.fill(...color, alpha);
				buf.text(line, x, lineY);
				lineY += lineH;
			}
		}

		// ── Scrollbar ─────────────────────────────────────────────────────────────

		function drawScrollbar(buf, sy, max) {
			if (max <= 0) return;
			const w = buf.width;
			const h = buf.height;
			const barH = h * 0.6;
			const barX = w - w * 0.025;
			const barY = h * 0.2;
			const thumbH = Math.max(20, barH * (h / (h + max)));
			const thumbY = barY + (sy / max) * (barH - thumbH);

			buf.noStroke();
			buf.fill(...THEME.GREEN_PRIMARY, 80);
			buf.rect(barX - 2, barY, 4, barH, 2);
			buf.fill(...THEME.GREEN_MID, 200);
			buf.rect(barX - 2, thumbY, 4, thumbH, 2);
		}
	};
}

// ── Typography helpers ────────────────────────────────────────────────────────

function fontSizeForType(type, canvasW) {
	if (type === "h1") return canvasW * 0.048;
	if (type === "h2") return canvasW * 0.028;
	return canvasW * 0.018;
}

/**
 * Word-wrap text to fit within maxWidth px using the buffer's current textSize.
 *
 * @param {p5.Graphics} buf
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} lineH - unused here, kept for signature consistency
 * @returns {string[]}
 */
function wrapText(buf, text, maxWidth) {
	const words = text.split(" ");
	const lines = [];
	let current = "";

	for (const word of words) {
		const test = current ? `${current} ${word}` : word;
		if (buf.textWidth(test) > maxWidth && current) {
			lines.push(current);
			current = word;
		} else {
			current = test;
		}
	}
	if (current) lines.push(current);
	return lines;
}

function drawDesktopBackground(buf, w, h) {
	buf.background(...THEME.BG);
	buf.noStroke();
	buf.fill(...THEME.GREEN_PRIMARY, 22);
	const cols = 38;
	const rows = 24;
	const dotSize = Math.max(1.5, Math.min(w / cols, h / rows) * 0.14);
	for (let c = 0; c <= cols; c++) {
		for (let r = 0; r <= rows; r++) {
			buf.ellipse((c / cols) * w, (r / rows) * h, dotSize, dotSize);
		}
	}
}

function drawWindowTopBar(buf, w, h, closeHovered, p) {
	const barH = h * 0.07;
	const ctx = buf.drawingContext;
	const grad = ctx.createLinearGradient(0, 0, 0, barH);
	grad.addColorStop(0, "rgba(95, 48, 28, 0.97)");
	grad.addColorStop(0.45, "rgba(52, 28, 16, 0.97)");
	grad.addColorStop(1, "rgba(16, 9, 5, 0.98)");
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, w, barH);
	buf.stroke(...THEME.GREEN_PRIMARY, 55);
	buf.strokeWeight(1);
	buf.line(0, 0, w, 0);
	buf.stroke(...THEME.GREEN_MID, 150);
	buf.strokeWeight(2);
	buf.line(0, barH, w, barH);
	buf.stroke(...THEME.GREEN_PRIMARY, 55);
	buf.strokeWeight(1);
	buf.line(0, barH - 3, w, barH - 3);
	buf.noStroke();

	const btnSize = barH * 0.58;
	const btnX = w * 0.022;
	const btnY = (barH - btnSize) * 0.5;
	buf.stroke(...THEME.GREEN_MID, closeHovered ? 240 : 180);
	buf.strokeWeight(2);
	buf.fill(...THEME.GREEN_PRIMARY, closeHovered ? 120 : 70);
	buf.rect(btnX, btnY, btnSize, btnSize, 4);
	buf.noStroke();
	applyThemeCanvasFont(buf, Math.max(11, w * 0.013), p);
	buf.fill(...THEME.GREEN_SUBTLE, closeHovered ? 255 : 240);
	buf.textAlign(p.CENTER, p.CENTER);
	buf.text("X", btnX + btnSize * 0.5, btnY + btnSize * 0.52);

	applyThemeCanvasFont(buf, Math.max(12, w * 0.014), p);
	buf.fill(...THEME.GREEN_SUBTLE, 240);
	buf.textAlign(p.LEFT, p.CENTER);
	buf.text("Lecteur d'histoire", btnX + btnSize + w * 0.02, barH * 0.5);

	return {
		closeRect: {x: btnX, y: btnY, w: btnSize, h: btnSize},
	};
}
